// Draws the match: a gallery, two marble statues made of photos, and what
// happens to them. Everything is drawn from the game state alone, so a
// rollback that rewrites the past redraws correctly on the next frame.

import { LENGTH, PARTS, type PartIndex, type Vec } from '../sim/body';
import type { Game, Side } from '../sim/game';
import { held, type Input, type Key } from '../sim/input';
import { ARENA_HEIGHT as H, ARENA_WIDTH as W } from '../sim/tuning';
import { COLUMN_WIDTH, drawColumns, drawFloor, drawRoom, type Bounds } from './art/arena';
import { atRisk, drawCracks, drawHits, flashOn, shake } from './art/effects';
import { drawHud, drawWreath, isWinner, SIDE_COLOUR } from './art/hud';
import { loadSprites, type Sprite, type SpriteName } from './art/sprites';

export interface View {
  // which fighter is the local player
  you: Side;
  // the keys the local player is holding now
  held: Input;
  names: readonly [string, string];
}

// what must fit on screen, in metres
const VIEW = { x0: -COLUMN_WIDTH - 0.15, x1: W + COLUMN_WIDTH + 0.15, y0: -0.9, y1: H + 0.1 };

// back to front: legs behind the torso (thighs over calves, for knees), arms
// behind it too so the shoulder stumps sit over them, the head on top
const ORDER: readonly PartIndex[] = [6, 7, 4, 5, 2, 3, 0, 1];

// where the letters sit on a right side part (x mirrored for the left), and how big
const LETTERS: Partial<Record<string, { y: number; dx: number; size: number }>> = {
  arm: { y: 0.12, dx: 0.085, size: 0.22 },
  thigh: { y: 0.02, dx: 0.13, size: 0.3 },
  calf: { y: 0.28, dx: 0.105, size: 0.24 },
};

const TEXT_PX = 100;

export class Renderer {
  private readonly ctx: CanvasRenderingContext2D;
  private sprites: Record<SpriteName, Sprite> | null = null;
  // device px per metre, and where the world origin lands
  private k = 1;
  private ox = 0;
  private oy = 0;

  constructor(private readonly canvas: HTMLCanvasElement) {
    this.ctx = canvas.getContext('2d')!;
  }

  // load sprites; draw() may be called before this resolves
  async load(): Promise<void> {
    this.sprites = await loadSprites();
  }

  dispose(): void {
    this.sprites = null;
  }

  draw(game: Game, view: View): void {
    this.fit();
    const { ctx, canvas } = this;
    const state = game.state;
    const [sx, sy] = shake(state);

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#151c1b';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    this.world(sx * 0.3, sy * 0.3);
    const b = this.bounds(sx * 0.3, sy * 0.3);
    drawRoom(ctx, b);

    // the order the fighters go down in: the local player in front
    const sides: Side[] = view.you === 0 ? [1, 0] : [0, 1];

    // reflections in the polished floor
    ctx.save();
    ctx.beginPath();
    ctx.rect(b.x0, b.y0, b.x1 - b.x0, -b.y0);
    ctx.clip();
    this.world(sx * 0.3, sy * 0.3, true);
    ctx.globalAlpha = 0.22;
    for (const side of sides) this.drawFighter(game, side, view, false);
    for (const side of sides) this.drawFighter(game, side, view, true);
    ctx.restore();
    this.world(sx * 0.3, sy * 0.3);
    drawFloor(ctx, b);
    drawColumns(ctx, b);

    this.world(sx, sy);
    for (const side of sides) this.drawFighter(game, side, view, false);
    for (const side of sides) this.drawFighter(game, side, view, true);
    drawHits(ctx, state);

    this.world(0, 0);
    drawHud(ctx, game);
  }

  // ---------------------------------------------------------------- framing

  private fit(): void {
    const { canvas } = this;
    const dpr = window.devicePixelRatio || 1;
    const w = Math.round(canvas.clientWidth * dpr);
    const h = Math.round(canvas.clientHeight * dpr);
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }
    const vw = VIEW.x1 - VIEW.x0;
    const vh = VIEW.y1 - VIEW.y0;
    this.k = Math.min(w / vw, h / vh);
    this.ox = (w - vw * this.k) / 2 - VIEW.x0 * this.k;
    this.oy = (h + vh * this.k) / 2 + VIEW.y0 * this.k;
  }

  // world coordinates, y up (or down, for a reflection in the floor)
  private world(dx: number, dy: number, mirrored = false): void {
    const { k } = this;
    this.ctx.setTransform(k, 0, 0, mirrored ? k : -k, this.ox + dx * k, this.oy - dy * k);
  }

  // everything on the canvas, in world coordinates
  private bounds(dx: number, dy: number): Bounds {
    const { k, canvas } = this;
    const ox = this.ox + dx * k;
    const oy = this.oy - dy * k;
    return {
      x0: -ox / k - 0.5,
      x1: (canvas.width - ox) / k + 0.5,
      y0: -(canvas.height - oy) / k - 0.5,
      y1: oy / k + 0.5,
    };
  }

  // ---------------------------------------------------------------- fighters

  // one fighter's loose parts (debris) or attached ones
  private drawFighter(game: Game, side: Side, view: View, attached: boolean): void {
    const f = game.state.fighters[side];
    if (f.bodies.length === 0) return;
    const risky = attached ? atRisk(f.attached) : [];
    for (const i of ORDER) {
      if (f.attached[i] !== attached) continue;
      const pose = game.pose(side, i);
      const ctx = this.ctx;
      ctx.save();
      ctx.translate(pose.x, pose.y);
      ctx.rotate(pose.angle);
      this.drawPart(game, side, i, view, attached, risky.includes(i));
      ctx.restore();
    }
  }

  private drawPart(game: Game, side: Side, i: PartIndex, view: View, attached: boolean, risky: boolean): void {
    const ctx = this.ctx;
    const def = PARTS[i]!;
    const left = def.name.startsWith('l');
    const name: SpriteName = def.kind === 'head' ? (side === 0 ? 'head0' : 'head1') : def.kind;
    const sprite = this.sprites?.[name];

    ctx.save();
    // a limb that has broken off has a jagged end
    if (!attached && def.joint && def.kind !== 'head') clipBreak(ctx, def.joint.onChild[1], def.size[0], i + side * 8);
    if (left) ctx.scale(-1, 1);

    if (sprite) {
      const [l, bt, r, t] = sprite.place;
      ctx.save();
      ctx.scale(1, -LENGTH[def.kind]);
      ctx.drawImage(sprite.image, l, -t, r - l, t - bt);
      const flash = flashOn(game.state, side, i);
      if (flash > 0) {
        ctx.globalAlpha *= flash;
        ctx.drawImage(sprite.flash, l, -t, r - l, t - bt);
      }
      ctx.restore();
    } else {
      // before the photos arrive
      ctx.beginPath();
      for (const [x, y] of def.hull) ctx.lineTo(left ? -x : x, y);
      ctx.closePath();
      ctx.fillStyle = def.kind === 'head' ? SIDE_COLOUR[side] : '#d8d2c2';
      ctx.fill();
    }
    ctx.restore();

    if (!attached && def.joint && def.kind !== 'head') {
      breakEdge(ctx, def.hull, def.joint.onChild[1], def.size[0], i + side * 8);
    }

    if (risky) drawCracks(ctx, side, i, game.state.fighters[side].damage);

    if (def.keys) {
      const spot = LETTERS[def.kind];
      if (spot) {
        const sign = left ? -1 : 1;
        const lit = side === view.you && attached;
        const y = spot.y * LENGTH[def.kind];
        letter(ctx, def.keys.open, sign * spot.dx, y, spot.size, lit && held(view.held, def.keys.open), side);
        letter(ctx, def.keys.close, -sign * spot.dx, y, spot.size, lit && held(view.held, def.keys.close), side);
      }
    }

    if (def.kind === 'head' && isWinner(game, side)) {
      const t = Math.min(1, (game.state.frame - game.state.phaseStart) / 40);
      drawWreath(ctx, 1.5 * (1 - t) ** 3);
    }
  }
}

function letter(ctx: CanvasRenderingContext2D, key: Key, x: number, y: number, size: number, lit: boolean, side: Side): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(1 / TEXT_PX, -1 / TEXT_PX);
  ctx.font = `700 ${size * TEXT_PX}px "Helvetica Neue", Helvetica, Arial, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const s = key.toUpperCase();
  if (lit) {
    // glowing, in the fighter's colour
    ctx.shadowColor = SIDE_COLOUR[side];
    ctx.shadowBlur = size * TEXT_PX * 1.2;
    ctx.lineWidth = size * TEXT_PX * 0.12;
    ctx.strokeStyle = SIDE_COLOUR[side];
    ctx.strokeText(s, 0, 0);
    ctx.fillStyle = '#fff';
    ctx.fillText(s, 0, 0);
    ctx.shadowBlur = size * TEXT_PX * 0.4;
    ctx.fillText(s, 0, 0);
  } else {
    // cut into the stone
    ctx.fillStyle = 'rgba(255, 252, 240, 0.55)';
    ctx.fillText(s, 1.5, 2);
    ctx.fillStyle = 'rgba(52, 44, 34, 0.7)';
    ctx.fillText(s, 0, 0);
  }
  ctx.restore();
}

// the jagged line a broken limb ends in, just below its joint
function breakPoints(y: number, width: number, seed: number): [number, number][] {
  const pts: [number, number][] = [];
  const n = 7;
  let s = seed * 9301 + 49297;
  for (let i = 0; i <= n; i++) {
    s = (s * 9301 + 49297) % 233280;
    const x = -width * 0.6 + (width * 1.2 * i) / n;
    pts.push([x, y + 0.02 + ((s / 233280) - 0.5) * 0.14]);
  }
  return pts;
}

function clipBreak(ctx: CanvasRenderingContext2D, y: number, width: number, seed: number): void {
  const pts = breakPoints(y, width, seed);
  ctx.beginPath();
  ctx.moveTo(-width, -10);
  for (const [x, py] of pts) ctx.lineTo(x, py);
  ctx.lineTo(width, -10);
  ctx.closePath();
  ctx.clip();
}

function breakEdge(ctx: CanvasRenderingContext2D, hull: readonly Vec[], y: number, width: number, seed: number): void {
  const pts = breakPoints(y, width, seed);
  ctx.save();
  ctx.beginPath();
  for (const [x, hy] of hull) ctx.lineTo(x, hy);
  ctx.clip();
  ctx.beginPath();
  pts.forEach(([x, py], n) => (n === 0 ? ctx.moveTo(x, py) : ctx.lineTo(x, py)));
  ctx.strokeStyle = 'rgba(255, 252, 244, 0.75)';
  ctx.lineWidth = 0.035;
  ctx.lineJoin = 'round';
  ctx.stroke();
  ctx.restore();
}
