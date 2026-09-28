#!/usr/bin/env node
/**
 * Build and deploy one Cloudflare instance.
 *
 *   node scripts/cf-deploy.mjs <instance-dir> [--dry-run] [extra wrangler args…]
 *
 * An instance directory holds a wrangler.jsonc (start from
 * worker/wrangler.example.jsonc) and, optionally, brand/ with brand.json,
 * logo.svg and icons/. The web app is built into <instance-dir>/dist with that
 * branding, the icons are copied alongside, then wrangler deploys it.
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { SECURITY_HEADERS } from '../server/headers.ts';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const [instance, ...rest] = process.argv.slice(2);
if (!instance || !fs.existsSync(path.join(instance, 'wrangler.jsonc'))) {
  console.error('usage: node scripts/cf-deploy.mjs <instance-dir> — the directory must contain wrangler.jsonc');
  process.exit(1);
}
const dir = path.resolve(instance);
const dist = path.join(dir, 'dist');
const brandDir = path.join(dir, 'brand');

// NODE_ENV is baked into the Worker bundle, and anything but "development"
// makes the session cookie HTTPS-only. Never ship a dev build by accident.
const env = { ...process.env, OUT_DIR: dist, NODE_ENV: 'production' };
if (fs.existsSync(path.join(brandDir, 'brand.json'))) env.BRAND_DIR = brandDir;
else delete env.BRAND_DIR;

const run = (cmd, args) => execFileSync(cmd, args, { cwd: root, env, stdio: 'inherit' });

run('npx', ['vite', 'build']);
fs.cpSync(path.join(root, 'icons'), path.join(dist, 'icons'), { recursive: true });
if (fs.existsSync(path.join(brandDir, 'icons'))) {
  fs.cpSync(path.join(brandDir, 'icons'), path.join(dist, 'icons'), { recursive: true });
}

// Headers for static asset responses (the Worker never sees those requests).
fs.writeFileSync(
  path.join(dist, '_headers'),
  `/*
${Object.entries(SECURITY_HEADERS)
  .map(([k, v]) => `  ${k}: ${v}`)
  .join('\n')}
/assets/*
  Cache-Control: public, max-age=31536000, immutable
/icons/*
  Cache-Control: public, max-age=604800
`,
);

run('npx', ['wrangler', 'deploy', '-c', path.join(dir, 'wrangler.jsonc'), ...rest]);
