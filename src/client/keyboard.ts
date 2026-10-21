// The keys held right now, as an Input.

import { bit, KEYS, type Input, type Key } from '../sim/input';

export class Keyboard {
  private held: Input = 0;
  private readonly down = (e: KeyboardEvent) => this.set(e, true);
  private readonly up = (e: KeyboardEvent) => this.set(e, false);
  private readonly blur = () => {
    this.held = 0;
  };

  constructor() {
    window.addEventListener('keydown', this.down);
    window.addEventListener('keyup', this.up);
    window.addEventListener('blur', this.blur);
  }

  get input(): Input {
    return this.held;
  }

  dispose(): void {
    window.removeEventListener('keydown', this.down);
    window.removeEventListener('keyup', this.up);
    window.removeEventListener('blur', this.blur);
  }

  private set(e: KeyboardEvent, down: boolean): void {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
    const key = e.key.toLowerCase();
    if (!(KEYS as readonly string[]).includes(key)) return;
    e.preventDefault();
    const b = bit(key as Key);
    this.held = down ? this.held | b : this.held & ~b;
  }
}
