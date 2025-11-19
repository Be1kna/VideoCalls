// WebRTC Video Call Client
class VideoCallClient {
    constructor() {
        this.socket = null;
        this.localStream = null;
        this.remoteStream = null;
        this.peerConnection = null;
        this.roomId = null;
        this.userName = null;
        this.isScreenSharing = false;
        this.screenStream = null;
        
        // Check if we're on a secure context (required for getUserMedia)
        if (window.location.protocol !== 'https:' && window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1') {
            console.warn('⚠️ WebRTC requires HTTPS (or localhost). Some features may not work.');
        }
        
        console.log('VideoCallClient initialized');
        
        // STUN/TURN servers for NAT traversal (works worldwide)
        this.rtcConfiguration = {
            iceServers: [
                { urls: 'stun:stun.l.google.com:19302' },
                { urls: 'stun:stun1.l.google.com:19302' },
                { urls: 'stun:stun2.l.google.com:19302' },
                { urls: 'stun:stun3.l.google.com:19302' },
                { urls: 'stun:stun4.l.google.com:19302' },
                // Add TURN servers here if needed for strict NATs
                // You can use services like Twilio, Xirsys, or self-hosted coturn
            ]
        };
        
        this.initializeEventListeners();
        this.initializeDebugBox();
    }
    
    initializeDebugBox() {
        const toggleBtn = document.getElementById('toggleDebugBtn');
        const clearBtn = document.getElementById('clearDebugBtn');
        const debugBox = document.getElementById('debugBox');
        
        toggleBtn.addEventListener('click', () => {
            debugBox.classList.toggle('collapsed');
            toggleBtn.textContent = debugBox.classList.contains('collapsed') ? 'Show' : 'Hide';
        });
        
        clearBtn.addEventListener('click', () => {
            document.getElementById('debugContent').innerHTML = '';
            this.debug('Debug log cleared', 'info');
        });
        
        this.debug('Debug system initialized', 'success');
    }
    
    debug(message, type = 'info', data = null) {
        const debugContent = document.getElementById('debugContent');
        if (!debugContent) return;
        
        const time = new Date().toLocaleTimeString();
        const entry = document.createElement('div');
        entry.className = `debug-log-entry ${type}`;
        
        let logMessage = `<span class="debug-log-time">[${time}]</span>`;
        logMessage += `<span class="debug-log-label">[${type.toUpperCase()}]</span>`;
        logMessage += ` ${message}`;
        
        if (data) {
            logMessage += `<br><pre style="margin: 5px 0 0 20px; font-size: 0.7rem; color: #888;">${JSON.stringify(data, null, 2)}</pre>`;
        }
        
        entry.innerHTML = logMessage;
        debugContent.appendChild(entry);
        debugContent.scrollTop = debugContent.scrollHeight;
        
        // Also log to console
        const consoleMethod = type === 'error' ? 'error' : type === 'warning' ? 'warn' : 'log';
        console[consoleMethod](`[${type.toUpperCase()}] ${message}`, data || '');
    }
    
    initializeEventListeners() {
        // Pre-call screen
        document.getElementById('createRoomBtn').addEventListener('click', () => this.createRoom());
        document.getElementById('joinBtn').addEventListener('click', () => this.joinRoom());
        document.getElementById('testPermissionsBtn').addEventListener('click', () => this.testPermissions());
        
        // Call screen controls
        document.getElementById('leaveBtn').addEventListener('click', () => this.leaveCall());
        document.getElementById('endCallBtn').addEventListener('click', () => this.leaveCall());
        document.getElementById('muteBtn').addEventListener('click', () => this.toggleAudio());
        document.getElementById('videoBtn').addEventListener('click', () => this.toggleVideo());
        document.getElementById('screenShareBtn').addEventListener('click', () => this.toggleScreenShare());
        document.getElementById('toggleVideo').addEventListener('click', () => this.toggleVideo());
        document.getElementById('toggleAudio').addEventListener('click', () => this.toggleAudio());
        document.getElementById('toggleScreenShare').addEventListener('click', () => this.toggleScreenShare());
        
        // Enter key to join
        document.getElementById('roomId').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.joinRoom();
        });
        document.getElementById('yourName').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.joinRoom();
        });
    }
    
    createRoom() {
        this.debug('Create Room button clicked', 'info');
        const roomId = Math.random().toString(36).substring(2, 9);
        document.getElementById('roomId').value = roomId;
        this.showNotification(`Room created: ${roomId}`, 'success');
        this.debug(`Room created: ${roomId}`, 'success');
    }
    
    async joinRoom() {
        this.debug('=== JOIN ROOM CLICKED ===', 'info');
        const roomId = document.getElementById('roomId').value.trim();
        const userName = document.getElementById('yourName').value.trim() || 'Anonymous';
        
        this.debug(`Room ID: "${roomId}", User Name: "${userName}"`, 'info');
        
        if (!roomId) {
            this.debug('Validation failed: No room ID provided', 'error');
            this.showNotification('Please enter a room ID', 'error');
            return;
        }
        
        this.roomId = roomId;
        this.userName = userName;
        
        try {
            this.debug('Step 1: Checking permissions...', 'info');
            // Check permissions first
            const permissionStatus = await this.checkPermissions();
            this.debug(`Permission check result: ${JSON.stringify(permissionStatus)}`, 'info', permissionStatus);
            
            if (!permissionStatus.granted) {
                this.debug('Permission check failed', 'error', permissionStatus);
                this.showNotification(permissionStatus.message, 'error');
                return;
            }
            
            this.debug('Step 2: Getting user media...', 'info');
            // Get user media
            await this.getUserMedia();
            this.debug('User media obtained successfully', 'success');
            
            this.debug('Step 3: Connecting to signaling server...', 'info');
            // Connect to signaling server
            this.connectToServer();
            
            this.debug('Step 4: Switching to call screen...', 'info');
            // Switch to call screen
            document.getElementById('preCallScreen').classList.remove('active');
            document.getElementById('callScreen').classList.add('active');
            document.getElementById('displayRoomId').textContent = roomId;
            
            this.updateConnectionStatus('Connecting...');
            this.debug('Join room process completed successfully', 'success');
        } catch (error) {
            this.debug('Error in joinRoom:', 'error', {
                name: error.name,
                message: error.message,
                stack: error.stack
            });
            console.error('Error joining room:', error);
            // Error message already shown in getUserMedia
        }
    }
    
    async checkPermissions() {
        this.debug('Checking permissions...', 'info');
        
        if (!navigator.permissions) {
            this.debug('Permissions API not available, will rely on getUserMedia', 'warning');
            // Permissions API not available, will rely on getUserMedia error
            return { granted: true, message: '' };
        }
        
        try {
            // Check camera permission
            this.debug('Querying camera permission...', 'info');
            const cameraPermission = await navigator.permissions.query({ name: 'camera' });
            this.debug(`Camera permission state: ${cameraPermission.state}`, 'info');
            
            this.debug('Querying microphone permission...', 'info');
            const microphonePermission = await navigator.permissions.query({ name: 'microphone' });
            this.debug(`Microphone permission state: ${microphonePermission.state}`, 'info');
            
            if (cameraPermission.state === 'denied' || microphonePermission.state === 'denied') {
                this.debug('Permissions denied', 'error', {
                    camera: cameraPermission.state,
                    microphone: microphonePermission.state
                });
                return {
                    granted: false,
                    message: 'Camera/microphone access is blocked. Please enable it in your browser settings (lock icon in address bar) and refresh the page.'
                };
            }
            
            if (cameraPermission.state === 'prompt' || microphonePermission.state === 'prompt') {
                this.debug('Permissions will be prompted by getUserMedia', 'info');
                // Will be prompted by getUserMedia
                return { granted: true, message: '' };
            }
            
            this.debug('Permissions granted', 'success');
            return { granted: true, message: '' };
        } catch (error) {
            // Permissions API might not support camera/microphone query
            // This is fine, getUserMedia will handle it
            this.debug('Permissions API query failed (may not be supported)', 'warning', error);
            console.log('Permissions API query not fully supported, proceeding...');
            return { granted: true, message: '' };
        }
    }
    
    connectToServer() {
        // Handle file:// protocol (when opening HTML directly)
        let wsUrl;
        if (window.location.protocol === 'file:') {
            // Default to localhost when using file://
            wsUrl = 'ws://localhost:8080';
            this.debug('Detected file:// protocol, using localhost for WebSocket', 'info');
        } else {
            const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
            const hostname = window.location.hostname || 'localhost';
            const port = window.location.port;
            
            // For production (HTTPS), don't include port - Render handles routing
            // For localhost development, include port 8080
            if (window.location.protocol === 'https:' || hostname !== 'localhost') {
                // Production/HTTPS: no port needed
                wsUrl = `${protocol}//${hostname}`;
            } else {
                // Local development: include port
                wsUrl = `${protocol}//${hostname}:8080`;
            }
        }
        
        this.debug(`Connecting to WebSocket server: ${wsUrl}`, 'info');
        this.debug(`Current protocol: ${window.location.protocol}, Hostname: ${window.location.hostname || 'localhost (file://)'}`, 'info');
        
        // Check if WebSocket is available
        if (typeof WebSocket === 'undefined') {
            const errorMsg = 'WebSocket is not supported in this browser';
            this.debug(errorMsg, 'error');
            this.showNotification(errorMsg, 'error');
            return;
        }
        
        try {
            this.debug('Creating WebSocket instance...', 'info');
            this.socket = new WebSocket(wsUrl);
            this.debug('WebSocket object created', 'success');
            
            // Set up event handlers before connection attempt
            this.socket.onopen = () => {
                this.debug('WebSocket connection opened successfully', 'success');
                console.log('Connected to signaling server');
                
                const joinMessage = {
                    type: 'join',
                    room: this.roomId,
                    name: this.userName
                };
                this.debug('Sending join message to server', 'info', joinMessage);
                
                try {
                    this.socket.send(JSON.stringify(joinMessage));
                    this.debug('Join message sent successfully', 'success');
                } catch (sendError) {
                    this.debug('Error sending join message', 'error', sendError);
                }
            };
            
            this.socket.onmessage = async (event) => {
                this.debug('WebSocket message received', 'info', {
                    dataLength: event.data ? event.data.length : 0
                });
                try {
                    const message = JSON.parse(event.data);
                    this.debug('Parsed message successfully', 'info', message);
                    await this.handleSignalingMessage(message);
                } catch (error) {
                    this.debug('Error parsing WebSocket message', 'error', {
                        error: error.message,
                        data: event.data ? event.data.substring(0, 100) : 'null'
                    });
                }
            };
            
            this.socket.onerror = (error) => {
                this.debug('WebSocket error event fired', 'error', {
                    error: error,
                    readyState: this.socket ? this.socket.readyState : 'unknown',
                    url: wsUrl
                });
                console.error('WebSocket error:', error);
                this.showNotification('Connection error. Please check if server is running on port 8080.', 'error');
            };
            
            this.socket.onclose = (event) => {
                this.debug(`WebSocket closed. Code: ${event.code}, Reason: ${event.reason || 'none'}`, 'warning', {
                    code: event.code,
                    reason: event.reason,
                    wasClean: event.wasClean,
                    readyState: this.socket ? this.socket.readyState : 'unknown'
                });
                console.log('Disconnected from signaling server');
                
                // Code 1006 is abnormal closure (connection lost)
                if (event.code === 1006) {
                    this.debug('Abnormal WebSocket closure detected - connection may have been lost', 'error');
                    this.showNotification('Connection lost. Attempting to reconnect...', 'warning');
                    // Attempt to reconnect after a delay
                    setTimeout(() => {
                        if (this.roomId && this.userName) {
                            this.debug('Attempting to reconnect WebSocket...', 'info');
                            this.connectToServer();
                        }
                    }, 2000);
                } else {
                    this.updateConnectionStatus('Disconnected', 'disconnected');
                }
            };
            
            // Check connection state after a short delay
            setTimeout(() => {
                if (this.socket) {
                    const state = this.socket.readyState;
                    const stateNames = ['CONNECTING', 'OPEN', 'CLOSING', 'CLOSED'];
                    this.debug(`WebSocket state after 100ms: ${stateNames[state]} (${state})`, 'info');
                }
            }, 100);
            
        } catch (error) {
            this.debug('Exception creating WebSocket connection', 'error', {
                name: error.name,
                message: error.message,
                stack: error.stack
            });
            this.showNotification('Failed to connect to server. Make sure the server is running on port 8080.', 'error');
        }
    }
    
    async handleSignalingMessage(message) {
        this.debug(`Handling signaling message: ${message.type}`, 'info', message);
        
        switch (message.type) {
            case 'joined':
                this.debug('Successfully joined room', 'success');
                this.showNotification(`Joined room: ${this.roomId}`, 'success');
                this.updateConnectionStatus('Waiting for participant...', '');
                break;
                
            case 'user-joined':
                this.debug(`User joined: ${message.name}`, 'info');
                this.showNotification(`${message.name} joined the call`, 'info');
                this.debug('Creating peer connection for new user...', 'info');
                await this.createPeerConnection();
                this.debug('Peer connection created, creating offer...', 'info');
                await this.createOffer();
                this.debug('Peer connection ready for screen sharing', 'success');
                break;
                
            case 'offer':
                this.debug('Received offer', 'info');
                await this.handleOffer(message.offer);
                break;
                
            case 'answer':
                this.debug('Received answer', 'info');
                await this.handleAnswer(message.answer);
                break;
                
            case 'ice-candidate':
                this.debug('Received ICE candidate', 'info');
                await this.handleIceCandidate(message.candidate);
                break;
                
            case 'user-left':
                this.debug(`User left: ${message.name}`, 'warning');
                this.showNotification(`${message.name} left the call`, 'info');
                this.handleRemoteLeave();
                break;
                
            case 'error':
                this.debug('Received error from server', 'error', message);
                this.showNotification(message.message, 'error');
                break;
                
            default:
                this.debug(`Unknown message type: ${message.type}`, 'warning', message);
        }
    }
    
    async getUserMedia() {
        this.debug('=== GET USER MEDIA ===', 'info');
        
        // Check if getUserMedia is available
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
            const errorMsg = 'Your browser does not support video calling. Please use Chrome, Firefox, Safari, or Edge.';
            this.debug('getUserMedia not available', 'error');
            this.showNotification(errorMsg, 'error');
            throw new Error(errorMsg);
        }

        this.debug('getUserMedia API is available', 'success');

        try {
            // First, try to get available devices to provide better error messages
            this.debug('Enumerating devices...', 'info');
            const devices = await navigator.mediaDevices.enumerateDevices();
            this.debug(`Found ${devices.length} devices`, 'info', devices);
            
            const hasVideo = devices.some(device => device.kind === 'videoinput');
            const hasAudio = devices.some(device => device.kind === 'audioinput');
            this.debug(`Video devices: ${hasVideo}, Audio devices: ${hasAudio}`, 'info');

            // Try with ideal constraints first
            let constraints = {
                video: {
                    width: { ideal: 1280 },
                    height: { ideal: 720 },
                    facingMode: 'user'
                },
                audio: {
                    echoCancellation: true,
                    noiseSuppression: true
                }
            };

            this.debug('Requesting media with ideal constraints', 'info', constraints);

            try {
                this.localStream = await navigator.mediaDevices.getUserMedia(constraints);
                this.debug('Media obtained with ideal constraints', 'success');
            } catch (error) {
                // If that fails, try with more lenient constraints
                this.debug('Ideal constraints failed, trying fallback', 'warning', error);
                console.log('Trying with fallback constraints...');
                constraints = {
                    video: hasVideo ? true : false,
                    audio: hasAudio ? true : false
                };
                
                this.debug('Requesting media with fallback constraints', 'info', constraints);
                this.localStream = await navigator.mediaDevices.getUserMedia(constraints);
                this.debug('Media obtained with fallback constraints', 'success');
            }
            
            this.debug('Setting local video element source', 'info');
            const localVideo = document.getElementById('localVideo');
            const localCameraPip = document.getElementById('localCameraPip');
            localVideo.srcObject = this.localStream;
            
            // Hide PIP camera initially
            if (localCameraPip) {
                localCameraPip.classList.remove('active');
                localCameraPip.srcObject = null;
            }
            
            // Check if we actually got video/audio tracks
            const videoTracks = this.localStream.getVideoTracks();
            const audioTracks = this.localStream.getAudioTracks();
            
            this.debug(`Video tracks: ${videoTracks.length}, Audio tracks: ${audioTracks.length}`, 'info', {
                videoTracks: videoTracks.map(t => ({ id: t.id, label: t.label, enabled: t.enabled, readyState: t.readyState })),
                audioTracks: audioTracks.map(t => ({ id: t.id, label: t.label, enabled: t.enabled, readyState: t.readyState }))
            });
            
            if (videoTracks.length === 0 && hasVideo) {
                this.debug('Warning: No video track received', 'warning');
                console.warn('No video track received');
            }
            if (audioTracks.length === 0 && hasAudio) {
                this.debug('Warning: No audio track received', 'warning');
                console.warn('No audio track received');
            }
            
            this.updateConnectionStatus('Connected', 'connected');
            this.debug('getUserMedia completed successfully', 'success');
        } catch (error) {
            console.error('Error accessing media devices:', error);
            console.error('Error name:', error.name);
            console.error('Error message:', error.message);
            console.error('Full error:', error);
            
            let errorMessage = 'Failed to access camera/microphone. ';
            
            switch (error.name) {
                case 'NotAllowedError':
                case 'PermissionDeniedError':
                    errorMessage += 'Please allow camera and microphone access in your browser settings and try again.';
                    break;
                    
                case 'NotFoundError':
                case 'DevicesNotFoundError':
                    errorMessage += 'No camera or microphone found. Please connect a device and try again.';
                    break;
                    
                case 'NotReadableError':
                case 'TrackStartError':
                    errorMessage += 'Camera or microphone is already in use by another application. Please close other apps and try again.';
                    break;
                    
                case 'OverconstrainedError':
                case 'ConstraintNotSatisfiedError':
                    errorMessage += 'Your device does not support the required video/audio settings. Trying with basic settings...';
                    // Try again with minimal constraints
                    try {
                        this.localStream = await navigator.mediaDevices.getUserMedia({
                            video: true,
                            audio: true
                        });
                        const localVideo = document.getElementById('localVideo');
                        localVideo.srcObject = this.localStream;
                        this.updateConnectionStatus('Connected', 'connected');
                        this.showNotification('Connected with basic settings', 'success');
                        return; // Success with fallback
                    } catch (fallbackError) {
                        errorMessage = 'Unable to access camera/microphone with any settings. Please check your device permissions.';
                    }
                    break;
                    
                case 'TypeError':
                    errorMessage += 'Invalid constraints. Please refresh the page and try again.';
                    break;
                    
                default:
                    errorMessage += `Error: ${error.message || 'Unknown error'}. Please check your browser console for details.`;
            }
            
            this.showNotification(errorMessage, 'error');
            
            // Show troubleshooting box on error
            const troubleshootingBox = document.getElementById('troubleshootingBox');
            if (troubleshootingBox) {
                troubleshootingBox.style.display = 'block';
                const troubleshootingMessage = document.getElementById('troubleshootingMessage');
                if (troubleshootingMessage) {
                    troubleshootingMessage.innerHTML = errorMessage.replace(/\. /g, '.<br>');
                }
            }
            
            throw error;
        }
    }
    
    async createPeerConnection() {
        this.debug('Creating peer connection...', 'info');
        
        // Close existing connection if any
        if (this.peerConnection) {
            this.debug('Closing existing peer connection first', 'warning');
            this.peerConnection.close();
            this.peerConnection = null;
        }
        
        this.peerConnection = new RTCPeerConnection(this.rtcConfiguration);
        this.debug('RTCPeerConnection created', 'success');
        
        // Add local stream tracks (add both screen share and camera if both are active)
        const tracksToAdd = [];
        
        if (this.isScreenSharing && this.screenStream) {
            this.debug('Screen sharing is active, adding screen share tracks', 'info');
            this.screenStream.getTracks().forEach(track => {
                this.debug(`Adding screen share track: ${track.kind} (${track.id})`, 'info');
                tracksToAdd.push({ track, stream: this.screenStream });
            });
        }
        
        if (this.localStream) {
            this.debug('Adding camera/audio tracks to peer connection', 'info');
            this.localStream.getTracks().forEach(track => {
                // If screen sharing is active, only add audio from camera (not video)
                if (this.isScreenSharing && this.screenStream && track.kind === 'video') {
                    this.debug('Skipping camera video track (screen share is active)', 'info');
                } else {
                    this.debug(`Adding track: ${track.kind} (${track.id})`, 'info');
                    tracksToAdd.push({ track, stream: this.localStream });
                }
            });
        }
        
        if (tracksToAdd.length === 0) {
            this.debug('Warning: No tracks available when creating peer connection', 'warning');
        } else {
            tracksToAdd.forEach(({ track, stream }) => {
                this.peerConnection.addTrack(track, stream);
            });
        }
        
        // Handle remote stream
        this.peerConnection.ontrack = (event) => {
            this.debug('Remote track received', 'success', {
                streams: event.streams.length,
                track: event.track ? { 
                    kind: event.track.kind, 
                    id: event.track.id,
                    enabled: event.track.enabled,
                    readyState: event.track.readyState
                } : null
            });
            
            if (event.streams && event.streams.length > 0) {
                const remoteVideo = document.getElementById('remoteVideo');
                remoteVideo.srcObject = event.streams[0];
                this.remoteStream = event.streams[0];
                document.getElementById('remoteLabel').textContent = 'Remote Participant';
                this.updateConnectionStatus('Connected', 'connected');
                
                // Force play the video
                remoteVideo.play().then(() => {
                    this.debug('Remote video playing', 'success');
                }).catch(err => {
                    this.debug('Error playing remote video', 'error', err);
                });
            } else {
                this.debug('No streams in track event', 'warning');
            }
        };
        
        // Handle ICE candidates
        this.peerConnection.onicecandidate = (event) => {
            if (event.candidate) {
                this.debug('ICE candidate generated', 'info', {
                    candidate: event.candidate.candidate.substring(0, 50) + '...'
                });
                
                // Check if socket is open before sending
                if (this.socket && this.socket.readyState === WebSocket.OPEN) {
                    try {
                        this.socket.send(JSON.stringify({
                            type: 'ice-candidate',
                            room: this.roomId,
                            candidate: event.candidate
                        }));
                        this.debug('ICE candidate sent successfully', 'info');
                    } catch (error) {
                        this.debug('Error sending ICE candidate', 'error', error);
                    }
                } else {
                    this.debug('WebSocket not open, cannot send ICE candidate', 'warning', {
                        readyState: this.socket ? this.socket.readyState : 'no socket'
                    });
                }
            } else {
                this.debug('ICE candidate gathering complete', 'info');
            }
        };
        
        // Handle connection state changes
        this.peerConnection.onconnectionstatechange = () => {
            const state = this.peerConnection.connectionState;
            this.debug(`Peer connection state changed: ${state}`, 'info');
            console.log('Connection state:', state);
            if (state === 'connected') {
                this.updateConnectionStatus('Connected', 'connected');
                this.debug('Peer connection is now connected', 'success');
                
                // If screen sharing is active, apply it to the peer connection
                if (this.isScreenSharing && this.screenStream) {
                    this.debug('Screen sharing is active, applying to peer connection...', 'info');
                    const videoTrack = this.screenStream.getVideoTracks()[0];
                    if (videoTrack) {
                        this.replaceVideoTrackWithScreenShare(videoTrack).then(success => {
                            if (success) {
                                this.debug('Screen share successfully applied to peer connection', 'success');
                                this.showNotification('Screen sharing is now visible to peer', 'success');
                            } else {
                                this.debug('Failed to apply screen share to peer connection', 'warning');
                            }
                        });
                    }
                }
                
                // Enable screen share button visually
                const screenShareBtn = document.getElementById('screenShareBtn');
                if (screenShareBtn) {
                    screenShareBtn.title = 'Share Screen (Connected)';
                }
            } else if (state === 'disconnected' || state === 'failed') {
                this.updateConnectionStatus('Connection lost', 'disconnected');
                this.debug('Peer connection lost', 'warning');
            } else if (state === 'connecting') {
                this.debug('Peer connection is connecting...', 'info');
            }
        };
        
        this.peerConnection.oniceconnectionstatechange = () => {
            const state = this.peerConnection.iceConnectionState;
            this.debug(`ICE connection state: ${state}`, 'info');
            
            if (state === 'failed') {
                this.debug('ICE connection failed - attempting to restart ICE', 'error');
                // Try to restart ICE
                this.peerConnection.restartIce().then(() => {
                    this.debug('ICE restart initiated', 'info');
                }).catch(err => {
                    this.debug('Error restarting ICE', 'error', err);
                });
            } else if (state === 'connected') {
                this.debug('ICE connection established successfully', 'success');
            } else if (state === 'disconnected') {
                this.debug('ICE connection disconnected', 'warning');
            }
        };
        
        // Handle ICE gathering state
        this.peerConnection.onicegatheringstatechange = () => {
            const state = this.peerConnection.iceGatheringState;
            this.debug(`ICE gathering state: ${state}`, 'info');
        };
    }
    
    async createOffer() {
        this.debug('Creating WebRTC offer...', 'info');
        if (!this.peerConnection) {
            this.debug('No peer connection, creating one...', 'info');
            await this.createPeerConnection();
        }
        
        try {
            const offer = await this.peerConnection.createOffer();
            this.debug('Offer created', 'success', { type: offer.type });
            await this.peerConnection.setLocalDescription(offer);
            this.debug('Local description set', 'success');
            
            // Check if socket is open before sending
            if (this.socket && this.socket.readyState === WebSocket.OPEN) {
                this.socket.send(JSON.stringify({
                    type: 'offer',
                    room: this.roomId,
                    offer: offer
                }));
                this.debug('Offer sent to signaling server', 'success');
            } else {
                this.debug('WebSocket not open, cannot send offer', 'error', {
                    readyState: this.socket ? this.socket.readyState : 'no socket'
                });
                this.showNotification('Connection lost. Please refresh and try again.', 'error');
            }
        } catch (error) {
            this.debug('Error creating offer', 'error', error);
            console.error('Error creating offer:', error);
        }
    }
    
    async handleOffer(offer) {
        this.debug('Handling incoming offer...', 'info');
        if (!this.peerConnection) {
            this.debug('No peer connection exists, creating one...', 'info');
            await this.createPeerConnection();
        }
        
        try {
            this.debug('Setting remote description from offer...', 'info');
            await this.peerConnection.setRemoteDescription(new RTCSessionDescription(offer));
            this.debug('Remote description set, creating answer...', 'info');
            const answer = await this.peerConnection.createAnswer();
            this.debug('Answer created, setting local description...', 'info');
            await this.peerConnection.setLocalDescription(answer);
            this.debug('Sending answer to peer...', 'info');
            
            // Check if socket is open before sending
            if (this.socket && this.socket.readyState === WebSocket.OPEN) {
                this.socket.send(JSON.stringify({
                    type: 'answer',
                    room: this.roomId,
                    answer: answer
                }));
                this.debug('Answer sent successfully', 'success');
                this.debug('Peer connection ready for screen sharing', 'success');
            } else {
                this.debug('WebSocket not open, cannot send answer', 'error', {
                    readyState: this.socket ? this.socket.readyState : 'no socket'
                });
                this.showNotification('Connection lost. Please refresh and try again.', 'error');
            }
        } catch (error) {
            this.debug('Error handling offer', 'error', error);
            console.error('Error handling offer:', error);
        }
    }
    
    async handleAnswer(answer) {
        this.debug('Handling incoming answer...', 'info');
        try {
            if (!this.peerConnection) {
                this.debug('No peer connection when handling answer', 'error');
                return;
            }
            this.debug('Setting remote description from answer...', 'info');
            await this.peerConnection.setRemoteDescription(new RTCSessionDescription(answer));
            this.debug('Answer processed successfully, peer connection established', 'success');
            this.debug('Peer connection ready for screen sharing', 'success');
        } catch (error) {
            this.debug('Error handling answer', 'error', error);
            console.error('Error handling answer:', error);
        }
    }
    
    async handleIceCandidate(candidate) {
        try {
            await this.peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
        } catch (error) {
            console.error('Error adding ICE candidate:', error);
        }
    }
    
    async toggleAudio() {
        this.debug('=== TOGGLE AUDIO CLICKED ===', 'info');
        
        if (!this.localStream) {
            this.debug('No local stream available for audio toggle', 'error');
            this.showNotification('No audio stream available', 'error');
            return;
        }
        
        const audioTrack = this.localStream.getAudioTracks()[0];
        if (!audioTrack) {
            this.debug('No audio track found in local stream', 'error');
            this.showNotification('No audio track available', 'error');
            return;
        }
        
        const wasEnabled = audioTrack.enabled;
        audioTrack.enabled = !audioTrack.enabled;
        const isMuted = !audioTrack.enabled;
        
        this.debug(`Audio track state changed: ${wasEnabled} → ${audioTrack.enabled}`, 'info', {
            trackId: audioTrack.id,
            trackLabel: audioTrack.label,
            enabled: audioTrack.enabled,
            readyState: audioTrack.readyState,
            muted: audioTrack.muted
        });
        
        document.getElementById('muteBtn').classList.toggle('muted', isMuted);
        document.getElementById('toggleAudio').classList.toggle('muted', isMuted);
        
        const message = isMuted ? 'Microphone muted' : 'Microphone unmuted';
        this.debug(message, isMuted ? 'warning' : 'success');
        this.showNotification(message, 'info');
    }
    
    async toggleVideo() {
        this.debug('=== TOGGLE VIDEO CLICKED ===', 'info');
        
        if (!this.localStream) {
            this.debug('No local stream available for video toggle', 'error');
            this.showNotification('No video stream available', 'error');
            return;
        }
        
        const videoTrack = this.localStream.getVideoTracks()[0];
        if (!videoTrack) {
            this.debug('No video track found in local stream', 'error');
            this.showNotification('No video track available', 'error');
            return;
        }
        
        const wasEnabled = videoTrack.enabled;
        videoTrack.enabled = !videoTrack.enabled;
        const isVideoOff = !videoTrack.enabled;
        
        this.debug(`Video track state changed: ${wasEnabled} → ${videoTrack.enabled}`, 'info', {
            trackId: videoTrack.id,
            trackLabel: videoTrack.label,
            enabled: videoTrack.enabled,
            readyState: videoTrack.readyState,
            muted: videoTrack.muted
        });
        
        document.getElementById('videoBtn').classList.toggle('video-off', isVideoOff);
        document.getElementById('toggleVideo').classList.toggle('video-off', isVideoOff);
        
        // Update PIP camera if screen sharing is active
        if (this.isScreenSharing) {
            const localCameraPip = document.getElementById('localCameraPip');
            if (localCameraPip) {
                if (isVideoOff) {
                    localCameraPip.classList.remove('active');
                    localCameraPip.srcObject = null;
                } else {
                    const cameraVideoTrack = this.localStream.getVideoTracks()[0];
                    if (cameraVideoTrack) {
                        const cameraStream = new MediaStream([cameraVideoTrack]);
                        localCameraPip.srcObject = cameraStream;
                        localCameraPip.classList.add('active');
                    }
                }
            }
        }
        
        const message = isVideoOff ? 'Video turned off' : 'Video turned on';
        this.debug(message, isVideoOff ? 'warning' : 'success');
        this.showNotification(message, 'info');
    }
    
    async toggleScreenShare() {
        this.debug('=== TOGGLE SCREEN SHARE CLICKED ===', 'info');
        this.debug(`Current screen sharing state: ${this.isScreenSharing}`, 'info');
        
        try {
            if (!this.isScreenSharing) {
                this.debug('Starting screen share...', 'info');
                
                // Check if displayMedia is available
                if (!navigator.mediaDevices || !navigator.mediaDevices.getDisplayMedia) {
                    const errorMsg = 'Screen sharing is not supported in your browser';
                    this.debug(errorMsg, 'error');
                    this.showNotification(errorMsg, 'error');
                    return;
                }
                
                this.debug('Requesting display media...', 'info');
                // Start screen sharing
                this.screenStream = await navigator.mediaDevices.getDisplayMedia({
                    video: {
                        cursor: 'always',
                        displaySurface: 'monitor'
                    },
                    audio: true
                });
                
                this.debug('Display media obtained', 'success', {
                    videoTracks: this.screenStream.getVideoTracks().length,
                    audioTracks: this.screenStream.getAudioTracks().length
                });
                
                const videoTrack = this.screenStream.getVideoTracks()[0];
                const audioTrack = this.screenStream.getAudioTracks()[0];
                
                if (!videoTrack) {
                    this.debug('No video track in screen stream', 'error');
                    this.showNotification('Failed to get screen video track', 'error');
                    if (this.screenStream) {
                        this.screenStream.getTracks().forEach(track => track.stop());
                        this.screenStream = null;
                    }
                    return;
                }
                
                this.debug('Screen video track details', 'info', {
                    id: videoTrack.id,
                    label: videoTrack.label,
                    enabled: videoTrack.enabled,
                    readyState: videoTrack.readyState,
                    settings: videoTrack.getSettings()
                });
                
                // Update local video to show screen share (even without peer connection)
                // If camera is also on, show camera in picture-in-picture
                this.debug('Updating local video element with screen stream', 'info');
                const localVideo = document.getElementById('localVideo');
                const localCameraPip = document.getElementById('localCameraPip');
                
                // Show screen share in main video
                localVideo.srcObject = this.screenStream;
                this.debug('Screen share set as main video source', 'success');
                
                // If camera is also active, show it in picture-in-picture
                if (this.localStream && this.localStream.getVideoTracks().length > 0) {
                    this.debug('Checking camera stream for PIP...', 'info');
                    const cameraVideoTrack = this.localStream.getVideoTracks()[0];
                    this.debug('Camera track found', 'info', {
                        id: cameraVideoTrack.id,
                        enabled: cameraVideoTrack.enabled,
                        readyState: cameraVideoTrack.readyState,
                        label: cameraVideoTrack.label
                    });
                    
                    if (cameraVideoTrack && cameraVideoTrack.enabled) {
                        // Create a new stream with just the camera track
                        const cameraStream = new MediaStream([cameraVideoTrack]);
                        if (localCameraPip) {
                            this.debug('Setting PIP camera source', 'info');
                            localCameraPip.srcObject = cameraStream;
                            localCameraPip.classList.add('active');
                            this.debug('Camera picture-in-picture activated', 'success', {
                                pipElement: localCameraPip ? 'found' : 'not found',
                                hasSrcObject: !!localCameraPip.srcObject,
                                hasActiveClass: localCameraPip.classList.contains('active')
                            });
                            
                            // Force play the PIP video
                            localCameraPip.play().then(() => {
                                this.debug('PIP camera video playing', 'success');
                            }).catch(err => {
                                this.debug('Error playing PIP camera', 'error', err);
                            });
                        } else {
                            this.debug('PIP camera element not found in DOM', 'error');
                        }
                    } else {
                        this.debug('Camera video track not enabled', 'info');
                        // Hide PIP camera if camera is off
                        if (localCameraPip) {
                            localCameraPip.classList.remove('active');
                            localCameraPip.srcObject = null;
                        }
                    }
                } else {
                    this.debug('No local stream or no video tracks', 'info');
                    // Hide PIP camera if no camera stream
                    if (localCameraPip) {
                        localCameraPip.classList.remove('active');
                        localCameraPip.srcObject = null;
                    }
                }
                
                this.isScreenSharing = true;
                document.getElementById('screenShareBtn').classList.add('screen-sharing');
                document.getElementById('toggleScreenShare').classList.add('screen-sharing');
                
                // Try to replace track in peer connection if it exists
                if (this.peerConnection) {
                    this.debug('Peer connection exists, attempting to replace video track...', 'info');
                    await this.replaceVideoTrackWithScreenShare(videoTrack);
                } else {
                    this.debug('No peer connection yet - screen share will be applied when connection is established', 'info');
                    this.showNotification('Screen sharing started. Will be shared when peer connects.', 'success');
                }
                
                this.debug('Screen sharing started successfully', 'success');
                if (this.peerConnection) {
                    this.showNotification('Screen sharing started', 'success');
                }
                
                // Handle screen share end
                videoTrack.onended = () => {
                    this.debug('Screen share track ended (user stopped sharing)', 'warning');
                    this.stopScreenShare();
                };
                
                // Also handle audio track end if present
                if (audioTrack) {
                    audioTrack.onended = () => {
                        this.debug('Screen share audio track ended', 'warning');
                    };
                }
            } else {
                this.debug('Stopping screen share...', 'info');
                await this.stopScreenShare();
            }
        } catch (error) {
            this.debug('Error toggling screen share', 'error', {
                name: error.name,
                message: error.message,
                stack: error.stack
            });
            console.error('Error toggling screen share:', error);
            
            let errorMessage = 'Failed to share screen';
            switch (error.name) {
                case 'NotAllowedError':
                    errorMessage = 'Screen sharing permission denied';
                    this.debug('User denied screen sharing permission', 'warning');
                    break;
                case 'NotFoundError':
                    errorMessage = 'No screen/window available to share';
                    this.debug('No display source found', 'error');
                    break;
                case 'NotReadableError':
                    errorMessage = 'Cannot access screen (may be in use)';
                    this.debug('Screen not readable', 'error');
                    break;
                case 'AbortError':
                    errorMessage = 'Screen sharing was cancelled';
                    this.debug('Screen sharing aborted by user', 'warning');
                    break;
                default:
                    errorMessage = `Screen sharing failed: ${error.message}`;
            }
            
            this.showNotification(errorMessage, 'error');
            
            // Clean up if we partially started
            if (this.screenStream) {
                this.screenStream.getTracks().forEach(track => track.stop());
                this.screenStream = null;
            }
        }
    }
    
    async replaceVideoTrackWithScreenShare(videoTrack) {
        if (!this.peerConnection) {
            this.debug('No peer connection available for track replacement', 'warning');
            return false;
        }
        
        // Check peer connection state
        const pcState = this.peerConnection.connectionState;
        this.debug(`Peer connection state: ${pcState}`, 'info');
        
        if (pcState === 'closed' || pcState === 'failed') {
            this.debug('Peer connection is closed or failed, cannot replace track', 'warning');
            return false;
        }
        
        // Replace video track
        this.debug('Finding video sender in peer connection...', 'info');
        const senders = this.peerConnection.getSenders();
        this.debug(`Found ${senders.length} senders`, 'info', senders.map(s => ({
            track: s.track ? { kind: s.track.kind, id: s.track.id } : null
        })));
        
        const sender = senders.find(s => 
            s.track && s.track.kind === 'video'
        );
        
        if (!sender) {
            this.debug('No video sender found in peer connection', 'warning');
            return false;
        }
        
        this.debug('Replacing video track with screen share track', 'info', {
            oldTrack: sender.track ? { id: sender.track.id, label: sender.track.label } : null,
            newTrack: { id: videoTrack.id, label: videoTrack.label }
        });
        
        try {
            await sender.replaceTrack(videoTrack);
            this.debug('Video track replaced successfully in peer connection', 'success');
            return true;
        } catch (replaceError) {
            this.debug('Error replacing track in peer connection', 'error', replaceError);
            return false;
        }
    }
    
    async stopScreenShare() {
        this.debug('=== STOPPING SCREEN SHARE ===', 'info');
        
        if (!this.isScreenSharing) {
            this.debug('Not currently screen sharing, nothing to stop', 'warning');
            return;
        }
        
        if (this.screenStream) {
            this.debug('Stopping screen stream tracks', 'info');
            this.screenStream.getTracks().forEach(track => {
                this.debug(`Stopping track: ${track.kind} (${track.id})`, 'info');
                track.stop();
            });
            this.screenStream = null;
        }
        
        // Restore camera track
        if (!this.localStream) {
            this.debug('No local stream available to restore', 'error');
            this.isScreenSharing = false;
            document.getElementById('screenShareBtn').classList.remove('screen-sharing');
            document.getElementById('toggleScreenShare').classList.remove('screen-sharing');
            return;
        }
        
        const videoTrack = this.localStream.getVideoTracks()[0];
        if (!videoTrack) {
            this.debug('No camera video track available to restore', 'error');
            this.isScreenSharing = false;
            document.getElementById('screenShareBtn').classList.remove('screen-sharing');
            document.getElementById('toggleScreenShare').classList.remove('screen-sharing');
            return;
        }
        
        if (!this.peerConnection) {
            this.debug('No peer connection available', 'warning');
            // Still update UI even without peer connection
        } else {
            const sender = this.peerConnection.getSenders().find(s => 
                s.track && s.track.kind === 'video'
            );
            
            if (sender) {
                this.debug('Restoring camera track in peer connection', 'info', {
                    oldTrack: sender.track ? { id: sender.track.id } : null,
                    newTrack: { id: videoTrack.id, label: videoTrack.label }
                });
                try {
                    await sender.replaceTrack(videoTrack);
                    this.debug('Camera track restored successfully', 'success');
                } catch (error) {
                    this.debug('Error restoring camera track', 'error', error);
                }
            } else {
                this.debug('No video sender found to restore track', 'warning');
            }
        }
        
        // Update UI
        this.debug('Updating local video element with camera stream', 'info');
        const localVideo = document.getElementById('localVideo');
        const localCameraPip = document.getElementById('localCameraPip');
        
        localVideo.srcObject = this.localStream;
        
        // Hide PIP camera
        if (localCameraPip) {
            localCameraPip.classList.remove('active');
            localCameraPip.srcObject = null;
        }
        
        this.isScreenSharing = false;
        document.getElementById('screenShareBtn').classList.remove('screen-sharing');
        document.getElementById('toggleScreenShare').classList.remove('screen-sharing');
        
        this.debug('Screen sharing stopped successfully', 'success');
        this.showNotification('Screen sharing stopped', 'info');
    }
    
    handleRemoteLeave() {
        if (this.peerConnection) {
            this.peerConnection.close();
            this.peerConnection = null;
        }
        
        const remoteVideo = document.getElementById('remoteVideo');
        remoteVideo.srcObject = null;
        document.getElementById('remoteLabel').textContent = 'Waiting for participant...';
        this.updateConnectionStatus('Waiting for participant...', '');
    }
    
    leaveCall() {
        // Stop all media tracks
        if (this.localStream) {
            this.localStream.getTracks().forEach(track => track.stop());
        }
        
        if (this.screenStream) {
            this.screenStream.getTracks().forEach(track => track.stop());
        }
        
        // Close peer connection
        if (this.peerConnection) {
            this.peerConnection.close();
            this.peerConnection = null;
        }
        
        // Close socket connection
        if (this.socket) {
            this.socket.send(JSON.stringify({
                type: 'leave',
                room: this.roomId
            }));
            this.socket.close();
            this.socket = null;
        }
        
        // Reset state
        this.localStream = null;
        this.remoteStream = null;
        this.isScreenSharing = false;
        this.screenStream = null;
        
        // Switch back to pre-call screen
        document.getElementById('callScreen').classList.remove('active');
        document.getElementById('preCallScreen').classList.add('active');
        
        // Clear video elements
        document.getElementById('localVideo').srcObject = null;
        document.getElementById('remoteVideo').srcObject = null;
        
        this.showNotification('Left the call', 'info');
    }
    
    updateConnectionStatus(status, className) {
        const statusEl = document.getElementById('connectionStatus');
        statusEl.textContent = status;
        statusEl.className = `connection-status ${className}`;
    }
    
    async testPermissions() {
        const troubleshootingBox = document.getElementById('troubleshootingBox');
        const troubleshootingMessage = document.getElementById('troubleshootingMessage');
        
        troubleshootingMessage.textContent = 'Testing camera and microphone access...';
        troubleshootingBox.style.display = 'block';
        
        try {
            // Check if API is available
            if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
                troubleshootingMessage.innerHTML = '❌ Your browser does not support video calling.<br>Please use Chrome, Firefox, Safari, or Edge.';
                return;
            }
            
            // Try to enumerate devices
            let devices = [];
            try {
                devices = await navigator.mediaDevices.enumerateDevices();
            } catch (e) {
                console.log('Could not enumerate devices:', e);
            }
            
            const videoDevices = devices.filter(d => d.kind === 'videoinput');
            const audioDevices = devices.filter(d => d.kind === 'audioinput');
            
            let status = '<strong>Device Status:</strong><br>';
            status += `📹 Cameras found: ${videoDevices.length}<br>`;
            status += `🎤 Microphones found: ${audioDevices.length}<br><br>`;
            
            // Try to access media
            try {
                const testStream = await navigator.mediaDevices.getUserMedia({ 
                    video: true, 
                    audio: true 
                });
                
                const videoTracks = testStream.getVideoTracks();
                const audioTracks = testStream.getAudioTracks();
                
                status += '✅ <strong>Success!</strong> Camera and microphone are accessible.<br>';
                status += `Video track: ${videoTracks.length > 0 ? '✅ Active' : '❌ Not available'}<br>`;
                status += `Audio track: ${audioTracks.length > 0 ? '✅ Active' : '❌ Not available'}<br>`;
                
                // Stop the test stream
                testStream.getTracks().forEach(track => track.stop());
                
                this.showNotification('Camera and microphone are working!', 'success');
            } catch (error) {
                status += '❌ <strong>Access Denied</strong><br>';
                
                switch (error.name) {
                    case 'NotAllowedError':
                        status += 'Permission was denied. Please:<br>';
                        status += '1. Click the lock icon in your browser address bar<br>';
                        status += '2. Allow camera and microphone access<br>';
                        status += '3. Refresh the page and try again';
                        break;
                    case 'NotFoundError':
                        status += 'No camera or microphone detected. Please connect a device.';
                        break;
                    case 'NotReadableError':
                        status += 'Camera/microphone is in use by another app. Close other apps and try again.';
                        break;
                    default:
                        status += `Error: ${error.message}`;
                }
                
                this.showNotification('Camera/microphone test failed. See details below.', 'error');
            }
            
            troubleshootingMessage.innerHTML = status;
        } catch (error) {
            troubleshootingMessage.innerHTML = `❌ Error: ${error.message}`;
        }
    }
    
    showNotification(message, type = 'info') {
        const notification = document.getElementById('notification');
        notification.textContent = message;
        notification.className = `notification ${type} show`;
        
        setTimeout(() => {
            notification.classList.remove('show');
        }, 3000);
    }
}

// Initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    window.videoCallClient = new VideoCallClient();
});

