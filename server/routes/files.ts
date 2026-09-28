import crypto from 'node:crypto';
import path from 'node:path';
import { pipeline } from 'node:stream';
import express, { Router } from 'express';
import { ALLOWED_UPLOAD_MIME, config } from '../config.ts';
import { blobs, dropUnusedBlobs } from '../blobs.ts';
import { db } from '../db.ts';
import { badRequest, idParam, notFound } from '../http.ts';
import { getCard, mustEdit } from '../permissions.ts';
import { requireAuth } from '../auth/session.ts';
import { logActivity, projectIdForCard } from '../activity.ts';

/**
 * Binary attachments (images, PDFs, spreadsheets…).
 *
 * Uploads are sent as a raw body with the filename in a header rather than as
 * multipart/form-data — the browser can post a File directly, and it saves
 * pulling in a multipart parser for a single field.
 *
 * Bytes go to the blob store (see blobs.ts) under a content-addressed name;
 * the DB only holds metadata.
 */
export const filesRouter = Router();

/** Filenames are shown and used in Content-Disposition — strip anything structural. */
function safeName(raw: string): string {
  const base = path.basename(raw).replace(/[\r\n"\\]/g, '').trim();
  return (base || 'file').slice(0, 200);
}

/**
 * The name with the extension its type implies, so bytes accepted as
 * text/plain can't be served back as "page.html" or "setup.exe".
 */
function withExtension(name: string, ext: string): string {
  const dot = name.lastIndexOf('.');
  const current = dot > 0 ? name.slice(dot + 1).toLowerCase() : '';
  if (current === ext || (ext === 'jpg' && current === 'jpeg')) return name;
  return (dot > 0 ? name.slice(0, dot) : name) + '.' + ext;
}

export const cardFilesRouter = Router();
cardFilesRouter.use(requireAuth);

/**
 * POST /api/cards/:id/files
 * Headers: X-Filename (URI-encoded), Content-Type
 * Body: the raw bytes
 */
cardFilesRouter.post(
  '/:id/files',
  express.raw({ type: '*/*', limit: config.maxUploadBytes }),
  (req, res) => {
    const cardId = idParam(req);
    const card = getCard(cardId);
    if (!card) throw notFound('Card not found');
    mustEdit(card, req.user, 'Card');

    const mime = String(req.headers['content-type'] || '').split(';')[0]!.trim().toLowerCase();
    if (!ALLOWED_UPLOAD_MIME[mime]) {
      throw badRequest(`Unsupported file type: ${mime || 'unknown'}`);
    }

    const body = req.body as Buffer;
    if (!Buffer.isBuffer(body) || !body.length) throw badRequest('Empty upload');
    if (body.length > config.maxUploadBytes) {
      throw badRequest(`File too large (max ${Math.floor(config.maxUploadBytes / 1024 / 1024)} MB)`);
    }

    const rawName = req.headers['x-filename'];
    let filename = 'file';
    if (typeof rawName === 'string' && rawName) {
      try {
        filename = safeName(decodeURIComponent(rawName));
      } catch {
        filename = safeName(rawName);
      }
    }
    filename = withExtension(filename, ALLOWED_UPLOAD_MIME[mime]!);

    // Content-addressed: identical bytes reuse one stored blob.
    const checksum = crypto.createHash('sha256').update(body).digest('hex');
    const key = `${checksum}.${ALLOWED_UPLOAD_MIME[mime]}`;
    if (!blobs().has(key)) blobs().put(key, body);

    const info = db
      .prepare(
        `INSERT INTO attachments (card_id, filename, content, language, storage_key, mime, size_bytes, checksum, created_by)
         VALUES (?, ?, '', '', ?, ?, ?, ?, ?)`,
      )
      .run(cardId, filename, key, mime, body.length, checksum, req.user.id);

    logActivity({
      user: req.user,
      verb: 'file.added',
      cardId,
      projectId: projectIdForCard(cardId),
      subject: (card as { title?: string }).title ?? null,
      detail: filename,
    });
    res.json(db.prepare('SELECT id, card_id, filename, language, created_at, storage_key, mime, size_bytes FROM attachments WHERE id = ?').get(info.lastInsertRowid));
  },
);

/**
 * GET /api/files/:id — stream a stored file.
 * ?download=1 forces a save dialog instead of inline rendering.
 */
filesRouter.use(requireAuth);
filesRouter.get('/:id', (req, res) => {
  const id = idParam(req);
  const row = db
    .prepare('SELECT id, filename, storage_key, mime, size_bytes FROM attachments WHERE id = ?')
    .get(id) as { id: number; filename: string; storage_key: string | null; mime: string | null; size_bytes: number | null } | undefined;
  if (!row) throw notFound('File not found');
  if (!row.storage_key) throw badRequest('That attachment is a text snippet, not a file');

  const stream = blobs().open(row.storage_key);
  if (!stream) throw notFound('File missing from storage');

  const mime = row.mime || 'application/octet-stream';
  // Only ever render inline what we know is safe to render; everything else
  // downloads. Combined with the upload allowlist this keeps the origin clean.
  const inlineOk = mime.startsWith('image/') || mime === 'application/pdf' || mime === 'text/plain';
  const wantsDownload = req.query.download === '1' || !inlineOk;
  const dispo = wantsDownload ? 'attachment' : 'inline';

  res.setHeader('Content-Type', mime);
  if (row.size_bytes != null) res.setHeader('Content-Length', String(row.size_bytes));
  res.setHeader('Content-Disposition', `${dispo}; filename*=UTF-8''${encodeURIComponent(row.filename)}`);
  // Content-addressed storage ⇒ a given id's bytes never change.
  res.setHeader('Cache-Control', 'private, max-age=31536000, immutable');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  // Opened directly, a file runs in a sandbox with no scripts. Not for PDFs:
  // a sandbox stops the browser's built-in PDF viewer from loading.
  if (mime !== 'application/pdf') {
    res.setHeader('Content-Security-Policy', "default-src 'none'; img-src 'self' data:; style-src 'unsafe-inline'; sandbox");
  }
  // pipeline, not pipe: a read error must end this response, not crash the process.
  pipeline(stream, res, (err) => {
    if (err) res.destroy(err);
  });
});

/** DELETE /api/files/:id — removes the row; bytes are GC'd if unreferenced. */
filesRouter.delete('/:id', (req, res) => {
  const id = idParam(req);
  const row = db.prepare('SELECT id, card_id, storage_key FROM attachments WHERE id = ?').get(id) as
    | { id: number; card_id: number; storage_key: string | null }
    | undefined;
  if (!row) throw notFound('File not found');
  const card = mustEdit(getCard(row.card_id), req.user, 'Card');
  const filename = (db.prepare('SELECT filename FROM attachments WHERE id = ?').get(id) as { filename: string }).filename;

  db.prepare('DELETE FROM attachments WHERE id = ?').run(id);
  if (row.storage_key) dropUnusedBlobs([row.storage_key]);
  logActivity({
    user: req.user,
    verb: 'file.removed',
    cardId: row.card_id,
    projectId: projectIdForCard(row.card_id),
    subject: (card.title as string) ?? null,
    detail: filename,
  });
  res.json({ ok: true });
});
