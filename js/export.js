import { chronological, longDay, roomLabel, timeLabel } from './programme.js';
import { sessionColors } from './track-colors.js';
import { encodeCalendarPng } from './png.js';

const margin = 44;
const rail = 157;
const header = 230;
const gap = 12;
const posterHeader = 66;
const tileHeight = 640;
const canvasBudget = 4_200_000;
const fontFamily = 'system-ui, sans-serif';
const palette = {
  paper: '#fbf9f4', ink: '#272922', muted: '#565951', rule: '#d8d7ce',
  grid: '#e2e0d6', header: '#eeebe3', poster: '#f2ede7', conflict: '#943f36',
};

const font = (ctx, weight, size) => { ctx.font = `${weight} ${size}px ${fontFamily}`; };
const minute = (time) => Number(time.slice(0, 2)) * 60 + Number(time.slice(3));
const clock = (value) => `${String(Math.floor(value / 60)).padStart(2, '0')}:${String(value % 60).padStart(2, '0')}`;
const segmenter = typeof Intl.Segmenter === 'function' ? new Intl.Segmenter(undefined, { granularity: 'grapheme' }) : null;

function wrap(ctx, value, maxWidth) {
  const lines = [];
  let line = '';
  for (const word of value.split(/\s+/)) {
    const candidate = line ? `${line} ${word}` : word;
    if (ctx.measureText(candidate).width <= maxWidth) {
      line = candidate;
      continue;
    }
    if (line) lines.push(line);
    line = '';
    const letters = segmenter ? [...segmenter.segment(word)].map(({ segment }) => segment) : [...word];
    for (const letter of letters) {
      if (line && ctx.measureText(line + letter).width > maxWidth) {
        lines.push(line);
        line = '';
      }
      line += letter;
    }
  }
  if (line) lines.push(line);
  return lines;
}

function intervals(items) {
  const slots = new Map();
  const unscheduled = [];
  for (const item of [...items].sort(chronological)) {
    const start = item.start ? minute(item.start) : NaN;
    const end = item.end ? minute(item.end) : NaN;
    if (!(end > start)) {
      unscheduled.push(item);
      continue;
    }
    const key = item.sharedWindow ? `${start}/${end}/poster` : item.id;
    if (!slots.has(key)) slots.set(key, { start, end, items: [], poster: item.sharedWindow });
    slots.get(key).items.push(item);
  }
  return { slots: [...slots.values()], unscheduled };
}

function makeClusters(slots) {
  const clusters = [];
  for (const slot of slots) {
    let cluster = clusters.at(-1);
    if (!cluster || slot.start >= cluster.end) {
      cluster = { end: slot.end, laneEnds: [], slots: [] };
      clusters.push(cluster);
    }
    cluster.end = Math.max(cluster.end, slot.end);
    const reusable = cluster.laneEnds.findIndex((end) => end <= slot.start);
    slot.lane = reusable === -1 ? cluster.laneEnds.length : reusable;
    cluster.laneEnds[slot.lane] = slot.end;
    cluster.slots.push(slot);
  }
  return clusters;
}

function measureCard(ctx, item, session, width, compact) {
  const titleSize = compact ? 27 : 31;
  const titleLine = titleSize + 7;
  const smallSize = compact ? 20 : 23;
  const smallLine = smallSize + 5;
  const padding = compact ? 14 : 18;
  font(ctx, 640, titleSize);
  const title = wrap(ctx, item.title || 'Not specified', width - padding * 2 - 5);
  font(ctx, 480, smallSize);
  const room = wrap(ctx, roomLabel(session), width - padding * 2 - 5);
  const height = padding * 2 + smallLine + title.length * titleLine + room.length * smallLine + 3;
  return { item, title, room, width, height, titleSize, titleLine, smallSize, smallLine, padding,
    colors: sessionColors(session) };
}

function arrangeCards(ctx, entries, sessions, width, columns, compact) {
  const cardWidth = Math.floor((width - gap * (columns - 1)) / columns);
  const cards = [];
  let y = 0;
  for (let i = 0; i < entries.length; i += columns) {
    const row = entries.slice(i, i + columns).map((item) => measureCard(ctx, item, sessions.get(item.sessionId), cardWidth, compact));
    const rowHeight = Math.max(...row.map((item) => item.height));
    row.forEach((item, col) => cards.push({ ...item, x: col * (cardWidth + gap), y, height: rowHeight }));
    y += rowHeight + gap;
  }
  return { height: y - gap, cards };
}

function placeTimeAxis(slots) {
  if (!slots.length) return { grid: [], bottom: header };
  const first = Math.floor(slots[0].start / 30) * 30;
  const last = Math.ceil(Math.max(...slots.map((slot) => slot.end)) / 30) * 30;
  const ticks = Array.from({ length: (last - first) / 30 + 1 }, (_, i) => first + i * 30);
  const edges = new Set(ticks);
  for (const slot of slots) {
    edges.add(slot.start);
    edges.add(slot.end);
  }
  const positions = new Map();
  let previous = first;
  let y = header;
  for (const time of [...edges].sort((a, b) => a - b)) {
    // Share a single coordinate for each time. Stretch the spans covered by a
    // dense block so clocks inside a block remain spaced against its duration.
    let pixelsPerMinute = 2.8;
    for (const slot of slots) {
      if (slot.start < time && slot.end > previous) {
        pixelsPerMinute = Math.max(pixelsPerMinute, (slot.minHeight + gap) / (slot.end - slot.start));
      }
    }
    y += (time - previous) * pixelsPerMinute;
    positions.set(time, y);
    previous = time;
  }
  for (const slot of slots) {
    slot.top = Math.round(positions.get(slot.start));
    slot.bottom = Math.round(positions.get(slot.end));
  }
  return { grid: ticks.map((time) => ({ time, y: Math.round(positions.get(time)) })), bottom: y };
}

function layoutCalendar(items, sessions) {
  const { slots, unscheduled } = intervals(items);
  const clusters = makeClusters(slots);
  const lanes = Math.max(1, ...clusters.map((item) => item.laneEnds.length));
  const maxPosters = Math.max(0, ...slots.filter((slot) => slot.poster).map((slot) => slot.items.length));
  const posterColumns = Math.min(8, Math.ceil(Math.sqrt(maxPosters)));
  const width = Math.max(1080, rail + margin + Math.max(lanes, posterColumns) * 315);
  const usable = width - rail - margin;
  const ctx = document.createElement('canvas').getContext('2d');
  for (const { laneEnds, slots: local } of clusters) {
    const slotWidth = Math.floor((usable - (laneEnds.length - 1) * gap) / laneEnds.length);
    for (const slot of local) {
      slot.x = rail + slot.lane * (slotWidth + gap);
      slot.width = slotWidth;
      const shared = slot.poster && slot.items.length > 1;
      const cols = shared ? Math.min(posterColumns, Math.floor(slotWidth / 300)) : 1;
      const layout = arrangeCards(ctx, slot.items, sessions, slotWidth - (shared ? 20 : 0), cols,
        shared || laneEnds.length > 2);
      slot.cards = layout.cards;
      slot.minHeight = layout.height + (shared ? posterHeader + 10 : 0);
      slot.shared = shared;
    }
  }
  const { grid, bottom } = placeTimeAxis(slots);
  const untimed = unscheduled.length
    ? arrangeCards(ctx, unscheduled, sessions, usable, Math.min(3, unscheduled.length), false) : null;
  const untimedY = Math.ceil(bottom) + (slots.length ? 62 : 18);
  const height = Math.ceil(untimed ? untimedY + untimed.height + 74 : bottom + 85);
  return { width, height, slots, grid, untimed, untimedY };
}

function drawCard(ctx, card, x, y, height, conflicts, shared) {
  const [accent, fill] = card.colors;
  ctx.fillStyle = fill;
  ctx.beginPath();
  ctx.roundRect(x, y, card.width, height, 10);
  ctx.fill();
  ctx.fillStyle = accent;
  ctx.fillRect(x + 1, y + 10, 4, height - 20);
  const left = x + card.padding + 5;
  const item = card.item;
  ctx.fillStyle = conflicts.has(item.id) ? palette.conflict : palette.muted;
  font(ctx, 650, card.smallSize);
  const stamp = shared || !item.start ? item.code || '' : timeLabel(item);
  ctx.fillText(stamp, left, y + card.padding + card.smallSize);
  if (stamp && item.code && !shared && item.start) {
    const startWidth = ctx.measureText(stamp).width;
    if (startWidth + ctx.measureText(item.code).width + 22 < card.width - card.padding * 2) {
      ctx.textAlign = 'right';
      ctx.fillText(item.code, x + card.width - card.padding, y + card.padding + card.smallSize);
      ctx.textAlign = 'left';
    }
  }
  ctx.fillStyle = palette.ink;
  font(ctx, 640, card.titleSize);
  const titleY = y + card.padding + card.smallLine + card.titleSize;
  card.title.forEach((line, i) => ctx.fillText(line, left, titleY + i * card.titleLine));
  ctx.fillStyle = palette.muted;
  font(ctx, 480, card.smallSize);
  const roomY = y + card.padding + card.smallLine + card.title.length * card.titleLine + card.smallSize + 2;
  card.room.forEach((line, i) => ctx.fillText(line, left, roomY + i * card.smallLine));
}

function drawCalendar(ctx, layout, day, count, conflicts, top, bottom) {
  const { width, height, slots, grid, untimed, untimedY } = layout;
  ctx.fillStyle = palette.paper;
  ctx.fillRect(0, 0, width, height);
  ctx.fillStyle = palette.header;
  ctx.fillRect(0, 0, width, 190);
  ctx.fillStyle = palette.muted;
  font(ctx, 680, 24);
  ctx.fillText('WCPEC-9   /   DAEJEON', margin, 50);
  ctx.fillStyle = palette.ink;
  font(ctx, 620, 62);
  ctx.fillText('My Agenda', margin - 2, 118);
  ctx.fillStyle = palette.muted;
  font(ctx, 530, 28);
  ctx.fillText(longDay(day), margin, 160);
  ctx.textAlign = 'right';
  font(ctx, 540, 22);
  ctx.fillText(`${count} presentation${count === 1 ? '' : 's'}`, width - margin, 151);
  ctx.textAlign = 'left';

  font(ctx, 560, 23);
  for (const { time, y } of grid) {
    if (y < top - 12 || y > bottom + 30) continue;
    ctx.strokeStyle = time % 60 === 0 ? palette.rule : palette.grid;
    ctx.beginPath();
    ctx.moveTo(rail - 18, y);
    ctx.lineTo(width - margin, y);
    ctx.stroke();
    ctx.fillStyle = palette.muted;
    ctx.fillText(clock(time), margin, y + 7);
  }
  for (const slot of slots) {
    if (slot.bottom < top || slot.top > bottom) continue;
    if (slot.shared) {
      ctx.fillStyle = palette.poster;
      ctx.beginPath();
      ctx.roundRect(slot.x, slot.top, slot.width, slot.bottom - slot.top - 2, 10);
      ctx.fill();
      ctx.fillStyle = palette.ink;
      font(ctx, 640, 25);
      ctx.fillText(`${clock(slot.start)}–${clock(slot.end)}  ·  Poster session`, slot.x + 16, slot.top + 41, slot.width - 32);
    }
    for (const card of slot.cards) {
      const x = slot.x + card.x + (slot.shared ? 10 : 0);
      const y = slot.top + card.y + (slot.shared ? posterHeader : 1);
      const height = slot.shared ? card.height : slot.bottom - slot.top - 3;
      if (y <= bottom && y + height >= top) drawCard(ctx, card, x, y, height, conflicts, slot.shared);
    }
  }
  if (untimed) {
    font(ctx, 620, 25);
    ctx.fillStyle = palette.muted;
    ctx.fillText('Time not specified', rail, untimedY - 18);
    for (const card of untimed.cards) drawCard(ctx, card, rail + card.x, untimedY + card.y, card.height, conflicts, false);
  }
  ctx.fillStyle = palette.muted;
  font(ctx, 560, 22);
  ctx.fillText('KOREA STANDARD TIME · UTC+9', margin, height - 29);
  if (grid.length) {
    ctx.textAlign = 'right';
    ctx.fillText('Time intervals expand to fit text.', width - margin, height - 29);
    ctx.textAlign = 'left';
  }
}

function canvasBlob(canvas) {
  return new Promise((resolve, reject) => canvas.toBlob(
    (blob) => blob ? resolve(blob) : reject(new Error('PNG generation failed')), 'image/png',
  ));
}

export function agendaCalendar(day, items, sessions, conflicts = new Set()) {
  const layout = layoutCalendar(items, sessions);
  const { width, height } = layout;
  function* render(scale, stripHeight) {
    for (let start = 0; start < height; start += stripHeight) {
      const canvas = document.createElement('canvas');
      canvas.width = Math.ceil(width * scale);
      const top = Math.round(start * scale);
      const bottom = Math.round(Math.min(start + stripHeight, height) * scale);
      canvas.height = bottom - top;
      const ctx = canvas.getContext('2d', { alpha: false });
      ctx.setTransform(canvas.width / width, 0, 0, scale, 0, -top);
      drawCalendar(ctx, layout, day, items.length, conflicts, start - 2, start + stripHeight + 2);
      yield canvas;
    }
  }
  const fitsCanvas = width * height <= canvasBudget && height <= 8192;
  let preview;
  function renderPreview() {
    const scale = fitsCanvas ? 1 : Math.min(1, Math.sqrt(9_000_000 / (width * height)));
    preview ??= [...render(scale, fitsCanvas ? height : tileHeight)];
    return preview;
  }
  return {
    day, width, height, renderPreview,
    async png() {
      if (fitsCanvas) return canvasBlob(renderPreview()[0]);
      return encodeCalendarPng(width, height, render(1, tileHeight));
    },
  };
}

export async function downloadCalendar(calendar) {
  const blob = await calendar.png();
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = `WCPEC9-Agenda-${calendar.day}.png`;
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(link.href), 30_000);
}
