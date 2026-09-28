#!/usr/bin/env node
/**
 * Rough end-to-end smoke test against a running dev server (see CONTRIBUTING).
 * Clicks through the main screens, saves screenshots, and exits non-zero if a
 * step fails or the page logs an error.
 *
 *   BASE, CHROME_PATH, SHOT_DIR, TEST_EMAIL, TEST_PASSWORD override the defaults.
 */
import fs from 'node:fs';
import puppeteer from 'puppeteer-core';

const BASE = process.env.BASE || 'http://127.0.0.1:3999';
const SHOT = process.env.SHOT_DIR || '/tmp/kanagare-shots';
const EMAIL = process.env.TEST_EMAIL || 'dev@example.com';
const PASSWORD = process.env.TEST_PASSWORD || 'devpassword';
fs.mkdirSync(SHOT, { recursive: true });

const browser = await puppeteer.launch({
  executablePath: process.env.CHROME_PATH || '/usr/bin/chromium',
  headless: true,
  args: ['--no-sandbox', '--disable-dev-shm-usage', '--window-size=1600,1000'],
});
const page = await browser.newPage();
await page.setViewport({ width: 1600, height: 1000 });

const errors = [];
page.on('console', (msg) => {
  if (msg.type() === 'error') errors.push('console: ' + msg.text());
});
page.on('pageerror', (err) => errors.push('pageerror: ' + err.message));
page.on('requestfailed', (req) => errors.push('reqfail: ' + req.url() + ' ' + req.failure()?.errorText));

let failed = 0;
const step = async (name, fn) => {
  try {
    await fn();
    console.log('OK  ' + name);
  } catch (e) {
    failed++;
    console.log('FAIL ' + name + ': ' + e.message);
    await page.screenshot({ path: `${SHOT}/FAIL-${name.replace(/\W+/g, '_')}.png` });
  }
};
const shot = (name) => page.screenshot({ path: `${SHOT}/${name}.png` });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// --- login page ---
await step('load login', async () => {
  await page.goto(BASE, { waitUntil: 'networkidle0' });
  await page.waitForSelector('.login-box', { timeout: 5000 });
  await shot('01-login');
});

await step('login', async () => {
  await page.type('input[type=email]', EMAIL);
  await page.type('input[type=password]', PASSWORD);
  await page.click('button[type=submit]');
  await page.waitForSelector('.board', { timeout: 5000 });
  await sleep(700);
  await shot('02-board');
});

await step('project switcher', async () => {
  await page.click('.proj-switch');
  await page.waitForSelector('.popover', { timeout: 3000 });
  await shot('03-switcher');
  await page.keyboard.press('Escape');
  await sleep(200);
});

await step('composer quick add', async () => {
  await page.click('.col-add');
  await page.waitForSelector('.composer textarea', { timeout: 3000 });
  await page.type('.composer textarea', 'Browser-test card ' + Date.now());
  await page.keyboard.press('Enter');
  await sleep(600);
  await page.keyboard.press('Escape');
  await shot('05-after-add');
});

await step('open card detail', async () => {
  await page.click('.card');
  await page.waitForSelector('.detail', { timeout: 3000 });
  await sleep(300);
  await shot('04-detail');
  await page.keyboard.press('Escape');
  await sleep(300);
});

await step('drag card', async () => {
  const card = await page.$('.card');
  const cols = await page.$$('.col');
  if (!card || cols.length < 2) throw new Error('need card + 2 columns');
  const cbox = await card.boundingBox();
  const tbox = await cols[1].boundingBox();
  await page.mouse.move(cbox.x + cbox.width / 2, cbox.y + 20);
  await page.mouse.down();
  await page.mouse.move(cbox.x + cbox.width / 2 + 30, cbox.y + 60, { steps: 5 });
  await sleep(100);
  await shot('06-dragging-start');
  await page.mouse.move(tbox.x + tbox.width / 2, tbox.y + 60, { steps: 20 });
  await sleep(150);
  await shot('06-dragging');
  await page.mouse.up();
  await sleep(700);
  await shot('07-after-drag');
});

await step('search overlay', async () => {
  await page.keyboard.down('Control');
  await page.keyboard.press('k');
  await page.keyboard.up('Control');
  await page.waitForSelector('.search-box', { timeout: 3000 });
  await page.type('.search-input-row input', 'test');
  await sleep(500);
  await shot('08-search');
  await page.keyboard.press('Escape');
  await sleep(200);
});

await step('today panel', async () => {
  await page.keyboard.press('t');
  await page.waitForSelector('.today-panel', { timeout: 3000 });
  await sleep(300);
  await shot('09-today');
  await page.keyboard.press('Escape');
  await sleep(200);
});

await step('filter menu', async () => {
  const chips = await page.$$('.topbar-right .chip');
  let filter = null;
  for (const c of chips) if ((await c.evaluate((el) => el.textContent)).startsWith('Filter')) filter = c;
  if (!filter) throw new Error('no Filter chip (the board needs cards)');
  await filter.click();
  await page.waitForSelector('.popover', { timeout: 3000 });
  await shot('10-filter');
  await page.keyboard.press('Escape');
  await sleep(200);
});

await step('user menu + admin', async () => {
  await page.click('.topbar-right .chip:last-child');
  await page.waitForSelector('.popover', { timeout: 3000 });
  await shot('11-usermenu');
  const items = await page.$$('.menu-item');
  for (const it of items) {
    const txt = await it.evaluate((el) => el.textContent);
    if (txt.includes('Manage users')) {
      await it.click();
      break;
    }
  }
  await page.waitForSelector('.admin-modal', { timeout: 3000 });
  await sleep(300);
  await shot('12-admin');
});

await step('admin add + delete user', async () => {
  await page.type('.admin-modal input[type=email]', 'browser-test@test.local');
  await page.type('.admin-modal input[type=password]', 'password12345');
  await page.click('.admin-modal button[type=submit]');
  await sleep(600);
  const rows = await page.$$('.user-row');
  let found = false;
  for (const row of rows) {
    const txt = await row.evaluate((el) => el.textContent);
    if (txt.includes('browser-test@test.local')) {
      found = true;
      const del = await row.$('.icon-btn.danger');
      await del.click();
      break;
    }
  }
  if (!found) throw new Error('created user not in list');
  await sleep(300);
  await shot('13-delete-confirm');
  // confirm dialog
  const btns = await page.$$('.modal button');
  for (const b of btns) {
    const txt = await b.evaluate((el) => el.textContent);
    if (txt.trim() === 'Delete') {
      await b.click();
      break;
    }
  }
  await sleep(600);
  const stillThere = await page.evaluate(() =>
    [...document.querySelectorAll('.user-row')].some((r) => r.textContent.includes('browser-test@test.local')),
  );
  if (stillThere) throw new Error('user still present after delete');
  await shot('14-after-delete');
  await page.keyboard.press('Escape');
});

await step('light theme', async () => {
  await page.evaluate(() => {
    document.documentElement.dataset.theme = 'light';
  });
  await sleep(300);
  await shot('15-light');
  await page.evaluate(() => {
    document.documentElement.dataset.theme = 'dark';
  });
});

await step('mobile viewport', async () => {
  await page.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true });
  await sleep(500);
  await shot('16-mobile');
});

console.log(errors.length ? '\nERRORS:\n' + errors.join('\n') : '\nNo page errors.');
await browser.close();
process.exitCode = failed || errors.length ? 1 : 0;
