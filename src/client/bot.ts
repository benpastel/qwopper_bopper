// The bot plays by looking ahead with the game itself: every few frames it tries
// each combination of muscles on a scratch copy of the game, simulates a moment
// ahead, and keeps whichever leaves it best off. Being built on the real physics,
// it keeps working as the tuning changes. The search is spread across frames so
// no single frame pays for all of it.

import { Game, other, type Saved, type Side } from '../sim/game';
import type { Input } from '../sim/input';
import { DAMAGE_PER_LIMB } from '../sim/tuning';

// frames each choice is held for
const WINDOW = 10;
// frames simulated past the end of the current choice, to judge the next one
const HORIZON = 24;
// how far apart the bot likes to stand: close enough to land a limb
const PREFERRED_DISTANCE = 3.2;
// how much the bot dithers between nearly-equal choices; 0 always takes the best
const TEMPERATURE = 0.6;

// every way to set three joints to open, close, or neither
const CANDIDATES: readonly Input[] = (() => {
  const out: Input[] = [];
  for (let a = 0; a < 3; a++)
    for (let b = 0; b < 3; b++)
      for (let c = 0; c < 3; c++) {
        // bits: q w o p e r; per joint 0 = neither, 1 = open, 2 = close
        out.push(a | (b << 2) | (c << 4));
      }
  return out;
})();

export class Bot {
  private scratch: Game | null = null;
  private plan: Input = 0;
  private planUntil = 0;
  private base: Saved | null = null;
  private baseFrame = 0;
  private scores = new Map<Input, number>();
  private queue: Input[] = [];

  constructor(readonly side: Side) {}

  decide(game: Game): Input {
    const s = game.state;
    if (s.phase !== 'fight') {
      this.base = null;
      this.planUntil = s.frame;
      return 0;
    }
    if (s.frame >= this.planUntil || this.base === null) {
      if (this.scores.size > 0) this.plan = this.choose();
      this.planUntil = s.frame + WINDOW;
      this.base = game.save();
      this.baseFrame = s.frame;
      this.scores.clear();
      this.queue = shuffled(CANDIDATES);
    }
    // a share of the search each frame, finishing by the end of the window
    const perFrame = Math.ceil(CANDIDATES.length / (WINDOW - 1));
    for (let i = 0; i < perFrame && this.queue.length > 0; i++) {
      const candidate = this.queue.pop()!;
      this.scores.set(candidate, this.evaluate(candidate));
    }
    return this.plan;
  }

  dispose(): void {
    this.scratch?.dispose();
    this.scratch = null;
  }

  private evaluate(candidate: Input): number {
    const base = this.base!;
    this.scratch ??= new Game(0);
    const g = this.scratch;
    g.load(base);
    const me = this.side;
    const them = other(me);
    const before = [lost(g, me), lost(g, them)];
    const pair: [Input, Input] = [0, 0];
    // the current plan runs out its window, then the candidate takes over
    const switchAt = this.baseFrame + WINDOW;
    let lowest = Infinity;
    while (g.state.frame < switchAt + HORIZON && g.state.phase === 'fight') {
      pair[me] = g.state.frame < switchAt ? this.plan : candidate;
      g.step(pair);
      lowest = Math.min(lowest, g.pose(me, 1).y);
    }
    const dealt = lost(g, them) - before[1]!;
    const taken = lost(g, me) - before[0]!;
    const torso = g.pose(me, 0);
    const theirs = g.pose(them, 0);
    const distance = Math.abs(torso.x - theirs.x);
    return (
      3 * dealt -
      2 * taken +
      // stand tall, stay upright, keep your head off the floor
      2 * torso.y -
      4 * Math.abs(torso.angle) +
      1.5 * Math.min(lowest, 4) -
      0.8 * Math.abs(distance - PREFERRED_DISTANCE)
    );
  }

  private choose(): Input {
    // soft-max over scores, so the bot isn't a perfect machine
    const entries = [...this.scores];
    const best = Math.max(...entries.map(([, s]) => s));
    const weights = entries.map(([, s]) => Math.exp((s - best) / TEMPERATURE));
    let r = Math.random() * weights.reduce((a, b) => a + b, 0);
    for (let i = 0; i < entries.length; i++) {
      r -= weights[i]!;
      if (r <= 0) return entries[i]![0];
    }
    return entries[entries.length - 1]![0];
  }
}

// everything a fighter has lost so far: limbs, and damage toward the next
function lost(g: Game, side: Side): number {
  const f = g.state.fighters[side];
  return f.attached.filter((a) => !a).length * DAMAGE_PER_LIMB + f.damage;
}

function shuffled<T>(xs: readonly T[]): T[] {
  const out = [...xs];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}
