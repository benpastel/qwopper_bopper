// sin and cos from + and * alone, so every browser gets the same bits
// (Math.sin and Math.cos are allowed to differ). Accurate to ~1e-12 for |x| <= π.

export function sin(x: number): number {
  const x2 = x * x;
  let term = x;
  let sum = x;
  for (let n = 1; n < 12; n++) {
    term *= -x2 / ((2 * n) * (2 * n + 1));
    sum += term;
  }
  return sum;
}

export function cos(x: number): number {
  const x2 = x * x;
  let term = 1;
  let sum = 1;
  for (let n = 1; n < 12; n++) {
    term *= -x2 / ((2 * n - 1) * (2 * n));
    sum += term;
  }
  return sum;
}

export function rotate([x, y]: readonly [number, number], angle: number): [number, number] {
  const c = cos(angle);
  const s = sin(angle);
  return [x * c - y * s, x * s + y * c];
}
