import express from 'express';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocketServer } from 'ws';
import { World } from './server/world';
import { SocketHub } from './server/socketHub';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app = express();
app.use(express.static(path.join(__dirname, 'dist')));
app.use('/images', express.static(path.join(__dirname, 'public/images')));

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
