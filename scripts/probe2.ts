import { Game, initPhysics } from '../src/sim/game';
import { fromKeys, type Key } from '../src/sim/input';
await initPhysics();
const g = new Game(1);
const run = (frames: number, keys: Key[]) => { for (let i = 0; i < frames; i++) { g.step([fromKeys(keys), 0]); for (const h of g.state.hits) if (h.frame === g.state.frame-1) console.log(JSON.stringify(h), 'blue torso', g.pose(1,0)); } };
run(300, []);
for (const k of ['q','w','o','p','e','r'] as Key[]) { run(30, [k]); run(60, []); }
for (let i = 0; i < 10; i++) { run(15, ['q','o']); run(15, ['w','p']); }
console.log(g.state.fighters[1].colliders, g.state.fighters[0].colliders);
