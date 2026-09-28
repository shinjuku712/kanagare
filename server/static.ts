import path from 'node:path';
import express, { Router } from 'express';
import { config } from './config.ts';
import { manifestJson, SERVICE_WORKER_HEADERS, SERVICE_WORKER_JS } from './pwa.ts';

export const staticRouter = Router();

// --- PWA manifest ---
staticRouter.get('/manifest.webmanifest', (_req, res) => {
  res.type('application/manifest+json').send(manifestJson(config.appName, config.appDescription));
});

// --- Icons ---
staticRouter.use('/icons', express.static(config.iconsDir, { maxAge: '7d' }));
staticRouter.get('/apple-touch-icon.png', (_req, res) => res.sendFile(path.join(config.iconsDir, 'apple-touch-icon.png')));
staticRouter.get('/apple-touch-icon-precomposed.png', (_req, res) =>
  res.sendFile(path.join(config.iconsDir, 'apple-touch-icon.png')),
);

// --- Service worker ---
staticRouter.get('/sw.js', (_req, res) => {
  res.type('application/javascript').set(SERVICE_WORKER_HEADERS).send(SERVICE_WORKER_JS);
});

// --- Built web app ---
// Vite emits content-hashed files under /assets — cache them hard.
staticRouter.use(
  '/assets',
  express.static(path.join(config.webDistDir, 'assets'), { immutable: true, maxAge: '1y' }),
);

// Runs before first paint to apply the saved theme (see web/public/theme.js).
staticRouter.get('/theme.js', (_req, res) => {
  res.set('Cache-Control', 'no-cache');
  res.sendFile(path.join(config.webDistDir, 'theme.js'));
});

// The app shell. Client-side routes that also need it are listed below.
staticRouter.get('/', (_req, res) => {
  res.set('Cache-Control', 'no-cache');
  res.sendFile(path.join(config.webDistDir, 'index.html'));
});

/**
 * Client-side routes that must serve the SPA shell on a hard refresh or a
 * pasted link. Listed explicitly rather than using a catch-all so that a typo'd
 * asset path or an unknown /api route still 404s honestly instead of returning
 * HTML with a 200.
 */
staticRouter.get('/card/:id', (req, res, next) => {
  // Digits only — /card/abc should 404 rather than serve the app shell.
  if (!/^\d+$/.test(req.params.id ?? '')) return next();
  res.set('Cache-Control', 'no-cache');
  res.sendFile(path.join(config.webDistDir, 'index.html'));
});
