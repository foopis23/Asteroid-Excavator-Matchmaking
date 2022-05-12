import { getIntFromEnv } from './config';
// eslint-disable-next-line @typescript-eslint/no-var-requires
require(`dotenv-defaults`).config({
  path: './.env',
  encoding: 'utf8',
  defaults: './.env.defaults'
})

const PORT = getIntFromEnv('PORT', 9500);
const KUBERNETES_API_BASE = process.env.KUBERNETES_API_BASE ?? 'http://localhost:8001';
const GAME_SERVER_DOMAIN = process.env.GAME_SERVER_DOMAIN;
const USE_SSL = (process.env.USE_SSL) ? process.env.USE_SSL.toLocaleLowerCase() === 'true' : false;
const SSL_KEY = process.env.SSL_KEY;
const SSL_CERT = process.env.SSL_CERT;
const LOCAL_GAME_SERVER_OVERRIDE = process.env.LOCAL_GAME_SERVER_OVERRIDE;

import axios from 'axios';
import { Server, Socket } from 'socket.io';
import { v4 as uuid } from 'uuid';
import { Server as HTTPServer } from 'http';
import { Server as HTTPSServer } from 'https';
import { readFileSync } from 'fs';

async function getGameServer() {
  if (LOCAL_GAME_SERVER_OVERRIDE) {
    const [host, port] = LOCAL_GAME_SERVER_OVERRIDE.split(':');
    return {
      status: {
        state: 'Allocated',
        address: host,
        ports: [
          parseInt(port, 10)
        ]
      }
    }
  }

  const response = await axios.post(`${KUBERNETES_API_BASE}/apis/allocation.agones.dev/v1/namespaces/default/gameserverallocations`, {
    spec: {}
  })

  if (response.status < 200 || response.status >= 300) {
    throw new Error(`Failed to allocate game server: ${response.status} ${response.statusText}`)
  }

  return response.data;
}

function createWebServer(useSSL?: boolean, key?: string, cert?: string): any {
  if (useSSL) {
    if (!key || !cert) {
      throw new Error('SSL key or cert not provided');
    }

    return new HTTPSServer({
      key: readFileSync('./ssl/localhost.key'),
      cert: readFileSync('./ssl/localhost.crt')
    });
  } else {
    return new HTTPServer();
  }
}

const webServer = createWebServer(USE_SSL, SSL_KEY, SSL_CERT);
const io = new Server(webServer, {
  cors: {
    origin: '*',
    methods: ['GET', 'HEAD', 'PUT', 'PATCH', 'POST', 'DELETE']
  }
});

const rooms = new Map<string, Socket[]>();

io.on('connection', (socket) => {
  socket.on('create-room', () => {
    const id = uuid();
    rooms.set(id, [socket]);
    socket.join(id);
    socket.emit('room-created', id);
    console.log('create-room', id);

  });

  socket.on('join-room', (roomId: string) => {
    const room = rooms.get(roomId);
    if (room) {
      if (room.length > 1) {
        socket.emit('room-full', roomId);
        return
      }

      room.push(socket);
      socket.join(roomId);
      socket.emit('room-joined', roomId);

      if (room.length > 1) {
        io.to(roomId).emit('players-found');

        const gameServer = getGameServer();
        gameServer.then((gs) => {
          if (gs.status.state === 'Allocated') {
            gs.status.address = GAME_SERVER_DOMAIN ?? gs.status.address;
            io.to(roomId).emit('game-server-found', gs);
            rooms.delete(roomId);
          } else {
            io.to(roomId).emit('game-server-not-found');
            rooms.delete(roomId);
          }
        });
      }
    } else {
      socket.emit('room-not-found', roomId);
    }
  });

  socket.on('disconnect', () => {
    for (const [id, room] of rooms.entries()) {
      const index = room.indexOf(socket);
      if (index > -1) {
        room.splice(index, 1);
      }

      if (room.length === 0) {
        rooms.delete(id);
      }
    }
  });
});

webServer.listen(PORT);
console.log(`Listening on ${(USE_SSL) ? 'wss' : 'ws'}://localhost:${PORT}`);
