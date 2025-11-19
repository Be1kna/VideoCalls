// WebRTC Signaling Server
const WebSocket = require('ws');
const http = require('http');
const path = require('path');
const fs = require('fs');

const PORT = process.env.PORT || 8080;

// Create HTTP server
const server = http.createServer((req, res) => {
    // Serve static files
    let filePath = '.' + req.url;
    if (filePath === './') {
        filePath = './index.html';
    }
    
    const extname = String(path.extname(filePath)).toLowerCase();
    const mimeTypes = {
        '.html': 'text/html',
        '.js': 'text/javascript',
        '.css': 'text/css',
        '.json': 'application/json',
        '.png': 'image/png',
        '.jpg': 'image/jpg',
        '.gif': 'image/gif',
        '.svg': 'image/svg+xml',
        '.wav': 'audio/wav',
        '.mp4': 'video/mp4',
        '.woff': 'application/font-woff',
        '.ttf': 'application/font-ttf',
        '.eot': 'application/vnd.ms-fontobject',
        '.otf': 'application/font-otf',
        '.wasm': 'application/wasm'
    };
    
    const contentType = mimeTypes[extname] || 'application/octet-stream';
    
    fs.readFile(filePath, (error, content) => {
        if (error) {
            if (error.code === 'ENOENT') {
                res.writeHead(404, { 'Content-Type': 'text/html' });
                res.end('<h1>404 - File Not Found</h1>', 'utf-8');
            } else {
                res.writeHead(500);
                res.end(`Server Error: ${error.code}`, 'utf-8');
            }
        } else {
            res.writeHead(200, { 'Content-Type': contentType });
            res.end(content, 'utf-8');
        }
    });
});

// Create WebSocket server
const wss = new WebSocket.Server({ server });

// Store rooms and their participants
const rooms = new Map();

wss.on('connection', (ws, req) => {
    console.log('New WebSocket connection');
    try {
        console.log('  Request headers:', {
            origin: req.headers.origin,
            'sec-websocket-key': req.headers['sec-websocket-key'],
            'sec-websocket-protocol': req.headers['sec-websocket-protocol'],
            'user-agent': req.headers['user-agent']
        });
        console.log('  Remote address:', req.socket && req.socket.remoteAddress);
    } catch (e) {
        console.warn('Failed to log connection request headers', e);
    }
    
    let currentRoom = null;
    let userName = null;
    
    ws.on('message', (message) => {
        try {
            const data = JSON.parse(message);
            
            switch (data.type) {
                case 'join':
                    handleJoin(ws, data, () => {
                        currentRoom = data.room;
                        userName = data.name;
                    });
                    break;
                    
                case 'offer':
                    handleOffer(data, ws);
                    break;

                case 'answer':
                    handleAnswer(data, ws);
                    break;

                case 'ice-candidate':
                    handleIceCandidate(data, ws);
                    break;
                    
                case 'leave':
                    handleLeave(data.room, ws);
                    break;
                    
                default:
                    sendError(ws, 'Unknown message type');
            }
        } catch (error) {
            console.error('Error parsing message:', error);
            sendError(ws, 'Invalid message format');
        }
    });
    
    ws.on('close', () => {
        console.log('WebSocket connection closed');
        if (currentRoom) {
            handleLeave(currentRoom, ws);
        }
    });
    
    ws.on('error', (error) => {
        console.error('WebSocket error:', error);
    });
});

// Log upgrade requests to help debug WSS handshake problems
server.on('upgrade', (req, socket, head) => {
    try {
        console.log('HTTP upgrade request for WebSocket');
        console.log('  Upgrade headers:', {
            host: req.headers.host,
            origin: req.headers.origin,
            upgrade: req.headers.upgrade,
            'sec-websocket-key': req.headers['sec-websocket-key'],
            'sec-websocket-protocol': req.headers['sec-websocket-protocol']
        });
    } catch (e) {
        console.warn('Failed to log upgrade request', e);
    }
});

// Listen for errors on the WebSocket server itself
wss.on('error', (err) => {
    console.error('WebSocket.Server error:', err);
});

function handleJoin(ws, data, callback) {
    const { room, name } = data;
    
    if (!room) {
        sendError(ws, 'Room ID is required');
        return;
    }
    
    // Initialize room if it doesn't exist
    if (!rooms.has(room)) {
        rooms.set(room, new Map());
    }
    
    const roomParticipants = rooms.get(room);
    
    // Check if room is full (limit to 2 participants for simplicity)
    if (roomParticipants.size >= 2) {
        sendError(ws, 'Room is full');
        return;
    }
    
    // Add participant to room
    roomParticipants.set(ws, { name: name || 'Anonymous' });
    
    // Send confirmation
    ws.send(JSON.stringify({
        type: 'joined',
        room: room,
        participants: Array.from(roomParticipants.values()).map(p => p.name)
    }));
    
    // Notify other participants
    roomParticipants.forEach((participant, participantWs) => {
        if (participantWs !== ws) {
            participantWs.send(JSON.stringify({
                type: 'user-joined',
                name: name || 'Anonymous'
            }));
        }
    });
    
    callback();
    console.log(`User ${name || 'Anonymous'} joined room ${room} (${roomParticipants.size} participants)`);
}

function handleOffer(data, senderWs) {
    const { room, offer } = data;
    const roomParticipants = rooms.get(room);

    if (!roomParticipants) {
        return;
    }

    // Forward offer to other participants (exclude sender)
    roomParticipants.forEach((participant, participantWs) => {
        if (participantWs !== senderWs && participantWs.readyState === WebSocket.OPEN) {
            participantWs.send(JSON.stringify({
                type: 'offer',
                offer: offer
            }));
        }
    });
}

function handleAnswer(data, senderWs) {
    const { room, answer } = data;
    const roomParticipants = rooms.get(room);

    if (!roomParticipants) {
        return;
    }

    // Forward answer to other participants (exclude sender)
    roomParticipants.forEach((participant, participantWs) => {
        if (participantWs !== senderWs && participantWs.readyState === WebSocket.OPEN) {
            participantWs.send(JSON.stringify({
                type: 'answer',
                answer: answer
            }));
        }
    });
}

function handleIceCandidate(data, senderWs) {
    const { room, candidate } = data;
    const roomParticipants = rooms.get(room);

    if (!roomParticipants) {
        return;
    }

    // Forward ICE candidate to other participants (exclude sender)
    roomParticipants.forEach((participant, participantWs) => {
        if (participantWs !== senderWs && participantWs.readyState === WebSocket.OPEN) {
            participantWs.send(JSON.stringify({
                type: 'ice-candidate',
                candidate: candidate
            }));
        }
    });
}

function handleLeave(room, ws) {
    const roomParticipants = rooms.get(room);
    
    if (!roomParticipants) {
        return;
    }
    
    const participant = roomParticipants.get(ws);
    const participantName = participant ? participant.name : 'Someone';
    
    // Remove participant
    roomParticipants.delete(ws);
    
    // Notify other participants
    roomParticipants.forEach((participant, participantWs) => {
        participantWs.send(JSON.stringify({
            type: 'user-left',
            name: participantName
        }));
    });
    
    // Clean up empty rooms
    if (roomParticipants.size === 0) {
        rooms.delete(room);
        console.log(`Room ${room} deleted (empty)`);
    } else {
        console.log(`User ${participantName} left room ${room} (${roomParticipants.size} participants remaining)`);
    }
}

function sendError(ws, message) {
    ws.send(JSON.stringify({
        type: 'error',
        message: message
    }));
}

// Start server
server.listen(PORT, () => {
    console.log(`\n🚀 Video Call Server running on port ${PORT}`);
    console.log(`📡 WebSocket server ready for connections`);
    console.log(`🌐 Open http://localhost:${PORT} in your browser\n`);
    console.log('Press Ctrl+C to stop the server\n');
});

// Graceful shutdown
process.on('SIGINT', () => {
    console.log('\n\nShutting down server...');
    wss.close(() => {
        server.close(() => {
            console.log('Server closed');
            process.exit(0);
        });
    });
});



