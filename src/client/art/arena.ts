// The gallery: a dark wall, a polished floor, a marble column at each side
// standing where the arena's walls are.

import { ARENA_HEIGHT as H, ARENA_WIDTH as W } from '../../sim/tuning';

export interface Bounds {
  x0: number;
  x1: number;
  y0: number;
  y1: number;
}

export const COLUMN_WIDTH = 0.9;

// in world coordinates, covering everything in bounds
export function drawRoom(ctx: CanvasRenderingContext2D, b: Bounds): void {
  // wall
  const wall = ctx.createLinearGradient(0, b.y1, 0, 0);
  wall.addColorStop(0, '#151c1b');
  wall.addColorStop(0.55, '#223230');
  wall.addColorStop(1, '#2a3a37');
  ctx.fillStyle = wall;
  ctx.fillRect(b.x0, 0, b.x1 - b.x0, b.y1);

  // a wash of light from above the middle
  ctx.save();
  ctx.translate(W / 2, H * 0.9);
  ctx.scale(1.6, 1);
  const light = ctx.createRadialGradient(0, 0, 0, 0, 0, H * 0.85);
  light.addColorStop(0, 'rgba(255, 236, 200, 0.13)');
  light.addColorStop(1, 'rgba(255, 236, 200, 0)');
  ctx.fillStyle = light;
  ctx.fillRect(-W, -H * 2, W * 2, H * 3);
  ctx.restore();

  // wainscot below a rail
  const rail = 1.25;
  ctx.fillStyle = 'rgba(0, 0, 0, 0.16)';
  ctx.fillRect(b.x0, 0, b.x1 - b.x0, rail);
  ctx.fillStyle = 'rgba(255, 240, 210, 0.07)';
  ctx.fillRect(b.x0, rail, b.x1 - b.x0, 0.05);
  ctx.fillStyle = 'rgba(0, 0, 0, 0.25)';
  ctx.fillRect(b.x0, rail - 0.04, b.x1 - b.x0, 0.04);
  // skirting
  ctx.fillStyle = '#18201f';
  ctx.fillRect(b.x0, 0, b.x1 - b.x0, 0.22);
  ctx.fillStyle = 'rgba(255, 240, 210, 0.06)';
  ctx.fillRect(b.x0, 0.2, b.x1 - b.x0, 0.025);
}

export function drawFloor(ctx: CanvasRenderingContext2D, b: Bounds): void {
  const floor = ctx.createLinearGradient(0, 0, 0, b.y0);
  floor.addColorStop(0, 'rgba(58, 44, 33, 0.82)');
  floor.addColorStop(1, 'rgba(26, 19, 14, 0.97)');
  ctx.fillStyle = floor;
  ctx.fillRect(b.x0, b.y0, b.x1 - b.x0, -b.y0);
  // boards, closer together toward the back
  ctx.strokeStyle = 'rgba(0, 0, 0, 0.25)';
  ctx.lineWidth = 0.015;
  for (const y of [-0.12, -0.3, -0.56, -0.9, -1.35]) {
    if (y < b.y0) break;
    ctx.beginPath();
    ctx.moveTo(b.x0, y);
    ctx.lineTo(b.x1, y);
    ctx.stroke();
  }
  // the floor's front lip
  ctx.fillStyle = 'rgba(255, 230, 190, 0.16)';
  ctx.fillRect(b.x0, -0.025, b.x1 - b.x0, 0.025);
}

export function drawColumns(ctx: CanvasRenderingContext2D, b: Bounds): void {
  for (const x of [-COLUMN_WIDTH, W]) column(ctx, x, b);
}

function column(ctx: CanvasRenderingContext2D, x: number, b: Bounds): void {
  const w = COLUMN_WIDTH;
  const top = b.y1;
  // plinth
  const plinthH = 0.45;
  ctx.fillStyle = shaft(ctx, x - 0.12, w + 0.24);
  ctx.fillRect(x - 0.12, 0, w + 0.24, plinthH);
  ctx.fillStyle = 'rgba(0, 0, 0, 0.25)';
  ctx.fillRect(x - 0.12, plinthH - 0.03, w + 0.24, 0.03);
  // torus
  ctx.fillStyle = shaft(ctx, x - 0.06, w + 0.12);
  ctx.fillRect(x - 0.06, plinthH, w + 0.12, 0.16);
  ctx.fillStyle = 'rgba(0, 0, 0, 0.2)';
  ctx.fillRect(x - 0.06, plinthH + 0.13, w + 0.12, 0.03);
  // shaft
  const y0 = plinthH + 0.16;
  ctx.fillStyle = shaft(ctx, x, w);
  ctx.fillRect(x, y0, w, top - y0);
  // flutes
  const flutes = 5;
  for (let i = 0; i < flutes; i++) {
    const fx = x + (w * (i + 0.5)) / flutes;
    ctx.fillStyle = 'rgba(60, 54, 42, 0.18)';
    ctx.fillRect(fx - 0.035, y0 + 0.08, 0.07, top - y0);
    ctx.fillStyle = 'rgba(255, 250, 235, 0.18)';
    ctx.fillRect(fx + 0.035, y0 + 0.08, 0.015, top - y0);
  }
}

function shaft(ctx: CanvasRenderingContext2D, x: number, w: number): CanvasGradient {
  const g = ctx.createLinearGradient(x, 0, x + w, 0);
  g.addColorStop(0, '#7d786b');
  g.addColorStop(0.3, '#d8d2c2');
  g.addColorStop(0.55, '#e8e3d5');
  g.addColorStop(1, '#8f8a7c');
  return g;
}
