import { DurableObject } from 'cloudflare:workers';
import { httpServerHandler } from 'cloudflare:node';
import { createApp } from '../server/app.ts';
import { useBlobStore } from '../server/blobs.ts';
import { migrate, seed, useDatabase } from '../server/db.ts';
import { errorHandler } from '../server/http.ts';
import { manifestJson, SERVICE_WORKER_HEADERS, SERVICE_WORKER_JS } from '../server/pwa.ts';
import { DEFAULT_DESCRIPTION, DEFAULT_NAME } from '../shared/defaults.ts';
import { SECURITY_HEADERS } from '../server/headers.ts';
import { ensureBlobTable, sqliteBlobStore } from './blobs.ts';
import { restore } from './restore.ts';
import { bindStorage, doDatabase } from './sqlite.ts';

/**
 * Kanagare on Cloudflare Workers.
 *
 * The built web app is served by Workers static assets and never reaches this
 * code. Everything under /api runs in a single Durable Object ("main"), which
 * owns the SQLite database — the same Express app as the Node server, over the
 * DO's synchronous SQLite (worker/sqlite.ts). One object means one writer, the
 * same concurrency model as a single Node process.
 */

export interface Env {
  BOARD: DurableObjectNamespace<Board>;
  ASSETS: Fetcher;
  APP_NAME?: string;
  APP_DESCRIPTION?: string;
  /** Set only while restoring a backup — see worker/restore.ts. */
  RESTORE_TOKEN?: string;
}

useDatabase(doDatabase);
useBlobStore(sqliteBlobStore);

const app = createApp();
app.use(errorHandler);
// Not a real socket: httpServerHandler routes requests to whatever listens on this port.
const PORT = 3463;
app.listen(PORT);
const api = httpServerHandler({ port: PORT });

export class Board extends DurableObject<Env> {
  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    bindStorage(ctx.storage);
    ctx.blockConcurrencyWhile(async () => {
      migrate();
      ensureBlobTable();
      seed();
    });
  }

  async fetch(request: Request): Promise<Response> {
    if (new URL(request.url).pathname.startsWith('/__restore/')) return restore(request, this.env);
    return api.fetch!(request as Request<unknown, IncomingRequestCfProperties>, this.env, this.ctx as never);
  }
}

/** Fill in the security headers a response doesn't set itself (files set a stricter CSP). */
function secured(res: Response): Response {
  const out = new Response(res.body, res);
  for (const [k, v] of Object.entries(SECURITY_HEADERS)) if (!out.headers.has(k)) out.headers.set(k, v);
  return out;
}

export default {
  async fetch(request, env) {
    return secured(await route(request, env));
  },
} satisfies ExportedHandler<Env>;

async function route(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const path = url.pathname;

  if (path.startsWith('/api/') || path.startsWith('/__restore/')) {
    return env.BOARD.getByName('main').fetch(request);
  }
  if (path === '/manifest.webmanifest') {
    return new Response(
      manifestJson(env.APP_NAME || DEFAULT_NAME, env.APP_DESCRIPTION || DEFAULT_DESCRIPTION),
      { headers: { 'Content-Type': 'application/manifest+json' } },
    );
  }
  if (path === '/sw.js') {
    return new Response(SERVICE_WORKER_JS, {
      headers: { 'Content-Type': 'application/javascript', ...SERVICE_WORKER_HEADERS },
    });
  }
  if (path === '/apple-touch-icon.png' || path === '/apple-touch-icon-precomposed.png') {
    return env.ASSETS.fetch(new URL('/icons/apple-touch-icon.png', url));
  }
  // Client-side route: serve the SPA shell on a hard refresh or a pasted link.
  // Digits only — anything else should 404 honestly rather than return HTML.
  if (/^\/card\/\d+$/.test(path)) {
    const shell = await env.ASSETS.fetch(new URL('/', url));
    const res = new Response(shell.body, shell);
    res.headers.set('Cache-Control', 'no-cache');
    return res;
  }
  return new Response('Not found', { status: 404 });
}
