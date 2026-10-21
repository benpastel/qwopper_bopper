// Users, tables, and the matches between them.
//
// A user is identified by an id their browser keeps in localStorage, so a refresh
// or a dropped connection reattaches them to their seat. Nothing works until
// they've given a name.
//
// A table has two seats. The host sits in side 0 and waits; the match starts when
// a guest takes side 1, and runs peer to peer between the two browsers, so all the
// server does is pick the seed, pass the WebRTC handshake between them, and relay
// their game packets when they can't connect directly. After a match either can
// ask for another, which starts when both have; leaving instead sends the leaver
// to the lobby and, if they hosted, closes the table, or else reopens it.
//
// A match can't be resumed, so someone who disconnects from a full table only
// keeps their seat briefly, long enough to refresh and pick up from the result;
// someone waiting alone at a table keeps it longer.
//
// Everything is in memory, so a server restart ends every table.

import {
  cleanName,
  ID_ALPHABET,
  TABLE_ID_LENGTH,
  type ClientMsg,
  type ServerMsg,
  type Side,
  type TableSummary,
  type TableView,
} from '../shared/protocol';

// how long a disconnected user is remembered: at a full table, and otherwise
export const MATCH_GRACE_MS = 15_000;
export const GRACE_MS = 120_000;

export interface User {
  id: string;
  name: string;
  connected: boolean;
  lastSeen: number;
  tableId: string | null;
}

export interface Table {
  id: string;
  // user ids, by side
  seats: [string, string | null];
  // the current match, once a guest has sat down
  match: number | null;
  again: [boolean, boolean];
}

export interface LobbyOptions {
  random?: () => number;
  now?: () => number;
}

export class Lobby {
  readonly users = new Map<string, User>();
  readonly tables = new Map<string, Table>();
  private matches = 0;
  private readonly random: () => number;
  private readonly now: () => number;

  constructor(
    private readonly send: (userId: string, msg: ServerMsg) => void,
    opts: LobbyOptions = {},
  ) {
    this.random = opts.random ?? Math.random;
    this.now = opts.now ?? Date.now;
  }

  // ------------------------------------------------------------ connections

  // A socket introduced itself. `bind` attaches it to the user's id before
  // anything is sent; returning users keep their name and seat.
  hello(userId: string | null, name: string, bind: (userId: string) => void): string {
    let user = userId === null ? undefined : this.users.get(userId);
    if (user === undefined) {
      user = { id: this.newId(16), name: cleanName(name), connected: true, lastSeen: 0, tableId: null };
      this.users.set(user.id, user);
    } else if (cleanName(name)) {
      user.name = cleanName(name);
    }
    user.connected = true;
    user.lastSeen = this.now();
    bind(user.id);
    this.send(user.id, { t: 'welcome', userId: user.id, name: user.name });

    const table = this.tableOf(user);
    if (table) this.pushTable(table);
    else this.send(user.id, this.lobbyMsg());
    // the host coming back reopens their table to the lobby
    if (table && table.seats[0] === user.id) this.pushLobby();
    return user.id;
  }

  disconnect(userId: string): void {
    const user = this.users.get(userId);
    if (!user) return;
    user.connected = false;
    user.lastSeen = this.now();
    const table = this.tableOf(user);
    // a host who's gone can't be joined
    if (table && table.seats[0] === user.id) this.pushLobby();
  }

  handle(userId: string, msg: ClientMsg): void {
    const user = this.users.get(userId);
    if (!user) return;
    user.lastSeen = this.now();
    switch (msg.t) {
      case 'hello':
        return;
      case 'setName':
        return this.setName(user, msg.name);
      case 'createTable':
        return this.createTable(user);
      case 'joinTable':
        return this.joinTable(user, msg.tableId);
      case 'leaveTable':
        return this.leaveTable(user);
      case 'again':
        return this.again(user);
      case 'signal': {
        const to = this.opponentIn(user, msg.match);
        if (to) this.send(to, { t: 'signal', match: msg.match, signal: msg.signal });
        return;
      }
      case 'relay': {
        const to = this.opponentIn(user, msg.match);
        if (to) this.send(to, { t: 'relay', match: msg.match, data: msg.data });
        return;
      }
    }
  }

  // Forget users who left and haven't come back.
  reap(): void {
    const now = this.now();
    for (const user of [...this.users.values()]) {
      if (user.connected) continue;
      const table = this.tableOf(user);
      const grace = table && table.seats[1] !== null ? MATCH_GRACE_MS : GRACE_MS;
      if (now - user.lastSeen < grace) continue;
      this.leaveTable(user, true);
      this.users.delete(user.id);
    }
  }

  // ---------------------------------------------------------------- actions

  private setName(user: User, name: string): void {
    user.name = cleanName(name);
    const table = this.tableOf(user);
    if (table) {
      this.pushTable(table);
      this.pushLobby();
    }
  }

  private createTable(user: User): void {
    if (!user.name) return;
    const current = this.tableOf(user);
    if (current && current.seats[1] !== null) {
      this.error(user, 'Finish your match first.');
      return;
    }
    if (current) this.leaveTable(user, true);
    let id = this.newId(TABLE_ID_LENGTH);
    while (this.tables.has(id)) id = this.newId(TABLE_ID_LENGTH);
    const table: Table = { id, seats: [user.id, null], match: null, again: [false, false] };
    this.tables.set(id, table);
    user.tableId = id;
    this.pushTable(table);
    this.pushLobby();
  }

  private joinTable(user: User, tableId: string): void {
    if (!user.name) return;
    const current = this.tableOf(user);
    if (current && current.id === tableId) {
      this.pushTable(current);
      return;
    }
    if (current && current.seats[1] !== null) {
      this.error(user, 'Finish your match first.');
      return;
    }
    const table = this.tables.get(tableId);
    let problem: string | null = null;
    if (!table) problem = 'That table is gone.';
    else if (table.seats[1] !== null) problem = 'That table is full.';
    else if (!this.users.get(table.seats[0])?.connected) problem = 'The host is away.';
    if (!table || problem !== null) {
      this.error(user, problem ?? 'That table is gone.');
      if (!current) {
        this.send(user.id, { t: 'left' });
        this.send(user.id, this.lobbyMsg());
      }
      return;
    }

    if (current) this.leaveTable(user, true);
    table.seats[1] = user.id;
    user.tableId = table.id;
    this.startMatch(table);
    this.pushLobby();
  }

  // Leave the table, if at one. `quiet` skips telling the leaver.
  private leaveTable(user: User, quiet = false): void {
    const table = this.tableOf(user);
    user.tableId = null;
    if (table) {
      const side = table.seats.indexOf(user.id) as Side;
      const otherId = table.seats[side === 0 ? 1 : 0];
      const other = otherId === null ? undefined : this.users.get(otherId);
      if (side === 0) {
        // the host's leaving closes the table
        this.tables.delete(table.id);
        if (other) {
          other.tableId = null;
          this.error(other, `${user.name} left.`);
          this.send(other.id, { t: 'left' });
        }
      } else {
        // the guest's reopens it
        table.seats[1] = null;
        table.match = null;
        table.again = [false, false];
        if (other) this.error(other, `${user.name} left.`);
        this.pushTable(table);
      }
    }
    if (!quiet) this.send(user.id, { t: 'left' });
    this.pushLobby();
  }

  private again(user: User): void {
    const table = this.tableOf(user);
    if (!table || table.seats[1] === null) return;
    const side = table.seats.indexOf(user.id) as Side;
    table.again[side] = true;
    if (table.again[0] && table.again[1]) this.startMatch(table);
    else this.pushTable(table);
  }

  private startMatch(table: Table): void {
    const [hostId, guestId] = table.seats;
    if (guestId === null) return;
    table.match = ++this.matches;
    table.again = [false, false];
    const seed = Math.floor(this.random() * 2 ** 31);
    const names: [string, string] = [this.nameOf(hostId), this.nameOf(guestId)];
    this.send(hostId, { t: 'start', match: table.match, seed, you: 0, names, initiator: true });
    this.send(guestId, { t: 'start', match: table.match, seed, you: 1, names, initiator: false });
    // after the start, so a client seeing a full table without a match knows it missed one
    this.pushTable(table);
  }

  // ---------------------------------------------------------------- plumbing

  private tableOf(user: User): Table | undefined {
    return user.tableId === null ? undefined : this.tables.get(user.tableId);
  }

  // the other player in this match, if it's still the table's current one
  private opponentIn(user: User, match: number): string | null {
    const table = this.tableOf(user);
    if (!table || table.match !== match) return null;
    const [a, b] = table.seats;
    return a === user.id ? b : a;
  }

  private nameOf(userId: string | null): string {
    return userId === null ? '' : (this.users.get(userId)?.name ?? '');
  }

  private newId(length: number): string {
    let id = '';
    for (let i = 0; i < length; i++) {
      id += ID_ALPHABET[Math.floor(this.random() * ID_ALPHABET.length)];
    }
    return id;
  }

  private tableView(table: Table, userId: string): TableView {
    const [host, guest] = table.seats;
    return {
      id: table.id,
      players: [this.nameOf(host), guest === null ? null : this.nameOf(guest)],
      you: guest === userId ? 1 : 0,
      again: [...table.again],
    };
  }

  // every table, except those whose host has gone and left nobody waiting
  lobbyMsg(): ServerMsg {
    const tables: TableSummary[] = [];
    for (const table of this.tables.values()) {
      const [host, guest] = table.seats;
      if (guest === null && !this.users.get(host)?.connected) continue;
      tables.push({ id: table.id, players: [this.nameOf(host), guest === null ? null : this.nameOf(guest)] });
    }
    return { t: 'lobby', tables };
  }

  private pushTable(table: Table): void {
    for (const id of table.seats) {
      if (id !== null) this.send(id, { t: 'table', table: this.tableView(table, id) });
    }
  }

  private pushLobby(): void {
    const msg = this.lobbyMsg();
    for (const user of this.users.values()) {
      if (user.tableId === null && user.connected) this.send(user.id, msg);
    }
  }

  private error(user: User, message: string): void {
    this.send(user.id, { t: 'error', message });
  }
}
