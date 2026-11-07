import express from 'express';
import http from 'http';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import { Server } from 'socket.io';
import { config } from './config/index.js';
import { initDatabase } from './database/index.js';
import { authRouter } from './routes/auth.js';
import { createAdminRouter } from './routes/admin.js';
import { createMessagesRouter } from './routes/messages.js';
import { setupSocketServer } from './socket/index.js';
import { startTtlWorker } from './workers/ttlCleaner.js';

// 1. Initialize SQLite Database
initDatabase();

// 2. Setup Express & HTTP Server
const app = express();
const server = http.createServer(app);

// 3. Setup Socket.io
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

// Setup Socket server handlers
setupSocketServer(io);

// 4. Start Background TTL Worker
startTtlWorker(io);

// 5. Middlewares
app.use(cors());
app.use(express.json({ limit: '5mb' }));

// 6. API Routes
app.use('/api/auth', authRouter);
app.use('/api/admin', createAdminRouter(io));
app.use('/api/messages', createMessagesRouter(io));

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    service: 'XMessenger Core Engine'
  });
});

// 7. Serve Static Frontend in production
const clientDistPath = path.resolve(process.cwd(), '../client/dist');
const localDistPath = path.resolve(process.cwd(), './client-dist');

const staticDir = fs.existsSync(clientDistPath) ? clientDistPath : (fs.existsSync(localDistPath) ? localDistPath : null);

if (staticDir) {
  console.log(`[Server] Serving static client from: ${staticDir}`);

  // Serve static assets with caching, but index.html must NEVER be cached
  app.use(express.static(staticDir, {
    setHeaders: (res, filePath) => {
      if (filePath.endsWith('.html')) {
        res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
        res.setHeader('Pragma', 'no-cache');
        res.setHeader('Expires', '0');
      } else {
        // Hashed assets (JS/CSS) can be cached safely
        res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
      }
    }
  }));

  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api') || req.path.startsWith('/socket.io')) {
      return next();
    }
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    res.sendFile(path.join(staticDir, 'index.html'));
  });
}

// 8. Start Listening
server.listen(config.port, '0.0.0.0', () => {
  console.log(`===============================================`);
  console.log(`🚀 XMessenger Server running on port ${config.port}`);
  console.log(`🔒 Encryption: AES-256-GCM Enabled`);
  console.log(`⏱️ Default Message TTL: ${config.defaultTtlSeconds}s`);
  console.log(`🌐 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`===============================================`);
});

export { app, server, io };
