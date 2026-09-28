import type { NextFunction, Request, Response } from 'express';
import type { User } from '../../shared/types.ts';
import { config } from '../config.ts';
import { db } from '../db.ts';
import { newSessionToken } from './password.ts';

declare module 'express-serve-static-core' {
  interface Request {
    user: User;
  }
}

export function loadUserFromSession(req: Request): User | null {
  const token = req.cookies?.[config.cookieName];
  if (!token) return null;
  const row = db
    .prepare(
      `SELECT u.id, u.email, u.is_admin
       FROM sessions s JOIN users u ON u.id = s.user_id
       WHERE s.token = ? AND s.expires_at > datetime('now')`,
    )
    .get(token) as { id: number; email: string; is_admin: number } | undefined;
  if (!row) return null;
  return { id: row.id, email: row.email, is_admin: !!row.is_admin };
}

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const user = loadUserFromSession(req);
  if (!user) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }
  req.user = user;
  next();
}

export function requireAdmin(req: Request, res: Response, next: NextFunction): void {
  const user = loadUserFromSession(req);
  if (!user) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }
  if (!user.is_admin) {
    res.status(403).json({ error: 'Admin required' });
    return;
  }
  req.user = user;
  next();
}

export function createSession(userId: number): string {
  const token = newSessionToken();
  const expiresAt = new Date(Date.now() + config.sessionTtlMs)
    .toISOString()
    .replace('T', ' ')
    .slice(0, 19);
  db.prepare('INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, ?)').run(
    token,
    userId,
    expiresAt,
  );
  return token;
}
