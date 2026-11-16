import { chronological, longDay, roomLabel, timeLabel } from './programme.js';
import { sessionColors } from './track-colors.js';
import { encodeCalendarPng } from './png.js';

const margin = 44;
const rail = 136;
const header = 198;
const gap = 14;
const posterHeader = 58;
const maxTileWidth = 3840;
const tileHeight = 576;
const canvasBudget = 4_200_000;
const fontFamily = 'Inter, system-ui, sans-serif';
const palette = {
  paper: '#fffdfa', ink: '#192c3c', muted: '#415768', rule: '#aebfcb',
  grid: '#dbe5eb', poster: '#f0edf1', conflict: '#953f3f',
};

const font = (ctx, weight, size) => { ctx.font = `${weight} ${size}px ${fontFamily}`; };
const minute = (time) => Number(time.slice(0, 2)) * 60 + Number(time.slice(3));
const clock = (value) => `${String(Math.floor(value / 60)).padStart(2, '0')}:${String(value % 60).padStart(2, '0')}`;
const segmenter = typeof Intl.Segmenter === 'function' ? new Intl.Segmenter(undefined, { granularity: 'grapheme' }) : null;

function wrap(ctx, value, maxWidth, firstWidth) {
  const lines = [];
  let line = '';
  let width = firstWidth;
  for (const word of value.split(/\s+/)) {
    const candidate = line ? `${line} ${word}` : word;
    if (ctx.measureText(candidate).width <= width) {
      line = candidate;
      continue;
    }
    if (line || lines.length === 0) lines.push(line);
    width = maxWidth;
    if (ctx.measureText(word).width <= width) {
      line = word;
      continue;
    }
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

function measureCard(ctx, item, session, width, compact, shared) {
  const titleSize = compact ? 24 : 29;
  const smallSize = compact ? 18 : 21;
  const smallLine = smallSize + 5;
  const padding = compact ? 14 : 18;
  const contentWidth = width - padding * 2 - 5;
  const stamp = shared || !item.start || !item.end ? item.code || '' : timeLabel(item);
  const code = !shared && item.start && item.end ? item.code : null;
  font(ctx, 650, smallSize);
  const codeBelow = Boolean(code && ctx.measureText(stamp).width + ctx.measureText(code).width + 22 > contentWidth);
  const stampHeight = smallLine * (codeBelow ? 2 : 1);
  const fields = [
    ['Session:', session?.title, smallSize, 480],
    ['Presentation:', item.title, titleSize, 600],
    ['Authors:', item.authors.join(', '), smallSize, 480],
    ['Location:', roomLabel(session), smallSize, 600],
  ].map(([label, value, size, weight]) => {
    font(ctx, 600, smallSize);
    const labelWidth = ctx.measureText(label).width + 8;
    font(ctx, weight, size);
    const lines = wrap(ctx, value || 'Not specified', contentWidth, contentWidth - labelWidth);
    return { label, labelWidth, lines, size, weight, leading: size + (size === titleSize ? 7 : 5) };
  });
  const height = padding * 2 + stampHeight + 3
    + fields.reduce((sum, field) => sum + field.lines.length * field.leading + 3, 0);
  return { item, width, height, fields, smallSize, smallLine, padding, stamp, code, codeBelow, stampHeight,
    colors: sessionColors(session) };
}

function arrangeCards(ctx, entries, sessions, width, columns, compact, shared = false) {
  const cardWidth = Math.floor((width - gap * (columns - 1)) / columns);
  const cards = [];
  let y = 0;
  for (let i = 0; i < entries.length; i += columns) {
    const row = entries.slice(i, i + columns).map((item) =>
      measureCard(ctx, item, sessions.get(item.sessionId), cardWidth, compact, shared));
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
  const width = Math.max(items.length <= 2 ? 800 : 960, rail + margin + Math.max(lanes, posterColumns) * 315);
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
        shared || laneEnds.length > 2, shared);
      slot.cards = layout.cards;
      slot.minHeight = layout.height + (shared ? posterHeader + 10 : 0);
      slot.shared = shared;
    }
  }
  const { grid, bottom } = placeTimeAxis(slots);
  const untimed = unscheduled.length
    ? arrangeCards(ctx, unscheduled, sessions, usable, Math.min(3, unscheduled.length), false) : null;
  const untimedY = Math.ceil(bottom) + (slots.length ? 62 : 18);
  const contentBottom = untimed ? untimedY + untimed.height : bottom;
  const height = Math.ceil(Math.max(width + 24, contentBottom + 68));
  return { width, height, slots, grid, untimed, untimedY };
}

function drawCard(ctx, card, x, y, width, height, conflicts) {
  const [accent, fill] = card.colors;
  ctx.fillStyle = fill;
  ctx.beginPath();
  ctx.roundRect(x, y, width, height, 10);
  ctx.fill();
  ctx.fillStyle = accent;
  ctx.fillRect(x + 1, y + 10, 4, height - 20);
  const left = x + card.padding + 5;
  const top = y + card.padding;
  ctx.fillStyle = conflicts.has(card.item.id) ? palette.conflict : palette.muted;
  font(ctx, 650, card.smallSize);
  ctx.fillText(card.stamp, left, top + card.smallSize);
  if (card.codeBelow) {
    ctx.fillText(card.code, left, top + card.smallLine + card.smallSize);
  } else if (card.code) {
    ctx.textAlign = 'right';
    ctx.fillText(card.code, x + width - card.padding, top + card.smallSize);
    ctx.textAlign = 'left';
  }

  let row = top + card.stampHeight + 3;
  for (const field of card.fields) {
    const baseline = row + field.size;
    ctx.fillStyle = palette.muted;
    font(ctx, 600, card.smallSize);
    ctx.fillText(field.label, left, baseline);
    ctx.fillStyle = field.weight === 600 ? palette.ink : palette.muted;
    font(ctx, field.weight, field.size);
    for (const [index, line] of field.lines.entries()) {
      ctx.fillText(line, index === 0 ? left + field.labelWidth : left, baseline + index * field.leading);
    }
    row += field.lines.length * field.leading + 3;
  }
}

function drawCalendar(ctx, layout, day, count, conflicts, clip) {
  const { width, height, slots, grid, untimed, untimedY } = layout;
  const intersects = (x, y, w, h) =>
    x + w >= clip.left && x <= clip.right && y + h >= clip.top && y <= clip.bottom;
  ctx.fillStyle = palette.paper;
  ctx.fillRect(0, 0, width, height);
  if (clip.top < header) {
    const tint = ctx.createLinearGradient(0, 0, width, 130);
    tint.addColorStop(0, '#fbefcc');
    tint.addColorStop(.43, '#f5e8d4');
    tint.addColorStop(1, '#d8ebf5');
    ctx.fillStyle = tint;
    ctx.fillRect(0, 0, width, 162);
    ctx.fillStyle = palette.muted;
    font(ctx, 640, 20);
    ctx.fillText('WCPEC-9   /   DAEJEON', margin, 41);
    ctx.fillStyle = palette.ink;
    font(ctx, 560, 59);
    ctx.fillText('My Agenda', margin - 3, 104);
    ctx.fillStyle = palette.muted;
    font(ctx, 500, 24);
    ctx.fillText(longDay(day), margin, 139);
    ctx.textAlign = 'right';
    ctx.fillText(`${count} presentation${count === 1 ? '' : 's'}`, width - margin, 139);
    ctx.textAlign = 'left';
  }

  for (const { time, y } of grid) {
    if (!intersects(margin, y - 22, width - 2 * margin, 32)) continue;
    ctx.strokeStyle = time % 60 === 0 ? palette.rule : palette.grid;
    ctx.beginPath();
    ctx.moveTo(rail - 17, y);
    ctx.lineTo(width - margin, y);
    ctx.stroke();
    ctx.fillStyle = palette.muted;
    font(ctx, time % 60 === 0 ? 600 : 500, 20);
    ctx.fillText(clock(time), margin, y + 7);
  }

  for (const slot of slots) {
    const height = slot.bottom - slot.top;
    if (!intersects(slot.x, slot.top, slot.width, height)) continue;
    if (slot.shared) {
      ctx.fillStyle = palette.poster;
      ctx.beginPath();
      ctx.roundRect(slot.x, slot.top, slot.width, height - 2, 10);
      ctx.fill();
      ctx.fillStyle = palette.ink;
      font(ctx, 600, 23);
      ctx.fillText(`${clock(slot.start)}–${clock(slot.end)}  ·  Poster session`, slot.x + 15, slot.top + 35,
        slot.width - 30);
    }
    for (const card of slot.cards) {
      const x = slot.x + card.x + (slot.shared ? 10 : 0);
      const y = slot.top + card.y + (slot.shared ? posterHeader : 1);
      const cardHeight = slot.shared ? card.height : height - 3;
      if (intersects(x, y, card.width, cardHeight)) {
        drawCard(ctx, card, x, y, card.width, cardHeight, conflicts);
      }
    }
  }

  if (untimed) {
    font(ctx, 620, 24);
    ctx.fillStyle = palette.muted;
    ctx.fillText('Time not specified', rail, untimedY - 17);
    for (const card of untimed.cards) {
      if (intersects(rail + card.x, untimedY + card.y, card.width, card.height)) {
        drawCard(ctx, card, rail + card.x, untimedY + card.y, card.width, card.height, conflicts);
      }
    }
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
  const fitsCanvas = width * height <= canvasBudget && width <= 8192 && height <= 8192;

  function* render(scale, whole = false) {
    const pixelsWide = Math.ceil(width * scale);
    const pixelsHigh = Math.ceil(height * scale);
    const strip = whole ? pixelsHigh : tileHeight;
    const tile = whole ? pixelsWide : maxTileWidth;
    const scaleX = pixelsWide / width;
    const scaleY = pixelsHigh / height;
    for (let top = 0; top < pixelsHigh; top += strip) {
      const row = [];
      for (let left = 0; left < pixelsWide; left += tile) {
        const canvas = document.createElement('canvas');
        canvas.width = Math.min(tile, pixelsWide - left);
        canvas.height = Math.min(strip, pixelsHigh - top);
        const ctx = canvas.getContext('2d', { alpha: false });
        ctx.setTransform(scaleX, 0, 0, scaleY, -left, -top);
        drawCalendar(ctx, layout, day, items.length, conflicts, {
          left: left / scaleX - 2, right: (left + canvas.width) / scaleX + 2,
          top: top / scaleY - 2, bottom: (top + canvas.height) / scaleY + 2,
        });
        row.push(canvas);
      }
      yield row;
    }
  }

  let preview;
  function renderPreview() {
    const scale = fitsCanvas ? 1 : Math.min(1, Math.sqrt(9_000_000 / (width * height)));
    preview ??= [...render(scale, fitsCanvas)];
    return preview;
  }
  return {
    day, width, height, renderPreview,
    async png() {
      if (fitsCanvas) return canvasBlob(renderPreview()[0][0]);
      return encodeCalendarPng(width, height, render(1));
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
