import express from 'express';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocketServer } from 'ws';
import { World } from './server/world';
import { SocketHub } from './server/socketHub';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app = express();
// Art and videos come straight from public/ so a stale copy inside the built dist/ (the client build copies public/ into it) can't shadow edits.
app.use('/images', express.static(path.join(__dirname, 'public/images')));
app.use('/videos', express.static(path.join(__dirname, 'public/videos')));
app.use(express.static(path.join(__dirname, 'dist')));

const server = http.createServer(app);
const world = new World();

const wss = new WebSocketServer({ server, path: '/socketrefresh' });
wss.on('connection', (socket) => {
  new SocketHub(world, socket);
});

const PORT = process.env.PORT ?? 8080;
server.listen(PORT, () => {
  console.log(`Cellwarz server listening on http://localhost:${PORT}`);
});
