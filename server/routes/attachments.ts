import { Router } from 'express';
import { db } from '../db.ts';
import { badRequest, idParam, notFound, optionalString } from '../http.ts';
import { getCard, mustEdit } from '../permissions.ts';
import { requireAuth } from '../auth/session.ts';
import { dropUnusedBlobs } from '../blobs.ts';

export const attachmentsRouter = Router();
attachmentsRouter.use(requireAuth);

function getAttachment(id: number) {
  return db.prepare('SELECT * FROM attachments WHERE id = ?').get(id) as
    | { id: number; card_id: number; storage_key: string | null }
    | undefined;
}

attachmentsRouter.get('/:id', (req, res) => {
  const att = getAttachment(idParam(req));
  if (!att) throw notFound();
  res.json(att);
});

attachmentsRouter.put('/:id', (req, res) => {
  const att = getAttachment(idParam(req));
  if (!att) throw notFound('Attachment not found');
  mustEdit(getCard(att.card_id), req.user, 'Card');
  // Only text snippets are editable; an uploaded file's name follows its type.
  if (att.storage_key) throw badRequest('Uploaded files cannot be edited');
  const filename = optionalString(req.body, 'filename');
  const content = optionalString(req.body, 'content');
  const language = optionalString(req.body, 'language');
  if (filename !== undefined) db.prepare('UPDATE attachments SET filename = ? WHERE id = ?').run(filename.trim(), att.id);
  if (content !== undefined) db.prepare('UPDATE attachments SET content = ? WHERE id = ?').run(content, att.id);
  if (language !== undefined) db.prepare('UPDATE attachments SET language = ? WHERE id = ?').run(language, att.id);
  res.json({ ok: true });
});

attachmentsRouter.delete('/:id', (req, res) => {
  const att = getAttachment(idParam(req));
  if (!att) throw notFound('Attachment not found');
  mustEdit(getCard(att.card_id), req.user, 'Card');
  db.prepare('DELETE FROM attachments WHERE id = ?').run(att.id);
  if (att.storage_key) dropUnusedBlobs([att.storage_key]);
  res.json({ ok: true });
});
