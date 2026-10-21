// Running one match on screen: the fixed 60Hz loop, against a bot, a peer over
// the network, or (for trying out rollback) a bot behind a pretend network.

import { Game, other, type Side } from '../sim/game';
import { FPS } from '../sim/tuning';
import { Session, type Stats, type Transport } from '../net/rollback';
import { FakeNet, type Conditions } from '../net/fakenet';
import { Bot } from './bot';
import { Keyboard } from './keyboard';
import { Renderer } from './render';

export type Opponent =
  | { kind: 'bot' }
  | { kind: 'peer'; transport: Transport }
  | { kind: 'fakenet'; conditions: Conditions };

export interface MatchOptions {
  canvas: HTMLCanvasElement;
  seed: number;
  you: Side;
  names: readonly [string, string];
  opponent: Opponent;
  onOver?: (winner: Side) => void;
  // the other side has gone quiet
  onDisconnect?: () => void;
  onDesync?: (frame: number) => void;
}

export interface MatchHandle {
  stop(): void;
}

const TICK_MS = 1000 / FPS;
// after a stall (a hidden tab, a slow frame), catch up at most this many ticks at once
const MAX_CATCH_UP = 240;
const SILENCE_MS = 5000;

export function runMatch(opts: MatchOptions): MatchHandle {
  const keyboard = new Keyboard();
  const renderer = new Renderer(opts.canvas);
  void renderer.load();
  const game = new Game(opts.seed);
  const tick = ticker(game, opts, keyboard);

  let running = true;
  let last = performance.now();
  let owed = 0;
  let over = false;

  const frame = (now: number) => {
    if (!running) return;
    owed += now - last;
    last = now;
    let ticks = 0;
    while (owed >= TICK_MS && ticks < MAX_CATCH_UP) {
      owed -= TICK_MS;
      ticks++;
      if (!tick.step()) {
        owed = 0;
        break;
      }
    }
    if (ticks === MAX_CATCH_UP) owed = 0;

    renderer.draw(game, { you: opts.you, held: keyboard.input, names: opts.names });
    if (!over && game.state.phase === 'over') {
      over = true;
      opts.onOver?.(game.winner()!);
    }
    if (tick.silent()) {
      running = false;
      opts.onDisconnect?.();
      return;
    }
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);

  return {
    stop() {
      running = false;
      keyboard.dispose();
      renderer.dispose();
      tick.dispose();
      game.dispose();
    },
  };
}

interface Ticker {
  // advance one tick; false if the game is waiting on the network
  step(): boolean;
  silent(): boolean;
  dispose(): void;
}

function ticker(game: Game, opts: MatchOptions, keyboard: Keyboard): Ticker {
  const { opponent, you } = opts;
  const them = other(you);

  if (opponent.kind === 'bot') {
    const bot = new Bot(them);
    return {
      step() {
        const pair: [number, number] = [0, 0];
        pair[you] = keyboard.input;
        pair[them] = bot.decide(game);
        game.step(pair);
        return true;
      },
      silent: () => false,
      dispose: () => bot.dispose(),
    };
  }

  if (opponent.kind === 'peer') {
    const session = new Session(game, you, opponent.transport);
    session.onDesync = (f) => opts.onDesync?.(f);
    exposeStats(session);
    return {
      step() {
        if (session.shouldWait()) return true;
        return session.tick(keyboard.input);
      },
      silent: () => performance.now() - session.lastHeard > SILENCE_MS,
      dispose: () => opponent.transport.close(),
    };
  }

  // the bot plays the far side of a pretend network, with its own copy of the game
  const net = new FakeNet(opponent.conditions, () => performance.now());
  const theirGame = new Game(opts.seed);
  const bot = new Bot(them);
  const ours = new Session(game, you, net.a);
  const theirs = new Session(theirGame, them, net.b);
  ours.onDesync = (f) => opts.onDesync?.(f);
  exposeStats(ours);
  return {
    step() {
      net.pump();
      if (!theirs.shouldWait()) theirs.tick(bot.decide(theirGame));
      if (ours.shouldWait()) return true;
      return ours.tick(keyboard.input);
    },
    silent: () => false,
    dispose: () => {
      bot.dispose();
      theirGame.dispose();
    },
  };
}

// for poking at from the console
function exposeStats(session: { stats: Stats }): void {
  (window as unknown as { rollback: unknown }).rollback = session.stats;
}
