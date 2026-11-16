import { chronological, dayLabel, loadProgramme, longDay, normalize, roomLabel, timeLabel, typeLabel } from './programme.js';
import { conflicts, restoreAgenda, saveAgenda, storageKey } from './agenda.js';
import { agendaCards, downloadCard } from './export.js';

const byId = (id) => document.getElementById(id);
const content = byId('content');
const dialog = byId('details');
const clearDialog = byId('clear-dialog');
const views = {
  programme: ['Programme', 'Browse sessions and presentations by day. All times are in Korea Standard Time.'],
  explore: ['Explore', 'Find presentations by title, author, code or topic.'],
  agenda: ['My Agenda', 'Review your saved presentations and download a daily agenda card.'],
};
const state = { view: 'programme', programmeDate: '', agendaDate: '', filters: {}, ids: new Set(), grid: true };
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
  const nav = element('div', 'dates glass');
  nav.setAttribute('aria-label', 'Choose a programme date');
  for (const date of programme.dates) {
    const picker = button(dayLabel(date), 'date', () => {
      state[key] = date;
      render();
      content.querySelector('[aria-pressed="true"].date')?.focus({ preventScroll: true });
    });
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

function sessionCard(session) {
  const count = programme.bySession.get(session.id).length;
  const card = button('', 'session-card', (event) => showDetails('session', session.id, event.currentTarget));
  card.append(
    element('span', 'meta', [badge(session.type), ...(session.code ? [element('span', 'code', session.code)] : [])]),
    element('strong', 'session-title', session.title),
    element('span', 'session-time', time(session)),
    element('span', 'session-location', sessionRoom(session)),
  );
  if (count) card.append(element('span', 'session-count', `${count} presentation${count === 1 ? '' : 's'} →`));
  return card;
}

function groupedSessions(sessions) {
  const groups = new Map();
  for (const session of sessions) {
    const label = session.start || 'Time not specified';
    if (!groups.has(label)) groups.set(label, []);
    groups.get(label).push(session);
  }
  const output = element('div', 'timeline');
  for (const [label, entries] of groups) {
    output.append(element('section', 'time-group', [
      element('h3', 'time-axis', label),
      element('div', 'session-list', entries.map(sessionCard)),
    ]));
  }
  return output;
}

function roomNumber(session) {
  return /^Session Room ([1-7])/.exec(session.room || '')?.[1]
    || (/^Room 301/.test(session.room || '') ? '7' : '')
    || (/Grand Ballroom \(201\+202\)/.test(session.room || '') ? '5' : '');
}

function renderProgramme() {
  const sessions = programme.sessions.filter((session) => session.date === state.programmeDate).sort(chronological);
  const heading = element('h2', '', longDay(state.programmeDate));
  const toggle = button(state.grid ? 'List view' : 'Room timetable', 'button subtle grid-switch', () => {
    state.grid = !state.grid;
    render();
    content.querySelector('.grid-switch')?.focus();
  });
  toggle.setAttribute('aria-label', state.grid ? 'Switch to list view' : 'Switch to room timetable');
  const technical = sessions.filter((session) => roomNumber(session) && session.type !== 'poster');
  const columns = [...new Set(technical.map(roomNumber))].sort();
  const useGrid = columns.length > 1 && state.grid;
  const header = element('div', 'section-header', [heading, ...(columns.length > 1 ? [toggle] : [])]);
  content.replaceChildren(dateControls('programmeDate'), header);
  if (useGrid) {
    const table = element('table', 'timetable');
    const colGroup = element('colgroup', '');
    colGroup.append(element('col', 'time-col'), ...columns.map(() => element('col', '')));
    const head = element('thead', '', [element('tr', '', [
      element('th', '', 'Start (KST)'),
      ...columns.map((number) => element('th', '', 'Room ' + number)),
    ])]);
    for (const th of head.querySelectorAll('th')) th.scope = 'col';
    const body = element('tbody', '');
    const starts = [...new Set(technical.map((session) => session.start))];
    for (const start of starts) {
      const hour = element('th', 'time-axis', start || 'Not specified');
      hour.scope = 'row';
      body.append(element('tr', '', [hour, ...columns.map((number) => element('td', '',
        technical.filter((session) => session.start === start && roomNumber(session) === number).map(sessionCard),
      ))]));
    }
    table.append(colGroup, head, body);
    const elsewhere = sessions.filter((session) => !technical.includes(session));
    const grid = element('div', 'desktop-schedule', [table]);
    if (elsewhere.length) {
      grid.append(element('h2', 'other-heading', 'Other locations and events'), groupedSessions(elsewhere));
    }
    content.append(grid);
  }
  const list = groupedSessions(sessions);
  list.classList.toggle('mobile-schedule', useGrid);
  content.append(list);
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
  const detailButton = button('', 'talk-open', (event) => showDetails('talk', item.id, event.currentTarget, options.inside ? parent.id : null));
  const meta = [badge(item.type)];
  if (item.code) meta.push(element('span', 'code', item.code));
  if (options.date) meta.push(element('span', 'code', dayLabel(item.date)));
  const location = [time(item), !options.inside && roomLabel(parent)].filter(Boolean).join(' · ');
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

function filterControl(key, label, entries) {
  const input = element('select', '');
  input.name = key;
  input.append(new Option('All ' + label.toLowerCase(), ''));
  for (const [value, description] of entries) input.append(new Option(description, value));
  input.value = state.filters[key] || '';
  input.addEventListener('change', () => {
    state.filters[key] = input.value;
    resultLimit = pageSize;
    renderResults();
  });
  return element('label', 'filter', [element('span', '', label), input]);
}

function renderExplore() {
  const query = element('input', 'query');
  query.type = 'search';
  query.placeholder = 'Search presentations';
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
    filterControl('date', 'Dates', programme.dates.map((item) => [item, dayLabel(item)])),
    filterControl('track', 'Areas', tracks.map((item) => [item, item])),
    filterControl('type', 'Types', types.map((item) => [item, typeLabel(item)])),
    filterControl('room', 'Rooms', rooms),
  ]);
  const queryLabel = element('label', 'search-label', [element('span', 'sr-only', 'Search presentations'), query]);
  const results = element('div', 'results');
  results.id = 'results';
  content.replaceChildren(element('div', 'search-controls glass', [queryLabel, filters]), results);
  renderResults();
}

function renderResults() {
  const filters = state.filters;
  const tokens = normalize(filters.query || '').trim().split(/\s+/).filter(Boolean);
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
  const results = byId('results');
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
    content.append(empty('Your agenda is empty for this day', 'Save a presentation in Programme or Explore to add it to this day.'));
    return;
  }
  if (overlapping.size) {
    content.append(element('p', 'notice', 'Some saved presentations overlap. You can keep both and decide which to attend.'));
  }
  const list = element('div', 'talk-list', items.map((item) => talkRow(item, { overlap: overlapping.has(item.id) })));
  const preview = element('section', 'export-panel surface');
  preview.id = 'agenda-preview';
  preview.tabIndex = -1;
  preview.append(element('h3', '', 'Daily agenda card'));
  const cards = agendaCards(day, items, programme.sessionById);
  let cardIndex = 0;
  let visibleCard;
  const status = element('p', 'export-status', '');
  status.setAttribute('role', 'status');
  const frame = element('div', 'card-preview');
  const pagination = element('div', 'pagination');
  const download = button('', 'button primary', async () => {
    try {
      await downloadCard(visibleCard, day, cardIndex, cards.length);
      status.textContent = 'PNG download started.';
    } catch {
      status.textContent = 'Could not create the PNG. Please try again.';
    }
  });
  function showCard() {
    visibleCard = cards[cardIndex]();
    frame.replaceChildren(visibleCard);
    download.textContent = cards.length > 1 ? `Download part ${cardIndex + 1} PNG` : 'Download PNG';
    status.textContent = '';
    previous.disabled = cardIndex === 0;
    next.disabled = cardIndex === cards.length - 1;
    pageNumber.textContent = `Part ${cardIndex + 1} of ${cards.length}`;
  }
  const previous = button('Previous', 'button subtle', () => { cardIndex--; showCard(); });
  const next = button('Next', 'button subtle', () => { cardIndex++; showCard(); });
  const pageNumber = element('span', '', '');
  pageNumber.setAttribute('aria-live', 'polite');
  if (cards.length > 1) pagination.append(previous, pageNumber, next);
  const actions = element('div', 'actions', [download]);
  if (cards.length > 1) {
    actions.append(button('Download all PNGs', 'button subtle', async () => {
      try {
        for (const [index, card] of cards.entries()) {
          await downloadCard(card(), day, index, cards.length);
        }
        status.textContent = 'Download requests sent. If your browser blocks multiple files, download each part from its preview.';
      } catch {
        status.textContent = 'Some cards could not be downloaded. Use each part’s download button to retry.';
      }
    }));
  }
  preview.append(frame, pagination, actions, status);
  showCard();
  content.append(button('Preview agenda card', 'button subtle jump-preview', () => {
    preview.scrollIntoView({ block: 'start' });
    preview.focus({ preventScroll: true });
  }), element('div', 'agenda-layout', [list, preview]));
}

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
  const [title, description] = views[state.view];
  byId('view-title').textContent = title;
  byId('view-description').textContent = description;
  for (const link of byId('navigation').querySelectorAll('a')) {
    if (link.dataset.view === state.view) link.setAttribute('aria-current', 'page');
    else link.removeAttribute('aria-current');
  }
  navCount();
  ({ programme: renderProgramme, explore: renderExplore, agenda: renderAgenda })[state.view]();
}

function navigate(scroll = false) {
  if (!programme) return;
  const key = location.hash.slice(1);
  if (key === 'main') return;
  state.view = Object.prototype.hasOwnProperty.call(views, key) ? key : 'programme';
  if (dialog.open) dialog.close();
  render();
  if (scroll) window.scrollTo({ top: 0, behavior: 'auto' });
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
