const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const zlib = require('node:zlib');
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

async function openPreview(page) {
  assert.equal(await page.getByRole('button', { name: 'Download PNG' }).count(), 0);
  await page.getByRole('button', { name: 'Preview agenda' }).click();
  const preview = page.getByRole('dialog', { name: 'Agenda card' });
  await preview.locator('canvas').first().waitFor();
  return preview;
}

async function verifyPng(page, name, label, expectedCount) {
  const preview = page.getByRole('dialog', { name: 'Agenda card' });
  const frame = preview.getByRole('img');
  const noun = expectedCount === 1 ? 'presentation' : 'presentations';
  assert((await frame.getAttribute('aria-label')).endsWith(`, ${expectedCount} saved ${noun}`));
  const tiles = frame.locator('canvas');
  const expected = await tiles.count() === 1
    ? await tiles.first().evaluate((canvas) => canvas.toDataURL('image/png').split(',')[1]) : null;
  const downloads = [];
  const record = (file) => downloads.push(file);
  page.on('download', record);
  const [download] = await Promise.all([page.waitForEvent('download', { timeout: 60_000 }), preview.getByRole('button', { name: 'Download PNG' }).click()]);
  assert.equal(download.suggestedFilename(), name);
  const file = path.join(output, label + '-' + name);
  await download.saveAs(file);
  await preview.getByText('PNG download started.').waitFor();
  page.off('download', record);
  assert.equal(downloads.length, 1);
  const buffer = await fs.readFile(file);
  assert.equal(buffer.subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
  const width = buffer.readUInt32BE(16);
  const height = buffer.readUInt32BE(20);
  if (expected) {
    const samePixels = await page.evaluate(async ([first, second]) => {
      const checks = [];
      for (const source of [first, second]) {
        const response = await fetch('data:image/png;base64,' + source);
        const bitmap = await createImageBitmap(await response.blob());
        const canvas = document.createElement('canvas');
        canvas.width = bitmap.width;
        canvas.height = bitmap.height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(bitmap, 0, 0);
        const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
        checks.push(Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', pixels))).join(','));
        bitmap.close();
      }
      return checks[0] === checks[1];
    }, [expected, buffer.toString('base64')]);
    assert(samePixels, 'Downloaded PNG pixels must match the live canvas preview');
  } else {
    const compressed = [];
    for (let i = 8; i < buffer.length;) {
      const size = buffer.readUInt32BE(i);
      const chunk = buffer.toString('ascii', i + 4, i + 8);
      if (chunk === 'IDAT') compressed.push(buffer.subarray(i + 8, i + 8 + size));
      i += size + 12;
    }
    assert.equal(buffer[25], 2, 'Strip PNG must use RGB');
    assert.equal(zlib.inflateSync(Buffer.concat(compressed)).length, (width * 3 + 1) * height);
  }
  console.log(`One PNG for ${expectedCount} talks: ${width}×${height}.`);
  return { width, height };
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
  assert.equal(await page.locator('#navigation a').count(), 2);
  assert.equal(await page.locator('.time-block[open]').count(), 1);
  await page.screenshot({ path: path.join(output, 'desktop.png') });
  const parallel = page.locator('.time-summary').filter({ hasText: '15:00 start' });
  await parallel.click();
  const silicon = page.locator('.time-block[open] .session-card').filter({ hasText: '2AO.1' });
  await silicon.waitFor();
  assert.equal(await silicon.evaluate((element) => getComputedStyle(element).borderLeftColor), 'rgb(53, 132, 108)');
  const perovskite = page.locator('.time-block[open] .session-card').filter({ hasText: '3AO.1' });
  assert.equal(await perovskite.evaluate((element) => getComputedStyle(element).borderLeftColor), 'rgb(173, 102, 59)');
  const loadMs = await page.evaluate(() => {
    const file = performance.getEntriesByType('resource').find((entry) => entry.name.endsWith('/data/programme.json'));
    return Math.round(file.duration);
  });
  await page.screenshot({ path: path.join(output, 'desktop-expanded.png') });
  const session = page.locator('.time-block[open]').getByRole('button', { name: /2AO\.1/ });
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
  await parallel.click();
  assert.equal(await page.locator('.time-block[open] .session-card').filter({ hasText: '2AO.1' }).count(), 0);
  await page.getByRole('button', { name: 'Filters', exact: true }).click();
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
  await switchView(page, 'programme');
  assert.equal(await page.getByRole('searchbox').inputValue(), 'xuefeng han machine learning');
  assert.equal(await page.locator('select[name="type"]').inputValue(), 'poster');
  await page.getByRole('button', { name: 'Clear search and filters' }).click();
  await page.getByRole('group', { name: 'Programme dates' }).waitFor();
  await page.getByRole('button', { name: /Filters/ }).click();
  assert.equal(await page.locator('#programme-filters').isVisible(), false);
  await save(page, '2AO.1-OP-4');
  await switchView(page, 'agenda');
  assert.equal(await page.getByText('Time overlap', { exact: true }).count(), 0);
  const preview = await openPreview(page);
  await verifyPng(page, 'WCPEC9-Agenda-2026-11-16.png', 'short', 2);
  await page.keyboard.press('Escape');
  await preview.waitFor({ state: 'hidden' });
  assert(await page.getByRole('button', { name: 'Preview agenda' }).evaluate((node) => node === document.activeElement));
  await page.reload();
  await page.locator('.agenda-list').waitFor();
  assert.equal(await page.locator('.talk-row').count(), 2);
  await switchView(page, 'programme');
  await save(page, '3AO.1-IV-2');
  await save(page, '2-1-AP-01');
  await save(page, '2-1-AP-02');
  await switchView(page, 'agenda');
  assert.equal(await page.getByText('Time overlap', { exact: true }).count(), 2);
  const times = await page.locator('.agenda-time').allTextContents();
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
  assert.equal(await page.locator('#context-label').innerText(), '15–20 November 2026');
  assert.equal(await page.getByText('Made by Sathya · TU Delft', { exact: true }).count(), 0);
  const origin = new URL(base).origin;
  assert(requests.every((request) => new URL(request).origin === origin), 'Unexpected external asset request');
  assert.deepEqual(errors, []);
  console.log(`Local JSON transfer ${loadMs} ms; a full-dataset keyword query and render ${searchMs} ms.`);
  await context.close();
}

async function calendarFields(browser, { code, authorCount, abbreviated, longTitle = false }) {
  const item = dataset.presentations.find((record) => record.code === code);
  assert.equal(item.authors.length, authorCount);
  const session = dataset.sessions.find((record) => record.id === item.sessionId);
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, acceptDownloads: true,
  });
  const page = await context.newPage();
  await page.addInitScript(({ key, id }) => {
    localStorage.setItem(key, JSON.stringify([id]));
    window.calendarText = [];
    const original = CanvasRenderingContext2D.prototype.fillText;
    CanvasRenderingContext2D.prototype.fillText = function (text, x, y, ...args) {
      window.calendarText.push({ text, x, y, font: this.font });
      return original.call(this, text, x, y, ...args);
    };
  }, { key: storageKey, id: item.id });
  await page.goto(base + '#agenda');
  const preview = await openPreview(page);
  await noOverflow(page);

  const drawn = await page.evaluate(() => window.calendarText);
  const timeIndex = drawn.findIndex(({ text }) => text === `${item.start}–${item.end}`);
  assert(timeIndex >= 0);
  const block = drawn.slice(timeIndex);
  const texts = block.map(({ text }) => text);
  assert.equal(texts[1], code);
  assert(block.every(({ font }) => font.includes('21px ')), 'Every regular block label and value must use the session size');

  const fields = [
    ['Session:', session.title],
    ['Presentation:', item.title],
    ['Authors:', item.authors.join(', ')],
    ['Location:', session.room],
  ];
  for (const [index, [label, value]] of fields.entries()) {
    const start = texts.indexOf(label);
    const end = index + 1 < fields.length ? texts.indexOf(fields[index + 1][0]) : texts.length;
    assert(start >= 0 && end > start, `Missing or out-of-order calendar field ${label}`);
    const lines = texts.slice(start + 1, end).filter(Boolean);
    if (label === 'Authors:') {
      assert.equal(end, start + 2, 'Authors must occupy one visual line');
      const names = block[start + 1];
      assert.equal(names.y, block[start].y, 'Names must share the label baseline');
      const candidates = [value, ...item.authors.slice(0, -1).map((_, index) =>
        item.authors.slice(0, index + 1).join(', ') + ', et al.').reverse(), 'et al.'];
      const available = block[1].x - names.x;
      const expected = await page.evaluate(({ font, candidates, available }) => {
        const ctx = document.createElement('canvas').getContext('2d');
        ctx.font = font;
        return candidates.find((text) => ctx.measureText(text).width <= available);
      }, { font: names.font, candidates, available });
      assert.equal(names.text, expected, 'Show the longest whole-name prefix that fits');
      assert.equal(names.text.endsWith('et al.'), abbreviated);
    } else {
      assert.equal(lines.join(' '), value.replace(/\s+/g, ' '));
      if (longTitle && label === 'Presentation:') assert(lines.length > 1, 'Long titles must wrap');
    }
  }

  await verifyPng(page, `WCPEC9-Agenda-${item.date}.png`, code, 1);
  await preview.getByRole('button', { name: 'Close', exact: true }).click();
  await page.locator('.agenda-list .talk-open').click();
  assert.equal(await page.locator('#detail-content .authors').textContent(), item.authors.join(', '));
  await context.close();
}

async function calendarStress(browser, selection) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, acceptDownloads: true });
  const page = await context.newPage();
  const day = '2026-11-17';
  const all = dataset.presentations.filter((item) => item.date === day);
  const previewCodes = [
    '2BO.3-IV-1', '4BO.3-OP-2', '2BO.3-OP-3', '4BO.3-OP-3', '2BO.4-KN-1',
    '2BO.4-OP-3', 'Pl.2', '5BO.5-KN-1', '5BO.6-OP-4', '3-2-BP-01',
  ];
  const items = selection === 'full' ? all
    : selection === 'posters' ? all.filter((item) => item.sharedWindow)
      : all.filter((item) => previewCodes.includes(item.code));
  if (selection === 'calendar') assert.equal(items.length, previewCodes.length);
  await page.addInitScript(({ key, ids }) => {
    localStorage.setItem(key, JSON.stringify(ids));
  }, { key: storageKey, ids: [...items.map((item) => item.id), 'removed-record'] });
  await page.goto(base + '#agenda');
  const preview = await openPreview(page);
  await noOverflow(page);
  const frame = preview.getByRole('img');
  assert(await frame.evaluate((node) => node.scrollWidth <= node.clientWidth + 1));
  if (selection === 'calendar') {
    await page.screenshot({ path: path.join(output, 'mobile-agenda-preview.png') });
    const position = await preview.evaluate((node) => { node.scrollTop = 250; return node.scrollTop; });
    assert(position > 0);
  }
  assert.equal(await page.locator('.agenda-list .talk-row').count(), items.length);
  const dimensions = await verifyPng(page, `WCPEC9-Agenda-${day}.png`, selection, items.length);
  assert(dimensions.height > dimensions.width, 'Daily calendar must use portrait dimensions');
  if (selection !== 'calendar') assert(dimensions.height > 8192, 'Dense day must exercise tiled PNG export');
  await preview.getByRole('button', { name: 'Close', exact: true }).click();
  await preview.waitFor({ state: 'hidden' });
  await context.close();
}

async function geometry(browser) {
  const page = await browser.newPage();
  await page.goto(base);
  const { data, longAuthor } = await page.evaluate(async () => {
    const { agendaCalendar } = await import('./js/export.js');
    const { loadProgramme } = await import('./js/programme.js');
    const programme = await loadProgramme();
    const day = '2026-11-17';
    const codes = ['2BO.3-OP-3', '4BO.3-OP-3', '2BO.3-IV-1', '3-2-BP-01', '3-2-BP-02'];
    const items = codes.map((code) => programme.talkById.get(`${day}-${code}`));
    const calls = [];
    const original = CanvasRenderingContext2D.prototype.fillText;
    CanvasRenderingContext2D.prototype.fillText = function (text, x, y) {
      calls.push({ text, x, y, font: this.font });
      return original.call(this, text, x, y);
    };
    try {
      agendaCalendar(day, items, programme.sessionById).renderPreview();
      const data = calls.splice(0);
      const item = { ...items[2], authors: ['An unusually long author name '.repeat(12)] };
      agendaCalendar(day, [item], programme.sessionById).renderPreview();
      const label = calls.findIndex(({ text }) => text === 'Authors:');
      return { data, longAuthor: calls[label + 1]?.text };
    } finally {
      CanvasRenderingContext2D.prototype.fillText = original;
    }
  });
  const text = (target) => data.filter(({ text }) => text === target);
  const overlaps = text('09:05–09:20');
  assert.equal(overlaps.length, 2);
  assert.equal(overlaps[0].y, overlaps[1].y);
  assert.notEqual(overlaps[0].x, overlaps[1].x, 'Overlaps must use separate columns');
  assert(text('08:30–08:50')[0].y < overlaps[0].y);
  assert(text('18:00–19:00  ·  Poster session')[0].y > overlaps[0].y);
  assert(text('DCC 2, Exhibition Hall').length >= 2);
  assert.equal(longAuthor, 'et al.', 'An unusually long name must be omitted as a whole');
  const posterStart = data.findIndex(({ text }) => text.includes('·  Poster session'));
  const posterText = data.slice(posterStart + 1).filter(({ x }) => x >= 136);
  assert(posterText.every(({ font }) => font.includes('18px ')), 'Compact cards use one font size');
  assert.equal(posterText.filter(({ text }) => text === 'Authors:').length, 2);
  posterText.forEach(({ text, y }, index) => {
    if (text !== 'Authors:') return;
    assert.equal(posterText[index + 1].y, y);
    assert.equal(posterText[index + 2].text, 'Location:');
  });
  const [nine] = text('09:00');
  const [nineThirty] = text('09:30');
  assert(nine.y < overlaps[0].y && overlaps[0].y < nineThirty.y);
  await page.close();
}

async function layout(browser, width, height) {
  const context = await browser.newContext({ viewport: { width, height }, isMobile: width < 500, hasTouch: width < 500 });
  const page = await context.newPage();
  await page.goto(base);
  await page.getByRole('button', { name: /Mon,? 16 Nov/ }).click();
  const cards = page.locator('.session-card:visible');
  await cards.first().waitFor();
  await noOverflow(page);
  if (width === 390) {
    await page.screenshot({ path: path.join(output, 'mobile.png') });
    const chrome = page.locator('.masthead, #navigation');
    const positions = () => chrome.evaluateAll((nodes) => nodes.map((node) => node.getBoundingClientRect().y));
    const initial = await positions();
    assert.equal(await page.locator('.masthead').evaluate((node) =>
      getComputedStyle(node).getPropertyValue('--glass-fill').trim()), '#f7fbff24');
    await page.evaluate(() => document.fonts.ready);
    assert.match(await page.locator('h1').evaluate((node) => getComputedStyle(node).fontFamily), /^Inter,/);
    assert(await page.evaluate(() => document.fonts.check('560 32px Inter')));
    assert.match(await page.locator('body').evaluate((node) => getComputedStyle(node, '::before').backgroundImage), /linear-gradient/);
    await page.evaluate(() => window.scrollBy(0, 240));
    assert.deepEqual(await positions(), initial);
    assert(await page.evaluate(() => window.scrollY > 0));
    for (const control of ['.masthead', '#navigation', '.search-controls', '.dates']) {
      const treatment = await page.locator(control).evaluate((node) => getComputedStyle(node).backdropFilter);
      assert(treatment.includes('blur') && treatment.includes('glass-refraction'));
    }
    await page.screenshot({ path: path.join(output, 'mobile-scrolled.png') });
    await page.evaluate(() => window.scrollTo(0, 0));
  }
  await cards.first().click();
  await page.getByRole('dialog').waitFor();
  await noOverflow(page);
  if (width === 390) await page.screenshot({ path: path.join(output, 'mobile-sheet.png') });
  await page.getByRole('button', { name: 'Close details' }).click();
  await page.getByRole('button', { name: 'Filters', exact: true }).click();
  await page.locator('select[name="type"]').selectOption('poster');
  await page.locator('.talk-row').first().waitFor();
  await noOverflow(page);
  if (width === 390) {
    await page.emulateMedia({ contrast: 'more', reducedMotion: 'reduce' });
    const fallback = await page.locator('#navigation').evaluate((node) => getComputedStyle(node).backdropFilter);
    assert.equal(fallback, 'none');
  }
  await page.locator('[data-save]').first().click();
  await switchView(page, 'agenda');
  await noOverflow(page);
  const [preview, clear] = await Promise.all([
    page.getByRole('button', { name: 'Preview agenda', exact: true }).boundingBox(),
    page.getByRole('button', { name: 'Clear My Agenda', exact: true }).boundingBox(),
  ]);
  assert(preview && clear && preview.y === clear.y && preview.x + preview.width < clear.x,
    'Agenda actions should appear side by side');
  if (width === 390) await page.screenshot({ path: path.join(output, 'mobile-agenda.png') });
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
  await page.locator('.agenda-list').waitFor();
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
    assert.equal(await project.locator('#navigation [aria-current=page]').getAttribute('data-view'), 'programme');
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
  await run(geometry);
  for (const sample of [
    { code: 'TS-F-1', authorCount: 1, abbreviated: false },
    { code: '1DO.8-IV-2', authorCount: 3, abbreviated: false },
    { code: '6CO.7-OP-1', authorCount: 6, abbreviated: true },
    { code: '4AO.1-OP-4', authorCount: 11, abbreviated: true, longTitle: true },
    { code: '1CO.5-IV-1', authorCount: 20, abbreviated: true },
    { code: '3-2-BP-01', authorCount: 12, abbreviated: true },
  ]) await run((browser) => calendarFields(browser, sample));
  await run((browser) => calendarStress(browser, 'calendar'));
  await run((browser) => calendarStress(browser, 'posters'));
  await run((browser) => calendarStress(browser, 'full'));
  for (const [width, height] of [[375, 812], [390, 844], [430, 932], [768, 1024], [1440, 900]]) {
    await run((browser) => layout(browser, width, height));
  }
  await run(reliability);
  console.log('Passed Chromium functionality, storage, single-image calendar exports, and all five layouts.'
    + (subpath ? ' Project-subpath preview passed.' : ' Set WCPEC_SUBPATH_URL to run the project-subpath check.'));
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
