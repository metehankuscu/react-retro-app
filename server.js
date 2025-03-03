const { Server } = require('socket.io');
const express = require('express');
const http = require('http');
const cors = require('cors');

const app = express();
app.use(cors());

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

const rooms = new Map();

const createRoom = (roomId) => {
  if (!rooms.has(roomId)) {
    rooms.set(roomId, {
      clients: new Map(),
      state: {
        went_well: [],
        to_improve: [],
        action_items: [],
      },
      owner: null,
      isHidden: false,
    });
  }
  return rooms.get(roomId);
};

const broadcastToRoom = (io, roomId, event, data, excludeSocket = null) => {
  if (excludeSocket) {
    excludeSocket.to(roomId).emit(event, data);
  } else {
    io.to(roomId).emit(event, data);
  }
};

io.on('connection', (socket) => {
  console.log('Yeni bağlantı:', socket.id);
  const roomId = socket.handshake.query.roomId;
  const username = socket.handshake.query.username;

  if (!roomId || !username) {
    console.log('Bağlantı reddedildi: Eksik parametreler');
    socket.disconnect();
    return;
  }

  socket.join(roomId);

  let room = rooms.get(roomId);
  if (!room) {
    room = createRoom(roomId);
    room.owner = username;
  }

  room.clients.set(username, { socket, username });
  console.log(`Kullanıcı odaya bağlandı - Oda: ${roomId}, Kullanıcı: ${username}`);

  socket.emit('initial-state', {
    items: room.state,
    isRoomOwner: username === room.owner,
    isHidden: room.isHidden || false,
  });

  socket.on('add-item', ({ category, item }) => {
    try {
      room.state[category].push(item);
      broadcastToRoom(io, roomId, 'item-added', { category, item });
    } catch (error) {
      console.error('Add item error:', error);
    }
  });

  socket.on('remove-item', ({ category, itemId }) => {
    try {
      room.state[category] = room.state[category].filter(
        (item) => item.id !== itemId
      );
      broadcastToRoom(io, roomId, 'item-removed', { category, itemId });
    } catch (error) {
      console.error('Remove item error:', error);
    }
  });

  socket.on('move-item', ({ source, destination, itemId }) => {
    try {
      const movedItem = room.state[source.droppableId].find(
        (item) => item.id === itemId
      );

      if (movedItem) {
        room.state[source.droppableId] = room.state[source.droppableId].filter(
          (i) => i.id !== itemId
        );
        room.state[destination.droppableId].splice(
          destination.index,
          0,
          movedItem
        );
        broadcastToRoom(io, roomId, 'item-moved', {
          source,
          destination,
          item: movedItem,
        });
      }
    } catch (error) {
      console.error('Move item error:', error);
    }
  });

  socket.on('toggle-visibility', () => {
    try {
      if (username === room.owner) {
        room.isHidden = !room.isHidden;
        broadcastToRoom(io, roomId, 'visibility-changed', {
          isHidden: room.isHidden,
        });
      }
    } catch (error) {
      console.error('Toggle visibility error:', error);
    }
  });

  socket.on('disconnect', () => {
    try {
      console.log(`Kullanıcı odadan ayrıldı - Oda: ${roomId}, Kullanıcı: ${username}`);
      room.clients.delete(username);

      if (room.clients.size === 0) {
        rooms.delete(roomId);
        console.log(`Oda silindi - Oda: ${roomId}`);
      } else if (username === room.owner) {
        const newOwner = Array.from(room.clients.keys())[0];
        room.owner = newOwner;
        broadcastToRoom(io, roomId, 'owner-changed', { newOwner });
      }
    } catch (error) {
      console.error('Disconnect error:', error);
    }
  });
});

const PORT = process.env.PORT || 10000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
}); 