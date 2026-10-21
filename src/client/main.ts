// The app: your name and the tables, the table you're waiting at, and the match.
//
// Dev shortcuts, in the url:
//   ?fakenet=latency,jitter,loss  straight into a match against the bot over a
//                                 pretend network, for trying out rollback
//   ?relay                        online matches skip WebRTC and go through the
//                                 server, as when a direct connection fails

import { initPhysics } from '../sim/game';
import type { Side } from '../sim/game';
import type { Conditions } from '../net/fakenet';
import type { ServerMsg, TableSummary, TableView } from '../shared/protocol';
import { runMatch, type MatchHandle, type Opponent } from './match';
import { Net, type Status } from './net';
import { PeerLink } from './peer';

const physics = initPhysics();
const params = new URLSearchParams(location.search);
const forceRelay = params.has('relay');

// remembered across visits, so a refresh puts you back in your seat
const ID_KEY = 'qb.userId';
const NAME_KEY = 'qb.name';

function load(key: string): string {
  try {
    return localStorage.getItem(key) ?? '';
  } catch {
    return '';
  }
}

function save(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // private windows may refuse; we just won't remember
  }
}

function $<T extends HTMLElement>(selector: string, root: ParentNode = document): T {
  return root.querySelector(selector) as T;
}

function element(tag: string, className: string, text?: string): HTMLElement {
  const e = document.createElement(tag);
  e.className = className;
  if (text !== undefined) e.textContent = text;
  return e;
}

// the table in the url, which we join once we have a name
function urlTable(): string | null {
  return /^\/t\/([a-z0-9]+)\/?$/i.exec(location.pathname)?.[1]?.toLowerCase() ?? null;
}

function setPath(path: string): void {
  if (location.pathname !== path) history.replaceState(null, '', path + location.search);
}

function tableLink(id: string): string {
  return `${location.origin}/t/${id}${forceRelay ? '?relay' : ''}`;
}

type Screen = 'lobby' | 'room' | 'match';

function show(screen: Screen): void {
  document.body.className = `at-${screen}`;
}

const canvas = $<HTMLCanvasElement>('#arena');
const lobby = $('.lobby');
const room = $('.room');
const nameInput = $<HTMLInputElement>('.name-input', lobby);
const tableList = $('.table-list', lobby);
const result = $('.result');
const resultTitle = $('.result-title', result);
const resultNote = $('.result-note', result);
const againButton = $<HTMLButtonElement>('.again', result);
const netbar = $('.netbar');
const toast = $('.toast');

// ------------------------------------------------------------------ the match

// what's on the canvas: an online match at our table, or a local one
interface Playing {
  online: boolean;
  // online only: the server's number for the match, and the connection
  match: number;
  link: PeerLink | null;
  handle: MatchHandle | null;
  names: readonly [string, string];
  you: Side;
  over: boolean;
}

let playing: Playing | null = null;
let localOpponent: Opponent = { kind: 'bot' };

function stopPlaying(): void {
  if (!playing) return;
  playing.handle?.stop();
  playing.link?.close();
  playing = null;
  result.hidden = true;
}

function startHandle(p: Playing, seed: number, opponent: Opponent): void {
  p.handle = runMatch({
    canvas,
    seed,
    you: p.you,
    names: p.names,
    opponent,
    onOver: (winner) => {
      p.over = true;
      showResult(winner === p.you ? 'you win' : `${p.names[winner]} wins`);
    },
    onDisconnect: () => {
      if (p.over) return;
      p.over = true;
      p.handle?.stop();
      p.handle = null;
      showResult('connection lost');
    },
    onDesync: (frame) => console.error('desync at frame', frame),
  });
}

function showResult(title: string): void {
  resultTitle.textContent = title;
  againButton.disabled = false;
  result.hidden = false;
  renderAgain();
}

// whether the other side has asked for another
function renderAgain(): void {
  const them = playing?.online && table ? table.players[1 - table.you] : null;
  const wants = table && them !== null && table.again[(1 - table.you) as Side];
  resultNote.hidden = !wants;
  resultNote.textContent = wants ? `${them} wants another` : '';
}

async function playLocal(): Promise<void> {
  stopPlaying();
  const p: Playing = {
    online: false,
    match: 0,
    link: null,
    handle: null,
    names: [nameInput.value.trim() || 'you', 'bot'],
    you: 0,
    over: false,
  };
  playing = p;
  show('match');
  await physics;
  if (playing !== p) return;
  startHandle(p, (Math.random() * 2 ** 31) | 0, localOpponent);
}

async function playOnline(msg: Extract<ServerMsg, { t: 'start' }>): Promise<void> {
  stopPlaying();
  const link = new PeerLink({
    match: msg.match,
    initiator: msg.initiator,
    forceRelay,
    sendSignal: (signal) => net.send({ t: 'signal', match: msg.match, signal }),
    sendRelay: (data) => net.send({ t: 'relay', match: msg.match, data }),
  });
  const p: Playing = {
    online: true,
    match: msg.match,
    link,
    handle: null,
    names: msg.names,
    you: msg.you,
    over: false,
  };
  playing = p;
  show('match');
  try {
    await Promise.all([physics, link.ready]);
  } catch {
    if (playing !== p) return;
    p.over = true;
    link.close();
    showResult("couldn't connect");
    return;
  }
  if (playing !== p) return;
  startHandle(p, msg.seed, { kind: 'peer', transport: link });
}

againButton.addEventListener('click', () => {
  if (!playing) return;
  if (playing.online) {
    againButton.disabled = true;
    net.send({ t: 'again' });
  } else {
    void playLocal();
  }
});

$('.leave', result).addEventListener('click', () => {
  if (playing?.online) {
    net.send({ t: 'leaveTable' });
  } else {
    stopPlaying();
    leaveLocal();
  }
});

function leaveLocal(): void {
  localOpponent = { kind: 'bot' };
  stopPlaying();
  setPath('/');
  renderLobby();
  show('lobby');
}

window.addEventListener('keydown', (e) => {
  // a match against the bot can be left at any time
  if (e.key === 'Escape' && playing && !playing.online) leaveLocal();
});

// ------------------------------------------------------------------ the lobby

let welcomed = false;
let tables: TableSummary[] = [];
let table: TableView | null = null;
let wantTable = urlTable();

const named = () => nameInput.value.trim().length > 0;

function maybeJoin(): void {
  if (welcomed && wantTable && named() && table?.id !== wantTable) {
    net.send({ t: 'joinTable', tableId: wantTable });
  }
}

function renderLobby(): void {
  const ok = named();
  lobby.classList.toggle('locked', !ok);
  for (const b of lobby.querySelectorAll<HTMLButtonElement>('.actions button')) b.disabled = !ok;

  tableList.replaceChildren();
  for (const t of tables) {
    const [host, guest] = t.players;
    const row = element('li', 'table-row');
    row.classList.toggle('full', guest !== null);
    row.append(element('span', 'row-name', host));
    if (guest !== null) {
      row.append(element('span', 'vs', 'vs'), element('span', 'row-name', guest));
    } else {
      const join = element('button', 'btn small', 'join') as HTMLButtonElement;
      join.disabled = !ok;
      join.addEventListener('click', () => net.send({ t: 'joinTable', tableId: t.id }));
      row.append(join);
    }
    tableList.append(row);
  }
}

function renderRoom(view: TableView): void {
  $('.host', room).textContent = view.players[0];
  $<HTMLInputElement>('.invite-link', room).value = tableLink(view.id);
}

nameInput.value = load(NAME_KEY);
nameInput.addEventListener('input', () => {
  const name = nameInput.value.trim();
  save(NAME_KEY, name);
  net.send({ t: 'setName', name });
  renderLobby();
});
// a table link joins once the name is entered, not on its first letter
nameInput.addEventListener('change', maybeJoin);

$('.new-table', lobby).addEventListener('click', () => net.send({ t: 'createTable' }));
$('.play-bot', lobby).addEventListener('click', () => void playLocal());

$('.leave', room).addEventListener('click', () => net.send({ t: 'leaveTable' }));
const copyButton = $<HTMLButtonElement>('.copy', room);
copyButton.addEventListener('click', () => {
  if (!table) return;
  navigator.clipboard?.writeText(tableLink(table.id)).then(
    () => {
      copyButton.textContent = 'copied';
      setTimeout(() => (copyButton.textContent = 'copy'), 1400);
    },
    () => undefined,
  );
});
$<HTMLInputElement>('.invite-link', room).addEventListener('focus', (e) =>
  (e.target as HTMLInputElement).select(),
);

let toastTimer: ReturnType<typeof setTimeout> | undefined;
function showToast(message: string): void {
  toast.textContent = message;
  toast.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (toast.hidden = true), 3000);
}

function onStatus(status: Status): void {
  netbar.hidden = status === 'open' || status === 'connecting' || !welcomed;
  netbar.textContent = status === 'replaced' ? 'open in another tab' : 'reconnecting…';
}

function onMessage(msg: ServerMsg): void {
  switch (msg.t) {
    case 'welcome':
      welcomed = true;
      save(ID_KEY, msg.userId);
      if (document.activeElement !== nameInput && msg.name) nameInput.value = msg.name;
      maybeJoin();
      break;
    case 'lobby':
      tables = msg.tables;
      renderLobby();
      if (!table && !playing) {
        if (!wantTable) setPath('/');
        show('lobby');
        if (!named()) nameInput.focus();
      }
      break;
    case 'table': {
      table = msg.table;
      wantTable = table.id;
      setPath(`/t/${table.id}`);
      if (playing && !playing.online) stopPlaying();
      if (table.players[1] === null) {
        // waiting for someone to sit down
        if (playing) stopPlaying();
        renderRoom(table);
        show('room');
      } else if (!playing) {
        // back at a full table without a match, as after a refresh
        playing = { online: true, match: 0, link: null, handle: null, names: ['', ''], you: table.you, over: true };
        show('match');
        showResult('');
      } else {
        renderAgain();
      }
      break;
    }
    case 'start':
      void playOnline(msg);
      break;
    case 'left':
      table = null;
      wantTable = null;
      if (playing?.online) stopPlaying();
      if (!playing) {
        setPath('/');
        renderLobby();
        show('lobby');
      }
      break;
    case 'signal':
      if (playing?.match === msg.match) playing.link?.signal(msg.signal);
      break;
    case 'relay':
      if (playing?.match === msg.match) playing.link?.relayed(msg.data);
      break;
    case 'error':
      showToast(msg.message);
      break;
  }
}

const net = new Net(
  () => ({ t: 'hello', userId: load(ID_KEY) || null, name: load(NAME_KEY) }),
  onMessage,
  onStatus,
);
net.connect();
renderLobby();

const fake = params.get('fakenet');
if (fake !== null) {
  const [latency = 60, jitter = 10, loss = 0.05] = fake.split(',').filter(Boolean).map(Number);
  const conditions: Conditions = { latency, jitter, loss };
  localOpponent = { kind: 'fakenet', conditions };
  void playLocal();
}
