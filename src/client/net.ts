// The websocket to the lobby server, reconnecting with backoff and sending
// hello() each time it opens, so the server can put us back in our seat.

import { REPLACED, type ClientMsg, type ServerMsg } from '../shared/protocol';

export type Status = 'connecting' | 'open' | 'closed' | 'replaced';

export class Net {
  private ws: WebSocket | null = null;
  private backoff = 500;

  constructor(
    private readonly hello: () => ClientMsg,
    private readonly onMessage: (msg: ServerMsg) => void,
    private readonly onStatus: (status: Status) => void,
  ) {}

  connect(): void {
    this.onStatus('connecting');
    const scheme = location.protocol === 'https:' ? 'wss' : 'ws';
    const ws = new WebSocket(`${scheme}://${location.host}/ws`);
    this.ws = ws;
    ws.addEventListener('open', () => {
      this.backoff = 500;
      this.onStatus('open');
      ws.send(JSON.stringify(this.hello()));
    });
    ws.addEventListener('message', ({ data }) => {
      this.onMessage(JSON.parse(String(data)) as ServerMsg);
    });
    ws.addEventListener('close', ({ code }) => {
      if (this.ws !== ws) return;
      this.ws = null;
      if (code === REPLACED) {
        this.onStatus('replaced');
        return;
      }
      this.onStatus('closed');
      setTimeout(() => this.connect(), this.backoff);
      this.backoff = Math.min(this.backoff * 2, 8000);
    });
  }

  // dropped while disconnected; the server replays our state on reconnect
  send(msg: ClientMsg): void {
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(msg));
  }
}
