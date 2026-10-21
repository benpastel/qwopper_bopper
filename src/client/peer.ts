// The connection between the two players of an online match, as a rollback
// Transport: a WebRTC data channel, unordered and without retransmits, set up
// through the lobby server; or, if that doesn't open in time, the server's
// websocket relaying the packets instead. Rollback copes with loss, reordering
// and the relay's extra latency.
//
// Each side picks its own path, and listens on both, so the two never need to
// agree. Once a path is picked the two exchange hellos over it, so that both
// start the match within a packet's flight of each other.

import type { Transport } from '../net/rollback';
import type { Signal } from '../shared/protocol';

const ICE_SERVERS: RTCIceServer[] = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun.cloudflare.com:3478' },
];
// how long the data channel gets to open before falling back to the relay
const DIRECT_TIMEOUT_MS = 5000;
// how long until we give up on reaching the other side at all
const READY_TIMEOUT_MS = 15000;
const HELLO_INTERVAL_MS = 50;
const HELLO_PREFIX = '{"t":"hi"';

export type Path = 'direct' | 'relay';

export interface PeerOptions {
  match: number;
  // whether we make the offer
  initiator: boolean;
  // skip WebRTC, for trying out the relay
  forceRelay: boolean;
  sendSignal(signal: Signal): void;
  sendRelay(data: string): void;
}

export class PeerLink implements Transport {
  onMessage: ((data: string) => void) | null = null;
  path: Path | null = null;

  private pc: RTCPeerConnection | null = null;
  private dc: RTCDataChannel | null = null;
  private closed = false;
  private isReady = false;
  // the hello handshake: we've heard theirs; they've heard ours
  private heard = false;
  private heardUs = false;
  private signals: Promise<void> = Promise.resolve();
  private timers: ReturnType<typeof setTimeout>[] = [];
  private hello: ReturnType<typeof setInterval> | null = null;
  private resolveReady: (path: Path) => void = () => {};
  private rejectReady: (err: Error) => void = () => {};
  readonly ready: Promise<Path>;

  constructor(private readonly opts: PeerOptions) {
    this.ready = new Promise((resolve, reject) => {
      this.resolveReady = resolve;
      this.rejectReady = reject;
    });
    this.timers.push(setTimeout(() => this.fail('timed out'), READY_TIMEOUT_MS));
    if (opts.forceRelay || typeof RTCPeerConnection === 'undefined') {
      this.choose('relay');
      return;
    }
    this.timers.push(setTimeout(() => this.choose('relay'), DIRECT_TIMEOUT_MS));
    this.startDirect();
  }

  // ------------------------------------------------------------ from the server

  signal(signal: Signal): void {
    // in order: an ICE candidate can't be added before the description it's for
    this.signals = this.signals.then(() => this.applySignal(signal)).catch((err: unknown) => {
      console.warn('[net] signal failed', err);
    });
  }

  relayed(data: string): void {
    // the other side has given up on the data channel, so there's no point waiting
    if (this.path === null) this.choose('relay');
    this.receive(data);
  }

  // ---------------------------------------------------------------- Transport

  send(data: string): void {
    if (this.closed) return;
    const dc = this.dc;
    if (this.path === 'direct' && dc && dc.readyState === 'open') dc.send(data);
    else this.opts.sendRelay(data);
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;
    this.onMessage = null;
    for (const t of this.timers) clearTimeout(t);
    if (this.hello !== null) clearInterval(this.hello);
    this.dc?.close();
    this.pc?.close();
    this.rejectReady(new Error('closed'));
  }

  // ---------------------------------------------------------------- internals

  private startDirect(): void {
    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
    this.pc = pc;
    pc.addEventListener('icecandidate', ({ candidate }) => {
      if (!candidate || !candidate.candidate) return;
      this.opts.sendSignal({
        kind: 'ice',
        candidate: candidate.candidate,
        sdpMid: candidate.sdpMid,
        sdpMLineIndex: candidate.sdpMLineIndex,
      });
    });
    pc.addEventListener('connectionstatechange', () => {
      if (pc.connectionState === 'failed' && this.path === null) this.choose('relay');
    });
    if (this.opts.initiator) {
      this.useChannel(pc.createDataChannel('game', { ordered: false, maxRetransmits: 0 }));
      this.signals = this.signals.then(async () => {
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        this.opts.sendSignal({ kind: 'offer', sdp: offer.sdp ?? '' });
      });
    } else {
      pc.addEventListener('datachannel', ({ channel }) => this.useChannel(channel));
    }
  }

  private async applySignal(signal: Signal): Promise<void> {
    const pc = this.pc;
    if (!pc || this.closed) return;
    if (signal.kind === 'offer') {
      await pc.setRemoteDescription({ type: 'offer', sdp: signal.sdp });
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      this.opts.sendSignal({ kind: 'answer', sdp: answer.sdp ?? '' });
    } else if (signal.kind === 'answer') {
      await pc.setRemoteDescription({ type: 'answer', sdp: signal.sdp });
    } else {
      await pc.addIceCandidate({
        candidate: signal.candidate,
        sdpMid: signal.sdpMid,
        sdpMLineIndex: signal.sdpMLineIndex,
      });
    }
  }

  private useChannel(dc: RTCDataChannel): void {
    this.dc = dc;
    dc.addEventListener('open', () => {
      if (this.path === null) this.choose('direct');
    });
    dc.addEventListener('message', ({ data }) => this.receive(String(data)));
    dc.addEventListener('close', () => {
      if (this.path === 'direct' && !this.closed) {
        console.info(`[net] match ${this.opts.match}: data channel closed, relaying`);
        this.path = 'relay';
      }
    });
  }

  private choose(path: Path): void {
    if (this.path !== null || this.closed) return;
    this.path = path;
    console.info(`[net] match ${this.opts.match}: ${path === 'direct' ? 'direct (WebRTC)' : 'relay (server)'}`);
    (window as unknown as { netPath: Path }).netPath = path;
    if (path === 'relay') {
      this.dc?.close();
      this.pc?.close();
      this.dc = null;
      this.pc = null;
    }
    const sayHello = () => this.send(JSON.stringify({ t: 'hi', got: this.heard }));
    sayHello();
    this.hello = setInterval(sayHello, HELLO_INTERVAL_MS);
  }

  private receive(data: string): void {
    if (this.closed) return;
    if (data.startsWith(HELLO_PREFIX)) {
      if (this.isReady) return;
      this.heard = true;
      try {
        if ((JSON.parse(data) as { got?: unknown }).got === true) this.heardUs = true;
      } catch {
        return;
      }
      this.maybeReady();
      return;
    }
    if (this.isReady) {
      this.onMessage?.(data);
      return;
    }
    // a game packet: they've started, so they've heard us
    this.heard = true;
    this.heardUs = true;
    this.maybeReady();
  }

  private maybeReady(): void {
    if (this.isReady || !this.heard || !this.heardUs || this.path === null) return;
    this.isReady = true;
    for (const t of this.timers) clearTimeout(t);
    // one last hello, so they know we've heard theirs if they don't yet
    this.send(JSON.stringify({ t: 'hi', got: true }));
    if (this.hello !== null) clearInterval(this.hello);
    this.hello = null;
    this.resolveReady(this.path);
  }

  private fail(why: string): void {
    if (this.isReady || this.closed) return;
    console.warn(`[net] match ${this.opts.match}: couldn't connect (${why})`);
    this.rejectReady(new Error(why));
  }
}
