#!/usr/bin/env node
/**
 * Render the PWA icons from the SVG logo.
 *
 *   node scripts/gen-icons.mjs [logo.svg] [logo-maskable.svg] [out-dir]
 *
 * Defaults to scripts/logo.svg, scripts/logo-maskable.svg and icons/. Point it
 * at a deploy/<name>/brand/ folder to make icons for a rebranded instance.
 */
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';

const [logo = 'scripts/logo.svg', maskable = 'scripts/logo-maskable.svg', out = 'icons'] = process.argv.slice(2);
fs.mkdirSync(out, { recursive: true });

const svg = fs.readFileSync(logo, 'utf8');
// iOS rounds the corners itself and fills transparency with black, so the
// apple-touch icon is the logo as a plain square.
const square = svg.replace(/(<rect\b[^>]*?)\s+rx="[^"]*"/, '$1');

const render = (source, size, file) =>
  sharp(Buffer.from(source), { density: 300 }).resize(size, size).png().toFile(path.join(out, file));

await render(svg, 192, 'icon-192.png');
await render(svg, 512, 'icon-512.png');
await render(fs.readFileSync(maskable, 'utf8'), 512, 'icon-512-maskable.png');
await render(square, 180, 'apple-touch-icon.png');
console.log(`icons written to ${out}/`);
