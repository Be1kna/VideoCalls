// WebRTC Signaling Server
const WebSocket = require('ws');
const http = require('http');
const path = require('path');
const fs = require('fs');

const PORT = process.env.PORT || 8080;

// Create HTTP server
const server = http.createServer((req, res) => {
    // Simple health endpoint for reachability checks
    if (req.url === '/health') {
        res.writeHead(200, { 'Content-Type': 'text/plain' });
        res.end('OK');
        return;
    }
    // Provide ICE servers to clients (TURN/STUN) if configured via env
    if (req.url === '/ice-servers') {
        // Async helper so we can optionally fetch dynamic credentials from a TURN provider
        (async () => {
            res.writeHead(200, { 'Content-Type': 'application/json' });

            // Default STUN servers
            const defaultIce = [
                { urls: 'stun:stun.l.google.com:19302' },
                { urls: 'stun:stun1.l.google.com:19302' }
            ];

            // Try dynamic provider (e.g. Xirsys) if configured
            // First, if ident/secret are provided, try the Xirsys global REST endpoint with Basic auth
            if (process.env.XIRSYS_IDENT && process.env.XIRSYS_SECRET) {
                try {
                    const channel = process.env.XIRSYS_CHANNEL || 'VideoCall';
                    const https = require('https');
                    const auth = Buffer.from(`${process.env.XIRSYS_IDENT}:${process.env.XIRSYS_SECRET}`).toString('base64');
                    const options = {
                        hostname: 'global.xirsys.net',
                        path: `/_turn/${encodeURIComponent(channel)}`,
                        method: 'GET',
                        headers: {
                            'Authorization': `Basic ${auth}`,
                            'User-Agent': 'VideoCallsServer/1.0'
                        }
                    };

                    console.log(`[ice-servers] Attempting Xirsys Basic auth fetch for channel=${channel} at ${new Date().toISOString()}`);

                    const body = await new Promise((resolve, reject) => {
                        const req2 = https.request(options, (res2) => {
                            let data = '';
                            res2.on('data', (chunk) => { data += chunk; });
                            res2.on('end', () => {
                                console.log(`[ice-servers] Xirsys response status=${res2.statusCode}, length=${data.length}`);
                                resolve(data);
                            });
                        });
                        req2.on('error', (err) => reject(err));
                        req2.end();
                    });

                    let parsed;
                    try { parsed = JSON.parse(body || '{}'); } catch (e) { parsed = null; console.warn('[ice-servers] Could not parse Xirsys response JSON', e && e.message); }
                    // If provider returned non-JSON text that contains a JSON array, attempt to extract it
                    if ((!parsed || !(parsed.iceServers || (parsed.v && parsed.v.iceServers))) && body) {
                        const m = (body || '').match(/\[\s*\{[\s\S]*\}\s*\]/);
                        if (m && m[0]) {
                            try {
                                const parsedArray = JSON.parse(m[0]);
                                parsed = { iceServers: parsedArray };
                                console.log('[ice-servers] Extracted iceServers array from non-JSON response');
                            } catch (e2) {
                                console.warn('[ice-servers] Could not extract JSON array from response', e2 && e2.message);
                            }
                        }
                    }
                    const ice = (parsed && parsed.v && parsed.v.iceServers) ? parsed.v.iceServers : (parsed && parsed.iceServers ? parsed.iceServers : null);
                    if (Array.isArray(ice) && ice.length) {
                        console.log(`[ice-servers] Returning ${ice.length} iceServers from Xirsys Basic auth fetch`);
                        res.end(JSON.stringify({ iceServers: ice }));
                        return;
                    } else {
                        console.log('[ice-servers] Xirsys Basic auth fetch returned no iceServers, falling back; body preview:', (body || '').slice(0,200));
                    }
                } catch (err) {
                    console.warn('Xirsys ident/secret fetch failed', err && (err.stack || err.message || err));
                }
            }

            if (process.env.XIRSYS_API_URL) {
                try {
                    console.log(`[ice-servers] Attempting dynamic fetch from XIRSYS_API_URL=${process.env.XIRSYS_API_URL} at ${new Date().toISOString()}`);
                    const fetch = global.fetch || (await import('node-fetch')).default;
                    const headers = {};
                    if (process.env.XIRSYS_API_TOKEN) headers['Authorization'] = `Bearer ${process.env.XIRSYS_API_TOKEN}`;
                    const resp = await fetch(process.env.XIRSYS_API_URL, { method: 'GET', headers, cache: 'no-store' });
                    console.log('[ice-servers] dynamic fetch status', resp && resp.status);
                    if (resp && resp.ok) {
                        const body = await resp.text();
                        console.log('[ice-servers] dynamic fetch response length', body && body.length);
                        let parsedBody;
                        try { parsedBody = JSON.parse(body); } catch (e) { parsedBody = null; console.warn('[ice-servers] dynamic fetch returned non-JSON', e); }
                        const ice = (parsedBody && parsedBody.iceServers) ? parsedBody.iceServers : (parsedBody && parsedBody.v && parsedBody.v.iceServers) ? parsedBody.v.iceServers : null;
                        if (Array.isArray(ice) && ice.length) {
                            console.log(`[ice-servers] Returning ${ice.length} iceServers from dynamic fetch`);
                            res.end(JSON.stringify({ iceServers: ice }));
                            return;
                        }
                    } else {
                        console.warn('Dynamic ICE fetch returned non-OK', resp && resp.status);
                    }
                } catch (err) {
                    console.warn('Dynamic ICE fetch failed', err && (err.stack || err.message || err));
                }
            }

            // Fallback: If TURN_SERVERS is provided as JSON in env, use that
            let iceServers = defaultIce;
            try {
                if (process.env.TURN_SERVERS) {
                    // Expecting JSON string like: [{"urls":"turn:turn.example.com:3478","username":"user","credential":"pass"}]
                    // TURN_SERVERS may be set either as a JSON array string or as provider output.
                    try {
                        const parsed = JSON.parse(process.env.TURN_SERVERS);
                        if (Array.isArray(parsed) && parsed.length) {
                            iceServers = parsed.concat(defaultIce);
                        }
                    } catch (innerErr) {
                        // Try to extract a JSON array substring if someone pasted provider output
                        const raw = process.env.TURN_SERVERS || '';
                        const m = raw.match(/\[\s*\{[\s\S]*\}\s*\]/);
                        if (m && m[0]) {
                            try {
                                const parsed2 = JSON.parse(m[0]);
                                if (Array.isArray(parsed2) && parsed2.length) {
                                    iceServers = parsed2.concat(defaultIce);
                                }
                            } catch (e2) {
                                console.warn('[ice-servers] TURN_SERVERS contains bracketed text but JSON.parse failed', e2 && e2.message);
                            }
                        } else {
                            console.warn('[ice-servers] TURN_SERVERS env var not valid JSON; value preview:', (raw || '').slice(0,200));
                        }
                    }
                } else if (process.env.TURN_URLS && process.env.TURN_USERNAME && process.env.TURN_PASSWORD) {
                    // Allow comma-separated TURN_URLS
                    const urls = process.env.TURN_URLS.split(',').map(s => s.trim()).filter(Boolean);
                    if (urls.length) {
                        const turnEntries = urls.map(u => ({ urls: u, username: process.env.TURN_USERNAME, credential: process.env.TURN_PASSWORD }));
                        iceServers = turnEntries.concat(defaultIce);
                    }
                }
            } catch (e) {
                console.warn('Could not parse TURN_SERVERS env var, falling back to default STUNs', e);
                iceServers = defaultIce;
            }

            res.end(JSON.stringify({ iceServers }));
        })();
        return;
    }
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
            console.log('Received raw message from client:', {
                remoteAddress: req.socket && req.socket.remoteAddress,
                raw: typeof message === 'string' ? (message.length > 200 ? message.substring(0,200) + '...' : message) : '<binary>'
            });
            const data = JSON.parse(message);

            console.log('Parsed signaling message type:', data.type);

            switch (data.type) {
                // simple ping/pong support for diagnostic pages
                case 'ping':
                    try {
                        ws.send(JSON.stringify({ type: 'pong', ts: Date.now() }));
                    } catch (e) {
                        console.warn('Failed to send pong', e);
                    }
                    break;
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
    const candidateTime = data.candidateTime || null;
    roomParticipants.forEach((participant, participantWs) => {
        if (participantWs !== senderWs && participantWs.readyState === WebSocket.OPEN) {
            participantWs.send(JSON.stringify({
                type: 'ice-candidate',
                candidate: candidate,
                candidateTime
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



