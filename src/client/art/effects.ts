// Effects drawn from the game state alone. Rollback can rewind and replay the
// state at any moment, so nothing here remembers anything between frames:
// every spark and crack is a function of the state and fixed seeds.

import type { Hit, State } from '../../sim/game';
import { PARTS, type PartIndex } from '../../sim/body';
import { DAMAGE_PER_LIMB, FPS, GRAVITY } from '../../sim/tuning';

export function hash(...xs: number[]): number {
  let h = 0x9e3779b9;
  for (const x of xs) {
    h = Math.imul(h ^ (x | 0), 0x85ebca6b);
    h ^= h >>> 13;
    h = Math.imul(h, 0xc2b2ae35);
    h ^= h >>> 16;
  }
  return h >>> 0;
}

export function rng(seed: number): () => number {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return (s >>> 0) / 2 ** 32;
  };
}

function hitSeed(h: Hit): number {
  return hash(h.frame, Math.round(h.x * 1000), Math.round(h.y * 1000), h.part);
}

// how hard a hit was, 0..1
function strength(h: Hit): number {
  return Math.min(1, h.amount / 25);
}

// ---------------------------------------------------------------- shake

// a screen offset in metres from the hits still ringing
export function shake(state: State): [number, number] {
  let x = 0;
  let y = 0;
  for (const h of state.hits) {
    const age = state.frame - h.frame;
    if (age < 0 || age > 14) continue;
    const decay = (1 - age / 14) ** 2;
    const amp = 0.03 + 0.12 * strength(h);
    const r = rng(hitSeed(h) ^ age);
    x += (r() - 0.5) * 2 * amp * decay;
    y += (r() - 0.5) * 2 * amp * decay;
  }
  return [x, y];
}

// ---------------------------------------------------------------- hits

const CHIP_LIGHT = ['#efeadc', '#e2dccb', '#d4cdb8', '#f7f4ea'];

export function drawHits(ctx: CanvasRenderingContext2D, state: State): void {
  for (const h of state.hits) {
    const age = state.frame - h.frame;
    if (age < 0) continue;
    const s = strength(h);
    const r = rng(hitSeed(h));

    // flash
    if (age < 7) {
      const t = age / 7;
      const rad = (0.25 + 0.45 * s) * (0.6 + t);
      const g = ctx.createRadialGradient(h.x, h.y, 0, h.x, h.y, rad);
      g.addColorStop(0, `rgba(255, 252, 240, ${0.95 * (1 - t)})`);
      g.addColorStop(0.4, `rgba(255, 235, 190, ${0.5 * (1 - t)})`);
      g.addColorStop(1, 'rgba(255, 235, 190, 0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(h.x, h.y, rad, 0, Math.PI * 2);
      ctx.fill();
    }

    // a ring
    if (age < 12) {
      const t = age / 12;
      ctx.strokeStyle = `rgba(255, 248, 230, ${0.7 * (1 - t)})`;
      ctx.lineWidth = 0.05 * (1 - t) + 0.01;
      ctx.beginPath();
      ctx.arc(h.x, h.y, 0.15 + (0.5 + 0.6 * s) * t, 0, Math.PI * 2);
      ctx.stroke();
    }

    // marble dust
    const puffs = 3 + Math.round(3 * s);
    for (let i = 0; i < puffs; i++) {
      const a = r() * Math.PI * 2;
      const d = (0.1 + 0.4 * r()) * (1 - 1 / (1 + age * 0.15));
      const life = 1 - age / 30;
      if (life <= 0) continue;
      const px = h.x + Math.cos(a) * d;
      const py = h.y + Math.sin(a) * d + age * 0.004;
      const pr = 0.08 + 0.12 * r() + age * 0.008;
      ctx.fillStyle = `rgba(225, 218, 200, ${0.22 * life})`;
      ctx.beginPath();
      ctx.arc(px, py, pr, 0, Math.PI * 2);
      ctx.fill();
    }

    // chips
    const chips = 4 + Math.round(10 * s);
    const t = age / FPS;
    for (let i = 0; i < chips; i++) {
      const a = Math.PI * (0.05 + 0.9 * r()) + (r() < 0.25 ? Math.PI : 0);
      const v = 1.5 + (2 + 4 * s) * r();
      const size = 0.02 + 0.04 * r();
      const spin = (r() - 0.5) * 30;
      const shade = CHIP_LIGHT[Math.floor(r() * CHIP_LIGHT.length)]!;
      const k = r();
      let x = h.x + Math.cos(a) * v * t;
      let y = h.y + Math.sin(a) * v * t - 0.5 * GRAVITY * t * t;
      if (y < size) {
        y = size;
        x = h.x + Math.cos(a) * v * Math.min(t, 0.6);
      }
      const life = Math.min(1, (30 - age) / 8);
      if (life <= 0) continue;
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(spin * t + k * 6);
      ctx.globalAlpha = life;
      ctx.fillStyle = shade;
      ctx.strokeStyle = 'rgba(70, 60, 45, 0.6)';
      ctx.lineWidth = 0.01;
      ctx.beginPath();
      ctx.moveTo(-size, -size * 0.5);
      ctx.lineTo(size * (0.5 + k), -size * 0.7);
      ctx.lineTo(-size * 0.2, size * (0.6 + k * 0.6));
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    }
  }
}

// the most recent hit on this part, if it is still flashing: 0..1
export function flashOn(state: State, side: number, part: PartIndex): number {
  let best = 0;
  for (const h of state.hits) {
    if (h.victim !== side || h.part !== part) continue;
    const age = state.frame - h.frame;
    if (age < 0 || age >= 8) continue;
    best = Math.max(best, (1 - age / 8) * (0.45 + 0.4 * strength(h)));
  }
  return best;
}

// ---------------------------------------------------------------- cracks

interface Segment {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  // when, as a fraction of the damage toward the next limb, this segment appears
  b0: number;
  b1: number;
  width: number;
}

const crackCache = new Map<number, Segment[]>();

// Fixed crack networks spreading from each part's joint, which grow as the damage
// builds toward the next limb coming off.
function cracksFor(side: number, part: PartIndex): Segment[] {
  const key = side * 16 + part;
  const cached = crackCache.get(key);
  if (cached) return cached;
  const def = PARTS[part]!;
  const out: Segment[] = [];
  const r = rng(hash(side + 7, part + 31));
  const [ox, oy] = def.joint?.onChild ?? [0, 0];
  const halfW = def.size[0] / 2;
  const halfH = def.size[1] / 2;
  const reach = Math.min(def.size[1] * 0.75, 1.1);
  const step = 0.1;

  const grow = (x: number, y: number, dir: number, len: number, b: number, span: number, width: number, depth: number) => {
    const n = Math.max(1, Math.round(len / step));
    const heading = dir;
    for (let i = 0; i < n; i++) {
      dir = dir * 0.6 + heading * 0.4 + (r() - 0.5) * 0.9;
      const l = step * (0.6 + 0.8 * r());
      let nx = x + Math.cos(dir) * l;
      const ny = Math.max(-halfH * 0.9, Math.min(halfH * 0.9, y + Math.sin(dir) * l));
      // stay on the stone
      const limit = halfW * 0.6;
      if (Math.abs(nx) > limit) nx = Math.sign(nx) * limit;
      const b0 = b + (span * i) / n;
      const b1 = b + (span * (i + 1)) / n;
      out.push({ x0: x, y0: y, x1: nx, y1: ny, b0, b1, width: width * (1 - (0.6 * i) / n) });
      if (depth < 1 && r() < 0.35) {
        grow(nx, ny, dir + (r() < 0.5 ? -1 : 1) * (0.4 + r() * 0.4), len * 0.35, b1, span * 0.4, width * 0.6, depth + 1);
      }
      x = nx;
      y = ny;
    }
  };

  // from near the joint (but out from under whatever overlaps it) toward the middle
  const sx = ox * 0.6;
  const sy = oy * 0.6;
  const toward = Math.atan2(-sy, -sx || 1e-9);
  const branches = 2;
  for (let i = 0; i < branches; i++) {
    const dir = toward + (i - (branches - 1) / 2) * 0.35 + (r() - 0.5) * 0.2;
    grow(sx + (i - (branches - 1) / 2) * halfW * 0.5, sy, dir, reach * (0.7 + 0.3 * r()), i * 0.15, 0.85 - i * 0.15, 0.026, 0);
  }
  crackCache.set(key, out);
  return out;
}

// the parts the next lost limb will come from
export function atRisk(attached: readonly boolean[]): PartIndex[] {
  let tier = Infinity;
  PARTS.forEach((def, i) => {
    if (def.joint && attached[i]) tier = Math.min(tier, def.tier);
  });
  const out: PartIndex[] = [];
  PARTS.forEach((def, i) => {
    if (def.joint && attached[i] && def.tier === tier) out.push(i);
  });
  return out;
}

// in the part's frame
export function drawCracks(ctx: CanvasRenderingContext2D, side: number, part: PartIndex, damage: number): void {
  const frac = Math.min(1, damage / DAMAGE_PER_LIMB);
  if (frac <= 0) return;
  const def = PARTS[part]!;
  ctx.save();
  ctx.beginPath();
  for (const [x, y] of def.hull) ctx.lineTo(x, y);
  ctx.clip();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'miter';
  for (const pass of [0, 1]) {
    for (const s of cracksFor(side, part)) {
      if (s.b0 >= frac) continue;
      const t = Math.min(1, (frac - s.b0) / (s.b1 - s.b0));
      const x1 = s.x0 + (s.x1 - s.x0) * t;
      const y1 = s.y0 + (s.y1 - s.y0) * t;
      ctx.beginPath();
      if (pass === 0) {
        // the lit lip of the crack
        ctx.strokeStyle = 'rgba(255, 252, 240, 0.55)';
        ctx.lineWidth = s.width * (0.7 + 0.6 * frac) + 0.02;
        ctx.moveTo(s.x0 + 0.012, s.y0 - 0.012);
        ctx.lineTo(x1 + 0.012, y1 - 0.012);
      } else {
        ctx.strokeStyle = 'rgba(38, 30, 22, 0.9)';
        ctx.lineWidth = s.width * (0.7 + 0.6 * frac);
        ctx.moveTo(s.x0, s.y0);
        ctx.lineTo(x1, y1);
      }
      ctx.stroke();
    }
  }
  ctx.restore();
}
