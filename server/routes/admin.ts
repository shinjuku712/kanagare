import { Router } from 'express';
import { db } from '../db.ts';
import { badRequest, HttpError, idParam, notFound } from '../http.ts';
import { hashPassword } from '../auth/password.ts';
import { requireAdmin } from '../auth/session.ts';

export const adminRouter = Router();
adminRouter.use(requireAdmin);

adminRouter.get('/users', (_req, res) => {
  res.json(db.prepare('SELECT id, email, is_admin, created_at FROM users ORDER BY created_at').all());
});

adminRouter.post('/users', (req, res) => {
  const email = String(req.body?.email || '').trim().toLowerCase();
  const password = String(req.body?.password || '');
  const isAdmin = req.body?.is_admin ? 1 : 0;
  if (!email || !password) throw badRequest('Email and password required');
  if (password.length < 8) throw badRequest('Password must be at least 8 characters');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw badRequest('Invalid email');
  try {
    const info = db
      .prepare('INSERT INTO users (email, password_hash, is_admin) VALUES (?, ?, ?)')
      .run(email, hashPassword(password), isAdmin);
    res.json({ id: info.lastInsertRowid, email, is_admin: !!isAdmin });
  } catch (e) {
    if (String((e as Error).message).includes('UNIQUE')) throw new HttpError(409, 'Email already exists');
    throw e;
  }
});

adminRouter.put('/users/:id/password', (req, res) => {
  const id = idParam(req);
  const password = String(req.body?.password || '');
  if (password.length < 8) throw badRequest('Password must be at least 8 characters');
  const info = db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hashPassword(password), id);
  if (info.changes === 0) throw notFound();
  // Invalidate all sessions for this user so they get logged out everywhere.
  db.prepare('DELETE FROM sessions WHERE user_id = ?').run(id);
  res.json({ ok: true });
});

adminRouter.put('/users/:id/admin', (req, res) => {
  const id = idParam(req);
  const isAdmin = req.body?.is_admin ? 1 : 0;
  if (!isAdmin) {
    const target = db.prepare('SELECT is_admin FROM users WHERE id = ?').get(id) as
      | { is_admin: number }
      | undefined;
    if (target?.is_admin) {
      const admins = (db.prepare('SELECT COUNT(*) AS c FROM users WHERE is_admin = 1').get() as { c: number }).c;
      if (admins <= 1) throw badRequest('Cannot demote the last admin');
    }
  }
  const info = db.prepare('UPDATE users SET is_admin = ? WHERE id = ?').run(isAdmin, id);
  if (info.changes === 0) throw notFound();
  res.json({ ok: true });
});

adminRouter.delete('/users/:id', (req, res) => {
  const id = idParam(req);
  if (id === req.user.id) throw badRequest('Cannot delete yourself');
  const target = db.prepare('SELECT is_admin FROM users WHERE id = ?').get(id) as
    | { is_admin: number }
    | undefined;
  if (target?.is_admin) {
    const admins = (db.prepare('SELECT COUNT(*) AS c FROM users WHERE is_admin = 1').get() as { c: number }).c;
    if (admins <= 1) throw badRequest('Cannot delete the last admin');
  }
  const info = db.prepare('DELETE FROM users WHERE id = ?').run(id);
  if (info.changes === 0) throw notFound();
  res.json({ ok: true });
});
