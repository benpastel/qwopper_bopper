import { describe, expect, it } from 'vitest';
import { GRACE_MS, Lobby, MATCH_GRACE_MS } from '../src/server/lobby';
import { parseClientMsg, type ServerMsg } from '../src/shared/protocol';

type Of<T extends ServerMsg['t']> = Extract<ServerMsg, { t: T }>;

function setup() {
  let clock = 0;
  const inbox = new Map<string, ServerMsg[]>();
  const lobby = new Lobby(
    (id, msg) => {
      if (!inbox.has(id)) inbox.set(id, []);
      inbox.get(id)!.push(msg);
    },
    { now: () => clock },
  );
  const join = (name: string, id: string | null = null) => lobby.hello(id, name, () => {});
  const sent = (id: string) => inbox.get(id) ?? [];
  const last = <T extends ServerMsg['t']>(id: string, t: T): Of<T> | undefined =>
    sent(id).filter((m): m is Of<T> => m.t === t).at(-1);
  const clear = () => inbox.clear();
  const tick = (ms: number) => {
    clock += ms;
    lobby.reap();
  };
  return { lobby, join, sent, last, clear, tick };
}

// a host at a table and a guest who's joined it
function seated() {
  const s = setup();
  const host = s.join('Plato');
  const guest = s.join('Diogenes');
  s.lobby.handle(host, { t: 'createTable' });
  const tableId = s.last(host, 'table')!.table.id;
  s.lobby.handle(guest, { t: 'joinTable', tableId });
  return { ...s, host, guest, tableId };
}

describe('lobby', () => {
  it('welcomes users and remembers them', () => {
    const { join, last } = setup();
    const id = join('  Plato  ');
    expect(last(id, 'welcome')).toEqual({ t: 'welcome', userId: id, name: 'Plato' });
    expect(join('', id)).toBe(id);
    expect(last(id, 'welcome')!.name).toBe('Plato');
    expect(join('x', 'unknown')).not.toBe('unknown');
  });

  it("does nothing for a user who hasn't given a name", () => {
    const { lobby, join, last } = setup();
    const id = join('');
    lobby.handle(id, { t: 'createTable' });
    expect(lobby.tables.size).toBe(0);
    lobby.handle(id, { t: 'setName', name: 'Zeno' });
    lobby.handle(id, { t: 'createTable' });
    expect(lobby.tables.size).toBe(1);
    const id5 = last(id, 'table')!.table.id;
    expect(id5).toMatch(/^[abcdefghjkmnpqrstuvwxyz23456789]{5}$/);
  });

  it('lists tables, and starts the match when a guest sits down', () => {
    const { lobby, join, last } = setup();
    const host = join('Plato');
    const watcher = join('Zeno');
    lobby.handle(host, { t: 'createTable' });
    const tableId = last(host, 'table')!.table.id;
    expect(last(watcher, 'lobby')!.tables).toEqual([{ id: tableId, players: ['Plato', null] }]);

    const guest = join('Diogenes');
    lobby.handle(guest, { t: 'joinTable', tableId });
    const a = last(host, 'start')!;
    const b = last(guest, 'start')!;
    expect(a.seed).toBe(b.seed);
    expect(a.match).toBe(b.match);
    expect([a.you, b.you]).toEqual([0, 1]);
    expect([a.initiator, b.initiator]).toEqual([true, false]);
    expect(a.names).toEqual(['Plato', 'Diogenes']);
    expect(last(watcher, 'lobby')!.tables).toEqual([{ id: tableId, players: ['Plato', 'Diogenes'] }]);
  });

  it('turns away a full table or a missing one', () => {
    const { lobby, join, last, tableId } = seated();
    const third = join('Zeno');
    lobby.handle(third, { t: 'joinTable', tableId });
    expect(last(third, 'error')!.message).toBe('That table is full.');
    lobby.handle(third, { t: 'joinTable', tableId: 'zzzzz' });
    expect(last(third, 'error')!.message).toBe('That table is gone.');
    expect(last(third, 'left')).toBeDefined();
  });

  it('relays signals and packets only within the current match', () => {
    const { lobby, host, guest, last, clear } = seated();
    const match = last(host, 'start')!.match;
    clear();
    lobby.handle(host, { t: 'relay', match, data: 'hi' });
    lobby.handle(guest, { t: 'signal', match, signal: { kind: 'answer', sdp: 'v=0' } });
    lobby.handle(host, { t: 'relay', match: match + 1, data: 'stale' });
    expect(last(guest, 'relay')).toEqual({ t: 'relay', match, data: 'hi' });
    expect(last(host, 'signal')!.signal).toEqual({ kind: 'answer', sdp: 'v=0' });
    expect(last(guest, 'relay')!.data).toBe('hi');
  });

  it('starts another match once both ask', () => {
    const { lobby, host, guest, last } = seated();
    const first = last(host, 'start')!;
    lobby.handle(host, { t: 'again' });
    expect(last(guest, 'table')!.table.again).toEqual([true, false]);
    expect(last(host, 'start')).toBe(first);
    lobby.handle(guest, { t: 'again' });
    const second = last(host, 'start')!;
    expect(second.match).not.toBe(first.match);
    expect(last(guest, 'start')!.match).toBe(second.match);
    expect(last(guest, 'table')!.table.again).toEqual([false, false]);
  });

  it('reopens the table when the guest leaves', () => {
    const { lobby, host, guest, last, tableId } = seated();
    lobby.handle(guest, { t: 'leaveTable' });
    expect(last(guest, 'left')).toBeDefined();
    expect(last(host, 'error')!.message).toBe('Diogenes left.');
    expect(last(host, 'table')!.table.players).toEqual(['Plato', null]);
    expect(last(guest, 'lobby')!.tables).toEqual([{ id: tableId, players: ['Plato', null] }]);
    // and stale packets go nowhere
    const match = last(host, 'start')!.match;
    const before = last(guest, 'relay');
    lobby.handle(host, { t: 'relay', match, data: 'x' });
    expect(last(guest, 'relay')).toBe(before);
  });

  it('closes the table when the host leaves', () => {
    const { lobby, host, guest, last } = seated();
    lobby.handle(host, { t: 'leaveTable' });
    expect(lobby.tables.size).toBe(0);
    expect(last(guest, 'error')!.message).toBe('Plato left.');
    expect(last(guest, 'left')).toBeDefined();
    expect(last(guest, 'lobby')!.tables).toEqual([]);
  });

  it('puts a returning host back at their table', () => {
    const { lobby, join, last } = setup();
    const host = join('Plato');
    lobby.handle(host, { t: 'createTable' });
    const watcher = join('Zeno');
    lobby.disconnect(host);
    expect(last(watcher, 'lobby')!.tables).toEqual([]);
    join('', host);
    expect(last(host, 'table')!.table.players).toEqual(['Plato', null]);
    expect(last(watcher, 'lobby')!.tables).toHaveLength(1);
  });

  it('forgets the disconnected: quickly mid-match, slowly otherwise', () => {
    const { lobby, join, host, guest, last, tick } = seated();
    lobby.disconnect(guest);
    tick(MATCH_GRACE_MS - 1);
    expect(lobby.users.has(guest)).toBe(true);
    tick(1);
    expect(lobby.users.has(guest)).toBe(false);
    expect(last(host, 'table')!.table.players).toEqual(['Plato', null]);

    lobby.disconnect(host);
    tick(GRACE_MS - 1);
    expect(lobby.tables.size).toBe(1);
    tick(1);
    expect(lobby.tables.size).toBe(0);
    expect(join('x', host)).not.toBe(host);
  });

  it("won't let a seated player join elsewhere mid-match", () => {
    const { lobby, join, host, last } = seated();
    const other = join('Zeno');
    lobby.handle(other, { t: 'createTable' });
    const otherTable = last(other, 'table')!.table.id;
    lobby.handle(host, { t: 'joinTable', tableId: otherTable });
    expect(last(host, 'error')!.message).toBe('Finish your match first.');
  });
});

describe('parseClientMsg', () => {
  it('accepts good messages, keeping only their fields', () => {
    expect(parseClientMsg('{"t":"hello","userId":null,"name":"a","extra":1}')).toEqual({
      t: 'hello',
      userId: null,
      name: 'a',
    });
    expect(parseClientMsg({ t: 'joinTable', tableId: 'abcde' })).toEqual({ t: 'joinTable', tableId: 'abcde' });
    expect(parseClientMsg({ t: 'again', x: 1 })).toEqual({ t: 'again' });
    expect(
      parseClientMsg({ t: 'signal', match: 3, signal: { kind: 'ice', candidate: 'c', sdpMid: '0', sdpMLineIndex: 0 } }),
    ).toEqual({ t: 'signal', match: 3, signal: { kind: 'ice', candidate: 'c', sdpMid: '0', sdpMLineIndex: 0 } });
    expect(parseClientMsg({ t: 'relay', match: 1, data: '{}' })).toEqual({ t: 'relay', match: 1, data: '{}' });
  });

  it('rejects bad ones', () => {
    for (const bad of [
      'not json',
      '[]',
      'null',
      { t: 'nope' },
      { t: 'hello', userId: 5, name: 'a' },
      { t: 'hello', userId: null },
      { t: 'setName', name: 7 },
      { t: 'joinTable', tableId: 'x'.repeat(100) },
      { t: 'signal', match: 1, signal: { kind: 'offer' } },
      { t: 'signal', match: 1, signal: { kind: 'ice', candidate: 'c', sdpMid: 1, sdpMLineIndex: 0 } },
      { t: 'signal', match: -1, signal: { kind: 'answer', sdp: '' } },
      { t: 'relay', match: 1.5, data: '' },
      { t: 'relay', match: 1, data: 'x'.repeat(10000) },
    ]) {
      expect(parseClientMsg(bad)).toBeNull();
    }
  });
});
