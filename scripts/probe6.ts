// Random brawls: how hard do hits land, and how long do rounds last?
import { Game, initPhysics } from '../src/sim/game';
import { next } from '../src/sim/rng';
await initPhysics();
const amounts: number[] = [];
for (let seed = 1; seed <= 6; seed++) {
  const g = new Game(seed);
  let r = seed * 999, inA = 0, inB = 0;
  const seen = new Set<string>();
  while (g.state.phase !== 'over' && g.state.frame < 60 * 60 * 4) {
    if (g.state.frame % 12 === 0) { let v; [v, r] = next(r); inA = Math.floor(v * 64); [v, r] = next(r); inB = Math.floor(v * 64); }
    g.step([inA, inB]);
    for (const h of g.state.hits) { const k = `${h.frame}:${h.victim}:${h.part}`; if (!seen.has(k)) { seen.add(k); amounts.push(h.amount); } }
  }
  console.log('seed', seed, 'frames', g.state.frame, 'round', g.state.round, 'wins', g.state.wins, g.state.phase, 'hits', seen.size);
}
amounts.sort((a, b) => a - b);
const q = (p: number) => amounts[Math.floor(p * (amounts.length - 1))]?.toFixed(1);
console.log('n', amounts.length, 'p10', q(0.1), 'p50', q(0.5), 'p90', q(0.9), 'max', q(1));
