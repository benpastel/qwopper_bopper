// Headless poke at the sim: does a fighter stand, do keys move it, what do snapshots cost.
import { Game, initPhysics } from '../src/sim/game';
import { fromKeys, type Key } from '../src/sim/input';
import { PART_NAMES } from '../src/sim/body';

await initPhysics();
const g = new Game(1);
const fmt = (n: number) => n.toFixed(2);
const report = (label: string) => {
  const t = g.pose(0, 0), h = g.pose(0, 1), c = g.pose(0, PART_NAMES.indexOf('rCalf'));
  console.log(label, 'f', g.state.frame, g.state.phase, 'torso', fmt(t.x), fmt(t.y), fmt(t.angle), 'head y', fmt(h.y), 'rcalf', fmt(c.x), fmt(c.y), 'dmg', g.state.fighters.map(f=>fmt(f.damage)).join('/'));
};
const run = (frames: number, keys: Key[], keys2: Key[] = []) => { for (let i = 0; i < frames; i++) g.step([fromKeys(keys), fromKeys(keys2)]); };
report('start');
run(180, []); report('countdown done');
run(120, []); report('idle 2s');
for (const k of ['q','w','o','p','e','r'] as Key[]) { run(30, [k]); report('hold ' + k); run(60, []); }
// walking-ish
for (let i = 0; i < 10; i++) { run(15, ['q','o']); run(15, ['w','p']); }
report('alternate');
let t0 = performance.now(); for (let i=0;i<600;i++) g.step([fromKeys(['q']), fromKeys(['e'])]); console.log('step ms', ((performance.now()-t0)/600).toFixed(3));
t0 = performance.now(); let s; for (let i=0;i<200;i++) s = g.save(); console.log('save ms', ((performance.now()-t0)/200).toFixed(3), 'bytes', s!.world.length);
t0 = performance.now(); for (let i=0;i<200;i++) g.load(s!); console.log('load ms', ((performance.now()-t0)/200).toFixed(3));
t0 = performance.now(); for (let i=0;i<200;i++) g.checksum(); console.log('checksum ms', ((performance.now()-t0)/200).toFixed(3));
