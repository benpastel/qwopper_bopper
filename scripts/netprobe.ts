import { Game, initPhysics } from '../src/sim/game';
import { FakeNet } from '../src/net/fakenet';
import { Session } from '../src/net/rollback';
await initPhysics();
for (const [lat, jit, loss] of [[90, 40, 0.2], [90, 40, 0], [90, 0, 0.2], [60, 0, 0]]) {
  let clock = 0; const now = () => clock;
  const net = new FakeNet({ latency: lat!, jitter: jit!, loss: loss! }, now);
  const peers = [new Session(new Game(1), 0, net.a, {}, now), new Session(new Game(1), 1, net.b, {}, now)];
  let waits = [0, 0];
  for (let t = 0; t < 1800; t++) { clock += 1000/60; net.pump(); peers.forEach((p, i) => { if (p.shouldWait()) waits[i]!++; else p.tick(t % 20 < 10 ? 1 : 2); }); }
  console.log(lat, jit, loss, peers.map(p => JSON.stringify(p.stats)), 'waits', waits);
}
