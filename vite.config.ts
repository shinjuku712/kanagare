import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DEFAULT_DESCRIPTION, DEFAULT_NAME } from './shared/defaults.ts';

const root = path.dirname(fileURLToPath(import.meta.url));

/**
 * Optional instance branding. BRAND_DIR points at a directory holding
 * brand.json ({ name, shortName?, description? }) and optionally logo.svg,
 * which replaces the built-in mark in the UI and the favicon. Unset, the build
 * is plain Kanagare.
 */
function loadBrand() {
  const dir = process.env.BRAND_DIR && path.resolve(process.env.BRAND_DIR);
  const json = dir ? JSON.parse(fs.readFileSync(path.join(dir, 'brand.json'), 'utf8')) : {};
  const logoFile = dir && path.join(dir, 'logo.svg');
  const logo =
    logoFile && fs.existsSync(logoFile)
      ? `data:image/svg+xml;base64,${fs.readFileSync(logoFile).toString('base64')}`
      : null;
  const name: string = json.name ?? DEFAULT_NAME;
  return {
    name,
    shortName: (json.shortName as string | undefined) ?? name,
    description: (json.description as string | undefined) ?? DEFAULT_DESCRIPTION,
    logo,
  };
}

const brand = loadBrand();
const escapeAttr = (s: string) => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');

const brandHtml: Plugin = {
  name: 'brand-html',
  transformIndexHtml(html) {
    html = html
      .replace(/<title>.*?<\/title>/, `<title>${escapeAttr(brand.name)}</title>`)
      .replace(/(<meta name="description" content=")[^"]*/, `$1${escapeAttr(brand.description)}`)
      .replace(/(<meta name="apple-mobile-web-app-title" content=")[^"]*/, `$1${escapeAttr(brand.shortName)}`);
    if (brand.logo) html = html.replace(/(<link rel="icon" type="image\/svg\+xml" href=")[^"]*/, `$1${brand.logo}`);
    return html;
  },
};

export default defineConfig({
  root: path.join(root, 'web'),
  plugins: [react(), brandHtml],
  define: {
    __BRAND__: JSON.stringify({ name: brand.name, shortName: brand.shortName, logo: brand.logo }),
  },
  resolve: {
    alias: { '@shared': path.join(root, 'shared') },
  },
  build: {
    outDir: process.env.OUT_DIR ? path.resolve(process.env.OUT_DIR) : path.join(root, 'web', 'dist'),
    emptyOutDir: true,
    target: 'es2022',
  },
  server: {
    port: 5174,
    proxy: Object.fromEntries(
      ['/api', '/manifest.webmanifest', '/sw.js', '/icons', '/apple-touch-icon.png'].map((p) => [p, 'http://127.0.0.1:3999']),
    ),
  },
});
