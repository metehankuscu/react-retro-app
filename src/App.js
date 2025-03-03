import React, { useState, useEffect, useRef } from "react";
import { DragDropContext, Droppable, Draggable } from "react-beautiful-dnd";
import "./App.css";
import { io } from 'socket.io-client';

const CATEGORIES = {
  WENT_WELL: "went_well",
  TO_IMPROVE: "to_improve",
  ACTION_ITEMS: "action_items",
};

const CATEGORY_TITLES = {
  went_well: "Went Well",
  to_improve: "To Improve",
  action_items: "Action Items",
};

const LobbyScreen = ({ onJoinRoom, onCreateRoom }) => {
  const [username, setUsername] = useState("");
  const [roomId, setRoomId] = useState("");
  const [activeTab, setActiveTab] = useState("join");

  const handleJoin = (e) => {
    e.preventDefault();
    if (!username.trim() || !roomId.trim()) return;
    onJoinRoom(username, roomId);
  };

  const handleCreate = (e) => {
    e.preventDefault();
    if (!username.trim()) return;
    onCreateRoom(username);
  };

  return (
    <div className="lobby-container">
      <h1>Retrospective Board</h1>
      <div className="lobby-card">
        <div className="tab-buttons">
          <button
            className={`tab-button ${activeTab === "join" ? "active" : ""}`}
            onClick={() => setActiveTab("join")}
          >
            Join Room
          </button>
          <button
            className={`tab-button ${activeTab === "create" ? "active" : ""}`}
            onClick={() => setActiveTab("create")}
          >
            Create Room
          </button>
        </div>

        <div className="tab-content">
          {activeTab === "join" ? (
            <form onSubmit={handleJoin}>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="Your name..."
                required
              />
              <input
                type="text"
                value={roomId}
                onChange={(e) => setRoomId(e.target.value)}
                placeholder="Room ID..."
                required
              />
              <button type="submit" className="submit-button">
                Join Room
              </button>
            </form>
          ) : (
            <form onSubmit={handleCreate}>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="Your name..."
                required
              />
              <button type="submit" className="submit-button">
                Create Room
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};

// Socket.IO connection function
const createSocketConnection = (setConnected, roomId, username) => {
  const SOCKET_URL = process.env.REACT_APP_SOCKET_URL || 'http://localhost:10000';
  
  const socket = io(SOCKET_URL, {
    query: { roomId, username },
    reconnectionAttempts: 5,
    reconnectionDelay: 1000,
    transports: ['websocket', 'polling'],
  });

  socket.io.on("error", (error) => {
    console.error('Socket.IO Infrastructure Error:', error);
  });

  socket.io.on("reconnect_attempt", (attempt) => {
    console.log(`Reconnection attempt ${attempt}`);
  });

  socket.io.on("reconnect", (attempt) => {
    console.log(`Reconnected after ${attempt} attempts`);
  });

  socket.io.on("reconnect_error", (error) => {
    console.error('Reconnection error:', error);
  });

  socket.on('connect', () => {
    console.log('Socket.IO Connected');
    setConnected(true);
  });

  socket.on('disconnect', () => {
    console.log('Socket.IO Disconnected');
    setConnected(false);
  });

  socket.on('connect_error', (error) => {
    console.error('Socket.IO Connection Error:', error);
    setConnected(false);
  });

  return socket;
};

const Board = ({
  categoryId,
  items,
  removeItem,
  isRoomOwner,
  currentUser,
  isHidden,
}) => {
  return (
    <Droppable droppableId={categoryId}>
      {(provided, snapshot) => (
        <div
          ref={provided.innerRef}
          {...provided.droppableProps}
          className={`drop-zone ${
            snapshot.isDraggingOver ? "dragging-over" : ""
          }`}
        >
          {(items[categoryId] || []).map((item, index) => {
            const shouldHideContent =
              isHidden && item.author !== currentUser && !isRoomOwner;

            return (
              <Draggable key={item.id} draggableId={item.id} index={index}>
                {(provided, snapshot) => (
                  <div
                    ref={provided.innerRef}
                    {...provided.draggableProps}
                    {...provided.dragHandleProps}
                    className={`item ${snapshot.isDragging ? "dragging" : ""} ${
                      shouldHideContent ? "hidden-content" : ""
                    }`}
                    style={{
                      ...provided.draggableProps.style,
                      transform: snapshot.isDragging
                        ? provided.draggableProps.style.transform
                        : "translate(0, 0)",
                    }}
                  >
                    <div className="item-content">
                      {shouldHideContent ? (
                        <p>🔒 Hidden Content</p>
                      ) : (
                        <p>{item.content}</p>
                      )}
                      <div className="item-footer">
                        <small className="author">
                          Added by: {item.author}
                        </small>
                        {(item.author === currentUser || isRoomOwner) && (
                          <button
                            onClick={() => removeItem(categoryId, item.id)}
                            className="delete-button"
                          >
                            ×
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </Draggable>
            );
          })}
          {provided.placeholder}
        </div>
      )}
    </Droppable>
  );
};

const RetroBoard = ({ roomId, username, onDisconnect }) => {
  const [items, setItems] = useState({
    went_well: [],
    to_improve: [],
    action_items: [],
  });
  const [connected, setConnected] = useState(false);
  const [newItem, setNewItem] = useState("");
  const [activeCategory, setActiveCategory] = useState("went_well");
  const [socket, setSocket] = useState(null);
  const [isRoomOwner, setIsRoomOwner] = useState(false);
  const [isHidden, setIsHidden] = useState(false);
  const inputRef = useRef(null);

  useEffect(() => {
    const socket = createSocketConnection(setConnected, roomId, username);
    setSocket(socket);

    socket.on('initial-state', (data) => {
      setItems(data.items);
      setIsRoomOwner(data.isRoomOwner);
      setIsHidden(data.isHidden);
    });

    socket.on('item-added', ({ category, item }) => {
      setItems((prev) => ({
        ...prev,
        [category]: [...prev[category], item],
      }));
    });

    socket.on('item-removed', ({ category, itemId }) => {
      setItems((prev) => ({
        ...prev,
        [category]: prev[category].filter((item) => item.id !== itemId),
      }));
    });

    socket.on('item-moved', ({ source, destination, item }) => {
      setItems((prev) => {
        const newItems = { ...prev };
        newItems[source.droppableId] = newItems[source.droppableId].filter(
          (i) => i.id !== item.id
        );
        newItems[destination.droppableId].splice(destination.index, 0, item);
        return newItems;
      });
    });

    socket.on('visibility-changed', ({ isHidden }) => {
      setIsHidden(isHidden);
    });

    socket.on('owner-changed', ({ newOwner }) => {
      setIsRoomOwner(username === newOwner);
    });

    return () => {
      socket.disconnect();
    };
  }, [roomId, username]);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const addItem = (e) => {
    e.preventDefault();
    if (!newItem.trim() || !connected) return;

    const item = {
      id: `item-${Date.now()}`,
      content: newItem,
      author: username,
      likes: [],
    };

    socket.emit('add-item', {
      category: activeCategory,
      item,
    });

    setNewItem("");
  };

  const handleDragEnd = (result) => {
    if (!result.destination || !connected) return;

    const { source, destination, draggableId } = result;

    if (
      source.droppableId === destination.droppableId &&
      source.index === destination.index
    ) {
      return;
    }

    socket.emit('move-item', {
      source,
      destination,
      itemId: draggableId,
    });
  };

  const removeItem = (category, itemId) => {
    if (!connected) return;

    socket.emit('remove-item', {
      category,
      itemId,
    });
  };

  const handleKeyPress = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      addItem(e);
    }
  };

  const toggleVisibility = () => {
    if (!isRoomOwner) return;

    socket.emit('toggle-visibility');
  };

  return (
    <div className="App">
      <div className="room-info">
        <div className="room-header">
          <h1>Retrospective Board {connected ? "🟢" : "🔴"}</h1>
          <div className="room-details">
            <div className="room-meta">
              <p>
                <strong>Room ID:</strong> {roomId}
              </p>
              <p>
                <strong>User:</strong> {username}
              </p>
              {isRoomOwner && (
                <button
                  onClick={toggleVisibility}
                  className={`visibility-toggle ${isHidden ? "active" : ""}`}
                >
                  {isHidden ? "🔒 Private Mode" : "🔓 Public Mode"}
                </button>
              )}
            </div>
            <button onClick={onDisconnect} className="disconnect-button">
              Leave Room
            </button>
          </div>
        </div>
      </div>

      <form onSubmit={addItem} className="input-section">
        <div className="input-group">
          <input
            ref={inputRef}
            type="text"
            value={newItem}
            onChange={(e) => setNewItem(e.target.value)}
            onKeyPress={handleKeyPress}
            placeholder="Add a new item..."
            className="new-item-input"
            required
          />
        </div>
        <select
          value={activeCategory}
          onChange={(e) => setActiveCategory(e.target.value)}
          className="category-select"
        >
          {Object.values(CATEGORIES).map((categoryId) => (
            <option key={categoryId} value={categoryId}>
              {CATEGORY_TITLES[categoryId]}
            </option>
          ))}
        </select>
        <button type="submit" className="add-button">
          Add Item
        </button>
      </form>

      <DragDropContext onDragEnd={handleDragEnd}>
        <div className="boards-container">
          {Object.values(CATEGORIES).map((categoryId) => (
            <div key={categoryId} className="board">
              <h2>{CATEGORY_TITLES[categoryId]}</h2>
              <Board
                categoryId={categoryId}
                items={items}
                removeItem={removeItem}
                isRoomOwner={isRoomOwner}
                currentUser={username}
                isHidden={isHidden}
              />
            </div>
          ))}
        </div>
      </DragDropContext>
    </div>
  );
};

const App = () => {
  const [roomState, setRoomState] = useState({
    inRoom: false,
    roomId: null,
    username: null,
  });

  const handleJoinRoom = (username, roomId) => {
    setRoomState({
      inRoom: true,
      roomId,
      username,
    });
  };

  const handleCreateRoom = async (username) => {
    const roomId = Math.random().toString(36).substring(2, 8).toUpperCase();
    setRoomState({
      inRoom: true,
      roomId,
      username,
    });
  };

  const handleDisconnect = () => {
    setRoomState({
      inRoom: false,
      roomId: null,
      username: null,
    });
  };

  return (
    <div>
      {!roomState.inRoom ? (
        <LobbyScreen
          onJoinRoom={handleJoinRoom}
          onCreateRoom={handleCreateRoom}
        />
      ) : (
        <RetroBoard
          roomId={roomState.roomId}
          username={roomState.username}
          onDisconnect={handleDisconnect}
        />
      )}
    </div>
  );
};

export default App;
