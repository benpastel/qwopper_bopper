// TEMPORARY entry: straight into a match. ?fakenet=latency,jitter,loss plays the
// bot over a pretend network; otherwise the bot directly.

import { initPhysics } from '../sim/game';
import { runMatch, type Opponent } from './match';

await initPhysics();
const params = new URLSearchParams(location.search);
const fake = params.get('fakenet');
let opponent: Opponent = { kind: 'bot' };
if (fake !== null) {
  const [latency = 60, jitter = 10, loss = 0.05] = fake.split(',').map(Number);
  opponent = { kind: 'fakenet', conditions: { latency, jitter, loss } };
}
runMatch({
  canvas: document.getElementById('arena') as HTMLCanvasElement,
  seed: (Math.random() * 2 ** 31) | 0,
  you: 0,
  names: ['you', 'bot'],
  opponent,
  onDesync: (f) => console.error('desync at frame', f),
});
