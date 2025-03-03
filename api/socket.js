const { Server } = require('ws');

module.exports = (req, res) => {
  if (req.headers.upgrade?.toLowerCase() !== 'websocket') {
    res.end('WebSocket bağlantısı gerekli');
    return;
  }

  const wss = new Server({ noServer: true });

  // Map to store rooms
  const rooms = new Map();

  // Create new room
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

  // Room-specific broadcast
  const broadcastToRoom = (roomId, message, excludeClient = null) => {
    const room = rooms.get(roomId);
    if (room) {
      room.clients.forEach(({ ws }) => {
        if (ws.readyState === 1 && ws !== excludeClient) {
          ws.send(JSON.stringify(message));
        }
      });
    }
  };

  wss.on('connection', (ws, req) => {
    const url = new URL(req.url, `http://${req.headers.host}`);
    const roomId = url.searchParams.get('roomId');
    const username = url.searchParams.get('username');

    if (!roomId || !username) {
      console.log('Connection rejected: Missing parameters', { roomId, username });
      ws.close();
      return;
    }

    let room = rooms.get(roomId);
    if (!room) {
      room = createRoom(roomId);
      room.owner = username;
    }

    room.clients.set(username, { ws, username });
    console.log(`User connected to room - Room: ${roomId}, User: ${username}`);

    ws.on('error', (error) => {
      console.error('WebSocket connection error:', error);
    });

    try {
      ws.send(JSON.stringify({
        type: 'initial-state',
        data: {
          items: room.state,
          isRoomOwner: username === room.owner,
          isHidden: room.isHidden || false,
        },
      }));
    } catch (error) {
      console.error('Error sending initial state:', error);
    }

    ws.on('message', (message) => {
      try {
        const data = JSON.parse(message);

        switch (data.type) {
          case 'add-item': {
            const { category, item } = data.payload;
            room.state[category].push(item);
            broadcastToRoom(roomId, {
              type: 'item-added',
              payload: { category, item },
            });
            break;
          }

          case 'remove-item': {
            const { category, itemId } = data.payload;
            room.state[category] = room.state[category].filter(
              (item) => item.id !== itemId
            );
            broadcastToRoom(roomId, {
              type: 'item-removed',
              payload: { category, itemId },
            });
            break;
          }

          case 'move-item': {
            const { source, destination, itemId } = data.payload;
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
              broadcastToRoom(roomId, {
                type: 'item-moved',
                payload: { source, destination, item: movedItem },
              });
            }
            break;
          }

          case 'toggle-visibility': {
            if (username === room.owner) {
              room.isHidden = !room.isHidden;
              broadcastToRoom(roomId, {
                type: 'visibility-changed',
                payload: { isHidden: room.isHidden },
              });
            }
            break;
          }
        }
      } catch (error) {
        console.error('Message processing error:', error);
      }
    });

    ws.on('close', () => {
      console.log(`User left room - Room: ${roomId}, User: ${username}`);
      room.clients.delete(username);

      if (room.clients.size === 0) {
        rooms.delete(roomId);
        console.log(`Room deleted - Room: ${roomId}`);
      } else if (username === room.owner) {
        const newOwner = Array.from(room.clients.keys())[0];
        room.owner = newOwner;
        broadcastToRoom(roomId, {
          type: 'owner-changed',
          payload: { newOwner },
        });
      }
    });
  });

  wss.handleUpgrade(req, req.socket, Buffer.alloc(0), (ws) => {
    wss.emit('connection', ws, req);
  });
}; 