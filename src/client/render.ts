// STUB: replaced by the real renderer. The interface below is the contract.

import type { Game, Side } from '../sim/game';
import type { Input } from '../sim/input';

export interface View {
  // which fighter is the local player
  you: Side;
  // the keys the local player is holding now
  held: Input;
  names: readonly [string, string];
}

export class Renderer {
  private readonly ctx: CanvasRenderingContext2D;
  constructor(private readonly canvas: HTMLCanvasElement) {
    this.ctx = canvas.getContext('2d')!;
  }
  // load sprites; draw() may be called before this resolves
  async load(): Promise<void> {}
  draw(game: Game, _view: View): void {
    const { ctx, canvas } = this;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillText(`frame ${game.state.frame}`, 10, 10);
  }
  dispose(): void {}
}
