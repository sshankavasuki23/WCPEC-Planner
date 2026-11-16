import { chronological, longDay, roomLabel, timeLabel } from './programme.js';
import { sessionColors } from './track-colors.js';
import { encodeCalendarPng } from './png.js';

const margin = 44;
const clockY = 198;
const firstLaneY = 226;
const gap = 14;
const posterHeader = 58;
const maxTileWidth = 3840;
const tileHeight = 576;
const canvasBudget = 4_200_000;
const fontFamily = '"Instrument Sans", system-ui, sans-serif';
const palette = {
  paper: '#fffdfa', ink: '#192c3c', muted: '#415768', rule: '#aebfcb',
  grid: '#dbe5eb', poster: '#f0edf1', conflict: '#953f3f',
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
  const titleSize = compact ? 24 : 29;
  const titleLine = titleSize + 7;
  const smallSize = compact ? 18 : 21;
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

function placeTimeAxis(slots, minimumWidth) {
  if (!slots.length) return { grid: [], width: minimumWidth };
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
  let x = margin;
  for (const time of [...edges].sort((a, b) => a - b)) {
    let pixelsPerMinute = 1.9;
    for (const slot of slots) {
      if (slot.start < time && slot.end > previous) {
        pixelsPerMinute = Math.max(pixelsPerMinute, (slot.minWidth + gap) / (slot.end - slot.start));
      }
    }
    x += (time - previous) * pixelsPerMinute;
    positions.set(time, x);
    previous = time;
  }
  const scale = Math.max(1, (minimumWidth - margin * 2) / (x - margin));
  const position = (time) => Math.round(margin + (positions.get(time) - margin) * scale);
  for (const slot of slots) {
    slot.left = position(slot.start);
    slot.right = position(slot.end);
  }
  return { grid: ticks.map((time) => ({ time, x: position(time) })), width: position(last) + margin };
}

function layoutCalendar(items, sessions, minimumWidth = 1280) {
  const { slots, unscheduled } = intervals(items);
  const clusters = makeClusters(slots);
  const dense = slots.length > 65;
  const cardWidth = dense ? 272 : 360;
  for (const slot of slots) {
    slot.shared = slot.poster && slot.items.length > 1;
    slot.columns = slot.shared ? Math.min(17, Math.ceil(Math.sqrt(slot.items.length))) : 1;
    const posterWidth = dense ? 312 : 360;
    slot.minWidth = slot.shared ? slot.columns * (posterWidth + gap) - gap + 24 : cardWidth;
  }
  const { grid, width } = placeTimeAxis(slots, minimumWidth);
  const laneHeights = [];
  const isolatedPosters = [];
  const ctx = document.createElement('canvas').getContext('2d');
  for (const { laneEnds, slots: local } of clusters) {
    for (const slot of local) {
      const slotWidth = slot.right - slot.left - gap;
      const layout = arrangeCards(ctx, slot.items, sessions,
        slot.shared ? slot.minWidth - 24 : Math.min(slotWidth, 720), slot.columns, dense || slot.shared);
      slot.width = slotWidth;
      slot.cards = layout.cards;
      slot.height = layout.height + (slot.shared ? posterHeader + 12 : 0);
      if (slot.shared && laneEnds.length === 1) isolatedPosters.push(slot);
      else laneHeights[slot.lane] = Math.max(laneHeights[slot.lane] || 0, slot.height);
    }
  }
  const rowTops = [];
  let lanesBottom = firstLaneY;
  for (const height of laneHeights) {
    rowTops.push(lanesBottom);
    lanesBottom += height + gap;
  }
  for (const slot of slots) slot.top = rowTops[slot.lane] ?? firstLaneY;
  const scheduleBottom = Math.max(lanesBottom, ...isolatedPosters.map((slot) => slot.top + slot.height));
  const untimed = unscheduled.length
    ? arrangeCards(ctx, unscheduled, sessions, Math.min(width - margin * 2, 1560), Math.min(3, unscheduled.length), false) : null;
  const untimedY = scheduleBottom + 60;
  const usedHeight = untimed ? untimedY + untimed.height : scheduleBottom;
  const height = usedHeight + 68;
  // A selection made entirely of simultaneous talks or posters can be taller
  // than its time span. Expand the horizontal axis before drawing that case.
  if (width <= height) return layoutCalendar(items, sessions, Math.ceil(height * 1.12));
  return { width, height, slots, grid, untimed, untimedY,
    gridBottom: Math.max(lanesBottom, Math.min(scheduleBottom, firstLaneY + 190)) };
}

function drawCard(ctx, card, x, y, width, height, conflicts, shared) {
  const [accent, fill] = card.colors;
  ctx.fillStyle = fill;
  ctx.beginPath();
  ctx.roundRect(x, y, width, height, 10);
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
    if (startWidth + ctx.measureText(item.code).width + 22 < width - card.padding * 2) {
      ctx.textAlign = 'right';
      ctx.fillText(item.code, x + width - card.padding, y + card.padding + card.smallSize);
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

function drawCalendar(ctx, layout, day, count, conflicts, clip) {
  const { width, height, slots, grid, untimed, untimedY, gridBottom } = layout;
  const intersects = (x, y, w, h) =>
    x + w >= clip.left && x <= clip.right && y + h >= clip.top && y <= clip.bottom;
  ctx.fillStyle = palette.paper;
  ctx.fillRect(0, 0, width, height);
  if (clip.top < clockY) {
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
    ctx.font = '400 66px Baskervville, Georgia, serif';
    ctx.fillText('My Agenda', margin - 3, 104);
    ctx.fillStyle = palette.muted;
    font(ctx, 500, 24);
    ctx.fillText(longDay(day), margin, 139);
    ctx.textAlign = 'right';
    ctx.fillText(`${count} presentation${count === 1 ? '' : 's'}`, width - margin, 139);
    ctx.textAlign = 'left';
  }

  for (const { time, x } of grid) {
    if (!intersects(x - 40, clockY - 30, 80, gridBottom - clockY + 30)) continue;
    ctx.strokeStyle = time % 60 === 0 ? palette.rule : palette.grid;
    ctx.beginPath();
    ctx.moveTo(x, clockY + 12);
    ctx.lineTo(x, gridBottom);
    ctx.stroke();
    ctx.fillStyle = palette.muted;
    ctx.textAlign = 'center';
    font(ctx, time % 60 === 0 ? 640 : 500, 20);
    ctx.fillText(clock(time), x, clockY);
    ctx.textAlign = 'left';
  }

  for (const slot of slots) {
    if (!intersects(slot.left, slot.top, slot.width, slot.height)) continue;
    if (slot.shared) {
      ctx.fillStyle = palette.poster;
      ctx.beginPath();
      ctx.roundRect(slot.left, slot.top, slot.width, slot.height, 10);
      ctx.fill();
      ctx.fillStyle = palette.ink;
      font(ctx, 640, 23);
      ctx.fillText(`${clock(slot.start)}–${clock(slot.end)}  ·  Poster session`, slot.left + 15, slot.top + 35,
        slot.width - 30);
    }
    for (const card of slot.cards) {
      const x = slot.left + card.x + (slot.shared ? 12 : 0);
      const y = slot.top + card.y + (slot.shared ? posterHeader : 0);
      const cardWidth = slot.shared ? card.width : slot.width;
      if (intersects(x, y, cardWidth, card.height)) {
        drawCard(ctx, card, x, y, cardWidth, card.height, conflicts, slot.shared);
      }
    }
  }

  if (untimed) {
    font(ctx, 620, 24);
    ctx.fillStyle = palette.muted;
    ctx.fillText('Time not specified', margin, untimedY - 17);
    for (const card of untimed.cards) {
      if (intersects(margin + card.x, untimedY + card.y, card.width, card.height)) {
        drawCard(ctx, card, margin + card.x, untimedY + card.y, card.width, card.height, conflicts, false);
      }
    }
  }
  if (clip.bottom >= height - 55) {
    ctx.fillStyle = palette.muted;
    font(ctx, 560, 20);
    ctx.fillText('KOREA STANDARD TIME · UTC+9', margin, height - 25);
    if (grid.length) {
      ctx.textAlign = 'right';
      ctx.fillText('Time intervals expand to fit text.', width - margin, height - 25);
      ctx.textAlign = 'left';
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
