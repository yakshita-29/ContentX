const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const mongoose = require('mongoose');
const helmet = require('helmet');
const cors = require('cors');
require('dotenv').config();

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: process.env.CORS_ORIGIN || '*',
    methods: ['GET', 'POST']
  }
});

const PORT = process.env.PORT || 3000;
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/connectx';

// Connect to MongoDB
mongoose.connect(MONGODB_URI)
  .then(() => console.log('Connected to MongoDB database successfully.'))
  .catch(err => {
    console.error('MongoDB connection failed. App will run with in-memory array fallbacks:', err.message);
  });

// MongoDB Schemas
const messageSchema = new mongoose.Schema({
  channel: { type: String, index: true },
  sender: String,
  msg: String,
  avatar: String,
  color: String,
  time: String,
  timestamp: { type: Date, default: Date.now }
});

const fileSchema = new mongoose.Schema({
  name: String,
  filename: String,
  size: Number,
  url: String,
  uploader: String,
  time: String,
  timestamp: { type: Date, default: Date.now }
});

const Message = mongoose.model('Message', messageSchema);
const SharedFile = mongoose.model('SharedFile', fileSchema);

// Security configuration
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'", "https://unpkg.com", "https://cdn.jsdelivr.net"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com", "https://fonts.gstatic.com"],
      fontSrc: ["'self'", "https://fonts.gstatic.com", "https://fonts.googleapis.com"],
      imgSrc: ["'self'", "data:", "blob:", "https://images.unsplash.com"],
      connectSrc: ["'self'", "wss:", "ws:", "https://unpkg.com", "https://cdn.jsdelivr.net", "http://localhost:3000"],
      mediaSrc: ["'self'", "blob:", "data:"],
      frameSrc: ["'self'"]
    }
  }
}));

app.use(cors({
  origin: process.env.CORS_ORIGIN || '*',
  methods: ['GET', 'POST']
}));

// Ensure uploads directory exists
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir);
}

// Serve static files
app.use(express.static(__dirname));
app.use('/uploads', express.static(uploadsDir));
app.use(express.json());

// Set up Multer file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadsDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, uniqueSuffix + '-' + file.originalname);
  }
});
const upload = multer({ storage });

// Fallback in-memory lists (used if DB connection is unavailable)
const sharedFilesFallback = [];
const activeUsers = new Map();

// Helper functions
function getInitials(name) {
  if (!name) return '??';
  return name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();
}

const colors = ["avatar-cyan", "avatar-magenta", "avatar-blue", "avatar-purple"];
let colorIdx = 0;
function getNextColor() {
  const c = colors[colorIdx];
  colorIdx = (colorIdx + 1) % colors.length;
  return c;
}

// REST endpoints
app.post('/upload', upload.single('file'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded' });
  }

  const fileInfo = {
    name: req.file.originalname,
    filename: req.file.filename,
    size: req.file.size,
    url: `/uploads/${req.file.filename}`,
    uploader: req.body.uploader || 'Alex Rivera',
    time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  };

  // Save to MongoDB
  try {
    if (mongoose.connection.readyState === 1) {
      const dbFile = new SharedFile(fileInfo);
      await dbFile.save();
    }
  } catch (err) {
    console.error("Failed to save file to DB:", err.message);
  }

  sharedFilesFallback.push(fileInfo);
  io.emit('file-shared', fileInfo);
  res.json(fileInfo);
});

// Socket.io events
io.on('connection', (socket) => {
  console.log(`Socket connected: ${socket.id}`);

  // Register user info
  socket.on('user-register', async (userData) => {
    const username = userData.username || 'Anonymous User';
    const role = userData.role || 'Workspace Member';
    
    socket.username = username;
    socket.role = role;
    
    const userObj = {
      id: socket.id,
      name: username,
      role: role,
      avatar: getInitials(username),
      color: getNextColor()
    };
    
    activeUsers.set(socket.id, userObj);
    console.log(`Registered user: ${username} (${socket.id})`);
    
    // Broadcast active roster to everyone
    io.emit('roster-update', Array.from(activeUsers.values()));

    // Send existing files to the new connection
    try {
      if (mongoose.connection.readyState === 1) {
        const files = await SharedFile.find().sort({ timestamp: -1 }).limit(100);
        socket.emit('init-files', files.reverse());
      } else {
        socket.emit('init-files', sharedFilesFallback);
      }
    } catch (err) {
      console.error("Error reading shared files:", err.message);
      socket.emit('init-files', sharedFilesFallback);
    }
  });

  // Get chat history when switching channels
  socket.on('get-chat-history', async (channelName) => {
    try {
      if (mongoose.connection.readyState === 1) {
        const history = await Message.find({ channel: channelName }).sort({ timestamp: -1 }).limit(50);
        socket.emit('chat-history', { channel: channelName, messages: history.reverse() });
      } else {
        socket.emit('chat-history', { channel: channelName, messages: [] });
      }
    } catch (err) {
      console.error(`Error reading history for channel ${channelName}:`, err.message);
      socket.emit('chat-history', { channel: channelName, messages: [] });
    }
  });

  // Chat management
  socket.on('chat-msg', async (data) => {
    const user = activeUsers.get(socket.id) || { name: 'Anonymous', avatar: 'AN', color: 'avatar-purple' };
    const chatMsg = {
      channel: data.channel || 'general',
      sender: user.name,
      msg: data.msg,
      avatar: user.avatar,
      color: user.color,
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };
    
    // Save message to database
    try {
      if (mongoose.connection.readyState === 1) {
        const dbMsg = new Message(chatMsg);
        await dbMsg.save();
      }
    } catch (err) {
      console.error("Failed to save message to DB:", err.message);
    }

    io.emit('chat-msg', chatMsg);
  });

  // Whiteboard sync
  socket.on('whiteboard-draw', (data) => {
    socket.broadcast.emit('whiteboard-draw', data);
  });

  socket.on('whiteboard-clear', () => {
    socket.broadcast.emit('whiteboard-clear');
  });

  // WebRTC mesh signaling broker
  socket.on('webrtc-join', () => {
    console.log(`Peer joined WebRTC meeting room: ${socket.username} (${socket.id})`);
    socket.broadcast.emit('peer-joined', {
      id: socket.id,
      name: socket.username || 'Anonymous Peer',
      avatar: getInitials(socket.username),
      color: activeUsers.get(socket.id)?.color || 'avatar-purple'
    });
  });

  socket.on('webrtc-offer', (data) => {
    io.to(data.target).emit('webrtc-offer', {
      sender: socket.id,
      offer: data.offer
    });
  });

  socket.on('webrtc-answer', (data) => {
    io.to(data.target).emit('webrtc-answer', {
      sender: socket.id,
      answer: data.answer
    });
  });

  socket.on('webrtc-ice-candidate', (data) => {
    io.to(data.target).emit('webrtc-ice-candidate', {
      sender: socket.id,
      candidate: data.candidate
    });
  });

  socket.on('webrtc-leave', () => {
    console.log(`Peer left WebRTC meeting room: ${socket.id}`);
    socket.broadcast.emit('peer-left', socket.id);
  });

  // Disconnection handler
  socket.on('disconnect', () => {
    console.log(`Socket disconnected: ${socket.id}`);
    if (activeUsers.has(socket.id)) {
      activeUsers.delete(socket.id);
      io.emit('roster-update', Array.from(activeUsers.values()));
    }
    io.emit('peer-left', socket.id);
  });
});

server.listen(PORT, () => {
  console.log(`ConnectX server running at http://localhost:${PORT}`);
});
