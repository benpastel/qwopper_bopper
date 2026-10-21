// A pretend network between two transports in one process: latency, jitter and
// loss, on whatever clock it's given. For tests, and for trying rollback in one tab.

import type { Transport } from './rollback';

export interface Conditions {
  // one way, milliseconds
  latency: number;
  jitter: number;
  // 0..1
  loss: number;
}

interface InFlight {
  at: number;
  data: string;
  to: FakeTransport;
}

class FakeTransport implements Transport {
  onMessage: ((data: string) => void) | null = null;
  peer: FakeTransport | null = null;
  constructor(private readonly net: FakeNet) {}
  send(data: string): void {
    if (this.peer) this.net.carry(data, this.peer);
  }
  close(): void {
    this.peer = null;
  }
}

export class FakeNet {
  readonly a: Transport;
  readonly b: Transport;
  private flying: InFlight[] = [];

  constructor(
    public conditions: Conditions,
    private readonly now: () => number,
    private readonly random: () => number = Math.random,
  ) {
    const a = new FakeTransport(this);
    const b = new FakeTransport(this);
    a.peer = b;
    b.peer = a;
    this.a = a;
    this.b = b;
  }

  carry(data: string, to: FakeTransport): void {
    const { latency, jitter, loss } = this.conditions;
    if (this.random() < loss) return;
    const at = this.now() + latency + (this.random() * 2 - 1) * jitter;
    this.flying.push({ at, data, to });
  }

  // deliver everything due by now
  pump(): void {
    const now = this.now();
    const due = this.flying.filter((m) => m.at <= now).sort((x, y) => x.at - y.at);
    this.flying = this.flying.filter((m) => m.at > now);
    for (const m of due) m.to.onMessage?.(m.data);
  }
}
