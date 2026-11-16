import { chronological, dayLabel, loadProgramme, longDay, normalize, roomLabel, timeLabel, typeLabel } from './programme.js';
import { conflicts, restoreAgenda, saveAgenda, storageKey } from './agenda.js';
import { agendaCalendar, downloadCalendar } from './export.js';
import { sessionColors } from './track-colors.js';

const byId = (id) => document.getElementById(id);
const content = byId('content');
const dialog = byId('details');
const clearDialog = byId('clear-dialog');
const previewDialog = byId('agenda-preview');
const previewDownload = byId('preview-download');
let previewCalendar;
let previewRequest;
const views = { programme: 'Programme', agenda: 'My Agenda' };
const state = {
  view: 'programme', programmeDate: '', agendaDate: '', filters: {}, filtersOpen: false,
  ids: new Set(), openBlocks: new Map(),
};
const filterKeys = ['date', 'track', 'type', 'room'];
const pageSize = 40;
let programme;
let detail;
let returnFocus;
let resultLimit = pageSize;

function element(tag, className, value) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (typeof value === 'string') node.textContent = value;
  else if (value) node.append(...value);
  return node;
}

function button(label, className, handler) {
  const node = element('button', className, label);
  node.type = 'button';
  node.addEventListener('click', handler);
  return node;
}

function time(item) {
  return item.start && item.end ? timeLabel(item) : 'Time not specified';
}

function roomKey(room) {
  return (room || '').replace(/\s*\(/g, '(');
}

function sessionRoom(session) {
  return session.room || (session.type === 'break' ? '' : 'Room not specified');
}

function dateControls(key) {
  const nav = element('div', 'dates glass refractive');
  nav.setAttribute('role', 'group');
  nav.setAttribute('aria-label', key === 'agendaDate' ? 'Agenda dates' : 'Programme dates');
  for (const date of programme.dates) {
    const [weekday, day, month] = dayLabel(date).replace(',', '').split(' ');
    const picker = button('', 'date', () => {
      if (state[key] === date) return;
      state[key] = date;
      if (key === 'programmeDate') renderDay();
      else renderAgenda();
      content.querySelector('[aria-pressed="true"].date')?.focus({ preventScroll: true });
    });
    picker.append(element('span', 'date-weekday', weekday), element('strong', 'date-day', day),
      element('span', 'date-month', month));
    picker.setAttribute('aria-label', dayLabel(date));
    picker.setAttribute('aria-pressed', String(date === state[key]));
    if (key === 'agendaDate') {
      const count = [...state.ids].filter((id) => programme.talkById.get(id).date === date).length;
      if (count) picker.append(element('span', 'date-count', String(count)));
    }
    nav.append(picker);
  }
  return nav;
}

function empty(message, detailText) {
  return element('div', 'empty surface', [element('h2', '', message), element('p', '', detailText)]);
}

function badge(type) {
  return element('span', 'type type-' + type, typeLabel(type));
}

function trackColor(node, session) {
  const [accent, fill] = sessionColors(session);
  node.style.setProperty('--track-accent', accent);
  node.style.setProperty('--track-fill', fill);
}

function sessionCard(session) {
  const count = programme.bySession.get(session.id).length;
  const card = button('', 'session-card', (event) => showDetails('session', session.id, event.currentTarget));
  card.setAttribute('aria-haspopup', 'dialog');
  trackColor(card, session);
  const meta = session.code ? [element('span', 'code', session.code), badge(session.type)] : [badge(session.type)];
  const summary = [sessionRoom(session), count ? `${count} talk${count === 1 ? '' : 's'}` : ''].filter(Boolean).join(' · ');
  const arrow = element('span', 'session-arrow');
  arrow.setAttribute('aria-hidden', 'true');
  card.append(element('span', 'meta', meta), element('strong', 'session-title', session.title),
    element('span', 'session-time', time(session)), element('span', 'session-location', summary), arrow);
  return card;
}

function groupedSessions(sessions) {
  const groups = new Map();
  for (const session of sessions) {
    const start = session.start || '';
    if (!groups.has(start)) groups.set(start, []);
    groups.get(start).push(session);
  }
  const output = element('div', 'timeline');
  const date = state.programmeDate;
  if (!state.openBlocks.has(date)) {
    const initial = [...groups].find(([, entries]) => entries.some((item) => programme.bySession.get(item.id).length));
    state.openBlocks.set(date, new Set(initial ? [initial[0]] : []));
  }
  const expanded = state.openBlocks.get(date);
  for (const [start, entries] of groups) {
    const ends = new Set(entries.map((item) => item.end));
    const range = ends.size === 1 ? time(entries[0]) : `${start} start`;
    const block = element('details', 'time-block');
    block.open = expanded.has(start);
    const posterBlock = entries.every((item) => item.type === 'poster' || item.title === 'Poster Session');
    const label = entries.length === 1 ? entries[0].title
      : posterBlock ? 'Poster session' : `${entries.length} parallel sessions`;
    const context = entries.length === 1 ? sessionRoom(entries[0])
      : posterBlock ? `${entries.filter((item) => item.type === 'poster').length} poster areas`
        : [...new Set(entries.map((item) => typeLabel(item.type)))].join(' · ');
    const chevron = element('span', 'chevron');
    chevron.setAttribute('aria-hidden', 'true');
    const summary = element('summary', 'time-summary', [
      element('span', 'time-axis', range),
      element('span', 'time-summary-text', [element('strong', '', label), ...(context ? [element('span', '', context)] : [])]),
      chevron,
    ]);
    const colors = [...new Set(entries.map((item) => sessionColors(item)[0]))];
    const swatches = element('span', 'track-swatches', colors.map((color) => {
      const swatch = element('span', '');
      swatch.style.backgroundColor = color;
      return swatch;
    }));
    swatches.setAttribute('aria-hidden', 'true');
    summary.insertBefore(swatches, chevron);
    block.append(summary, element('div', 'session-list', entries.map(sessionCard)));
    block.addEventListener('toggle', () => {
      if (block.open) expanded.add(start);
      else expanded.delete(start);
    });
    output.append(block);
  }
  return output;
}

function renderDay() {
  const sessions = programme.sessions.filter((session) => session.date === state.programmeDate).sort(chronological);
  const heading = element('div', 'section-header', [element('h2', '', longDay(state.programmeDate))]);
  byId('programme-results').replaceChildren(heading, groupedSessions(sessions));
  for (const picker of content.querySelectorAll('.date')) {
    picker.setAttribute('aria-pressed', String(picker.getAttribute('aria-label') === dayLabel(state.programmeDate)));
  }
}

function selectionButton(item, compact) {
  const selected = state.ids.has(item.id);
  const label = selected ? 'Remove from My Agenda' : 'Add to My Agenda';
  const action = button(compact ? (selected ? '✓' : '+') : label,
    compact ? 'save-button' : 'button primary', () => toggleAgenda(item));
  action.setAttribute('aria-label', `${label}: ${item.title || item.code || 'presentation'}`);
  action.setAttribute('aria-pressed', String(selected));
  action.dataset.save = item.id;
  return action;
}

function talkRow(item, options = {}) {
  const parent = programme.sessionById.get(item.sessionId);
  const article = element('article', 'talk-row surface');
  trackColor(article, parent);
  const detailButton = button('', 'talk-open', (event) => showDetails('talk', item.id, event.currentTarget, options.inside ? parent.id : null));
  const meta = [badge(item.type)];
  if (item.code) meta.push(element('span', 'code', item.code));
  if (options.date) meta.push(element('span', 'code', dayLabel(item.date)));
  detailButton.setAttribute('aria-haspopup', 'dialog');
  const location = [!options.agenda && time(item), !options.inside && roomLabel(parent)].filter(Boolean).join(' · ');
  if (options.agenda) detailButton.append(element('span', 'agenda-time', time(item)));
  detailButton.append(element('span', 'meta', meta), element('strong', 'talk-title', item.title || 'Not specified'),
    element('span', 'talk-location', location));
  if (options.search && item.authors.length) {
    const summary = item.authors[0] + (item.authors.length > 1 ? ` + ${item.authors.length - 1}` : '');
    detailButton.append(element('span', 'byline', summary));
  }
  if (item.timeNote) detailButton.append(element('span', 'overlap', 'Check programme time'));
  if (options.overlap) detailButton.append(element('span', 'overlap', 'Time overlap'));
  article.append(detailButton, selectionButton(item, true));
  return article;
}

function filterControl(key, label, all, entries) {
  const input = element('select', '');
  input.name = key;
  input.append(new Option(all, ''));
  for (const [value, description] of entries) input.append(new Option(description, value));
  input.value = state.filters[key] || '';
  input.addEventListener('change', () => {
    state.filters[key] = input.value;
    resultLimit = pageSize;
    renderResults();
  });
  return element('label', 'filter', [element('span', '', label), input]);
}

function renderProgramme() {
  const query = element('input', 'query');
  query.type = 'search';
  query.placeholder = 'Title, author or code';
  query.value = state.filters.query || '';
  query.addEventListener('input', () => {
    state.filters.query = query.value;
    resultLimit = pageSize;
    renderResults();
  });
  const tracks = [...new Set(programme.sessions.map((item) => item.track).filter(Boolean))].sort();
  const types = [...new Set(programme.presentations.map((item) => item.type))].sort();
  const rooms = [...new Map(programme.sessions.filter((item) => item.room)
    .map((item) => [roomKey(item.room), item.room])).entries()].sort((a, b) => a[1].localeCompare(b[1]));
  const filters = element('div', 'filters', [
    filterControl('date', 'Date', 'All dates', programme.dates.map((item) => [item, dayLabel(item)])),
    filterControl('track', 'Area', 'All areas', tracks.map((item) => [item, item])),
    filterControl('type', 'Type', 'All types', types.map((item) => [item, typeLabel(item)])),
    filterControl('room', 'Room', 'All rooms', rooms),
  ]);
  filters.id = 'programme-filters';
  filters.hidden = !state.filtersOpen;
  const filterButton = button('Filters', 'button filter-toggle', () => {
    state.filtersOpen = !state.filtersOpen;
    filters.hidden = !state.filtersOpen;
    filterButton.setAttribute('aria-expanded', String(state.filtersOpen));
  });
  filterButton.id = 'filter-toggle';
  filterButton.setAttribute('aria-controls', filters.id);
  filterButton.setAttribute('aria-expanded', String(state.filtersOpen));
  const queryLabel = element('label', 'search-label', [element('span', 'sr-only', 'Search presentations'), query]);
  const reset = button('Clear search and filters', 'button text-button', () => {
    state.filters = {};
    resultLimit = pageSize;
    query.value = '';
    filters.querySelectorAll('select').forEach((input) => { input.value = ''; });
    renderResults();
    query.focus({ preventScroll: true });
  });
  reset.id = 'clear-filters';
  const toolbar = element('div', 'search-controls glass refractive', [
    element('div', 'search-line', [queryLabel, filterButton]), filters,
  ]);
  const days = dateControls('programmeDate');
  days.id = 'programme-dates';
  const results = element('div', 'results');
  results.id = 'programme-results';
  content.replaceChildren(toolbar, days, reset, results);
  renderResults();
}

function renderResults() {
  const filters = state.filters;
  const tokens = normalize(filters.query || '').trim().split(/\s+/).filter(Boolean);
  const filterCount = filterKeys.filter((key) => filters[key]).length;
  const searching = Boolean(tokens.length || filterCount);
  byId('programme-dates').hidden = searching;
  byId('clear-filters').hidden = !searching;
  byId('filter-toggle').textContent = filterCount ? `Filters · ${filterCount}` : 'Filters';
  if (!searching) {
    renderDay();
    return;
  }
  const matches = programme.presentations.filter((item) => {
    const session = programme.sessionById.get(item.sessionId);
    return (!filters.date || item.date === filters.date)
      && (!filters.track || session.track === filters.track)
      && (!filters.type || item.type === filters.type)
      && (!filters.room || roomKey(session.room) === filters.room)
      && tokens.every((token) => item.search.includes(token));
  });
  const summary = element('p', 'results-summary', `${matches.length.toLocaleString('en-GB')} presentation${matches.length === 1 ? '' : 's'}`);
  summary.setAttribute('role', 'status');
  const results = byId('programme-results');
  results.replaceChildren(summary);
  if (!matches.length) {
    results.append(empty('No presentations found', 'Try a different keyword or change the date, area, type or room filters.'));
    return;
  }
  results.append(element('div', 'talk-list', matches.slice(0, resultLimit).map((item) => talkRow(item, { date: true, search: true }))));
  if (matches.length > resultLimit) {
    results.append(button('Show more presentations', 'button subtle show-more', () => {
      const oldLimit = resultLimit;
      resultLimit += pageSize;
      renderResults();
      results.querySelectorAll('.talk-open')[oldLimit]?.focus();
    }));
  }
}

function renderAgenda() {
  const day = state.agendaDate;
  const selected = [...state.ids].map((id) => programme.talkById.get(id));
  const items = selected.filter((item) => item.date === day).sort(chronological);
  const overlapping = conflicts(items);
  const heading = element('h2', '', longDay(day));
  const clear = button('Clear My Agenda', 'button subtle', () => {
    clearDialog.returnValue = 'cancel';
    clearDialog.showModal();
  });
  content.replaceChildren(dateControls('agendaDate'),
    element('div', 'section-header', [heading, ...(selected.length ? [clear] : [])]));
  const savedNote = element('p', 'saved-note', 'Your selections are saved in this browser on this device.');
  content.append(savedNote);
  if (!items.length) {
    content.append(empty('Your agenda is empty for this day', 'Save a presentation from Programme to add it to this day.'));
    return;
  }
  if (overlapping.size) {
    content.append(element('p', 'notice', 'Some saved presentations overlap. You can keep both and decide which to attend.'));
  }
  const list = element('div', 'talk-list agenda-list',
    items.map((item) => talkRow(item, { agenda: true, overlap: overlapping.has(item.id) })));
  const preview = button('Preview agenda card', 'button primary preview-trigger',
    () => openAgendaPreview(day, items, overlapping));
  preview.setAttribute('aria-haspopup', 'dialog');
  content.append(preview, list);
}

function openAgendaPreview(day, items, overlapping) {
  const frame = byId('preview-image');
  byId('preview-date').textContent = longDay(day);
  byId('preview-status').textContent = 'Preparing preview…';
  previewDownload.disabled = true;
  const request = Symbol();
  previewRequest = request;
  previewDialog.showModal();
  previewDialog.scrollTop = 0;
  // Let the sheet paint before typesetting a full conference day.
  requestAnimationFrame(() => requestAnimationFrame(() => {
    if (!previewDialog.open || previewRequest !== request) return;
    try {
      previewCalendar = agendaCalendar(day, items, programme.sessionById, overlapping);
      frame.setAttribute('aria-label', `Calendar for ${longDay(day)}, ${items.length} saved presentation${items.length === 1 ? '' : 's'}`);
      frame.replaceChildren(...previewCalendar.renderPreview());
      byId('preview-status').textContent = '';
      previewDownload.disabled = false;
    } catch {
      byId('preview-status').textContent = 'The calendar could not be rendered. Close and reopen the preview to retry.';
    }
  }));
}

previewDownload.addEventListener('click', async () => {
  const calendar = previewCalendar;
  const status = byId('preview-status');
  previewDownload.disabled = true;
  status.textContent = 'Preparing PNG…';
  try {
    await downloadCalendar(calendar);
    if (previewCalendar === calendar) status.textContent = 'PNG download started.';
  } catch {
    if (previewCalendar === calendar) status.textContent = 'Could not create the PNG. Please try again.';
  } finally {
    if (previewCalendar === calendar) previewDownload.disabled = false;
  }
});
byId('preview-close').addEventListener('click', () => previewDialog.close());
previewDialog.addEventListener('close', () => {
  if (previewDialog.open) return;
  previewCalendar = undefined;
  byId('preview-image').replaceChildren();
});

function showDetails(kind, id, origin, sessionId = null) {
  if (!dialog.open) {
    returnFocus = origin;
    dialog.showModal();
  }
  detail = { kind, id, sessionId };
  renderDetails();
  byId('detail-title').focus({ preventScroll: true });
  dialog.scrollTop = 0;
}

function facts(rows) {
  return element('dl', 'facts', rows.flatMap(([name, value]) => [element('dt', '', name), element('dd', '', value)]));
}

function renderDetails() {
  const panel = byId('detail-content');
  const isSession = detail.kind === 'session';
  const item = (isSession ? programme.sessionById : programme.talkById).get(detail.id);
  const session = isSession ? item : programme.sessionById.get(item.sessionId);
  const title = element('h2', 'detail-title', item.title || 'Not specified');
  title.id = 'detail-title';
  title.tabIndex = -1;
  byId('detail-back').hidden = !detail.sessionId;
  const date = longDay(item.date);
  const details = [['Date', date], ['Time (KST)', timeLabel(item)], ['Room', roomLabel(session)]];
  if (item.code) details.unshift([isSession ? 'Session code' : 'Presentation code', item.code]);
  if (!isSession) details.push(['Session', [session.code, session.title].filter(Boolean).join(' · ')]);
  if (!isSession && !item.start && session.start) details.push(['Session window (KST)', timeLabel(session)]);
  if (item.sharedWindow) details.push(['Poster board', 'Not specified']);
  if (session.track) details.push(['Area', session.track]);
  panel.replaceChildren(badge(item.type), title, facts(details));
  if (isSession) {
    const talks = programme.bySession.get(item.id);
    if (talks.length) {
      panel.append(element('h3', 'detail-section', 'Presentations'),
        element('div', 'talk-list', talks.map((talk) => talkRow(talk, { inside: true }))));
    }
    return;
  }
  if (item.timeNote) panel.append(element('p', 'notice', item.timeNote));
  if (item.sharedWindow) panel.append(element('p', 'saved-note', 'This is the shared poster-session window.'));
  if (item.authors.length) {
    panel.append(element('h3', 'detail-section', 'Authors / speakers'),
      element('p', 'authors', item.authors.join(', ')));
  } else {
    panel.append(element('p', 'saved-note', 'Authors / speakers: Not specified'));
  }
  panel.append(selectionButton(item, false));
}

function storageMessage(available) {
  const message = byId('storage-warning');
  message.hidden = available;
  message.textContent = available ? '' : 'Browser storage is unavailable. Selections may be lost when you close or reload this page.';
}

function navCount() {
  byId('nav-count').textContent = state.ids.size ? String(state.ids.size) : '';
}

function toggleAgenda(item) {
  const wasSaved = state.ids.has(item.id);
  if (wasSaved) state.ids.delete(item.id);
  else {
    if (state.ids.size === 0) state.agendaDate = item.date;
    state.ids.add(item.id);
  }
  storageMessage(saveAgenda(state.ids));
  navCount();
  byId('announcement').textContent = wasSaved ? 'Removed from My Agenda.' : 'Added to My Agenda.';
  const active = document.activeElement;
  if (state.view === 'agenda') renderAgenda();
  if (dialog.open) renderDetails();
  for (const current of document.querySelectorAll('[data-save]')) {
    if (current.dataset.save !== item.id) continue;
    const newButton = selectionButton(item, current.classList.contains('save-button'));
    current.replaceWith(newButton);
    if (active === current) newButton.focus({ preventScroll: true });
  }
  if (active?.dataset.save && !active.isConnected && document.activeElement === document.body) {
    const root = dialog.open ? dialog : content;
    ([...root.querySelectorAll('[data-save]')].find((node) => node.dataset.save === item.id)
      || root.querySelector('[data-save], .date[aria-pressed="true"]'))?.focus({ preventScroll: true });
  }
}

function render() {
  byId('view-title').textContent = views[state.view];
  for (const link of byId('navigation').querySelectorAll('a')) {
    if (link.dataset.view === state.view) link.setAttribute('aria-current', 'page');
    else link.removeAttribute('aria-current');
  }
  navCount();
  if (state.view === 'agenda') renderAgenda();
  else renderProgramme();
}

function navigate(scroll = false) {
  if (!programme) return;
  const key = location.hash.slice(1);
  if (key === 'main') return;
  state.view = Object.prototype.hasOwnProperty.call(views, key) ? key : 'programme';
  if (dialog.open) dialog.close();
  if (previewDialog.open) previewDialog.close();
  render();
  if (scroll) window.scrollTo({ top: 0, behavior: 'auto' });
  if (key === 'explore') content.querySelector('.query')?.focus({ preventScroll: true });
}

async function start() {
  try {
    programme = await loadProgramme();
    const date = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit',
    }).formatToParts(new Date());
    const part = (type) => date.find((item) => item.type === type).value;
    const today = [part('year'), part('month'), part('day')].join('-');
    state.programmeDate = programme.dates.includes(today) ? today : programme.dates[0];
    const saved = restoreAgenda(programme.talkById);
    state.ids = saved.ids;
    const savedDates = [...state.ids].map((id) => programme.talkById.get(id).date).sort();
    state.agendaDate = savedDates.includes(today) ? today : savedDates[0] || state.programmeDate;
    storageMessage(saved.available);
    navigate();
  } catch {
    const error = empty('Programme could not be loaded', 'Reload to try again. If you opened a local copy, serve the folder over HTTP first.');
    error.append(button('Reload', 'button primary', () => location.reload()));
    content.replaceChildren(error);
  }
}

byId('detail-close').addEventListener('click', () => dialog.close());
byId('detail-back').addEventListener('click', () => showDetails('session', detail.sessionId));
dialog.addEventListener('close', () => {
  if (dialog.open) return;
  byId('detail-content').replaceChildren();
  if (returnFocus?.isConnected) returnFocus.focus({ preventScroll: true });
  else content.querySelector('.date[aria-pressed="true"], .query')?.focus({ preventScroll: true });
});
clearDialog.addEventListener('close', () => {
  if (clearDialog.returnValue === 'clear') {
    state.ids.clear();
    storageMessage(saveAgenda(state.ids));
    render();
    content.querySelector('.date[aria-pressed="true"]')?.focus();
  }
});
window.addEventListener('hashchange', () => navigate(true));
window.addEventListener('storage', (event) => {
  if (programme && (event.key === storageKey || event.key === null)) {
    const saved = restoreAgenda(programme.talkById);
    state.ids = saved.ids;
    storageMessage(saved.available);
    render();
    if (dialog.open) renderDetails();
  }
});
start();
