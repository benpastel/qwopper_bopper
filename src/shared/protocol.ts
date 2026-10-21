// The messages between a browser and the lobby server, over the websocket at /ws.
//
// A table has two seats: the host's (side 0) and the guest's (side 1). The match
// starts when the guest sits down, and runs peer to peer; the server only picks
// the seed, relays the WebRTC handshake between the two, and, if the peers can't
// reach each other directly, relays their game packets.

export type Side = 0 | 1;

export const MAX_NAME_LENGTH = 20;
// no look-alikes; table ids end up in urls
export const ID_ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789';
export const TABLE_ID_LENGTH = 5;
// the close code for a socket replaced by the same user's newer tab; the client
// doesn't reconnect after it
export const REPLACED = 4000;

// WebRTC session setup, passed between the two seated players untouched
export type Signal =
  | { kind: 'offer'; sdp: string }
  | { kind: 'answer'; sdp: string }
  | { kind: 'ice'; candidate: string; sdpMid: string | null; sdpMLineIndex: number | null };

export type ClientMsg =
  | { t: 'hello'; userId: string | null; name: string }
  | { t: 'setName'; name: string }
  | { t: 'createTable' }
  | { t: 'joinTable'; tableId: string }
  | { t: 'leaveTable' }
  // after a match: play another
  | { t: 'again' }
  | { t: 'signal'; match: number; signal: Signal }
  // a game packet for the other player, when there's no direct connection
  | { t: 'relay'; match: number; data: string };

export interface TableSummary {
  id: string;
  // by side; the guest's is null while the table is open
  players: [string, string | null];
}

export interface TableView {
  id: string;
  players: [string, string | null];
  you: Side;
  // who has asked for another match
  again: [boolean, boolean];
}

export type ServerMsg =
  | { t: 'welcome'; userId: string; name: string }
  | { t: 'lobby'; tables: TableSummary[] }
  | { t: 'table'; table: TableView }
  // you're no longer at a table
  | { t: 'left' }
  | {
      t: 'start';
      // a new number for every match, so stale signals and packets can be told apart
      match: number;
      seed: number;
      you: Side;
      names: [string, string];
      // whether to make the WebRTC offer
      initiator: boolean;
    }
  | { t: 'signal'; match: number; signal: Signal }
  | { t: 'relay'; match: number; data: string }
  | { t: 'error'; message: string };

export function cleanName(raw: string): string {
  return raw.split(/\s+/).filter(Boolean).join(' ').slice(0, MAX_NAME_LENGTH);
}

// ------------------------------------------------------------------ validation

// packets are small; anything much bigger than one isn't one
const MAX_DATA = 4096;
const MAX_SDP = 16384;

type Obj = Record<string, unknown>;

function isObj(x: unknown): x is Obj {
  return typeof x === 'object' && x !== null && !Array.isArray(x);
}

function str(x: unknown, max: number): x is string {
  return typeof x === 'string' && x.length <= max;
}

function matchId(x: unknown): x is number {
  return typeof x === 'number' && Number.isSafeInteger(x) && x >= 0;
}

function parseSignal(x: unknown): Signal | null {
  if (!isObj(x)) return null;
  if ((x.kind === 'offer' || x.kind === 'answer') && str(x.sdp, MAX_SDP)) {
    return { kind: x.kind, sdp: x.sdp };
  }
  if (x.kind === 'ice' && str(x.candidate, 2048)) {
    const sdpMid = x.sdpMid === null || str(x.sdpMid, 64) ? x.sdpMid : undefined;
    const index = x.sdpMLineIndex;
    const sdpMLineIndex =
      index === null || (typeof index === 'number' && Number.isInteger(index) && index >= 0)
        ? index
        : undefined;
    if (sdpMid === undefined || sdpMLineIndex === undefined) return null;
    return { kind: 'ice', candidate: x.candidate, sdpMid, sdpMLineIndex };
  }
  return null;
}

// A message from a client, rebuilt from only the fields it should have, or null
// if it isn't one.
export function parseClientMsg(raw: unknown): ClientMsg | null {
  let x: unknown;
  try {
    x = typeof raw === 'string' ? JSON.parse(raw) : raw;
  } catch {
    return null;
  }
  if (!isObj(x)) return null;
  switch (x.t) {
    case 'hello':
      if (!(x.userId === null || str(x.userId, 64)) || !str(x.name, 200)) return null;
      return { t: 'hello', userId: x.userId, name: x.name };
    case 'setName':
      return str(x.name, 200) ? { t: 'setName', name: x.name } : null;
    case 'createTable':
    case 'leaveTable':
    case 'again':
      return { t: x.t };
    case 'joinTable':
      return str(x.tableId, 16) ? { t: 'joinTable', tableId: x.tableId } : null;
    case 'signal': {
      const signal = parseSignal(x.signal);
      return signal && matchId(x.match) ? { t: 'signal', match: x.match, signal } : null;
    }
    case 'relay':
      return matchId(x.match) && str(x.data, MAX_DATA)
        ? { t: 'relay', match: x.match, data: x.data }
        : null;
    default:
      return null;
  }
}
