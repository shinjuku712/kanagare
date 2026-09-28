import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DEFAULT_DESCRIPTION, DEFAULT_NAME } from '../shared/defaults.ts';

// import.meta.url is undefined in the Cloudflare bundle, which reads none of the paths below.
const __dirname = import.meta.url ? path.dirname(fileURLToPath(import.meta.url)) : '/';

const ROOT_DIR = path.resolve(__dirname, '..');

export const config = {
  port: Number(process.env.PORT) || 3463,
  /** Shown as the installed app's name (PWA manifest). The web UI's name is set at build time — see BRAND_DIR. */
  appName: process.env.APP_NAME || DEFAULT_NAME,
  appDescription: process.env.APP_DESCRIPTION || DEFAULT_DESCRIPTION,
  dbPath: process.env.DB_PATH || path.join(ROOT_DIR, 'kanagare.db'),
  cookieName: process.env.COOKIE_NAME || 'kanagare_session',
  isProd: process.env.NODE_ENV !== 'development',
  adminEmail: process.env.ADMIN_EMAIL,
  adminPassword: process.env.ADMIN_PASSWORD,
  /** Server-side session lifetime. */
  sessionTtlMs: 30 * 24 * 60 * 60 * 1000,
  /** Browser cookie lifetime (server TTL wins). */
  cookieMaxAgeMs: 365 * 24 * 60 * 60 * 1000,
  webDistDir: path.join(ROOT_DIR, 'web', 'dist'),
  iconsDir: path.join(ROOT_DIR, 'icons'),
  /** Where uploaded files are written. Not in the DB — see docs on backups. */
  uploadsDir: process.env.UPLOADS_DIR || path.join(ROOT_DIR, 'uploads'),
  /** Hard cap per file. nginx's client_max_body_size must be >= this. */
  maxUploadBytes: Number(process.env.MAX_UPLOAD_BYTES) || 25 * 1024 * 1024,
} as const;

/**
 * Accepted upload types. An allowlist rather than a blocklist: anything not
 * named here is refused, so a new browser-executable type can't sneak in.
 * Notably absent: text/html and svg — both execute script when opened, and
 * these files are served from the app's own origin.
 */
export const ALLOWED_UPLOAD_MIME: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/gif': 'gif',
  'image/webp': 'webp',
  'image/avif': 'avif',
  'application/pdf': 'pdf',
  'text/plain': 'txt',
  'text/csv': 'csv',
  'text/markdown': 'md',
  'application/json': 'json',
  'application/zip': 'zip',
  'application/msword': 'doc',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
  'application/vnd.ms-excel': 'xls',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
  'application/vnd.oasis.opendocument.spreadsheet': 'ods',
  'application/vnd.oasis.opendocument.text': 'odt',
  'application/vnd.ms-powerpoint': 'ppt',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': 'pptx',
};
