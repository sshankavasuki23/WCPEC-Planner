import { longDay, roomLabel, timeLabel } from './programme.js';

const width = 1080;
const margin = 76;
const maxBody = 1350;
const fontFamily = 'system-ui, sans-serif';
const palette = {
  ink: '#182c28', muted: '#48645d', teal: '#245e50', line: '#dae5df',
  panel: '#fbfaf6', white: '#fffefa', deep: '#163e35',
};
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

export function agendaCards(day, items, sessions) {
  if (!items.length) return [];
  const measure = document.createElement('canvas').getContext('2d');
  const parts = [[]];
  let used = 0;
  for (const item of items) {
    font(measure, 650, 42);
    const title = wrap(measure, item.title || 'Not specified', width - margin * 2 - 28);
    font(measure, 500, 30);
    const room = wrap(measure, roomLabel(sessions.get(item.sessionId)), width - margin * 2 - 28);
    const height = 93 + title.length * 52 + room.length * 38;
    if (used && used + height > maxBody) {
      parts.push([]);
      used = 0;
    }
    parts.at(-1).push({ item, title, room, height });
    used += height;
  }
  return parts.map((rows, index) => () => drawCard(day, rows, index, parts.length));
}

function drawCard(day, rows, index, total) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = 323 + rows.reduce((sum, row) => sum + row.height, 0) + 96;
  canvas.setAttribute('role', 'img');
  canvas.setAttribute('aria-label', `Agenda card for ${longDay(day)}. Part ${index + 1} of ${total}. ${rows.length} presentations.`);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = palette.panel;
  ctx.fillRect(0, 0, width, canvas.height);
  rounded(ctx, 33, 33, width - 66, 266, 32);
  const header = ctx.createLinearGradient(0, 0, width, 310);
  header.addColorStop(0, palette.deep);
  header.addColorStop(1, palette.teal);
  ctx.fillStyle = header;
  ctx.fill();
  ctx.save();
  ctx.clip();
  ctx.strokeStyle = '#ffffff23';
  ctx.lineWidth = 2;
  for (const radius of [92, 130, 170, 212]) {
    ctx.beginPath();
    ctx.arc(1005, 96, radius, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.restore();
  ctx.fillStyle = '#d8ede3';
  font(ctx, 700, 28);
  ctx.fillText('WCPEC-9  /  DAEJEON', margin, 96);
  ctx.fillStyle = palette.white;
  font(ctx, 660, 78);
  ctx.fillText('My Agenda', margin, 186);
  font(ctx, 470, 32);
  ctx.fillText(longDay(day), margin, 252);

  let top = 323;
  for (const { item, title, room, height } of rows) {
    const x = margin + 28;
    ctx.fillStyle = '#89ac9e';
    ctx.beginPath();
    ctx.arc(margin + 4, top + 35, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = palette.teal;
    font(ctx, 700, 30);
    ctx.fillText(timeLabel(item) + (item.sharedWindow ? ' · Poster window' : item.timeNote ? ' · Check programme time' : ''), x, top + 46);
    if (item.code) {
      ctx.textAlign = 'right';
      font(ctx, 530, 24);
      ctx.fillText(item.code, width - margin, top + 46);
      ctx.textAlign = 'left';
    }
    ctx.fillStyle = palette.ink;
    font(ctx, 650, 42);
    title.forEach((line, i) => ctx.fillText(line, x, top + 105 + i * 52));
    ctx.fillStyle = palette.muted;
    font(ctx, 500, 30);
    room.forEach((line, i) => ctx.fillText(line, x, top + 101 + title.length * 52 + i * 38));
    top += height;
    ctx.strokeStyle = palette.line;
    ctx.beginPath();
    ctx.moveTo(margin, top);
    ctx.lineTo(width - margin, top);
    ctx.stroke();
  }

  ctx.fillStyle = palette.muted;
  font(ctx, 570, 25);
  ctx.fillText('KOREA STANDARD TIME · UTC+9', margin, top + 58);
  ctx.textAlign = 'right';
  ctx.fillText(total > 1 ? `PART ${index + 1} / ${total}` : 'WCPEC-9', width - margin, top + 58);
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
