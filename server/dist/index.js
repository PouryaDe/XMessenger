"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.io = exports.server = exports.app = void 0;
const express_1 = __importDefault(require("express"));
const http_1 = __importDefault(require("http"));
const cors_1 = __importDefault(require("cors"));
const path_1 = __importDefault(require("path"));
const fs_1 = __importDefault(require("fs"));
const socket_io_1 = require("socket.io");
const index_js_1 = require("./config/index.js");
const index_js_2 = require("./database/index.js");
const auth_js_1 = require("./routes/auth.js");
const admin_js_1 = require("./routes/admin.js");
const messages_js_1 = require("./routes/messages.js");
const index_js_3 = require("./socket/index.js");
const ttlCleaner_js_1 = require("./workers/ttlCleaner.js");
// 1. Initialize SQLite Database
(0, index_js_2.initDatabase)();
// 2. Setup Express & HTTP Server
const app = (0, express_1.default)();
exports.app = app;
const server = http_1.default.createServer(app);
exports.server = server;
// 3. Setup Socket.io
const io = new socket_io_1.Server(server, {
    cors: {
        origin: '*',
        methods: ['GET', 'POST']
    }
});
exports.io = io;
// Setup Socket server handlers
(0, index_js_3.setupSocketServer)(io);
// 4. Start Background TTL Worker
(0, ttlCleaner_js_1.startTtlWorker)(io);
// 5. Middlewares
app.use((0, cors_1.default)());
app.use(express_1.default.json({ limit: '5mb' }));
// 6. API Routes
app.use('/api/auth', auth_js_1.authRouter);
app.use('/api/admin', (0, admin_js_1.createAdminRouter)(io));
app.use('/api/messages', (0, messages_js_1.createMessagesRouter)(io));
// Health check endpoint
app.get('/api/health', (req, res) => {
    res.json({
        status: 'ok',
        timestamp: new Date().toISOString(),
        service: 'XMessenger Core Engine'
    });
});
// 7. Serve Uploaded User/Admin Content (Persistent Volume in data/uploads)
const uploadsDir = path_1.default.join(index_js_1.config.dataDir, 'uploads');
if (!fs_1.default.existsSync(uploadsDir)) {
    fs_1.default.mkdirSync(uploadsDir, { recursive: true });
}
app.use('/uploads', express_1.default.static(uploadsDir, {
    maxAge: '7d'
}));
// 8. Serve Dynamic PWA Manifest (incorporates admin custom app name & icon)
app.get('/manifest.json', (req, res) => {
    const appName = (0, index_js_2.getSettingValue)('app_name', 'XMessenger - پیام‌رسان امن و خصوصی');
    const pwaShortName = (0, index_js_2.getSettingValue)('pwa_short_name', 'XMessenger');
    const customIcon = (0, index_js_2.getSettingValue)('pwa_icon_url', '');
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
            src: "/icon-192.png",
            sizes: "192x192",
            type: "image/png",
            purpose: "any"
        },
        {
            src: "/icon-512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "any"
        },
        {
            src: "/icon-512-maskable.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "maskable"
        },
        {
            src: "/shield.svg",
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
        description: "پیام‌رسان متمرکز امن یک‌طرفه با پیام‌های گذرا و رمزنگاری AES-256",
        start_url: "/",
        scope: "/",
        display: "standalone",
        orientation: "portrait-primary",
        background_color: "#DFDDD6",
        theme_color: "#DFDDD6",
        lang: "fa",
        dir: "rtl",
        categories: ["social", "utilities", "productivity"],
        icons
    });
});
// 9. Serve Static Frontend in production
const clientDistPath = path_1.default.resolve(process.cwd(), '../client/dist');
const localDistPath = path_1.default.resolve(process.cwd(), './client-dist');
const staticDir = fs_1.default.existsSync(clientDistPath) ? clientDistPath : (fs_1.default.existsSync(localDistPath) ? localDistPath : null);
if (staticDir) {
    console.log(`[Server] Serving static client from: ${staticDir}`);
    // Serve static assets with caching, but index.html must NEVER be cached
    app.use(express_1.default.static(staticDir, {
        setHeaders: (res, filePath) => {
            if (filePath.endsWith('.html')) {
                res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
                res.setHeader('Pragma', 'no-cache');
                res.setHeader('Expires', '0');
            }
            else {
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
        res.sendFile(path_1.default.join(staticDir, 'index.html'));
    });
}
// 8. Start Listening
server.listen(index_js_1.config.port, '0.0.0.0', () => {
    console.log(`===============================================`);
    console.log(`🚀 XMessenger Server running on port ${index_js_1.config.port}`);
    console.log(`🔒 Encryption: AES-256-GCM Enabled`);
    console.log(`⏱️ Default Message TTL: ${index_js_1.config.defaultTtlSeconds}s`);
    console.log(`🌐 Environment: ${process.env.NODE_ENV || 'development'}`);
    console.log(`===============================================`);
});
