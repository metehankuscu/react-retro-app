const WebSocket = require("ws");
const url = require("url");

// Create WebSocket server
const wss = new WebSocket.Server({
  port: 10000,
  host: "0.0.0.0",
  // For debugging
  perMessageDeflate: false,
  // Connection timeout
  clientTracking: true,
  // Ping/Pong check
  keepalive: true,
  keepaliveInterval: 30000,
});

// For debugging
console.log("WebSocket server started on port 10000");

// Connection timeout
const TIMEOUT = 30000;

// Ping/Pong check
const PING_INTERVAL = 10000;

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
      if (ws.readyState === WebSocket.OPEN && ws !== excludeClient) {
        ws.send(JSON.stringify(message));
      }
    });
  }
};

// Hata yakalama
wss.on("error", (error) => {
  console.error("WebSocket server error:", error);
});

wss.on("connection", (ws, req) => {
  const parameters = url.parse(req.url, true).query;
  const roomId = parameters.roomId;
  const username = parameters.username;

  if (!roomId || !username) {
    console.log("Connection rejected: Missing parameters", {
      roomId,
      username,
    });
    ws.close();
    return;
  }

  // Close connection if room doesn't exist or is invalid
  let room = rooms.get(roomId);
  if (!room) {
    // Create new room
    room = createRoom(roomId);
    room.owner = username; // Set first connected user as owner
  }

  // Add client to room
  room.clients.set(username, { ws, username });
  console.log(
    `User connected to room - Room: ${roomId}, User: ${username}`
  );

  // Catch connection errors
  ws.on("error", (error) => {
    console.error("WebSocket connection error:", error);
  });

  // Ping/Pong check
  ws.isAlive = true;
  ws.on("pong", () => {
    ws.isAlive = true;
  });

  // Send current state to newly connected user
  try {
    ws.send(
      JSON.stringify({
        type: "initial-state",
        data: {
          items: room.state,
          isRoomOwner: username === room.owner,
          isHidden: room.isHidden || false,
        },
      })
    );
  } catch (error) {
    console.error("Error sending initial state:", error);
  }

  ws.on("message", (message) => {
    try {
      const data = JSON.parse(message);

      switch (data.type) {
        case "add-item": {
          const { category, item } = data.payload;
          room.state[category].push(item);
          broadcastToRoom(roomId, {
            type: "item-added",
            payload: {
              category,
              item,
            },
          });
          break;
        }

        case "remove-item": {
          const { category, itemId } = data.payload;
          room.state[category] = room.state[category].filter(
            (item) => item.id !== itemId
          );
          broadcastToRoom(roomId, {
            type: "item-removed",
            payload: { category, itemId },
          });
          break;
        }

        case "move-item": {
          const { source, destination, itemId } = data.payload;
          const movedItem = room.state[source.droppableId].find(
            (item) => item.id === itemId
          );

          if (movedItem) {
            room.state[source.droppableId] = room.state[
              source.droppableId
            ].filter((i) => i.id !== itemId);
            room.state[destination.droppableId].splice(
              destination.index,
              0,
              movedItem
            );
            broadcastToRoom(roomId, {
              type: "item-moved",
              payload: { source, destination, item: movedItem },
            });
          }
          break;
        }

        case "toggle-visibility": {
          // Only room owner can change visibility
          if (username === room.owner) {
            room.isHidden = !room.isHidden;
            broadcastToRoom(roomId, {
              type: "visibility-changed",
              payload: { isHidden: room.isHidden },
            });
            console.log(
              `Visibility changed - Room: ${roomId}, Hidden: ${room.isHidden}`
            );
          }
          break;
        }

        case "toggle-like": {
          const { category, itemId, userId } = data.payload;
          console.log("Like toggle request:", { category, itemId, userId });

          // Perform like operation
          const updatedItem = handleLikeToggle(category, itemId, userId);

          if (updatedItem) {
            // Notify all clients
            broadcastToRoom(roomId, {
              type: "like-updated",
              payload: {
                category,
                itemId,
                likes: [...updatedItem.likes], // Send new likes array
              },
            });
          }
          break;
        }
      }
    } catch (error) {
      console.error("Message processing error:", error);
    }
  });

  ws.on("close", () => {
    console.log(
      `User left room - Room: ${roomId}, User: ${username}`
    );
    ws.isAlive = false;
    room.clients.delete(username);

    // Delete room if no one is left
    if (room.clients.size === 0) {
      rooms.delete(roomId);
      console.log(`Room deleted - Room: ${roomId}`);
    } else if (username === room.owner) {
      // If room owner left, assign new owner
      const newOwner = Array.from(room.clients.keys())[0];
      room.owner = newOwner;
      broadcastToRoom(roomId, {
        type: "owner-changed",
        payload: { newOwner },
      });
    }
  });
});

// Connection check
const interval = setInterval(() => {
  wss.clients.forEach((ws) => {
    if (ws.isAlive === false) return ws.terminate();
    ws.isAlive = false;
    ws.ping();
  });
}, 30000);

wss.on("close", () => {
  clearInterval(interval);
});

// Start server
console.log("Starting WebSocket server on port 10000...");
wss.on("listening", () => {
  console.log("WebSocket server running on port 10000");
});

// Helper function for like operation
const handleLikeToggle = (category, itemId, userId) => {
  // Find item
  const item = rooms.get(category).state[category].find((i) => i.id === itemId);
  if (!item) return null;

  // Check likes array
  if (!Array.isArray(item.likes)) {
    item.likes = [];
  }

  // Change like status
  const likeIndex = item.likes.indexOf(userId);
  if (likeIndex === -1) {
    item.likes.push(userId);
  } else {
    item.likes.splice(likeIndex, 1);
  }

  return item;
};
