// Every number that shapes how the game feels, in one place.

export const FPS = 60;
export const DT = 1 / FPS;

// ------------------------------------------------------------------ arena
export const ARENA_WIDTH = 18;
export const ARENA_HEIGHT = 11;
export const GRAVITY = 10;
// torso centres at the start of a round
export const START_X: readonly [number, number] = [6.5, 11.5];

// ------------------------------------------------------------------ physics
export const SOLVER_ITERATIONS = 8;
export const DENSITY = 1;
export const FRICTION = 0.9;
export const FLOOR_FRICTION = 1.2;
export const RESTITUTION = 0.05;

// ------------------------------------------------------------------ muscles
// A held key drives its joint toward open or close with a stiff spring; with
// neither held the joint relaxes to a weak spring toward its rest angle.
// (Rapier's acceleration-based motor: stiffness and damping are per unit inertia.)
export const DRIVE_STIFFNESS = 800;
export const DRIVE_DAMPING = 40;
export const REST_STIFFNESS = 120;
export const REST_DAMPING = 8;
export const NECK_STIFFNESS = 120;
export const NECK_DAMPING = 10;

// A gentle torque keeping the torso upright, so a fighter can be knocked down but
// isn't helpless on every stumble. Torque per radian of lean, and its damping.
export const UPRIGHT_STIFFNESS = 60;
export const UPRIGHT_DAMPING = 6;

// ------------------------------------------------------------------ damage
// Contact force (newtons) below this between a striking limb and the opponent's
// head or torso does nothing: leaning, resting, brushing.
export const HIT_THRESHOLD = 180;
// damage per newton over the threshold
export const DAMAGE_PER_NEWTON = 0.1;
// a limb that has just landed a hit can't land another for this long
export const HIT_COOLDOWN_FRAMES = 15;
// a head hit hurts more than a torso hit
export const HEAD_MULTIPLIER = 2;
// damage that knocks off the next limb
export const DAMAGE_PER_LIMB = 50;
// how long a recent hit stays in the state, for effects to draw
export const HIT_MEMORY_FRAMES = 30;

// ------------------------------------------------------------------ match
export const COUNTDOWN_FRAMES = 3 * FPS;
export const ROUND_FRAMES = 60 * FPS;
export const KO_FRAMES = 2 * FPS;
export const ROUNDS_TO_WIN = 2;
