import axios from 'axios';
import { Server, Socket } from 'socket.io';
import { v4 as uuid } from 'uuid';

async function getGameServer() {
  const response = await axios.post('http://localhost:8001/apis/allocation.agones.dev/v1/namespaces/default/gameserverallocations', {
    spec: {}
  })

  if (response.status < 200 || response.status >= 300) {
    throw new Error(`Failed to allocate game server: ${response.status} ${response.statusText}`)
  }

  return response.data;
}

const io = new Server({
  cors: {
    origin: '*',
    methods: ['GET','HEAD','PUT','PATCH','POST','DELETE']
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

io.listen(8000);
