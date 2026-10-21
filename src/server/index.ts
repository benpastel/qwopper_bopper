// The lobby server: serves the built client, and the websocket at /ws that the
// lobby, the WebRTC handshake, and (as a fallback) game packets go through.

import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import express from 'express';
import { WebSocketServer, type WebSocket } from 'ws';
import { parseClientMsg, REPLACED, type ServerMsg } from '../shared/protocol';
import { Lobby } from './lobby';

const PORT = Number(process.env.PORT) || 8080;

const app = express();

const sockets = new Map<string, WebSocket>();
const lobby = new Lobby((userId, msg: ServerMsg) => {
  const ws = sockets.get(userId);
  if (ws && ws.readyState === ws.OPEN) ws.send(JSON.stringify(msg));
});
setInterval(() => lobby.reap(), 5_000).unref();

app.get('/healthz', (_req, res) => {
  res.json({ ok: true, users: lobby.users.size, tables: lobby.tables.size });
});

// In dev the client is served by Vite (which proxies /ws here), so this
// directory only exists after a build.
const clientDir = path.join(import.meta.dirname, '..', '..', 'dist');
if (fs.existsSync(clientDir)) {
  app.use(express.static(clientDir, { maxAge: '1h', index: false }));
  // share links (/t/<id>) and anything else get the app
  app.get('/{*path}', (_req, res) => res.sendFile(path.join(clientDir, 'index.html')));
}

const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: '/ws', maxPayload: 64 * 1024 });

wss.on('connection', (ws: WebSocket) => {
  let userId: string | null = null;
  let alive = true;
  ws.on('pong', () => {
    alive = true;
  });

  ws.on('message', (data) => {
    const msg = parseClientMsg(String(data));
    if (msg === null) return;
    if (msg.t === 'hello') {
      if (userId !== null) return;
      userId = lobby.hello(msg.userId, msg.name, (id) => {
        // a second tab for the same user takes over the seat
        const prev = sockets.get(id);
        if (prev && prev !== ws) prev.close(REPLACED, 'replaced');
        sockets.set(id, ws);
      });
      return;
    }
    if (userId !== null) lobby.handle(userId, msg);
  });

  ws.on('close', () => {
    if (userId !== null && sockets.get(userId) === ws) {
      sockets.delete(userId);
      lobby.disconnect(userId);
    }
  });

  // proxies in front of the server drop websockets that sit idle, so keep them warm
  const ping = setInterval(() => {
    if (!alive) {
      ws.terminate();
      return;
    }
    alive = false;
    ws.ping();
  }, 25_000);
  ws.on('close', () => clearInterval(ping));
});

server.listen(PORT, () => {
  console.log(`qwopper bopper listening on :${PORT}`);
});
