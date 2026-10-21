// What sits over the arena: round pips, the countdown, the last seconds of a
// round. Numbers are Roman, cut in stone.

import type { Game, Side } from '../../sim/game';
import { ARENA_HEIGHT as H, ARENA_WIDTH as W, FPS, ROUNDS_TO_WIN } from '../../sim/tuning';

export const SIDE_COLOUR: readonly [string, string] = ['#e0503f', '#4a86e8'];

const ROMAN = ['', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X'];

// world units are metres; text is set in this many px per metre, then scaled down
const TEXT_PX = 100;

function text(ctx: CanvasRenderingContext2D, s: string, x: number, y: number, size: number, alpha: number, scale = 1): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(scale / TEXT_PX, -scale / TEXT_PX);
  ctx.font = `600 ${size * TEXT_PX}px "Trajan Pro", "Cinzel", Georgia, "Times New Roman", serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.globalAlpha = alpha;
  // cut into stone: a dark under-edge, a pale face
  ctx.fillStyle = 'rgba(0, 0, 0, 0.55)';
  ctx.fillText(s, 0.04 * size * TEXT_PX, 0.05 * size * TEXT_PX);
  ctx.fillStyle = '#ece6d6';
  ctx.fillText(s, 0, 0);
  ctx.restore();
}

export function drawHud(ctx: CanvasRenderingContext2D, game: Game): void {
  const s = game.state;
  const left = game.phaseFramesLeft();

  // pips
  for (const side of [0, 1] as const) {
    for (let i = 0; i < ROUNDS_TO_WIN; i++) {
      const x = side === 0 ? 0.55 + i * 0.5 : W - 0.55 - i * 0.5;
      const y = H - 0.5;
      const won = i < s.wins[side];
      let r = 0.15;
      // the pip just won swells in
      if (won && i === s.wins[side] - 1 && s.phase === 'ko' && s.roundWinner === side) {
        const t = Math.min(1, (s.frame - s.phaseStart) / 20);
        r *= 1 + 0.8 * (1 - t) * (1 - t) + 0.12 * Math.sin(t * Math.PI);
      }
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      if (won) {
        ctx.fillStyle = SIDE_COLOUR[side];
        ctx.fill();
      }
      ctx.strokeStyle = won ? 'rgba(255, 245, 225, 0.5)' : 'rgba(236, 230, 214, 0.35)';
      ctx.lineWidth = 0.035;
      ctx.stroke();
    }
  }

  if (s.phase === 'countdown') {
    const n = Math.ceil(left / FPS);
    const p = 1 - ((left - 1) % FPS) / FPS;
    const scale = 1 + 0.35 * (1 - p) ** 4;
    const alpha = Math.min(1, p * 6, (1 - p) * 5 + 0.15);
    text(ctx, ROMAN[n] ?? '', W / 2, H * 0.6, 2.6, alpha, scale);
  }

  if (s.phase === 'fight' && left <= 10 * FPS) {
    const n = Math.ceil(left / FPS);
    const p = 1 - ((left - 1) % FPS) / FPS;
    text(ctx, ROMAN[n] ?? '', W / 2, H - 0.75, 0.85, 0.9, 1 + 0.15 * (1 - p) ** 3);
  }
}

// a gold laurel wreath, in the head's frame: two branches rising from the
// temples to meet over the brow
export function drawWreath(ctx: CanvasRenderingContext2D, drop: number): void {
  ctx.save();
  ctx.translate(0, drop);
  for (const dir of [-1, 1]) {
    const n = 8;
    for (let i = 0; i < n; i++) {
      const t = i / (n - 1);
      // along an arc from the temple (t=0) to the crown (t=1)
      const a = Math.PI * (0.05 + 0.4 * t);
      const x = dir * 0.47 * Math.cos(a);
      const y = -0.02 + 0.5 * Math.sin(a);
      const along = a + Math.PI / 2;
      for (const side of [-1, 1]) {
        ctx.save();
        ctx.translate(x, y);
        const angle = along + side * 0.55;
        ctx.rotate(dir > 0 ? angle : Math.PI - angle);
        leaf(ctx, 0.2 - 0.06 * t, 0.06);
        ctx.restore();
      }
    }
  }
  ctx.restore();
}

function leaf(ctx: CanvasRenderingContext2D, l: number, w: number): void {
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.quadraticCurveTo(l * 0.5, w, l, 0);
  ctx.quadraticCurveTo(l * 0.5, -w, 0, 0);
  const g = ctx.createLinearGradient(0, -w, 0, w);
  g.addColorStop(0, '#fbe38a');
  g.addColorStop(1, '#b68a1c');
  ctx.fillStyle = g;
  ctx.fill();
  ctx.strokeStyle = 'rgba(90, 60, 10, 0.6)';
  ctx.lineWidth = 0.01;
  ctx.stroke();
}

export function isWinner(game: Game, side: Side): boolean {
  return game.state.phase === 'over' && game.winner() === side;
}
