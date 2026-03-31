const express = require('express');
const app = express();
const http = require('http');
const path = require('path');
const { Server } = require('socket.io');
const server = http.createServer(app);
const io = new Server(server);

const userSocketMap = {};

// Serve React build in production
app.use(express.static(path.join(__dirname, 'build')));
app.get('/{*path}', (req, res) => {
    res.sendFile(path.join(__dirname, 'build', 'index.html'));
});

const getAllConnectedClients = (roomId) => {
    return Array.from(io.sockets.adapter.rooms.get(roomId) || []).map((socketId) => {
        return {
            socketId,
            username: userSocketMap[socketId],
        };
    });
};

io.on('connection', (socket) => {

    // ─── Join Room ───────────────────────────────────────────────
    socket.on('join', ({ roomId, username }) => {
        userSocketMap[socket.id] = username;
        socket.join(roomId);
        const clients = getAllConnectedClients(roomId);
        clients.forEach(({ socketId }) => {
            io.to(socketId).emit('joined', {
                clients,
                username,
                socketId: socket.id,
            });
        });
    });

    // ─── Code Change ─────────────────────────────────────────────
    socket.on('code-change', ({ roomId, code }) => {
        socket.in(roomId).emit('code-change', { code });
    });

    // ─── Sync Code to New Joiner ─────────────────────────────────
    socket.on('sync-code', ({ socketId, code }) => {
        io.to(socketId).emit('code-change', { code });
    });

    // ─── FEATURE 1: Language Change ──────────────────────────────
    // Broadcast language change to everyone else in the room
    socket.on('language-change', ({ roomId, language }) => {
        socket.in(roomId).emit('language-change', { language });
    });

    // Sync language to a new joiner
    socket.on('sync-language', ({ socketId, language }) => {
        io.to(socketId).emit('language-change', { language });
    });

    // ─── FEATURE 2: Chat Message ─────────────────────────────────
    // Broadcast chat message to everyone in the room (including sender)
    socket.on('chat-message', ({ roomId, message, username }) => {
        io.in(roomId).emit('chat-message', {
            message,
            username,
            socketId: socket.id,
            timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        });
    });

    // ─── FEATURE 3: Cursor Position ──────────────────────────────
    // Broadcast cursor position to everyone else in the room
    socket.on('cursor-move', ({ roomId, cursor, username }) => {
        socket.in(roomId).emit('cursor-move', {
            socketId: socket.id,
            cursor,   // { line, ch } — CodeMirror cursor object
            username,
        });
    });

    // ─── Disconnect ──────────────────────────────────────────────
    socket.on('disconnecting', () => {
        const rooms = [...socket.rooms];
        rooms.forEach((roomId) => {
            socket.in(roomId).emit('disconnected', {
                socketId: socket.id,
                username: userSocketMap[socket.id],
            });
            // Also remove the cursor of this user from everyone's editor
            socket.in(roomId).emit('cursor-remove', { socketId: socket.id });
        });
        delete userSocketMap[socket.id];
        socket.leave();
    });
});

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});