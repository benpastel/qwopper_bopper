import { Game, initPhysics } from '../src/sim/game';
import { fromKeys, type Key } from '../src/sim/input';
await initPhysics();
const g = new Game(1);
const show = () => { const b = g.pose(1,0), r = g.pose(0,0); console.log(g.state.frame, 'red', r.x.toFixed(2), r.y.toFixed(2), r.angle.toFixed(2), 'blue', b.x.toFixed(2), b.y.toFixed(2), b.angle.toFixed(2)); };
const run = (frames: number, keys: Key[]) => { for (let i = 0; i < frames; i++) g.step([fromKeys(keys), 0]); show(); };
run(300, []);
for (const k of ['q','w','o','p','e','r'] as Key[]) { run(30, [k]); run(60, []); }
for (let i = 0; i < 10; i++) { run(15, ['q','o']); run(15, ['w','p']); }
