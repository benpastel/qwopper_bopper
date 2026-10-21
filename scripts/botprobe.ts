// Bot vs idle and bot vs bot, headless: does it close in, land hits, win? How long does it think?
import { Game, initPhysics } from '../src/sim/game';
import { Bot } from '../src/client/bot';
await initPhysics();
for (const mode of ['vs idle', 'vs bot'] as const) {
  for (let seed = 1; seed <= 2; seed++) {
    const g = new Game(seed);
    const a = new Bot(0), b = new Bot(1);
    let worst = 0, total = 0;
    while (g.state.phase !== 'over' && g.state.frame < 60 * 60 * 3) {
      const t0 = performance.now();
      const ia = a.decide(g);
      const ib = mode === 'vs bot' ? b.decide(g) : 0;
      const dt = performance.now() - t0; worst = Math.max(worst, dt); total += dt;
      g.step([ia, ib]);
      if (g.state.frame % 600 === 0) {
        const r = g.pose(0, 0), bl = g.pose(1, 0);
        console.log(' ', g.state.frame, g.state.phase, 'round', g.state.round, 'wins', g.state.wins.join('-'), 'red', r.x.toFixed(1), r.y.toFixed(1), r.angle.toFixed(1), 'blue', bl.x.toFixed(1), bl.y.toFixed(1), 'lost', g.state.fighters.map(f => f.attached.filter(x => !x).length).join('/'));
      }
    }
    console.log(mode, 'seed', seed, 'end', g.state.phase, 'frame', g.state.frame, 'wins', g.state.wins, 'ms/frame avg', (total / g.state.frame).toFixed(2), 'worst', worst.toFixed(1));
  }
}
