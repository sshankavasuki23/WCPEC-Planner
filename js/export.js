import { longDay, roomLabel, timeLabel } from './programme.js';

const width = 1080;
// Keep the canvas within 4.86 megapixels, including on phone browsers.
const maxHeight = 4500;
const headerHeight = 254;
const footerHeight = 73;
const edge = 54;
const rail = 231;
const textX = 263;
const right = width - edge;
const fontFamily = 'system-ui, sans-serif';
const palette = {
  ink: '#202b3d', muted: '#4f5e75', accent: '#315883', line: '#dbe4f0',
  panel: '#fbfcff', rail: '#f0f4fb', blue: '#7794bc', rim: '#d0dcec',
};
const comfortable = { title: 39, leading: 47, meta: 27, metaLeading: 34, padding: 20, gap: 8 };
const compact = { title: 32, leading: 37, meta: 24, metaLeading: 28, padding: 10, gap: 5 };
const graphemes = typeof Intl.Segmenter === 'function'
  ? new Intl.Segmenter(undefined, { granularity: 'grapheme' }) : null;

function font(ctx, weight, size) {
  ctx.font = `${weight} ${size}px ${fontFamily}`;
}

export function wrap(ctx, value, maxWidth) {
  const lines = [];
  let line = '';
  for (const word of value.split(/\s+/)) {
    const candidate = [line, word].filter(Boolean).join(' ');
    if (ctx.measureText(candidate).width <= maxWidth) {
      line = candidate;
      continue;
    }
    if (line) lines.push(line);
    line = '';
    const characters = graphemes ? [...graphemes.segment(word)].map(({ segment }) => segment) : [...word];
    for (const character of characters) {
      if (line && ctx.measureText(line + character).width > maxWidth) {
        lines.push(line);
        line = '';
      }
      line += character;
    }
  }
  if (line) lines.push(line);
  return lines;
}

function rounded(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function layoutRows(ctx, items, sessions, style) {
  return items.map((item) => {
    font(ctx, 650, style.title);
    const title = wrap(ctx, item.title || 'Not specified', right - textX);
    font(ctx, 560, style.meta);
    const codeWidth = item.code ? ctx.measureText(item.code).width + 24 : 0;
    font(ctx, 480, style.meta);
    const room = wrap(ctx, roomLabel(sessions.get(item.sessionId)), right - textX - codeWidth);
    const label = item.start && item.end ? timeLabel(item) : 'Time not set';
    const note = item.sharedWindow ? 'Poster window' : item.timeNote ? 'Check time' : '';
    const height = 2 * style.padding + title.length * style.leading + style.gap + room.length * style.metaLeading;
    return { item, title, room, label, note, height };
  });
}

export function agendaCards(day, items, sessions) {
  if (!items.length) return [];
  const measure = document.createElement('canvas').getContext('2d');
  const capacity = maxHeight - headerHeight - footerHeight;
  let style = items.length <= 7 ? comfortable : compact;
  let rows = layoutRows(measure, items, sessions, style);
  if (style === comfortable && rows.reduce((sum, row) => sum + row.height, 0) > capacity) {
    style = compact;
    rows = layoutRows(measure, items, sessions, style);
  }
  const pages = [[]];
  let used = 0;
  for (const row of rows) {
    if (used && used + row.height > capacity) {
      pages.push([]);
      used = 0;
    }
    pages.at(-1).push(row);
    used += row.height;
  }
  return pages.map((page, index) => () => drawCard(day, page, style, index, pages.length));
}

function drawCard(day, rows, style, index, total) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = headerHeight + rows.reduce((sum, row) => sum + row.height, 0) + footerHeight;
  const partText = total > 1 ? ` Part ${index + 1} of ${total}.` : '';
  canvas.setAttribute('role', 'img');
  canvas.setAttribute('aria-label', `Agenda card for ${longDay(day)}.${partText} ${rows.length} presentations.`);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = palette.panel;
  ctx.fillRect(0, 0, width, canvas.height);
  const header = ctx.createLinearGradient(33, 20, right, headerHeight);
  header.addColorStop(0, '#f7faff');
  header.addColorStop(1, '#dce7f9');
  rounded(ctx, 29, 26, width - 58, 204, 24);
  ctx.fillStyle = header;
  ctx.fill();
  ctx.strokeStyle = palette.rim;
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.save();
  ctx.clip();
  ctx.strokeStyle = '#617ba42a';
  for (const radius of [77, 109, 143, 181]) {
    ctx.beginPath();
    ctx.arc(989, 95, radius, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.restore();
  ctx.fillStyle = palette.accent;
  font(ctx, 690, 23);
  ctx.fillText('WCPEC-9  /  DAEJEON', edge + 14, 79);
  ctx.fillStyle = palette.ink;
  font(ctx, 680, 66);
  ctx.fillText('My Agenda', edge + 12, 151);
  ctx.fillStyle = palette.muted;
  font(ctx, 520, 30);
  ctx.fillText(longDay(day), edge + 14, 197);

  const bottom = canvas.height - footerHeight;
  ctx.fillStyle = palette.rail;
  rounded(ctx, edge - 7, headerHeight, rail - edge - 5, bottom - headerHeight, 15);
  ctx.fill();
  ctx.strokeStyle = palette.rim;
  ctx.beginPath();
  ctx.moveTo(rail + 4, headerHeight + 9);
  ctx.lineTo(rail + 4, bottom - 9);
  ctx.stroke();
  let top = headerHeight;
  let lastSlot;
  for (const { item, title, room, label, note, height } of rows) {
    const previousSlot = lastSlot;
    lastSlot = label + note;
    const newSlot = lastSlot !== previousSlot;
    if (top > headerHeight) {
      ctx.strokeStyle = palette.line;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(newSlot ? edge + 10 : textX, top);
      ctx.lineTo(right, top);
      ctx.stroke();
    }
    if (newSlot) {
      ctx.fillStyle = palette.blue;
      ctx.beginPath();
      ctx.arc(rail + 4, top + style.padding + 13, 6, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = palette.accent;
      font(ctx, 690, style === compact ? 24 : 26);
      ctx.fillText(label, edge + 9, top + style.padding + 24);
      if (note) {
        ctx.fillStyle = palette.muted;
        font(ctx, 520, 21);
        ctx.fillText(note, edge + 9, top + style.padding + 52);
      }
    }
    ctx.fillStyle = palette.ink;
    font(ctx, 650, style.title);
    title.forEach((line, i) => ctx.fillText(line, textX, top + style.padding + style.title + i * style.leading));
    const metaY = top + style.padding + title.length * style.leading + style.gap + style.meta - 2;
    ctx.fillStyle = palette.muted;
    font(ctx, 480, style.meta);
    room.forEach((line, i) => ctx.fillText(line, textX, metaY + i * style.metaLeading));
    if (item.code) {
      ctx.textAlign = 'right';
      font(ctx, 560, style.meta);
      ctx.fillText(item.code, right, metaY);
      ctx.textAlign = 'left';
    }
    top += height;
  }

  ctx.fillStyle = palette.muted;
  font(ctx, 590, 22);
  ctx.fillText('KOREA STANDARD TIME · UTC+9', edge, bottom + 44);
  ctx.textAlign = 'right';
  if (total > 1) ctx.fillText(`PART ${index + 1} / ${total}`, right, bottom + 44);
  return canvas;
}

export function downloadCard(canvas, day, index, total) {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) {
        reject(new Error('PNG generation failed'));
        return;
      }
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      const part = total > 1 ? `-part-${String(index + 1).padStart(2, '0')}` : '';
      link.download = `WCPEC9-Agenda-${day}${part}.png`;
      document.body.append(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(link.href), 30_000);
      resolve();
    }, 'image/png');
  });
}
