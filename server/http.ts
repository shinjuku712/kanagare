import type { NextFunction, Request, Response } from 'express';

/** Throwing this anywhere in a handler produces `{ error }` with the given status. */
export class HttpError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export const badRequest = (msg: string) => new HttpError(400, msg);
export const notFound = (msg = 'Not found') => new HttpError(404, msg);
export const forbidden = (msg: string) => new HttpError(403, msg);

/** Central error handler: every error goes out as `{ "error": "..." }`. */
export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction) {
  if (err instanceof HttpError) {
    res.status(err.status).json({ error: err.message });
    return;
  }
  // body-parser rejects oversized bodies with its own typed error; turn that
  // into the same {error} contract instead of a bare 500.
  const e = err as { type?: string; status?: number; statusCode?: number; limit?: number };
  if (e?.type === 'entity.too.large') {
    const limit = e.limit ? `${Math.floor(e.limit / 1024 / 1024)} MB` : 'the limit';
    res.status(413).json({ error: `File too large (max ${limit})` });
    return;
  }
  console.error('[error]', err);
  res.status(500).json({ error: 'Internal server error' });
}

/** Coerce a route param to a positive integer or 404. */
export function idParam(req: Request, name = 'id'): number {
  const raw = req.params[name];
  const n = Number(raw);
  if (!Number.isInteger(n) || n <= 0) throw notFound();
  return n;
}

/** `body.field` as trimmed string, or undefined when absent. */
export function optionalString(body: Record<string, unknown>, field: string): string | undefined {
  const v = body?.[field];
  if (v === undefined || v === null) return undefined;
  return String(v);
}

/**
 * `body.field` as a hex colour, '' for none, or undefined when absent. Colours
 * end up in inline styles, so anything else (like `url(...)`) is refused.
 */
export function optionalColor(body: Record<string, unknown>, field: string): string | undefined {
  const v = optionalString(body, field)?.trim();
  if (v === undefined || v === '') return v;
  if (!/^#(?:[0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(v)) throw badRequest(`${field} must be a hex colour like #7c6ef6`);
  return v;
}

export function requiredTrimmed(body: Record<string, unknown>, field: string, errMsg: string): string {
  const v = optionalString(body, field)?.trim();
  if (!v) throw badRequest(errMsg);
  return v;
}
