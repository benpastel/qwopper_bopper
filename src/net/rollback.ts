// Rollback netcode for two peers, after GGPO.
//
// Each peer runs the whole game. Local input is delayed a couple of frames, sent
// every tick (with everything the other side hasn't acknowledged, so a lost packet
// costs nothing), and the other side's input is predicted to be whatever they
// last pressed. When their real input arrives and differs from the prediction,
// the game loads the state from that frame and re-simulates up to now.

import type { Input } from '../sim/input';
import type { Side } from '../sim/game';

export interface Sim<S> {
  step(inputs: readonly [Input, Input]): void;
  save(): S;
  load(saved: S): void;
  checksum(): number;
}

export interface Transport {
  send(data: string): void;
  onMessage: ((data: string) => void) | null;
  close(): void;
}

export type Packet =
  | {
      t: 'in';
      // inputs for frames start, start + 1, ...
      start: number;
      inputs: Input[];
      // the last of our inputs the sender has
      ack: number;
      // the sender's current frame, and how far it thinks it's ahead of us
      frame: number;
      adv: number;
    }
  | { t: 'sum'; frame: number; sum: number };

export interface Options {
  // frames between pressing a key and it taking effect
  delay: number;
  // furthest the game runs ahead of the other side's confirmed input
  maxPrediction: number;
  // frames between desync checks
  checkInterval: number;
}

// ticks between waits, at least
const WAIT_SPACING = 30;
const ADVANTAGE_WINDOW = 30;

function pushWindow(window: number[], value: number): void {
  window.push(value);
  if (window.length > ADVANTAGE_WINDOW) window.shift();
}

function mean(xs: readonly number[]): number {
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}

export const DEFAULTS: Options = { delay: 2, maxPrediction: 8, checkInterval: 30 };

export interface Stats {
  frame: number;
  rollbacks: number;
  rolledBackFrames: number;
  stalls: number;
  // our frame advantage over the other side, smoothed
  advantage: number;
}

export class Session<S> {
  // frames simulated so far: the game is at the start of this frame
  frame = 0;
  readonly stats: Stats = { frame: 0, rollbacks: 0, rolledBackFrames: 0, stalls: 0, advantage: 0 };
  onDesync: ((frame: number, ours: number, theirs: number) => void) | null = null;

  private readonly opts: Options;
  private readonly remote: Side;
  // confirmed input for each side, by frame
  private readonly inputs: [Map<number, Input>, Map<number, Input>] = [new Map(), new Map()];
  // what we assumed the other side pressed, by frame
  private readonly guessed = new Map<number, Input>();
  // state at the start of each frame, and its checksum
  private readonly states = new Map<number, S>();
  private readonly sums = new Map<number, number>();
  private readonly theirSums = new Map<number, number>();
  private sentSums = 0;
  // the other side's input is known for every frame up to this one
  private confirmed = -1;
  // the other side has our input up to this frame
  private acked = -1;
  private rollbackTo: number | null = null;
  private theirFrame = 0;
  private theirAdvantages: number[] = [];
  private advantages: number[] = [];
  private sinceWait = 0;
  lastHeard = 0;

  constructor(
    private readonly sim: Sim<S>,
    readonly local: Side,
    private readonly transport: Transport,
    opts: Partial<Options> = {},
    private readonly now: () => number = () => performance.now(),
  ) {
    this.opts = { ...DEFAULTS, ...opts };
    this.remote = local === 0 ? 1 : 0;
    // nobody presses anything before the first input arrives
    for (let f = 0; f < this.opts.delay; f++) {
      this.inputs[0].set(f, 0);
      this.inputs[1].set(f, 0);
    }
    this.confirmed = this.opts.delay - 1;
    this.lastHeard = this.now();
    transport.onMessage = (data) => this.receive(JSON.parse(data) as Packet);
  }

  // Run one frame with this local input. Returns false if the game had to wait
  // for the other side instead.
  tick(input: Input): boolean {
    const lead = this.frame - this.confirmed;
    const target = this.frame + this.opts.delay;
    if (lead <= this.opts.maxPrediction && !this.inputs[this.local].has(target)) {
      this.inputs[this.local].set(target, input);
    }
    this.sendInputs();
    this.resolveRollback();

    if (lead > this.opts.maxPrediction) {
      this.stats.stalls++;
      return false;
    }
    this.stepFrame();
    this.checkSums();
    this.prune();
    this.stats.frame = this.frame;
    return true;
  }

  // Whether to skip this tick to let the other side catch up, by the GGPO rule:
  // when we're further ahead of them than they are of us. Both sides' advantages
  // are smoothed, and waits are spaced out, so jitter doesn't have both waiting.
  shouldWait(): boolean {
    this.sinceWait++;
    if (this.advantages.length < 10 || this.theirAdvantages.length < 10) return false;
    const mine = mean(this.advantages);
    const theirs = mean(this.theirAdvantages);
    this.stats.advantage = mine;
    if (this.sinceWait < WAIT_SPACING || (mine - theirs) / 2 < 1) return false;
    this.sinceWait = 0;
    return true;
  }

  // the checksum of the state at the start of a frame, if it was taken
  checksumAt(frame: number): number | undefined {
    return this.sums.get(frame);
  }

  // the local player's inputs as the game will apply them, for showing held keys
  localInput(frame: number): Input {
    return this.inputs[this.local].get(frame) ?? 0;
  }

  // ---------------------------------------------------------------- internals

  private inputFor(side: Side, frame: number): Input {
    const known = this.inputs[side].get(frame);
    if (known !== undefined) return known;
    // predict: the last input we know of
    return this.inputs[side].get(Math.min(frame, this.confirmed)) ?? 0;
  }

  private stepFrame(): void {
    const f = this.frame;
    this.states.set(f, this.sim.save());
    if (f % this.opts.checkInterval === 0) this.sums.set(f, this.sim.checksum());
    const theirs = this.inputFor(this.remote, f);
    if (f > this.confirmed) this.guessed.set(f, theirs);
    else this.guessed.delete(f);
    const pair: [Input, Input] = [0, 0];
    pair[this.local] = this.inputFor(this.local, f);
    pair[this.remote] = theirs;
    this.sim.step(pair);
    this.frame++;
  }

  private resolveRollback(): void {
    const to = this.rollbackTo;
    if (to === null) return;
    this.rollbackTo = null;
    const saved = this.states.get(to);
    if (saved === undefined) throw new Error(`no saved state for frame ${to}`);
    const end = this.frame;
    this.sim.load(saved);
    this.frame = to;
    while (this.frame < end) this.stepFrame();
    this.stats.rollbacks++;
    this.stats.rolledBackFrames += end - to;
  }

  private sendInputs(): void {
    const start = this.acked + 1;
    const inputs: Input[] = [];
    for (let f = start; this.inputs[this.local].has(f); f++) {
      inputs.push(this.inputs[this.local].get(f)!);
    }
    const adv = this.frame - this.theirFrame;
    pushWindow(this.advantages, adv);
    this.send({ t: 'in', start, inputs, ack: this.confirmed, frame: this.frame, adv });
  }

  private receive(p: Packet): void {
    this.lastHeard = this.now();
    if (p.t === 'sum') {
      this.theirSums.set(p.frame, p.sum);
      return;
    }
    this.acked = Math.max(this.acked, p.ack);
    if (p.frame > this.theirFrame) {
      this.theirFrame = p.frame;
      pushWindow(this.theirAdvantages, p.adv);
    }
    const theirs = this.inputs[this.remote];
    p.inputs.forEach((input, i) => {
      const f = p.start + i;
      if (theirs.has(f)) return;
      theirs.set(f, input);
      const guess = this.guessed.get(f);
      if (guess !== undefined && guess !== input) {
        this.rollbackTo = Math.min(this.rollbackTo ?? f, f);
      }
    });
    while (theirs.has(this.confirmed + 1)) this.confirmed++;
  }

  private checkSums(): void {
    // a state is final once every input before it is confirmed
    const final = Math.min(this.confirmed + 1, this.frame);
    const interval = this.opts.checkInterval;
    for (let f = this.sentSums; f <= final; f += interval) {
      const sum = this.sums.get(f);
      if (sum !== undefined) this.send({ t: 'sum', frame: f, sum });
      this.sentSums = f + interval;
    }
    for (const [f, theirs] of this.theirSums) {
      if (f > final) continue;
      const ours = this.sums.get(f);
      this.theirSums.delete(f);
      if (ours !== undefined && ours !== theirs) this.onDesync?.(f, ours, theirs);
    }
  }

  private prune(): void {
    // nothing before the earliest unconfirmed frame can be rolled back to
    const keep = Math.min(this.confirmed, this.acked) - 2 * this.opts.checkInterval;
    for (const map of [this.states, this.guessed, this.sums, ...this.inputs]) {
      for (const f of map.keys()) {
        if (f < keep) map.delete(f);
        else break;
      }
    }
  }

  private send(p: Packet): void {
    this.transport.send(JSON.stringify(p));
  }
}
