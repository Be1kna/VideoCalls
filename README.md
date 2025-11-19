# Video Call Application

A modern, real-time video calling application built with WebRTC that enables high-quality video, audio, and screen sharing between users anywhere in the world.

## Features

- 🎥 **HD Video Calls** - High-quality video streaming
- 🎤 **Crystal Clear Audio** - Real-time audio communication
- 📺 **Screen Sharing** - Share your screen with participants
- 🌍 **Works Worldwide** - Uses STUN servers for NAT traversal
- 🔒 **Secure** - Peer-to-peer encrypted connections
- 📱 **Responsive Design** - Works on desktop and mobile devices
- 🎨 **Modern UI** - Beautiful, intuitive interface

## How It Works

This application uses **WebRTC** (Web Real-Time Communication) technology for peer-to-peer connections:

1. **Signaling Server**: A WebSocket server facilitates the initial connection setup
2. **STUN Servers**: Help establish connections through NATs and firewalls
3. **Peer-to-Peer**: Once connected, media streams directly between users (no server relay)

## Prerequisites

- **Node.js** (version 14 or higher)
- **npm** (comes with Node.js)
- A modern web browser with WebRTC support:
  - Chrome/Edge (recommended)
  - Firefox
  - Safari (macOS/iOS)

## Installation

1. **Navigate to the project directory:**
   ```bash
   cd "Online call"
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

## Running the Application

1. **Start the server:**
   ```bash
   npm start
   ```

   The server will start on port 8080 by default. You should see:
   ```
   🚀 Video Call Server running on port 8080
   📡 WebSocket server ready for connections
   🌐 Open http://localhost:8080 in your browser
   ```

2. **Open your browser:**
   - Go to `http://localhost:8080`
   - Allow camera and microphone permissions when prompted

3. **Start a call:**
   - Enter your name
   - Create a new room or enter an existing room ID
   - Click "Join Call"
   - Share the room ID with the person you want to call

## Usage Guide

### Starting a Call

1. **Create a Room:**
   - Click "Create Room" to generate a unique room ID
   - Or enter a custom room ID

2. **Enter Your Name:**
   - Type your name in the "Your Name" field

3. **Join the Call:**
   - Click "Join Call"
   - Allow browser permissions for camera and microphone

### During a Call

- **Mute/Unmute Audio**: Click the microphone button
- **Turn Video On/Off**: Click the video camera button
- **Share Screen**: Click the screen share button
- **Leave Call**: Click "Leave Call" or the red end call button

### Making International Calls

The application uses Google's public STUN servers which work worldwide. For best results:

1. **Both users should:**
   - Use a stable internet connection
   - Allow the application through their firewall
   - Use a modern browser

2. **If connection fails:**
   - Check firewall settings
   - Try a different network
   - Consider using a VPN if behind strict NAT

3. **For strict NATs:**
   - You may need to configure TURN servers (see Advanced Configuration)

## Advanced Configuration

### Custom Port

Set a custom port using the `PORT` environment variable:

```bash
PORT=3000 npm start
```

### Adding TURN Servers

For users behind strict NATs or firewalls, you may need TURN servers. Edit `client.js` and add TURN server configuration:

```javascript
this.rtcConfiguration = {
    iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        {
            urls: 'turn:your-turn-server.com:3478',
            username: 'your-username',
            credential: 'your-password'
        }
    ]
};
```

**TURN Server Options:**
- **Twilio STUN/TURN**: Commercial service with free tier
- **Xirsys**: Commercial TURN service
- **Self-hosted coturn**: Open-source TURN server

### HTTPS/SSL Setup

For production, you should use HTTPS. WebRTC requires secure contexts (HTTPS or localhost) for camera/microphone access.

1. **Get SSL certificates** (Let's Encrypt, etc.)
2. **Use a reverse proxy** (nginx, Apache) or
3. **Use Node.js HTTPS** with certificates

## Troubleshooting

### Camera/Microphone Not Working

- **Check browser permissions**: Allow camera and microphone access
- **Check device settings**: Ensure camera/mic are not in use by another app
- **Try a different browser**: Some browsers have better WebRTC support

### Connection Issues

- **Check firewall**: Allow WebSocket connections (port 8080)
- **Check network**: Ensure stable internet connection
- **Try STUN servers**: The app uses Google's public STUN servers
- **Check browser console**: Look for error messages

### Screen Sharing Not Working

- **Browser support**: Ensure your browser supports screen sharing
- **Permissions**: Allow screen sharing when prompted
- **OS permissions**: On macOS, check System Preferences > Security & Privacy

### Can't Connect to Server

- **Check if server is running**: Look for server startup messages
- **Check port**: Ensure port 8080 is not in use
- **Check firewall**: Allow incoming connections on port 8080

## File Structure

```
Online call/
├── index.html      # Main HTML file
├── styles.css      # Styling and UI
├── client.js       # WebRTC client logic
├── server.js       # WebSocket signaling server
├── package.json    # Dependencies
└── README.md       # This file
```

## Technical Details

### WebRTC Flow

1. **User A** joins room → Signaling server registers user
2. **User B** joins room → Signaling server notifies User A
3. **User A** creates WebRTC offer → Sent to User B via signaling server
4. **User B** creates WebRTC answer → Sent to User A via signaling server
5. **ICE candidates** exchanged → Direct peer connection established
6. **Media streams** flow directly between users (peer-to-peer)

### Security

- **WebRTC encryption**: All media streams are encrypted (DTLS/SRTP)
- **Signaling**: Currently unencrypted (use WSS in production)
- **No media storage**: Media streams are not recorded or stored

## Browser Compatibility

| Browser | Version | Support |
|---------|---------|---------|
| Chrome  | 60+     | ✅ Full |
| Firefox | 55+     | ✅ Full |
| Safari  | 11+     | ✅ Full |
| Edge    | 79+     | ✅ Full |

## Limitations

- **2 participants per room** (can be extended)
- **No call recording** (privacy-focused)
- **No chat functionality** (video/audio only)
- **Requires stable internet** for best quality

## Future Enhancements

- [ ] Multiple participants (3+)
- [ ] Text chat
- [ ] Call recording
- [ ] Virtual backgrounds
- [ ] Bandwidth adaptation
- [ ] Mobile app

## License

MIT License - Feel free to use and modify as needed.

## Support

For issues or questions:
1. Check the troubleshooting section
2. Review browser console for errors
3. Check server logs for connection issues

## Credits

Built with:
- **WebRTC** - Real-time communication
- **WebSocket** - Signaling protocol
- **Node.js** - Server runtime
- **Vanilla JavaScript** - No frameworks required

---

**Enjoy your video calls! 🌍📹**

