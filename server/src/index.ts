import express from 'express';
import http from 'http';
import cors from 'cors';
import compression from 'compression';
import path from 'path';
import fs from 'fs';
import { Server } from 'socket.io';
import { config } from './config/index.js';
import { db, initDatabase, getSettingValue } from './database/index.js';
import { createAuthRouter } from './routes/auth.js';
import { createAdminRouter } from './routes/admin.js';
import { createMessagesRouter } from './routes/messages.js';
import { createChannelRouter } from './routes/channel.js';
import { pushRouter } from './routes/push.js';
import { setupSocketServer } from './socket/index.js';
import { startTtlWorker } from './workers/ttlCleaner.js';
import { initVapid } from './services/pushService.js';
import { securityHeadersMiddleware } from './middleware/security.js';

// 1. Initialize SQLite Database & VAPID keys
initDatabase();
initVapid();

// 2. Setup Express & HTTP Server
const app = express();
const server = http.createServer(app);

// Security: Disable Express fingerprinting & trust upstream Nginx reverse proxy
app.disable('x-powered-by');
app.set('trust proxy', 1);

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
app.use(securityHeadersMiddleware);
app.use(compression({
  threshold: 1024, // Only compress responses above 1KB
  filter: (req, res) => {
    if (req.headers['x-no-compression']) return false;
    return compression.filter(req, res);
  }
}));

// Performance Latency Tracker (Core Web Vitals & Server Timing)
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - start;
    res.setHeader('X-Response-Time', `${duration}ms`);
    if (duration > 150 && !req.path.startsWith('/uploads') && !req.path.includes('/download')) {
      console.warn(`[Performance] Slow request: ${req.method} ${req.path} took ${duration}ms`);
    }
  });
  next();
});

app.use(cors());
app.use(express.json({ limit: '5mb' }));

// 6. API Routes
app.use('/api/auth', createAuthRouter(io));
app.use('/api/admin', createAdminRouter(io));
app.use('/api/messages', createMessagesRouter(io));
app.use('/api/channel', createChannelRouter(io));
app.use('/api/push', pushRouter);

// Health check endpoint for container healthchecks & watchdog daemon
app.get('/api/health', (req, res) => {
  try {
    db.prepare('SELECT 1').get();
    res.json({
      status: 'healthy',
      database: 'connected',
      uptime: Math.floor(process.uptime()),
      timestamp: new Date().toISOString(),
      version: config.appVersion,
      service: 'XMessenger Core Engine'
    });
  } catch (err: any) {
    res.status(500).json({
      status: 'unhealthy',
      database: 'error',
      error: err.message || 'Database unavailable',
      timestamp: new Date().toISOString()
    });
  }
});

// 7. Serve Uploaded User/Admin Content (Persistent Volume in data/uploads)
const uploadsDir = path.join(config.dataDir, 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}
app.use('/uploads', express.static(uploadsDir, {
  maxAge: '7d',
  dotfiles: 'ignore',
  setHeaders: (res) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Content-Security-Policy', "default-src 'none'; img-src 'self' data: blob:; style-src 'unsafe-inline'; sandbox");
    res.setHeader('X-Frame-Options', 'DENY');
  }
}));

// 8. Serve Dynamic PWA Manifest (incorporates admin custom app name & icon)
app.get('/manifest.json', (req, res) => {
  const appName = getSettingValue('app_name', 'XMessenger - پیام‌رسان امن و خصوصی');
  const pwaShortName = getSettingValue('pwa_short_name', 'XMessenger');
  const customIcon = getSettingValue('pwa_icon_url', '');

  const icons = customIcon ? [
    {
      src: customIcon,
      sizes: "192x192",
      type: "image/png",
      purpose: "any"
    },
    {
      src: customIcon,
      sizes: "512x512",
      type: "image/png",
      purpose: "any"
    },
    {
      src: customIcon,
      sizes: "512x512",
      type: "image/png",
      purpose: "maskable"
    }
  ] : [
    {
      src: `/icon-192.png?v=${config.appVersion}`,
      sizes: "192x192",
      type: "image/png",
      purpose: "any"
    },
    {
      src: `/icon-512.png?v=${config.appVersion}`,
      sizes: "512x512",
      type: "image/png",
      purpose: "any"
    },
    {
      src: `/icon-512-maskable.png?v=${config.appVersion}`,
      sizes: "512x512",
      type: "image/png",
      purpose: "maskable"
    },
    {
      src: `/shield.svg?v=${config.appVersion}`,
      sizes: "any",
      type: "image/svg+xml",
      purpose: "any"
    }
  ];

  res.setHeader('Content-Type', 'application/manifest+json');
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  res.json({
    name: appName,
    short_name: pwaShortName,
    description: "پیام‌رسان متمرکز امن یک‌طرفه با پیام‌های گذرا و رمزنگاری پیشرفته",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait-primary",
    background_color: "#0E1218",
    theme_color: "#0E1218",
    lang: "fa",
    dir: "rtl",
    categories: ["social", "utilities", "productivity"],
    icons
  });
});

// 9. Serve Static Frontend in production
const clientDistPath = path.resolve(process.cwd(), '../client/dist');
const localDistPath = path.resolve(process.cwd(), './client-dist');

const staticDir = fs.existsSync(clientDistPath) ? clientDistPath : (fs.existsSync(localDistPath) ? localDistPath : null);

if (staticDir) {
  console.log(`[Server] Serving static client from: ${staticDir}`);

  // Escape HTML utility to prevent XSS in dynamic title/meta injection
  const escapeHtml = (str: string): string =>
    str.replace(/[&<>"']/g, (m) => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;'
    }[m] || m));

  // Dynamic index.html renderer that stamps customized appName directly into <title> and apple-mobile-web-app-title
  const renderIndexHtml = (_req: express.Request, res: express.Response) => {
    const indexPath = path.join(staticDir, 'index.html');
    if (!fs.existsSync(indexPath)) {
      return res.status(404).send('Not Found');
    }

    try {
      let html = fs.readFileSync(indexPath, 'utf-8');
      const appName = getSettingValue('app_name', 'XMessenger');
      const safeAppName = escapeHtml(appName);

      // Replace <title> tag with dynamic configured appName
      html = html.replace(/<title>.*?<\/title>/i, `<title>${safeAppName}</title>`);
      // Replace <meta name="apple-mobile-web-app-title" content="...">
      html = html.replace(
        /<meta\s+name=["']apple-mobile-web-app-title["']\s+content=["'].*?["']/i,
        `<meta name="apple-mobile-web-app-title" content="${safeAppName}"`
      );

      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate, max-age=0');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      return res.send(html);
    } catch (err) {
      console.error('[Server] Error rendering index.html with custom title:', err);
      return res.sendFile(indexPath);
    }
  };

  // Serve static assets with caching, but index.html, sw.js and manifest.json must NEVER be cached.
  // index: false ensures root '/' is handled by renderIndexHtml rather than static index.html.
  app.use(express.static(staticDir, {
    index: false,
    setHeaders: (res, filePath) => {
      const isUncached = 
        filePath.endsWith('.html') || 
        filePath.endsWith('sw.js') || 
        filePath.endsWith('manifest.json') ||
        filePath.endsWith('.png') ||
        filePath.endsWith('.svg') ||
        filePath.endsWith('.ico') ||
        filePath.endsWith('.json') ||
        !filePath.includes(path.sep + 'assets' + path.sep);

      if (isUncached) {
        res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate, max-age=0');
        res.setHeader('Pragma', 'no-cache');
        res.setHeader('Expires', '0');
      } else {
        // Hashed assets (JS/CSS) in /assets/ can be cached safely
        res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
      }
    }
  }));

  // Explicit route for sw.js so service worker updates can never be blocked by cache
  app.get('/sw.js', (req, res) => {
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate, max-age=0');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
    const swPath = path.join(staticDir, 'sw.js');
    if (fs.existsSync(swPath)) {
      res.sendFile(swPath);
    } else {
      res.status(404).send('// Service worker not found');
    }
  });

  // Explicit routes for root and /index.html with stamped custom title
  app.get('/', renderIndexHtml);
  app.get('/index.html', renderIndexHtml);

  // SPA fallback route for all other page navigations
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api') || req.path.startsWith('/socket.io')) {
      return next();
    }
    renderIndexHtml(req, res);
  });
}

// 8. Start Listening
server.listen(config.port, '0.0.0.0', () => {
  console.log(`===============================================`);
  console.log(`🚀 XMessenger Server v${config.appVersion} running on port ${config.port}`);
  console.log(`🔒 Encryption: AES-256-GCM Enabled`);
  console.log(`⏱️ Default Message TTL: ${config.defaultTtlSeconds}s`);
  console.log(`🌐 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`===============================================`);
});

export { app, server, io };
