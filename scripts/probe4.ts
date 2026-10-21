import { Game, initPhysics } from '../src/sim/game';
import { PART_NAMES } from '../src/sim/body';
await initPhysics();
const g = new Game(1);
for (let i = 0; i < 3600; i++) { g.step([0, 0]); if (i % 300 === 0) { const b = g.pose(1,0), r = g.pose(0,0); console.log(g.state.frame, 'red', r.x.toFixed(3), r.angle.toFixed(3), 'blue', b.x.toFixed(3), b.angle.toFixed(3), PART_NAMES.map((_,p)=>g.pose(1,p).angle.toFixed(2)).join(' ')); } }
