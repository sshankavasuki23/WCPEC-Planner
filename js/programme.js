export const typeLabel = (type) => ({
  oral: 'Oral', invited: 'Invited', keynote: 'Keynote', poster: 'Poster',
  plenary: 'Plenary', tutorial: 'Tutorial', workshop: 'Workshop', social: 'Social',
  exhibition: 'Exhibition', ceremony: 'Ceremony', break: 'Break', event: 'Event', tour: 'Tour',
})[type] || type;

const formatDay = (date, options) => new Intl.DateTimeFormat('en-GB', {
  ...options, timeZone: 'UTC',
}).format(new Date(date + 'T12:00:00Z'));

export const dayLabel = (date) => formatDay(date, { weekday: 'short', day: 'numeric', month: 'short' });
export const longDay = (date) => formatDay(date, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
export const timeLabel = (item) => item.start && item.end ? `${item.start}–${item.end}` : 'Not specified';
export const roomLabel = (session) => session?.room || 'Not specified';
export const normalize = (text) => text.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();

export function chronological(a, b) {
  return (a.start || '99:99').localeCompare(b.start || '99:99')
    || (a.end || '99:99').localeCompare(b.end || '99:99')
    || (a.code || a.id).localeCompare(b.code || b.id, 'en', { numeric: true });
}

export async function loadProgramme() {
  const response = await fetch(new URL('../data/programme.json', import.meta.url));
  if (!response.ok) throw new Error('Programme download failed');
  const { sessions, presentations } = await response.json();
  const sessionById = new Map(sessions.map((item) => [item.id, item]));
  const talkById = new Map();
  const bySession = new Map(sessions.map((item) => [item.id, []]));
  for (const item of presentations) {
    const session = sessionById.get(item.sessionId);
    item.search = normalize([
      item.title, ...item.authors, item.code, session.code, session.title, session.track, session.room,
      typeLabel(item.type),
    ].filter(Boolean).join(' '));
    talkById.set(item.id, item);
    bySession.get(item.sessionId).push(item);
  }
  for (const talks of bySession.values()) talks.sort(chronological);
  return {
    sessions, presentations, sessionById, talkById, bySession,
    dates: [...new Set(sessions.map((item) => item.date))].sort(),
  };
}
