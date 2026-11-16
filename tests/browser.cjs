const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { chromium } = require(process.env.WCPEC_PLAYWRIGHT_MODULE || 'playwright');

const base = process.env.WCPEC_TEST_URL || 'http://localhost:8000/';
const subpath = process.env.WCPEC_SUBPATH_URL;
const output = process.env.WCPEC_TEST_OUTPUT || 'test-results';
const executablePath = process.env.CHROMIUM_PATH;
const launchModule = process.env.WCPEC_CHROMIUM_MODULE;
const dataset = require('../data/programme.json');
const monday = '2026-11-16';
const storageKey = 'wcpec9:agenda:v1';

async function noOverflow(page) {
  assert(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), 'Horizontal page overflow');
}

async function switchView(page, name) {
  await page.locator(`[data-view="${name}"]`).click();
  await page.locator(`[data-view="${name}"][aria-current=page]`).waitFor();
}

async function search(page, value) {
  await page.getByRole('searchbox').fill(value);
}

async function save(page, code) {
  await search(page, code);
  await page.locator(`[data-save="${monday}-${code}"]`).click();
}

async function verifyPng(page, label, name) {
  const expected = await page.locator('.card-preview canvas').evaluate((canvas) => canvas.toDataURL('image/png').split(',')[1]);
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: label, exact: true }).click()]);
  assert.equal(download.suggestedFilename(), name);
  const file = path.join(output, name);
  await download.saveAs(file);
  const buffer = await fs.readFile(file);
  assert.equal(buffer.subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
  assert.equal(buffer.readUInt32BE(16), 1080);
  assert(buffer.equals(Buffer.from(expected, 'base64')), 'Downloaded PNG pixels must match live canvas preview');
  return buffer.readUInt32BE(20);
}

async function functional(browser) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, acceptDownloads: true });
  const page = await context.newPage();
  const errors = [];
  const requests = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
  page.on('request', (request) => requests.push(request.url()));
  await page.goto(base);
  await page.getByRole('button', { name: /Mon,? 16 Nov/ }).click();
  await page.locator('.timetable').waitFor();
  const loadMs = await page.evaluate(() => {
    const file = performance.getEntriesByType('resource').find((entry) => entry.name.endsWith('/data/programme.json'));
    return Math.round(file.duration);
  });
  await page.screenshot({ path: path.join(output, 'desktop.png') });
  const session = page.locator('.timetable').getByRole('button', { name: /2AO\.1/ });
  await session.click();
  await page.getByRole('dialog').getByRole('button', { name: /Machine Learning Applications/ }).first().click();
  assert.match(await page.locator('#detail-content').innerText(), /Chenyun Pan, Xuefeng Han, Shuai Yuan, Xuegong Yu, Deren Yang/);
  assert.match(await page.locator('#detail-content').innerText(), /Session Room 1\(101-102\)/);
  await page.getByRole('button', { name: /Add to My Agenda:/ }).click();
  await page.getByRole('button', { name: '← Session' }).click();
  assert.equal(await page.locator('#detail-content [data-save$="2AO.1-OP-3"]').getAttribute('aria-pressed'), 'true');
  await page.keyboard.press('Escape');
  await page.getByRole('dialog').waitFor({ state: 'hidden' });
  assert(await session.evaluate((node) => node === document.activeElement));
  await page.getByRole('button', { name: 'Switch to list view' }).click();
  assert.equal(await page.locator('.timetable').count(), 0);
  await page.getByRole('button', { name: 'Switch to room timetable' }).click();
  await switchView(page, 'explore');
  const searchMs = await page.evaluate(() => {
    const start = performance.now();
    const input = document.querySelector('.query');
    input.value = 'xuefeng han machine learning';
    input.dispatchEvent(new Event('input'));
    return Math.round(performance.now() - start);
  });
  await page.locator('select[name="track"]').selectOption('Silicon Solar PV Technology');
  await page.locator('select[name="type"]').selectOption('oral');
  await page.locator('select[name="date"]').selectOption(monday);
  await page.locator('select[name="room"]').selectOption('Session Room 1(101-102)');
  assert.equal(await page.locator('.talk-row').count(), 1);
  assert.equal(await page.locator('.talk-row .save-button').getAttribute('aria-pressed'), 'true');
  await page.locator('select[name="type"]').selectOption('poster');
  await page.getByRole('heading', { name: 'No presentations found' }).waitFor();
  await switchView(page, 'agenda');
  await switchView(page, 'explore');
  assert.equal(await page.getByRole('searchbox').inputValue(), 'xuefeng han machine learning');
  assert.equal(await page.locator('select[name="type"]').inputValue(), 'poster');
  for (const filter of ['type', 'date', 'track', 'room']) await page.locator(`select[name="${filter}"]`).selectOption('');
  await save(page, '2AO.1-OP-4');
  await switchView(page, 'agenda');
  assert.equal(await page.getByText('Time overlap', { exact: true }).count(), 0);
  await verifyPng(page, 'Download PNG', 'WCPEC9-Agenda-2026-11-16.png');
  await page.reload();
  await page.locator('.agenda-layout').waitFor();
  assert.equal(await page.locator('.talk-row').count(), 2);
  await switchView(page, 'explore');
  await save(page, '3AO.1-IV-2');
  await save(page, '2-1-AP-01');
  await save(page, '2-1-AP-02');
  await switchView(page, 'agenda');
  assert.equal(await page.getByText('Time overlap', { exact: true }).count(), 2);
  const times = await page.locator('.talk-location').allTextContents();
  assert.deepEqual(times, [...times].sort());
  assert.equal(times.filter((value) => value.includes('18:00–19:00')).length, 2);
  await page.locator('[data-save$="3AO.1-IV-2"]').click();
  assert.equal(await page.getByText('Time overlap', { exact: true }).count(), 0);
  await page.getByRole('button', { name: 'Clear My Agenda' }).click();
  await page.getByRole('button', { name: 'Cancel' }).click();
  assert.equal(await page.locator('.talk-row').count(), 4);
  await page.getByRole('button', { name: 'Clear My Agenda' }).click();
  await page.getByRole('button', { name: 'Clear agenda', exact: true }).click();
  await page.getByRole('heading', { name: 'Your agenda is empty for this day' }).waitFor();
  assert.deepEqual(await page.evaluate((key) => JSON.parse(localStorage.getItem(key)), storageKey), []);
  const origin = new URL(base).origin;
  assert(requests.every((request) => new URL(request).origin === origin), 'Unexpected external asset request');
  assert.deepEqual(errors, []);
  console.log(`Local JSON transfer ${loadMs} ms; a full-dataset keyword query and render ${searchMs} ms.`);
  await context.close();
}

async function denseCards(browser) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, acceptDownloads: true });
  const page = await context.newPage();
  const dense = dataset.presentations.filter((item) => item.date === monday && item.type === 'poster')
    .sort((a, b) => b.title.length - a.title.length).slice(0, 20);
  await page.addInitScript(({ key, ids }) => {
    if (localStorage.getItem(key) === null) localStorage.setItem(key, JSON.stringify(ids));
  }, { key: storageKey, ids: [...dense.map((item) => item.id), 'removed-record'] });
  await page.goto(base + '#agenda');
  await page.getByRole('heading', { name: 'Daily agenda card' }).waitFor();
  await page.screenshot({ path: path.join(output, 'mobile-agenda.png'), fullPage: true });
  await noOverflow(page);
  assert.equal(await page.locator('.talk-row').count(), dense.length);
  const partCount = Number((await page.locator('.pagination span').textContent()).split(' of ')[1]);
  assert(partCount > 1);
  let total = 0;
  for (let part = 1; part <= partCount; part++) {
    const canvas = page.locator('.card-preview canvas');
    const label = await canvas.getAttribute('aria-label');
    total += Number(label.match(/(\d+) presentations\.$/)[1]);
    const suffix = String(part).padStart(2, '0');
    const height = await verifyPng(page, `Download part ${part} PNG`, `WCPEC9-Agenda-2026-11-16-part-${suffix}.png`);
    assert(height < 1770, 'Card height should stay within the phone-friendly limit');
    if (part < partCount) await page.getByRole('button', { name: 'Next', exact: true }).click();
  }
  assert.equal(total, dense.length);
  if (partCount > 1) {
    for (let part = partCount; part > 1; part--) await page.getByRole('button', { name: 'Previous', exact: true }).click();
  }
  const bulk = [];
  page.on('download', (download) => bulk.push(download.suggestedFilename()));
  await page.getByRole('button', { name: 'Download all PNGs' }).click();
  await page.getByText('Download requests sent.', { exact: false }).waitFor();
  assert.equal(new Set(bulk).size, partCount);
  // Inspect draw calls separately from pixels to check that the renderer carries
  // exact selected text, including scientific Unicode, into each card.
  const rendered = await page.evaluate(async ({ ids }) => {
    const { agendaCards } = await import('./js/export.js');
    const { loadProgramme, chronological } = await import('./js/programme.js');
    const programme = await loadProgramme();
    const texts = new Map();
    const original = CanvasRenderingContext2D.prototype.fillText;
    CanvasRenderingContext2D.prototype.fillText = function (value, x, y) {
      if (!texts.has(this.canvas)) texts.set(this.canvas, []);
      texts.get(this.canvas).push({ value, x, y, width: this.measureText(value).width });
      return original.call(this, value, x, y);
    };
    const items = ids.map((id) => programme.talkById.get(id)).sort(chronological);
    const canvases = agendaCards(items[0].date, items, programme.sessionById).map((card) => card());
    return canvases.map((canvas) => ({ height: canvas.height, words: texts.get(canvas) }));
  }, { ids: dense.map((item) => item.id) });
  const strings = rendered.flatMap((card) => card.words.map((word) => word.value));
  for (const item of dense) {
    assert(strings.includes(item.code));
    assert(strings.join(' ').includes(item.title), `Missing or clipped title for ${item.code}`);
  }
  assert(strings.includes('DCC 2, Exhibition Hall'));
  assert(strings.includes('18:00–19:00 · Poster window'));
  for (const card of rendered) {
    assert(card.words.every((word) => word.y < card.height && word.width < 940));
  }
  await context.close();
}

async function layout(browser, width, height) {
  const context = await browser.newContext({ viewport: { width, height }, isMobile: width < 500, hasTouch: width < 500 });
  const page = await context.newPage();
  await page.goto(base);
  await page.getByRole('button', { name: /Mon,? 16 Nov/ }).click();
  const cards = page.locator('.session-card:visible');
  await cards.first().waitFor();
  await noOverflow(page);
  if (width === 390) await page.screenshot({ path: path.join(output, 'mobile.png') });
  await cards.first().click();
  await page.getByRole('dialog').waitFor();
  await noOverflow(page);
  await page.getByRole('button', { name: 'Close details' }).click();
  for (const view of ['explore', 'agenda']) {
    await switchView(page, view);
    await noOverflow(page);
  }
  await context.close();
}

async function reliability(browser) {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.addInitScript(() => {
    Object.defineProperty(window, 'localStorage', {
      get() { throw new DOMException('Blocked', 'SecurityError'); },
    });
  });
  await page.goto(base + '#explore');
  await page.getByText('Browser storage is unavailable.', { exact: false }).waitFor();
  await save(page, '2AO.1-OP-3');
  await switchView(page, 'agenda');
  await page.locator('.agenda-layout').waitFor();
  await page.close();

  const corrupt = await context.newPage();
  await corrupt.addInitScript((key) => localStorage.setItem(key, '{broken'), storageKey);
  await corrupt.goto(base + '#agenda');
  await corrupt.getByRole('heading', { name: 'Your agenda is empty for this day' }).waitFor();
  await corrupt.close();

  const failed = await context.newPage();
  await failed.route('**/data/programme.json', (route) => route.fulfill({ status: 503, body: '' }));
  await failed.goto(base);
  await failed.getByRole('heading', { name: 'Programme could not be loaded' }).waitFor();
  await failed.close();

  if (subpath) {
    const project = await context.newPage();
    await project.goto(subpath + '#explore');
    await search(project, '5DO.15-OP-3');
    assert.equal(await project.locator('.talk-row').count(), 1);
    await project.close();
  }
}

(async () => {
  await fs.mkdir(output, { recursive: true });
  const alternate = launchModule ? (await import(launchModule)).default : null;
  const options = alternate ? { executablePath: await alternate.executablePath(), args: alternate.args }
    : { executablePath };
  async function run(check) {
    const browser = await chromium.launch(options);
    try {
      await check(browser);
    } finally {
      await browser.close();
    }
  }
  await run(functional);
  await run(denseCards);
  for (const [width, height] of [[375, 812], [390, 844], [430, 932], [768, 1024], [1440, 900]]) {
    await run((browser) => layout(browser, width, height));
  }
  await run(reliability);
  console.log('Passed Chromium functionality, storage, single and multipart PNGs, and all five layouts.'
    + (subpath ? ' Project-subpath preview passed.' : ' Set WCPEC_SUBPATH_URL to run the project-subpath check.'));
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
