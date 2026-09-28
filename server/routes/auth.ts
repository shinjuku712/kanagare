import { Router } from 'express';
import { config } from '../config.ts';
import { db } from '../db.ts';
import { badRequest, HttpError } from '../http.ts';
import { dummyPasswordHash, verifyPassword } from '../auth/password.ts';
import { clearFailures, lockedFor, recordFailure, takeHashSlot } from '../auth/throttle.ts';
import { createSession, loadUserFromSession } from '../auth/session.ts';

export const authRouter = Router();

authRouter.post('/login', async (req, res) => {
  const email = String(req.body?.email || '').trim().toLowerCase();
  const password = String(req.body?.password || '');
  if (!email || !password) throw badRequest('Email and password required');
  const wait = lockedFor(email);
  if (wait) throw new HttpError(429, `Too many failed attempts. Try again in ${wait} min.`);
  if (!takeHashSlot()) throw new HttpError(429, 'Too many sign-in attempts right now. Try again in a moment.');
  const user = db
    .prepare('SELECT id, email, password_hash, is_admin FROM users WHERE email = ?')
    .get(email) as { id: number; email: string; password_hash: string; is_admin: number } | undefined;
  const ok = await verifyPassword(password, user?.password_hash ?? dummyPasswordHash());
  if (!user || !ok) {
    recordFailure(email);
    throw new HttpError(401, 'Invalid credentials');
  }
  clearFailures(email);
  const token = createSession(user.id);
  res.cookie(config.cookieName, token, {
    httpOnly: true,
    secure: config.isProd,
    sameSite: 'strict',
    maxAge: config.cookieMaxAgeMs,
  });
  res.json({ ok: true, user: { id: user.id, email: user.email, is_admin: !!user.is_admin } });
});

authRouter.post('/logout', (req, res) => {
  const token = req.cookies?.[config.cookieName];
  if (token) db.prepare('DELETE FROM sessions WHERE token = ?').run(token);
  res.clearCookie(config.cookieName);
  res.json({ ok: true });
});

authRouter.get('/check', (req, res) => {
  const user = loadUserFromSession(req);
  if (!user) {
    res.json({ authenticated: false });
    return;
  }
  res.json({ authenticated: true, user });
});
