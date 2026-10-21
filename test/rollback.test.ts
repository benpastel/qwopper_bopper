import { beforeAll, describe, expect, it } from 'vitest';
import { Game, initPhysics } from '../src/sim/game';
import type { Input } from '../src/sim/input';
import { next } from '../src/sim/rng';
import { FakeNet } from '../src/net/fakenet';
import { Session, type Sim } from '../src/net/rollback';

beforeAll(initPhysics);

// mashing: a new random set of keys every few frames
function masher(seed: number): (frame: number) => Input {
  let rng = seed;
  let current = 0;
  return (frame) => {
    if (frame % 9 === 0) {
      let v;
      [v, rng] = next(rng);
      current = Math.floor(v * 64);
    }
    return current;
  };
}

function seeded(seed: number): () => number {
  let rng = seed;
  return () => {
    let v;
    [v, rng] = next(rng);
    return v;
  };
}

// fighters close enough to hit each other, so damage and limbs coming off get exercised
function brawl(seed: number, frames: number): [Input, Input][] {
  const a = masher(seed);
  const b = masher(seed + 1);
  return Array.from({ length: frames }, (_, f) => [a(f), b(f)]);
}

// a game that remembers the inputs each frame was last simulated with
class Recording implements Sim<ReturnType<Game['save']>> {
  readonly game = new Game(42);
  readonly used: [Input, Input][] = [];
  readonly sums: number[] = [];
  step(inputs: readonly [Input, Input]): void {
    this.used[this.game.state.frame] = [inputs[0], inputs[1]];
    this.sums[this.game.state.frame] = this.game.checksum();
    this.game.step(inputs);
  }
  save() {
    return this.game.save();
  }
  load(saved: ReturnType<Game['save']>): void {
    this.game.load(saved);
  }
  checksum(): number {
    return this.game.checksum();
  }
}

describe('sim', () => {
  it('is deterministic', () => {
    const inputs = brawl(7, 1500);
    const x = new Game(3);
    const y = new Game(3);
    for (const pair of inputs) {
      x.step(pair);
      y.step(pair);
      expect(x.checksum()).toBe(y.checksum());
    }
  });

  it('reloads exactly', () => {
    const inputs = brawl(11, 900);
    const straight = new Game(5);
    const sums: number[] = [];
    for (const pair of inputs) {
      straight.step(pair);
      sums.push(straight.checksum());
    }
    // the same run, but every 50 frames jump back 7 frames and redo them
    const jumpy = new Game(5);
    const saves = new Map<number, ReturnType<Game['save']>>();
    let f = 0;
    while (f < inputs.length) {
      saves.set(f, jumpy.save());
      jumpy.step(inputs[f]!);
      f++;
      if (f % 50 === 0 && f >= 7) {
        jumpy.load(saves.get(f - 7)!);
        f -= 7;
        for (let i = 0; i < 7; i++, f++) jumpy.step(inputs[f]!);
      }
      expect(jumpy.checksum()).toBe(sums[f - 1]);
    }
  });
});

describe('rollback', () => {
  for (const [latency, jitter, loss] of [
    [0, 0, 0],
    [40, 10, 0.05],
    [90, 40, 0.2],
  ] as const) {
    it(`stays in sync at ${latency}±${jitter}ms, ${loss * 100}% loss`, () => {
      let clock = 0;
      const now = () => clock;
      const net = new FakeNet({ latency, jitter, loss }, now, seeded(99));
      const sims = [new Recording(), new Recording()] as const;
      const peers = [
        new Session(sims[0], 0, net.a, {}, now),
        new Session(sims[1], 1, net.b, {}, now),
      ] as const;
      const desyncs: number[] = [];
      for (const p of peers) p.onDesync = (f) => desyncs.push(f);
      const mash = [masher(1), masher(2)];

      for (let tick = 0; tick < 1800; tick++) {
        clock += 1000 / 60;
        net.pump();
        peers.forEach((p, i) => {
          if (!p.shouldWait()) p.tick(mash[i]!(tick));
        });
      }
      // let everything arrive
      net.conditions = { latency: 0, jitter: 0, loss: 0 };
      for (let i = 0; i < 20; i++) {
        net.pump();
        for (const p of peers) p.tick(0);
      }

      expect(desyncs).toEqual([]);
      // both agree with a game replayed offline from the inputs each actually used
      const end = Math.min(peers[0].frame, peers[1].frame) - 20;
      const replay = new Game(42);
      let checked = 0;
      for (let f = 0; f < end; f++) {
        if (f % 30 === 0) {
          expect(sims[0].sums[f]).toBe(replay.checksum());
          expect(sims[1].sums[f]).toBe(replay.checksum());
          checked++;
        }
        expect(sims[1].used[f]).toEqual(sims[0].used[f]);
        replay.step(sims[0].used[f]!);
      }
      expect(checked).toBeGreaterThan(10);
      // time sync keeps both sides moving rather than stalling on each other
      expect(end).toBeGreaterThan(1600);
      if (latency > 0) expect(peers[0].stats.rollbacks).toBeGreaterThan(0);
    });
  }

  it('notices a desync', () => {
    let clock = 0;
    const now = () => clock;
    const net = new FakeNet({ latency: 30, jitter: 0, loss: 0 }, now);
    const peers = [
      new Session(new Game(1), 0, net.a, {}, now),
      new Session(new Game(2), 1, net.b, {}, now),
    ] as const;
    const desyncs: number[] = [];
    peers[0].onDesync = (f) => desyncs.push(f);
    const mash = [masher(1), masher(2)];
    for (let tick = 0; tick < 300; tick++) {
      clock += 1000 / 60;
      net.pump();
      peers.forEach((p, i) => p.tick(mash[i]!(tick)));
    }
    expect(desyncs.length).toBeGreaterThan(0);
  });
});
