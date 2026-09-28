import express from 'express';
import cookieParser from 'cookie-parser';
import { SECURITY_HEADERS } from './headers.ts';
import { authRouter } from './routes/auth.ts';
import { adminRouter } from './routes/admin.ts';
import { projectsRouter } from './routes/projects.ts';
import { projectLabelsRouter, labelsRouter } from './routes/labels.ts';
import { columnsRouter } from './routes/columns.ts';
import { cardsRouter } from './routes/cards.ts';
import { cardCommentsRouter, commentsRouter } from './routes/comments.ts';
import { cardLinksRouter, linksRouter } from './routes/links.ts';
import { attachmentsRouter } from './routes/attachments.ts';
import { cardFilesRouter, filesRouter } from './routes/files.ts';
import { templatesRouter } from './routes/templates.ts';
import { miscRouter } from './routes/misc.ts';

/**
 * The API as an Express app, shared by both runtimes. It doesn't open the
 * database, serve the web app or install an error handler — the caller mounts
 * whatever it serves alongside the API, then `errorHandler` last.
 */
export function createApp(): express.Express {
  const app = express();
  // Not for file uploads: those are raw bodies, and a JSON file would be parsed here.
  app.use(express.json({ limit: '100kb', type: (req) => /^application\/json/i.test(String(req.headers['content-type'] ?? '')) && !/\/files$/.test(req.url ?? '') }));
  app.use(cookieParser());

  app.disable('x-powered-by');
  app.use((req, res, next) => {
    res.set(SECURITY_HEADERS);
    // SameSite=Strict still lets sibling subdomains through, so also refuse
    // writes whose Origin isn't this host.
    const origin = req.headers.origin;
    if (req.method !== 'GET' && req.method !== 'HEAD' && origin && req.path.startsWith('/api/')) {
      let host = '';
      try {
        host = new URL(origin).host;
      } catch {
        /* unparseable origin: refused below */
      }
      if (host !== req.headers.host) {
        res.status(403).json({ error: 'Cross-origin request refused' });
        return;
      }
    }
    next();
  });

  app.use('/api', authRouter);
  app.use('/api/admin', adminRouter);
  // projectLabelsRouter first: it only defines /:id/labels, which projectsRouter doesn't.
  app.use('/api/projects', projectLabelsRouter);
  app.use('/api/projects', projectsRouter);
  app.use('/api/labels', labelsRouter);
  app.use('/api/columns', columnsRouter);
  // Sub-resource routers first: they only define /:id/comments and /:id/links,
  // which cardsRouter doesn't, so they must win before its /:id handlers.
  app.use('/api/cards', cardCommentsRouter);
  app.use('/api/cards', cardLinksRouter);
  app.use('/api/cards', cardFilesRouter);
  app.use('/api/cards', cardsRouter);
  app.use('/api/comments', commentsRouter);
  app.use('/api/links', linksRouter);
  app.use('/api/attachments', attachmentsRouter);
  app.use('/api/files', filesRouter);
  app.use('/api/templates', templatesRouter);
  app.use('/api', miscRouter);
  return app;
}
