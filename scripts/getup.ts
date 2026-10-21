// Knock red flat, then mash random keys: how often does it get back up, and how fast?
import { Game, initPhysics } from '../src/sim/game';
import { next } from '../src/sim/rng';
await initPhysics();
const TRIALS = 16, LIMIT = 600;
let recovered = 0, totalFrames = 0, down = 0;
for (let seed = 1; seed <= TRIALS; seed++) {
  const g = new Game(seed);
  for (let i = 0; i < 170; i++) g.step([0, 0]);
  const standY = g.pose(0, 0).y;
  // shove the torso sideways, alternating directions
  const torso = g.world.getRigidBody(g.state.fighters[0].bodies[0]!);
  torso.applyImpulse({ x: (seed % 2 ? 1 : -1) * 40, y: 0 }, true);
  for (let i = 0; i < 120; i++) g.step([0, 0]);
  const t = g.pose(0, 0);
  if (!(Math.abs(t.angle) > 0.8 || t.y < standY * 0.6)) continue;
  down++;
  let rng = seed * 7919, input = 0, upFor = 0;
  for (let f = 0; f < LIMIT; f++) {
    if (f % 8 === 0) { let v; [v, rng] = next(rng); input = Math.floor(v * 64); }
    g.step([input, 0]);
    const p = g.pose(0, 0);
    upFor = Math.abs(p.angle) < 0.4 && p.y > standY * 0.8 ? upFor + 1 : 0;
    if (upFor >= 30) { recovered++; totalFrames += f; break; }
  }
}
console.log(`knocked down ${down}/${TRIALS}, got up ${recovered}/${down}, avg ${(totalFrames / Math.max(1, recovered) / 60).toFixed(1)}s`);
