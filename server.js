const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*' }
});

const PORT = process.env.PORT || 3000;

// Serve static HTML game files
app.use(express.static(path.join(__dirname, 'app/src/main/assets')));
app.use(express.static(__dirname));

// Room management
const rooms = {};

io.on('connection', (socket) => {
  let currentRoom = null;
  let playerId = socket.id;

  // Measure ping
  socket.on('ping_check', (timestamp, callback) => {
    if (typeof callback === 'function') callback(timestamp);
  });

  // Join or Create Room
  socket.on('join_room', ({ roomId, playerState }) => {
    currentRoom = roomId || 'GLOBAL';
    socket.join(currentRoom);

    if (!rooms[currentRoom]) {
      rooms[currentRoom] = {
        players: {},
        foods: generateFoods(200)
      };
    }

    rooms[currentRoom].players[playerId] = {
      id: playerId,
      ...playerState
    };

    // Notify room
    io.to(currentRoom).emit('room_state', {
      players: rooms[currentRoom].players,
      foods: rooms[currentRoom].foods,
      playerCount: Object.keys(rooms[currentRoom].players).length
    });

    socket.emit('assigned_id', playerId);
  });

  // Sync position update
  socket.on('update_worm', (wormData) => {
    if (currentRoom && rooms[currentRoom] && rooms[currentRoom].players[playerId]) {
      rooms[currentRoom].players[playerId] = {
        ...rooms[currentRoom].players[playerId],
        ...wormData
      };
      socket.to(currentRoom).emit('worm_moved', { id: playerId, ...wormData });
    }
  });

  // Eat food
  socket.on('eat_food', (foodIndex) => {
    if (currentRoom && rooms[currentRoom] && rooms[currentRoom].foods[foodIndex]) {
      delete rooms[currentRoom].foods[foodIndex];
      io.to(currentRoom).emit('food_eaten', foodIndex);
    }
  });

  // Player disconnect
  socket.on('disconnect', () => {
    if (currentRoom && rooms[currentRoom]) {
      delete rooms[currentRoom].players[playerId];
      io.to(currentRoom).emit('player_left', playerId);
      if (Object.keys(rooms[currentRoom].players).length === 0) {
        delete rooms[currentRoom];
      }
    }
  });
});

function generateFoods(count) {
  const foods = [];
  for (let i = 0; i < count; i++) {
    foods.push({
      x: Math.floor(Math.random() * 2800) + 100,
      y: Math.floor(Math.random() * 2800) + 100,
      radius: Math.floor(Math.random() * 4) + 3,
      color: `hsl(${Math.floor(Math.random() * 360)}, 90%, 60%)`,
      value: Math.floor(Math.random() * 3) + 1
    });
  }
  return foods;
}

server.listen(PORT, () => {
  console.log(`🎮 Worms Royale Server running on port ${PORT}`);
});
