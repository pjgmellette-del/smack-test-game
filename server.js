const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http);
const PORT = 3000;

// Serve files from the public folder
app.use(express.static('public'));

let players = {};

io.on('connection', (socket) => {
    console.log(`Player connected: ${socket.id}`);

    // Create a data profile for the new connection
    players[socket.id] = {
        id: socket.id,
        x: 0, y: 5, z: 0,
        yaw: 0,
        colors: { body: '#00ff44', head: '#00ff44', limb: '#00ff44' }
    };

    // Send currently connected list back to the incoming player
    socket.emit('currentPlayers', players);
    
    // Alert everyone else a new player arrived
    socket.broadcast.emit('newPlayer', players[socket.id]);

    // Update customization color profile mid-lobby
    socket.on('playerColors', (colors) => {
        if (players[socket.id]) {
            players[socket.id].colors = colors;
            io.emit('playerUpdated', players[socket.id]);
        }
    });

    // Sync structural positional coordinates 
    socket.on('playerMovement', (movementData) => {
        if (players[socket.id]) {
            players[socket.id].x = movementData.x;
            players[socket.id].y = movementData.y;
            players[socket.id].z = movementData.z;
            players[socket.id].yaw = movementData.yaw;
            socket.broadcast.emit('playerMoved', players[socket.id]);
        }
    });

    // Forward combat knockback events to targets
    socket.on('hitPlayer', (targetId, force) => {
        io.to(targetId).emit('getHit', force);
    });

    socket.on('disconnect', () => {
        console.log(`Player disconnected: ${socket.id}`);
        delete players[socket.id];
        io.emit('playerDisconnected', socket.id);
    });
});

http.listen(PORT, () => {
    console.log(`Smack Test Game running on http://localhost:${PORT}`);
});