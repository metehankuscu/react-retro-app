import React, { useState, useEffect, useRef } from "react";
import { DragDropContext, Droppable, Draggable } from "react-beautiful-dnd";
import "./App.css";

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

// WebSocket connection function
const createWebSocket = (setConnected, roomId, username) => {

  const WS_URL = process.env.REACT_APP_WS_URL || window.location.hostname;

  const protocol = WS_URL.includes("ngrok") ? "wss" : "ws";
  const port = WS_URL.includes("ngrok") ? "" : ":10000";

  const ws = new WebSocket(
    `${protocol}://${WS_URL}${port}?roomId=${roomId}&username=${encodeURIComponent(
      username
    )}`
  );

  ws.onopen = () => {
    console.log("WebSocket Connected");
    setConnected(true);
  };

  ws.onclose = () => {
    console.log("WebSocket Disconnected");
    setConnected(false);
  };

  ws.onerror = (error) => {
    console.error("WebSocket Error:", error);
    setConnected(false);
  };

  return ws;
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
            // If item is hidden and user is not the item owner and not the room owner, hide the content
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
  const [ws, setWs] = useState(null);
  const [isRoomOwner, setIsRoomOwner] = useState(false);
  const [isHidden, setIsHidden] = useState(false);
  const inputRef = useRef(null);
  const reconnectTimeoutRef = useRef(null);
  const reconnectAttemptsRef = useRef(0);
  const maxReconnectAttempts = 5;

  useEffect(() => {
    const connectWebSocket = () => {
      const socket = createWebSocket(setConnected, roomId, username);

      socket.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data);

          switch (message.type) {
            case "initial-state":
              // Use empty state if items is undefined
              setItems(
                message.data.items || {
                  went_well: [],
                  to_improve: [],
                  action_items: [],
                }
              );
              setIsRoomOwner(message.data.isRoomOwner || false);
              setIsHidden(message.data.isHidden || false);
              break;
            case "room-not-found":
              alert("Room not found!");
              onDisconnect();
              break;
            case "item-added":
              const { category, item } = message.payload;
              setItems((prev) => ({
                ...prev,
                [category]: [...(prev[category] || []), item],
              }));
              break;
            case "item-removed":
              const { category: removeCat, itemId } = message.payload;
              setItems((prev) => ({
                ...prev,
                [removeCat]: prev[removeCat].filter(
                  (item) => item.id !== itemId
                ),
              }));
              break;
            case "item-moved":
              const { source, destination, item: movedItem } = message.payload;
              setItems((prev) => {
                const newItems = { ...prev };
                newItems[source.droppableId] = newItems[
                  source.droppableId
                ].filter((i) => i.id !== movedItem.id);
                newItems[destination.droppableId].splice(
                  destination.index,
                  0,
                  movedItem
                );
                return newItems;
              });
              break;
            case "visibility-changed":
              setIsHidden(message.payload.isHidden);
              break;
          }
        } catch (error) {
          console.error("Message handling error:", error);
        }
      };

      socket.onclose = () => {
        setConnected(false);
        if (reconnectAttemptsRef.current < maxReconnectAttempts) {
          reconnectAttemptsRef.current += 1;
          reconnectTimeoutRef.current = setTimeout(connectWebSocket, 3000);
        }
      };

      setWs(socket);
    };

    connectWebSocket();

    return () => {
      if (ws) {
        ws.close();
      }
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
    };
  }, [roomId, username]);

  // Input focus
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

    ws.send(
      JSON.stringify({
        type: "add-item",
        payload: {
          category: activeCategory,
          item,
        },
      })
    );

    setNewItem("");
  };

  const handleDragEnd = (result) => {
    if (!result.destination || !connected) return;

    const { source, destination, draggableId } = result;

    // Skip if dropped in the same position
    if (
      source.droppableId === destination.droppableId &&
      source.index === destination.index
    ) {
      return;
    }

    // Find the moved item
    const sourceItems = items[source.droppableId];
    const [movedItem] = sourceItems.filter((item) => item.id === draggableId);

    ws.send(
      JSON.stringify({
        type: "move-item",
        payload: {
          source,
          destination,
          itemId: draggableId,
        },
      })
    );
  };

  const removeItem = (category, itemId) => {
    if (!connected) return;

    ws.send(
      JSON.stringify({
        type: "remove-item",
        payload: {
          category,
          itemId,
        },
      })
    );
  };

  const handleKeyPress = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      addItem(e);
    }
  };

  const toggleVisibility = () => {
    if (!isRoomOwner) return;

    ws.send(
      JSON.stringify({
        type: "toggle-visibility",
        payload: {
          roomId,
        },
      })
    );
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
    // Generate new room ID (will be handled on server side)
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
