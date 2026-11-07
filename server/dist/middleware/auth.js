"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateToken = generateToken;
exports.authenticate = authenticate;
exports.requireAdmin = requireAdmin;
exports.requireActive = requireActive;
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const index_js_1 = require("../config/index.js");
const index_js_2 = require("../database/index.js");
function generateToken(user) {
    return jsonwebtoken_1.default.sign({
        id: user.id,
        username: user.username,
        role: user.role,
        status: user.status
    }, index_js_1.config.jwtSecret, { expiresIn: '7d' });
}
function authenticate(req, res, next) {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'UNAUTHORIZED', message: 'Authentication required' });
    }
    const token = authHeader.split(' ')[1];
    try {
        const decoded = jsonwebtoken_1.default.verify(token, index_js_1.config.jwtSecret);
        // Fetch live user status from database to prevent stale tokens after ban/approval changes
        const user = index_js_2.db.prepare('SELECT id, username, role, status, avatar_url FROM users WHERE id = ?').get(decoded.id);
        if (!user) {
            return res.status(401).json({ error: 'USER_NOT_FOUND', message: 'User no longer exists' });
        }
        if (user.status === 'banned') {
            return res.status(403).json({ error: 'ACCOUNT_BANNED', message: 'Account is suspended' });
        }
        req.user = {
            id: user.id,
            username: user.username,
            role: user.role,
            status: user.status,
            avatarUrl: user.avatar_url || undefined
        };
        next();
    }
    catch (err) {
        return res.status(401).json({ error: 'INVALID_TOKEN', message: 'Invalid or expired token' });
    }
}
function requireAdmin(req, res, next) {
    if (!req.user || req.user.role !== 'admin') {
        return res.status(403).json({ error: 'FORBIDDEN', message: 'Admin privileges required' });
    }
    next();
}
function requireActive(req, res, next) {
    if (!req.user) {
        return res.status(401).json({ error: 'UNAUTHORIZED', message: 'Authentication required' });
    }
    if (req.user.status === 'pending') {
        return res.status(403).json({
            error: 'ACCOUNT_PENDING_APPROVAL',
            message: 'Account is pending administrative approval'
        });
    }
    next();
}
