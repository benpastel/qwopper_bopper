// Try some key rhythms on red and see how far it travels, whether it falls, and whether it lands hits.
import { Game, initPhysics } from '../src/sim/game';
import { fromKeys, type Key } from '../src/sim/input';
await initPhysics();
const patterns: Record<string, [Key[], number][]> = {
  'qo/wp': [[['q','o'],15],[['w','p'],15]],
  'q/w': [[['q'],12],[['w'],12]],
  'qp/wo': [[['q','p'],15],[['w','o'],15]],
  'o/p': [[['o'],12],[['p'],12]],
  'e/r': [[['e'],15],[['r'],15]],
  'qe/wr': [[['q','e'],20],[['w','r'],20]],
  'q,o,w,p': [[['q'],10],[['o'],10],[['w'],10],[['p'],10]],
};
for (const [name, pat] of Object.entries(patterns)) {
  const g = new Game(1);
  for (let i = 0; i < 180; i++) g.step([0,0]);
  let minY = 99, maxX = -99, minX = 99;
  for (let rep = 0; rep < 20; rep++) for (const [keys, n] of pat) for (let i = 0; i < n; i++) {
    g.step([fromKeys(keys), 0]);
    const t = g.pose(0,0); minY = Math.min(minY, t.y); maxX = Math.max(maxX, t.x); minX = Math.min(minX, t.x);
  }
  const t = g.pose(0,0);
  console.log(name.padEnd(10), 'end x', t.x.toFixed(2), 'y', t.y.toFixed(2), 'ang', t.angle.toFixed(2), 'x range', minX.toFixed(2), maxX.toFixed(2), 'min y', minY.toFixed(2), 'blue dmg', g.state.fighters[1].damage.toFixed(1), 'blue lost', g.state.fighters[1].attached.filter(a=>!a).length, g.state.phase);
}
