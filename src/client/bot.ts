// STUB: replaced by the real bot.

import type { Game, Side } from '../sim/game';
import type { Input } from '../sim/input';

export class Bot {
  constructor(readonly side: Side) {}
  decide(_game: Game): Input {
    return 0;
  }
  dispose(): void {}
}
