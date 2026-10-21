// The fighter's body, as data: each part's shape, where it hangs, how far its
// joint bends, and which keys drive it.
//
// Units are metres, y up. Every part is described in its own frame, centred on
// the origin and hanging straight down (angle 0), as it is when built. Right
// side parts are listed here; the left side is their mirror image.
//
// A joint angle is the child's rotation relative to its parent, counter-clockwise.
// For a right side part, positive swings it outward (away from the body's centre).

import type { Key } from './input';
import { rotate } from './trig';

export type Vec = readonly [x: number, y: number];

export const PART_NAMES = [
  'torso',
  'head',
  'lArm',
  'rArm',
  'lThigh',
  'rThigh',
  'lCalf',
  'rCalf',
] as const;
export type PartName = (typeof PART_NAMES)[number];
export type PartIndex = number;

export type Kind = 'torso' | 'head' | 'arm' | 'thigh' | 'calf';

export interface Joint {
  parent: PartName;
  // where the joint sits, in the parent's frame and in the child's
  onParent: Vec;
  onChild: Vec;
  min: number;
  max: number;
  // what the joint's motor drives toward when a key is held, or neither is
  open: number;
  close: number;
  rest: number;
}

export interface PartDef {
  name: PartName;
  kind: Kind;
  // width and height of the sprite, which the hull sits inside
  size: Vec;
  hull: readonly Vec[];
  joint: Joint | null;
  keys: { open: Key; close: Key } | null;
  // limbs come off in tiers: the lowest remaining tier first
  tier: number;
  // can hurt the other fighter by hitting them, or be hurt by being hit
  strikes: boolean;
  vulnerable: boolean;
}

const TORSO: PartDef = {
  name: 'torso',
  kind: 'torso',
  size: [1.7, 2.6],
  hull: [
    [-0.82, 0.95],
    [-0.55, 1.25],
    [0.55, 1.25],
    [0.82, 0.95],
    [0.62, -1.25],
    [-0.62, -1.25],
  ],
  joint: null,
  keys: null,
  tier: Infinity,
  strikes: false,
  vulnerable: true,
};

const HEAD: PartDef = {
  name: 'head',
  kind: 'head',
  size: [0.85, 1.15],
  hull: [
    [-0.28, 0.56],
    [0.28, 0.56],
    [0.4, 0.2],
    [0.36, -0.25],
    [0.18, -0.55],
    [-0.18, -0.55],
    [-0.36, -0.25],
    [-0.4, 0.2],
  ],
  joint: {
    parent: 'torso',
    onParent: [0, 1.15],
    onChild: [0, -0.42],
    min: -0.35,
    max: 0.35,
    open: 0,
    close: 0,
    rest: 0,
  },
  keys: null,
  tier: 3,
  strikes: false,
  vulnerable: true,
};

const R_ARM: PartDef = {
  name: 'rArm',
  kind: 'arm',
  size: [0.5, 1.95],
  hull: [
    [-0.2, 0.95],
    [0.2, 0.95],
    [0.16, -0.95],
    [-0.14, -0.95],
  ],
  joint: {
    parent: 'torso',
    onParent: [0.72, 0.98],
    onChild: [0, 0.74],
    min: -0.6,
    max: 3.0,
    open: 2.9,
    close: -0.5,
    rest: 0.25,
  },
  keys: { open: 'e', close: 'r' },
  tier: 1,
  strikes: true,
  vulnerable: false,
};

const R_THIGH: PartDef = {
  name: 'rThigh',
  kind: 'thigh',
  size: [0.62, 1.65],
  hull: [
    [-0.3, 0.8],
    [0.3, 0.8],
    [0.22, -0.8],
    [-0.22, -0.8],
  ],
  joint: {
    parent: 'torso',
    onParent: [0.42, -1.1],
    onChild: [0, 0.56],
    min: -0.45,
    max: 1.45,
    open: 1.35,
    close: -0.35,
    rest: 0.12,
  },
  keys: { open: 'q', close: 'w' },
  tier: 2,
  strikes: true,
  vulnerable: false,
};

const R_CALF: PartDef = {
  name: 'rCalf',
  kind: 'calf',
  size: [0.55, 1.8],
  hull: [
    [-0.24, 0.88],
    [0.24, 0.88],
    [0.16, -0.6],
    [0.26, -0.88],
    [-0.2, -0.88],
    [-0.16, -0.6],
  ],
  joint: {
    parent: 'rThigh',
    onParent: [0, -0.6],
    onChild: [0, 0.66],
    min: -1.3,
    max: 1.7,
    open: 1.6,
    close: -1.2,
    rest: -0.1,
  },
  keys: { open: 'o', close: 'p' },
  tier: 1,
  strikes: true,
  vulnerable: false,
};

function mirror(def: PartDef, name: PartName, parent: PartName | null): PartDef {
  const flip = ([x, y]: Vec): Vec => [-x, y];
  const j = def.joint;
  return {
    ...def,
    name,
    hull: def.hull.map(flip),
    joint: j && {
      parent: parent ?? j.parent,
      onParent: flip(j.onParent),
      onChild: flip(j.onChild),
      min: -j.max,
      max: -j.min,
      open: -j.open,
      close: -j.close,
      rest: -j.rest,
    },
  };
}

// How much longer each kind of part is than its shape above, along its length.
// The art stretches to match.
export const LENGTH: Readonly<Record<Kind, number>> = {
  torso: 1,
  head: 1,
  arm: 1.5,
  thigh: 1.25,
  calf: 1.2,
};

function stretch(def: PartDef, parentKind: Kind): PartDef {
  const k = LENGTH[def.kind];
  const long = ([x, y]: Vec, by: number): Vec => [x, y * by];
  const j = def.joint;
  return {
    ...def,
    size: long(def.size, k),
    hull: def.hull.map((p) => long(p, k)),
    joint: j && {
      ...j,
      onParent: long(j.onParent, LENGTH[parentKind]),
      onChild: long(j.onChild, k),
    },
  };
}

// in PART_NAMES order, parents before children
export const PARTS: readonly PartDef[] = [
  TORSO,
  HEAD,
  mirror(R_ARM, 'lArm', null),
  R_ARM,
  mirror(R_THIGH, 'lThigh', null),
  R_THIGH,
  mirror(R_CALF, 'lCalf', 'lThigh'),
  R_CALF,
].map((def, _, all) => {
  const parent = all.find((p) => p.name === def.joint?.parent);
  return stretch(def, parent?.kind ?? 'torso');
});

export function partIndex(name: PartName): PartIndex {
  return PART_NAMES.indexOf(name);
}

// The body as built: every joint at its rest angle, so no muscle starts out
// straining. Each part's centre and angle relative to the torso's centre.
export const BUILD_POSE: readonly { at: Vec; angle: number }[] = (() => {
  const out: { at: Vec; angle: number }[] = [];
  for (const def of PARTS) {
    if (!def.joint) {
      out.push({ at: [0, 0], angle: 0 });
      continue;
    }
    const parent = out[partIndex(def.joint.parent)]!;
    const angle = parent.angle + def.joint.rest;
    const pivot = rotate(def.joint.onParent, parent.angle);
    const back = rotate(def.joint.onChild, angle);
    out.push({
      at: [parent.at[0] + pivot[0] - back[0], parent.at[1] + pivot[1] - back[1]],
      angle,
    });
  }
  return out;
})();

// lowest point of the body as built, relative to the torso centre
export const FEET_DEPTH = Math.min(
  ...PARTS.flatMap((def, i) => {
    const { at, angle } = BUILD_POSE[i]!;
    return def.hull.map((p) => at[1] + rotate(p, angle)[1]);
  }),
);
