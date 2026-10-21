// The statue photos, cut out of their backgrounds and turned into sprites once,
// at load: letters painted out, limbs graded to match the torso's marble, heads
// tinted per side, every part masked to a smooth silhouette with a shaded rim.

export type SpriteName = 'torso' | 'head0' | 'head1' | 'arm' | 'thigh' | 'calf';

type Pt = readonly [number, number];

interface Spec {
  src: string;
  // the part of the photo to use, as fractions of its size: x0, y0, x1, y1
  crop: readonly [number, number, number, number];
  // mirror the left half about this x, for a symmetrical torso
  mirrorAt?: number;
  // the photo is of a left limb: mirror it so the sprite is of a right one
  mirror?: boolean;
  // the photo is upside down for us (an arm raised, hand up)
  flipY?: boolean;
  // bands of rows (photo fractions) holding painted letters, to fill from above and below
  paintOut?: readonly (readonly [number, number])[];
  grade?: boolean;
  tint?: string;
  // the silhouette, in photo fractions (for mirrorAt, only the left half, top to bottom)
  outline: readonly Pt[];
  // where the crop lands in the part's frame (metres, y up): left, bottom, right, top
  place: readonly [number, number, number, number];
}

const SPECS: Record<SpriteName, Spec> = {
  torso: {
    src: 'torso.jpg',
    crop: [0.03, 0, 0.45, 1],
    mirrorAt: 0.45,
    outline: [
      [0.45, 0.02],
      [0.36, 0.02],
      [0.345, 0.1],
      [0.29, 0.12],
      [0.18, 0.145],
      [0.09, 0.175],
      [0.05, 0.215],
      [0.045, 0.26],
      [0.075, 0.31],
      [0.13, 0.36],
      [0.175, 0.41],
      [0.198, 0.48],
      [0.2, 0.56],
      [0.19, 0.63],
      [0.172, 0.68],
      [0.166, 0.78],
      [0.16, 0.88],
      [0.162, 0.935],
      [0.21, 0.955],
      [0.32, 0.962],
      [0.45, 0.968],
    ],
    place: [-0.81, -1.38, 0.81, 1.61],
  },
  head0: {
    src: 'red_head.jpg',
    crop: [0.02, 0.02, 0.96, 0.84],
    tint: '#ff6a55',
    outline: [
      [0.5, 0.035],
      [0.3, 0.05],
      [0.15, 0.1],
      [0.06, 0.19],
      [0.035, 0.33],
      [0.06, 0.48],
      [0.12, 0.6],
      [0.2, 0.7],
      [0.3, 0.77],
      [0.44, 0.81],
      [0.6, 0.8],
      [0.74, 0.73],
      [0.84, 0.61],
      [0.9, 0.46],
      [0.92, 0.3],
      [0.89, 0.16],
      [0.79, 0.07],
      [0.66, 0.04],
    ],
    place: [-0.44, -0.6, 0.44, 0.62],
  },
  head1: {
    src: 'blue_head.jpg',
    crop: [0.02, 0.02, 0.96, 0.86],
    tint: '#5d8dff',
    outline: [
      [0.5, 0.03],
      [0.3, 0.05],
      [0.15, 0.1],
      [0.06, 0.2],
      [0.035, 0.34],
      [0.07, 0.49],
      [0.13, 0.6],
      [0.2, 0.71],
      [0.29, 0.8],
      [0.42, 0.845],
      [0.56, 0.845],
      [0.7, 0.8],
      [0.81, 0.7],
      [0.89, 0.55],
      [0.94, 0.4],
      [0.94, 0.25],
      [0.87, 0.12],
      [0.74, 0.05],
    ],
    place: [-0.44, -0.62, 0.44, 0.62],
  },
  arm: {
    src: 'larm.jpg',
    crop: [0, 0, 1, 1],
    mirror: true,
    flipY: true,
    paintOut: [[0.405, 0.515]],
    grade: true,
    outline: [
      [0.7, 0.012],
      [0.78, 0.04],
      [0.77, 0.15],
      [0.74, 0.26],
      [0.76, 0.36],
      [0.8, 0.5],
      [0.83, 0.64],
      [0.87, 0.8],
      [0.93, 0.9],
      [0.97, 0.995],
      [0.5, 0.998],
      [0.03, 0.995],
      [0.05, 0.85],
      [0.07, 0.66],
      [0.12, 0.46],
      [0.2, 0.35],
      [0.31, 0.25],
      [0.4, 0.17],
      [0.46, 0.09],
      [0.55, 0.05],
      [0.62, 0.02],
    ],
    place: [-0.25, -0.98, 0.25, 0.98],
  },
  thigh: {
    src: 'lthigh.jpg',
    crop: [0, 0.02, 1, 1],
    mirror: true,
    paintOut: [[0.415, 0.6]],
    grade: true,
    outline: [
      [0.08, 0.03],
      [0.5, 0.02],
      [0.95, 0.03],
      [0.975, 0.25],
      [0.965, 0.5],
      [0.93, 0.75],
      [0.86, 0.985],
      [0.55, 0.995],
      [0.25, 0.985],
      [0.16, 0.75],
      [0.1, 0.5],
      [0.07, 0.25],
    ],
    place: [-0.32, -0.84, 0.32, 0.84],
  },
  calf: {
    src: 'lcalf.jpg',
    crop: [0, 0.2, 1, 1],
    mirror: true,
    paintOut: [[0.43, 0.555]],
    grade: true,
    outline: [
      [0.24, 0.205],
      [0.6, 0.2],
      [0.9, 0.21],
      [0.9, 0.35],
      [0.86, 0.5],
      [0.88, 0.62],
      [0.9, 0.75],
      [0.89, 0.86],
      [0.9, 0.95],
      [0.85, 0.995],
      [0.5, 0.998],
      [0.14, 0.995],
      [0.11, 0.93],
      [0.19, 0.83],
      [0.3, 0.75],
      [0.37, 0.68],
      [0.33, 0.6],
      [0.17, 0.48],
      [0.13, 0.36],
      [0.15, 0.26],
    ],
    place: [-0.25, -0.9, 0.27, 0.9],
  },
};

export interface Sprite {
  image: HTMLCanvasElement;
  // the same silhouette in flat white, for hit flashes
  flash: HTMLCanvasElement;
  place: readonly [number, number, number, number];
}

// px per photo px in the sprites, so masked edges stay smooth when scaled up
const UPSCALE = 3;

export async function loadSprites(): Promise<Record<SpriteName, Sprite>> {
  const names = Object.keys(SPECS) as SpriteName[];
  const built = await Promise.all(names.map((n) => build(SPECS[n])));
  return Object.fromEntries(names.map((n, i) => [n, built[i]!])) as Record<SpriteName, Sprite>;
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`could not load ${src}`));
    img.src = src;
  });
}

function canvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return [c, c.getContext('2d', { willReadFrequently: true })!];
}

async function build(spec: Spec): Promise<Sprite> {
  const img = await loadImage(`${import.meta.env.BASE_URL}statues/${spec.src}`);
  const W = img.naturalWidth;
  const H = img.naturalHeight;
  const [cx0, cy0, cx1, cy1] = spec.crop;
  const sx = Math.round(cx0 * W);
  const sy = Math.round(cy0 * H);
  const sw = Math.round((cx1 - cx0) * W);
  const sh = Math.round((cy1 - cy0) * H);

  // 1. the crop, at photo resolution, with pixel work done on it
  const [work, wctx] = canvas(sw, sh);
  wctx.drawImage(img, sx, sy, sw, sh, 0, 0, sw, sh);
  const data = wctx.getImageData(0, 0, sw, sh);
  for (const [a, b] of spec.paintOut ?? []) {
    paintOut(data, Math.round((a - cy0) * H), Math.round((b - cy0) * H));
  }
  if (spec.grade) grade(data);
  wctx.putImageData(data, 0, 0);

  // photo fractions -> crop px
  let outline: Pt[] = spec.outline.map(([x, y]) => [x * W - sx, y * H - sy]);
  let src: HTMLCanvasElement = work;

  // 2. mirroring
  if (spec.mirrorAt !== undefined) {
    const half = sw;
    const [m, mctx] = canvas(half * 2, sh);
    mctx.drawImage(work, 0, 0);
    mctx.translate(half * 2, 0);
    mctx.scale(-1, 1);
    mctx.drawImage(work, 0, 0);
    src = m;
    outline = [...outline, ...outline.slice().reverse().map(([x, y]): Pt => [half * 2 - x, y])];
  }
  const w = src.width;
  const h = src.height;
  if (spec.mirror) outline = outline.map(([x, y]) => [w - x, y]);
  if (spec.flipY) outline = outline.map(([x, y]) => [x, h - y]);

  // 3. the sprite, upscaled, tinted, masked and rimmed
  const ow = w * UPSCALE;
  const oh = h * UPSCALE;
  const [out, o] = canvas(ow, oh);
  o.imageSmoothingQuality = 'high';
  o.save();
  if (spec.mirror) {
    o.translate(ow, 0);
    o.scale(-1, 1);
  }
  if (spec.flipY) {
    o.translate(0, oh);
    o.scale(1, -1);
  }
  o.drawImage(src, 0, 0, ow, oh);
  o.restore();

  if (spec.tint) {
    o.globalCompositeOperation = 'multiply';
    o.globalAlpha = 0.6;
    o.fillStyle = spec.tint;
    o.fillRect(0, 0, ow, oh);
    o.globalAlpha = 1;
  }

  const path = smoothPath(outline.map(([x, y]) => [x * UPSCALE, y * UPSCALE]));
  o.globalCompositeOperation = 'destination-in';
  o.fillStyle = '#000';
  o.fill(path);

  // a soft dark rim inside the silhouette, so each part reads as round stone
  o.globalCompositeOperation = 'source-atop';
  o.filter = `blur(${UPSCALE * 2}px)`;
  o.strokeStyle = 'rgba(40, 34, 26, 0.55)';
  o.lineWidth = UPSCALE * 5;
  o.stroke(path);
  o.filter = 'none';
  o.globalCompositeOperation = 'source-over';

  const [flash, f] = canvas(ow, oh);
  f.fillStyle = '#fff';
  f.fill(path);

  return { image: out, flash, place: spec.place };
}

// A closed curve through the midpoints of the outline, the points as controls.
function smoothPath(pts: readonly Pt[]): Path2D {
  const p = new Path2D();
  const n = pts.length;
  const mid = (i: number): Pt => {
    const a = pts[i % n]!;
    const b = pts[(i + 1) % n]!;
    return [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
  };
  const start = mid(0);
  p.moveTo(start[0], start[1]);
  for (let i = 1; i <= n; i++) {
    const c = pts[i % n]!;
    const m = mid(i);
    p.quadraticCurveTo(c[0], c[1], m[0], m[1]);
  }
  p.closePath();
  return p;
}

// Fill rows [a, b) column by column, blending the row above into the row below,
// with a little grain so the patch doesn't look smeared.
function paintOut(img: ImageData, a: number, b: number): void {
  const { width, height, data } = img;
  const top = Math.max(0, a - 1);
  const bottom = Math.min(height - 1, b);
  let seed = 1234567;
  const rand = () => {
    seed = (Math.imul(seed, 1103515245) + 12345) >>> 0;
    return seed / 2 ** 32;
  };
  for (let x = 0; x < width; x++) {
    // average a few pixels either side of the band for steadier ends
    const sample = (y: number, dir: number): number[] => {
      const acc = [0, 0, 0];
      for (let k = 0; k < 3; k++) {
        const yy = Math.min(height - 1, Math.max(0, y + dir * k));
        for (let c = 0; c < 3; c++) acc[c]! += data[(yy * width + x) * 4 + c]! / 3;
      }
      return acc;
    };
    const t0 = sample(top, -1);
    const t1 = sample(bottom, 1);
    for (let y = a; y < b; y++) {
      const t = (y - top) / (bottom - top);
      const grain = (rand() - 0.5) * 14;
      for (let c = 0; c < 3; c++) {
        data[(y * width + x) * 4 + c] = t0[c]! * (1 - t) + t1[c]! * t + grain;
      }
    }
  }
}

// Recolour to the torso's warm marble: luminance, stretched, mapped through a ramp.
const RAMP: readonly (readonly [number, number, number])[] = [
  [96, 90, 76],
  [168, 163, 146],
  [212, 208, 192],
  [240, 237, 225],
];

function grade(img: ImageData): void {
  const { data } = img;
  const lum: number[] = [];
  for (let i = 0; i < data.length; i += 4) {
    lum.push(0.3 * data[i]! + 0.59 * data[i + 1]! + 0.11 * data[i + 2]!);
  }
  const sorted = lum.slice().sort((x, y) => x - y);
  const lo = sorted[Math.floor(sorted.length * 0.03)]!;
  const hi = sorted[Math.floor(sorted.length * 0.97)]!;
  for (let p = 0; p < lum.length; p++) {
    let t = (lum[p]! - lo) / Math.max(1, hi - lo);
    t = Math.min(1, Math.max(0, t));
    // lift the mids: marble is mostly light
    t = Math.pow(t, 0.7);
    const f = t * (RAMP.length - 1);
    const k = Math.min(RAMP.length - 2, Math.floor(f));
    const u = f - k;
    const c0 = RAMP[k]!;
    const c1 = RAMP[k + 1]!;
    for (let c = 0; c < 3; c++) data[p * 4 + c] = c0[c]! * (1 - u) + c1[c]! * u;
  }
}
