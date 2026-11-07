import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../config/index.js';
import { db } from '../database/index.js';

export interface AuthUser {
  id: string;
  username: string;
  role: 'admin' | 'user';
  status: 'active' | 'pending' | 'banned';
}

export interface AuthenticatedRequest extends Request {
  user?: AuthUser;
}

export function generateToken(user: AuthUser): string {
  return jwt.sign(
    {
      id: user.id,
      username: user.username,
      role: user.role,
      status: user.status
    },
    config.jwtSecret,
    { expiresIn: '7d' }
  );
}

export function authenticate(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'UNAUTHORIZED', message: 'Authentication required' });
  }

  const token = authHeader.split(' ')[1];

  try {
    const decoded = jwt.verify(token, config.jwtSecret) as AuthUser;
    
    // Fetch live user status from database to prevent stale tokens after ban/approval changes
    const user = db.prepare('SELECT id, username, role, status FROM users WHERE id = ?').get(decoded.id) as AuthUser | undefined;

    if (!user) {
      return res.status(401).json({ error: 'USER_NOT_FOUND', message: 'User no longer exists' });
    }

    if (user.status === 'banned') {
      return res.status(403).json({ error: 'ACCOUNT_BANNED', message: 'Account is suspended' });
    }

    req.user = user;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'INVALID_TOKEN', message: 'Invalid or expired token' });
  }
}

export function requireAdmin(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  if (!req.user || req.user.role !== 'admin') {
    return res.status(403).json({ error: 'FORBIDDEN', message: 'Admin privileges required' });
  }
  next();
}

export function requireActive(req: AuthenticatedRequest, res: Response, next: NextFunction) {
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
