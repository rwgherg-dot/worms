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
const WORLD_SIZE = 3000;

app.use(express.static(path.join(__dirname, 'app/src/main/assets')));
app.use(express.static(__dirname));

const rooms = {};

function generateFoodBatch(count) {
  const foods = [];
  for (let i = 0; i < count; i++) {
    foods.push({
      id: Math.random().toString(36).substr(2, 9),
      x: Math.floor(Math.random() * (WORLD_SIZE - 200)) + 100,
      y: Math.floor(Math.random() * (WORLD_SIZE - 200)) + 100,
      radius: Math.floor(Math.random() * 4) + 3,
      color: `hsl(${Math.floor(Math.random() * 360)}, 90%, 60%)`,
      value: Math.floor(Math.random() * 3) + 1
    });
  }
  return foods;
}

io.on('connection', (socket) => {
  let currentRoomId = null;
  let playerId = socket.id;

  socket.on('ping_check', (timestamp, callback) => {
    if (typeof callback === 'function') callback(timestamp);
  });

  socket.on('join_room', ({ roomId, name, skinId }) => {
    currentRoomId = roomId ? roomId.trim().toUpperCase() : 'GLOBAL';
    socket.join(currentRoomId);

    if (!rooms[currentRoomId]) {
      rooms[currentRoomId] = {
        players: {},
        foods: generateFoodBatch(250)
      };
    }

    rooms[currentRoomId].players[playerId] = {
      id: playerId,
      name: name || 'Червячок',
      skinId: skinId || 'classic',
      x: Math.floor(Math.random() * (WORLD_SIZE - 400)) + 200,
      y: Math.floor(Math.random() * (WORLD_SIZE - 400)) + 200,
      angle: Math.random() * Math.PI * 2,
      score: 100,
      isBoosting: false,
      isDead: false,
      segments: []
    };

    socket.emit('init_room', {
      myId: playerId,
      roomId: currentRoomId,
      players: rooms[currentRoomId].players,
      foods: rooms[currentRoomId].foods
    });

    socket.to(currentRoomId).emit('player_joined', rooms[currentRoomId].players[playerId]);
  });

  socket.on('update_position', (data) => {
    if (currentRoomId && rooms[currentRoomId] && rooms[currentRoomId].players[playerId]) {
      const p = rooms[currentRoomId].players[playerId];
      p.x = data.x;
      p.y = data.y;
      p.angle = data.angle;
      p.score = data.score;
      p.isBoosting = data.isBoosting;
      p.segments = data.segments;

      // Broadcast full worm state (score, position, angle, segments) to all friends in room!
      socket.to(currentRoomId).emit('player_moved', {
        id: playerId,
        x: data.x,
        y: data.y,
        angle: data.angle,
        score: data.score,
        isBoosting: data.isBoosting,
        segments: data.segments
      });
    }
  });

  socket.on('eat_food', (foodId) => {
    if (currentRoomId && rooms[currentRoomId]) {
      const room = rooms[currentRoomId];
      const idx = room.foods.findIndex(f => f.id === foodId);
      if (idx !== -1) {
        room.foods.splice(idx, 1);
        io.to(currentRoomId).emit('food_eaten', foodId);

        if (room.foods.length < 200) {
          const newFood = generateFoodBatch(10);
          room.foods.push(...newFood);
          io.to(currentRoomId).emit('food_spawned', newFood);
        }
      }
    }
  });

  socket.on('player_died', (droppedFood) => {
    if (currentRoomId && rooms[currentRoomId] && rooms[currentRoomId].players[playerId]) {
      rooms[currentRoomId].players[playerId].isDead = true;
      if (Array.isArray(droppedFood) && droppedFood.length > 0) {
        rooms[currentRoomId].foods.push(...droppedFood);
        io.to(currentRoomId).emit('food_spawned', droppedFood);
      }
      io.to(currentRoomId).emit('player_died', playerId);
    }
  });

  socket.on('disconnect', () => {
    if (currentRoomId && rooms[currentRoomId]) {
      delete rooms[currentRoomId].players[playerId];
      io.to(currentRoomId).emit('player_left', playerId);
      if (Object.keys(rooms[currentRoomId].players).length === 0) {
        delete rooms[currentRoomId];
      }
    }
  });
});

server.listen(PORT, () => {
  console.log(`🌐 Worms Royale Online Server running on port ${PORT}`);
});
