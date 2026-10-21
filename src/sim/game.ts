// The whole game, deterministic: the same seed and the same inputs give the same
// result on any machine. Rollback depends on that, so nothing in here reads the
// clock, Math.random, or Math's transcendental functions (which can differ
// between browsers); randomness comes from the seeded rng kept in the state.
//
// The state is two halves: the Rapier world, which snapshots to bytes, and a
// plain object for everything else, which clones.

import RAPIER from '@dimforge/rapier2d-deterministic-compat';
import { BUILD_POSE, FEET_DEPTH, PARTS, type PartIndex } from './body';
import { held, type Input } from './input';
import { next } from './rng';
import * as T from './tuning';

export async function initPhysics(): Promise<void> {
  await RAPIER.init();
}

export type Side = 0 | 1;
export const SIDES: readonly Side[] = [0, 1];
export function other(side: Side): Side {
  return side === 0 ? 1 : 0;
}

export type Phase = 'countdown' | 'fight' | 'ko' | 'over';

export interface Hit {
  frame: number;
  victim: Side;
  part: PartIndex;
  x: number;
  y: number;
  amount: number;
}

export interface FighterState {
  // toward the next limb coming off
  damage: number;
  attached: boolean[];
  // Rapier handles, by part
  bodies: number[];
  colliders: number[];
  joints: (number | null)[];
  // the frame each part can next land a hit
  readyAt: number[];
}

export interface State {
  frame: number;
  rng: number;
  phase: Phase;
  phaseStart: number;
  round: number;
  wins: [number, number];
  // who took the round that just ended; null for a draw
  roundWinner: Side | null;
  fighters: [FighterState, FighterState];
  hits: Hit[];
}

export interface Saved {
  world: Uint8Array;
  state: State;
}

export interface Pose {
  x: number;
  y: number;
  angle: number;
}

// collision groups: what each collider is, and what it touches
const WORLD = 1;
const FIGHTER: readonly [number, number] = [2, 4];
const DEBRIS = 8;
const ALL = 0xffff;
function groups(membership: number, filter: number): number {
  return (membership << 16) | filter;
}
const DEBRIS_GROUPS = groups(DEBRIS, ALL);

export class Game {
  world: RAPIER.World;
  state: State;
  private events = new RAPIER.EventQueue(true);

  constructor(seed: number) {
    this.state = {
      frame: 0,
      rng: seed | 0,
      phase: 'countdown',
      phaseStart: 0,
      round: 1,
      wins: [0, 0],
      roundWinner: null,
      fighters: [emptyFighter(), emptyFighter()],
      hits: [],
    };
    this.world = this.buildWorld();
  }

  // ---------------------------------------------------------------- snapshots

  save(): Saved {
    return { world: this.world.takeSnapshot(), state: structuredClone(this.state) };
  }

  load(saved: Saved): void {
    this.world.free();
    this.world = RAPIER.World.restoreSnapshot(saved.world);
    this.state = structuredClone(saved.state);
    this.events.clear();
  }

  dispose(): void {
    this.world.free();
    this.events.free();
  }

  // A hash of everything that matters, to compare between peers.
  checksum(): number {
    const floats: number[] = [];
    for (const f of this.state.fighters) {
      for (const h of f.bodies) {
        const b = this.world.getRigidBody(h);
        const p = b.translation();
        const v = b.linvel();
        floats.push(p.x, p.y, b.rotation(), v.x, v.y, b.angvel());
      }
      floats.push(f.damage);
    }
    let hash = fnv(new Uint8Array(new Float64Array(floats).buffer));
    const s = this.state;
    for (const n of [s.frame, s.rng, s.round, s.wins[0], s.wins[1], s.phaseStart]) {
      hash = Math.imul(hash ^ n, 16777619) >>> 0;
    }
    return hash;
  }

  // ---------------------------------------------------------------- reading

  pose(side: Side, part: PartIndex): Pose {
    const b = this.world.getRigidBody(this.state.fighters[side].bodies[part]!);
    const p = b.translation();
    return { x: p.x, y: p.y, angle: b.rotation() };
  }

  // frames left in the current phase, where it has a length
  phaseFramesLeft(): number {
    const s = this.state;
    const elapsed = s.frame - s.phaseStart;
    switch (s.phase) {
      case 'countdown':
        return T.COUNTDOWN_FRAMES - elapsed;
      case 'fight':
        return T.ROUND_FRAMES - elapsed;
      case 'ko':
        return T.KO_FRAMES - elapsed;
      case 'over':
        return 0;
    }
  }

  // ---------------------------------------------------------------- stepping

  step(inputs: readonly [Input, Input]): void {
    const s = this.state;
    for (const side of SIDES) {
      const live =
        s.phase === 'fight' || (s.phase === 'ko' && s.roundWinner === side) || s.phase === 'over';
      this.drive(side, live ? inputs[side] : 0);
      this.keepUpright(side);
    }

    this.world.step(this.events);
    this.events.drainContactForceEvents((e) => {
      this.contact(e.collider1(), e.collider2(), e.totalForceMagnitude());
    });

    s.frame++;
    s.hits = s.hits.filter((h) => s.frame - h.frame < T.HIT_MEMORY_FRAMES);
    this.advancePhase();
  }

  private drive(side: Side, input: Input): void {
    const f = this.state.fighters[side];
    PARTS.forEach((def, i) => {
      const handle = f.joints[i];
      if (!def.joint || handle == null || !f.attached[i]) return;
      const joint = this.world.getImpulseJoint(handle) as RAPIER.RevoluteImpulseJoint;
      if (!def.keys) {
        joint.configureMotorPosition(def.joint.rest, T.NECK_STIFFNESS, T.NECK_DAMPING);
        return;
      }
      const open = held(input, def.keys.open);
      const close = held(input, def.keys.close);
      if (open !== close) {
        const target = open ? def.joint.open : def.joint.close;
        joint.configureMotorPosition(target, T.DRIVE_STIFFNESS, T.DRIVE_DAMPING);
      } else {
        joint.configureMotorPosition(def.joint.rest, T.REST_STIFFNESS, T.REST_DAMPING);
      }
    });
  }

  private keepUpright(side: Side): void {
    const f = this.state.fighters[side];
    const torso = this.world.getRigidBody(f.bodies[0]!);
    const torque = -(T.UPRIGHT_STIFFNESS * torso.rotation() + T.UPRIGHT_DAMPING * torso.angvel());
    torso.applyTorqueImpulse(torque * torso.principalInertia() * T.DT, true);
  }

  // ---------------------------------------------------------------- damage

  private owner(collider: number): { side: Side; part: PartIndex } | null {
    for (const side of SIDES) {
      const part = this.state.fighters[side].colliders.indexOf(collider);
      if (part >= 0) return { side, part };
    }
    return null;
  }

  private contact(c1: number, c2: number, force: number): void {
    const s = this.state;
    if (s.phase !== 'fight') return;
    const a = this.owner(c1);
    const b = this.owner(c2);
    if (!a || !b || a.side === b.side) return;
    for (const [striker, victim] of [
      [a, b],
      [b, a],
    ] as const) {
      const sf = s.fighters[striker.side];
      const vf = s.fighters[victim.side];
      const sDef = PARTS[striker.part]!;
      const vDef = PARTS[victim.part]!;
      if (!sDef.strikes || !vDef.vulnerable) continue;
      if (!sf.attached[striker.part] || !vf.attached[victim.part]) continue;
      if (sf.readyAt[striker.part]! > s.frame) continue;
      if (force <= T.HIT_THRESHOLD) continue;

      const amount =
        (force - T.HIT_THRESHOLD) *
        T.DAMAGE_PER_NEWTON *
        (vDef.kind === 'head' ? T.HEAD_MULTIPLIER : 1);
      sf.readyAt[striker.part] = s.frame + T.HIT_COOLDOWN_FRAMES;
      const at = this.contactPoint(c1, c2) ?? this.pose(victim.side, victim.part);
      s.hits.push({ frame: s.frame, victim: victim.side, part: victim.part, x: at.x, y: at.y, amount });
      vf.damage += amount;
      while (vf.damage >= T.DAMAGE_PER_LIMB && s.phase === 'fight') {
        vf.damage -= T.DAMAGE_PER_LIMB;
        this.detachNext(victim.side);
      }
    }
  }

  private contactPoint(c1: number, c2: number): { x: number; y: number } | null {
    let point: { x: number; y: number } | null = null;
    this.world.contactPair(this.world.getCollider(c1), this.world.getCollider(c2), (m) => {
      if (!point && m.numSolverContacts() > 0) point = m.solverContactPoint(0);
    });
    return point;
  }

  private detachNext(side: Side): void {
    const s = this.state;
    const f = s.fighters[side];
    const candidates = PARTS.map((def, i) => ({ def, i })).filter(
      ({ def, i }) => def.joint && f.attached[i],
    );
    if (candidates.length === 0) return;
    const tier = Math.min(...candidates.map(({ def }) => def.tier));
    const pool = candidates.filter(({ def }) => def.tier === tier);
    const [r, rng] = next(s.rng);
    s.rng = rng;
    const { def, i } = pool[Math.floor(r * pool.length)]!;

    this.world.removeImpulseJoint(this.world.getImpulseJoint(f.joints[i]!), true);
    f.joints[i] = null;
    this.loosen(side, i);

    if (def.kind === 'head') {
      this.endRound(other(side));
    }
  }

  // a part and everything hanging from it become debris
  private loosen(side: Side, part: PartIndex): void {
    const f = this.state.fighters[side];
    f.attached[part] = false;
    this.world.getCollider(f.colliders[part]!).setCollisionGroups(DEBRIS_GROUPS);
    PARTS.forEach((def, i) => {
      if (def.joint?.parent !== PARTS[part]!.name) return;
      const handle = f.joints[i];
      if (handle != null) {
        const joint = this.world.getImpulseJoint(handle) as RAPIER.RevoluteImpulseJoint;
        joint.configureMotorPosition(def.joint.rest, T.REST_STIFFNESS, T.REST_DAMPING);
      }
      this.loosen(side, i);
    });
  }

  // ---------------------------------------------------------------- rounds

  private endRound(winner: Side | null): void {
    const s = this.state;
    s.roundWinner = winner;
    if (winner !== null) s.wins[winner]++;
    s.phase = 'ko';
    s.phaseStart = s.frame;
  }

  private advancePhase(): void {
    const s = this.state;
    if (s.phase === 'over' || this.phaseFramesLeft() > 0) return;
    switch (s.phase) {
      case 'countdown':
        s.phase = 'fight';
        s.phaseStart = s.frame;
        return;
      case 'fight':
        this.endRound(this.timeoutWinner());
        return;
      case 'ko':
        if (s.wins.some((w) => w >= T.ROUNDS_TO_WIN)) {
          s.phase = 'over';
          s.phaseStart = s.frame;
          return;
        }
        s.round++;
        s.phase = 'countdown';
        s.phaseStart = s.frame;
        s.roundWinner = null;
        s.hits = [];
        this.world.free();
        this.world = this.buildWorld();
        return;
    }
  }

  // on time: whoever has lost less, by limbs then damage
  private timeoutWinner(): Side | null {
    const lost = (side: Side): number => {
      const f = this.state.fighters[side];
      return f.attached.filter((a) => !a).length * T.DAMAGE_PER_LIMB + f.damage;
    };
    const [a, b] = [lost(0), lost(1)];
    return a === b ? null : a < b ? 0 : 1;
  }

  // the match winner, once it's over
  winner(): Side | null {
    const s = this.state;
    if (s.phase !== 'over') return null;
    return s.wins[0] > s.wins[1] ? 0 : 1;
  }

  // ---------------------------------------------------------------- building

  private buildWorld(): RAPIER.World {
    const world = new RAPIER.World({ x: 0, y: -T.GRAVITY });
    world.timestep = T.DT;
    world.integrationParameters.numSolverIterations = T.SOLVER_ITERATIONS;

    const ground = world.createRigidBody(RAPIER.RigidBodyDesc.fixed());
    const W = T.ARENA_WIDTH;
    const H = T.ARENA_HEIGHT;
    const walls: [number, number, number, number][] = [
      // centre x, centre y, half width, half height
      [W / 2, -1, W / 2 + 2, 1],
      [-1, H / 2, 1, H],
      [W + 1, H / 2, 1, H],
    ];
    for (const [x, y, hw, hh] of walls) {
      world.createCollider(
        RAPIER.ColliderDesc.cuboid(hw, hh)
          .setTranslation(x, y)
          .setFriction(T.FLOOR_FRICTION)
          .setCollisionGroups(groups(WORLD, ALL)),
        ground,
      );
    }

    for (const side of SIDES) {
      this.state.fighters[side] = this.buildFighter(world, side);
    }
    return world;
  }

  private buildFighter(world: RAPIER.World, side: Side): FighterState {
    const f = emptyFighter();
    const x0 = T.START_X[side];
    const y0 = -FEET_DEPTH + 0.02;
    const own = FIGHTER[side];
    const theirs = FIGHTER[other(side)];

    PARTS.forEach((def, i) => {
      const { at, angle } = BUILD_POSE[i]!;
      const body = world.createRigidBody(
        RAPIER.RigidBodyDesc.dynamic()
          .setTranslation(x0 + at[0], y0 + at[1])
          .setRotation(angle)
          .setCanSleep(false)
          .setAngularDamping(0.5),
      );
      const desc = RAPIER.ColliderDesc.roundConvexHull(new Float32Array(def.hull.flat()), 0.03)!
        .setDensity(T.DENSITY)
        .setFriction(T.FRICTION)
        .setRestitution(T.RESTITUTION)
        .setCollisionGroups(groups(own, WORLD | theirs | DEBRIS));
      if (def.vulnerable) {
        desc
          .setActiveEvents(RAPIER.ActiveEvents.CONTACT_FORCE_EVENTS)
          .setContactForceEventThreshold(T.HIT_THRESHOLD);
      }
      const collider = world.createCollider(desc, body);
      f.bodies.push(body.handle);
      f.colliders.push(collider.handle);
      f.attached.push(true);
      f.readyAt.push(0);

      if (!def.joint) {
        f.joints.push(null);
        return;
      }
      const parentBody = world.getRigidBody(f.bodies[PARTS.findIndex((p) => p.name === def.joint!.parent)]!);
      const [px, py] = def.joint.onParent;
      const [cx, cy] = def.joint.onChild;
      const joint = world.createImpulseJoint(
        RAPIER.JointData.revolute({ x: px, y: py }, { x: cx, y: cy }),
        parentBody,
        body,
        true,
      ) as RAPIER.RevoluteImpulseJoint;
      joint.setLimits(def.joint.min, def.joint.max);
      joint.configureMotorPosition(def.joint.rest, T.REST_STIFFNESS, T.REST_DAMPING);
      f.joints.push(joint.handle);
    });
    return f;
  }
}

function emptyFighter(): FighterState {
  return { damage: 0, attached: [], bodies: [], colliders: [], joints: [], readyAt: [] };
}

function fnv(bytes: Uint8Array): number {
  let h = 2166136261;
  for (const b of bytes) h = Math.imul(h ^ b, 16777619);
  return h >>> 0;
}
