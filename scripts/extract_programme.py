"""Extract programme metadata from the supplied WCPEC-9 edition (requires PyMuPDF)."""
import argparse
from collections import Counter, defaultdict
from dataclasses import dataclass
import json
from pathlib import Path
import re

import fitz

ORAL = r'[1-7][A-E]O\.\d+'
TALK = re.compile(rf'^(?P<code>{ORAL}-(?:OP|IV|KN)-\d+|Pl\.\d+|\d-\d-[ABD]P-\d+|[A-Za-z][A-Za-z0-9]*(?:-[A-Z0-9]+)*-\d+)(?![\w-])')
TIME = re.compile(r'(?<!\d)(\d{1,2}:[0-5]\d)\s*[-–—−:]\s*(\d{1,2}:[0-5]\d)(?!\d)')
TRACKS = {
    1: 'Tandem Solar PV', 2: 'Silicon Solar PV Technology',
    3: 'Perovskite Solar PV Technology', 4: 'Thin-Film and Emerging Solar PV Technology',
    5: 'PV Module and System Engineering, Integrated/Applied PV',
    6: 'PV Expansion: Frontiers in Photovoltaic Science and Technology',
    7: 'PV in the Energy Transition',
}
TABLES = {16: (87, 88), 17: (97, 98), 18: (115, 116), 19: (139, 140), 20: (159, 160)}
DETAILS = {16: (89, 96), 17: (99, 114), 18: (117, 138), 19: (141, 158), 20: (161, 164)}


@dataclass
class Line:
    x: float
    y: float
    size: float
    font: str
    text: str
    right: float


def clean(text):
    return ' '.join(text.replace('\u00ad', '').replace('\x07', '').split())


def lines(page):
    result = []
    for block in page.get_text('dict', flags=fitz.TEXTFLAGS_DICT & ~fitz.TEXT_PRESERVE_IMAGES)['blocks']:
        for line in block.get('lines', []):
            spans = line['spans']
            if not spans:
                continue
            main = max(spans, key=lambda span: len(span['text'].strip()))
            text = clean(''.join(span['text'] for span in spans))
            if text:
                result.append(Line(line['bbox'][0], main['origin'][1], spans[0]['size'],
                                   spans[0]['font'], text, line['bbox'][2]))
    return sorted(result, key=lambda row: (round(row.y, 1), row.x))


def hours(text):
    match = TIME.search(text)
    return tuple(part.zfill(5) for part in match.groups()) if match else (None, None)


def wrapped(parts):
    result = ''
    for part in parts:
        result += ('' if not result or result.endswith('-') else ' ') + part
    return clean(result)


def authors(parts):
    value = ' '.join(parts)
    marker = r'[¹²³⁴⁵⁶⁷⁸⁹⁰*†‡]+'
    # Affiliation numbers can have their own comma and a few bylines omit an
    # author separator after the final affiliation. Keep printed author order.
    value = re.sub(rf'{marker}(?:\s*[,;]\s*{marker})+', '*', value)
    value = re.sub(rf'{marker}(?=\s*[A-ZÀ-ÖØ-Þ])', ',', value)
    value = re.sub(marker, '', value)
    value = re.sub(r'(?<=[^\W\d_])\s*\d+(?=\s*(?:[,;]|$))', '', value)
    return [name for section in re.split(r'[,;]', value)
            if (name := clean(section)).strip('.') and not name.isdigit()]


def typography(page):
    spans = []
    for block in page.get_text('dict', flags=fitz.TEXTFLAGS_DICT & ~fitz.TEXT_PRESERVE_IMAGES)['blocks']:
        for line in block.get('lines', []):
            spans.extend(line['spans'])
    return spans


def assembled(spans, selected, title=False):
    """Reconstruct lines sorted by baseline and horizontal position."""
    baselines = sorted({round(span['origin'][1], 1) for span in selected})
    groups = {y: [] for y in baselines}
    for span in spans:
        if not baselines:
            break
        x, y = span['origin']
        baseline = min(baselines, key=lambda b: abs(b - y))
        tolerance = 5 if span['size'] < 7 and title else .7
        if x > 88 and abs(baseline - y) <= tolerance and (
                span in selected or title and 4 < span['size'] < 7 and 'Semibold' in span['font']):
            groups[baseline].append(span)
    result = []
    for group in groups.values():
        text = ''
        prev = None
        for span in sorted(group, key=lambda span: span['origin'][0]):
            if prev and span['origin'][0] - prev['bbox'][2] > 2.6 and not title:
                text += ' '
            text += span['text']
            prev = span
        if clean(text):
            result.append(clean(text))
    return result


def table_mapping(doc, issues):
    result = {}
    for day, pages in TABLES.items():
        for page in pages:
            rows = lines(doc[page - 1])
            rooms = []
            spans = []
            for row in rows:
                for room in re.finditer(r'Session Room \d\s*\([\d+-]+\)', row.text):
                    x = row.x + (row.right - row.x) * (room.start() + len(room[0]) / 2) / len(row.text)
                    rooms.append((x, room[0]))
                time = TIME.search(row.text)
                if time and row.y > 150:
                    x = row.x + (row.right - row.x) * time.start() / len(row.text)
                    room = min(rooms, key=lambda item: abs(item[0] - (x + 28)))[1] if rooms else None
                    spans.append((row.y, room, hours(time[0])))
            for row in rows:
                if row.y < 160:
                    continue
                for match in re.finditer(rf'{ORAL}|Plenary Session [1-5]', row.text):
                    x = row.x + (row.right - row.x) * match.start() / len(row.text)
                    room = min(rooms, key=lambda item: abs(item[0] - (x + 28)))[1] if rooms else None
                    prior = [entry for entry in spans if entry[1] == room and 0 <= row.y - entry[0] <= 32]
                    code = match[0]
                    if (day, code) in result:
                        issues.append(f'Timetable has repeated {code} on {day} November (PDF page {page}).')
                    if not prior:
                        issues.append(f'Timetable time could not be associated with {code} (PDF page {page}).')
                    result[day, code] = (* (prior[-1][2] if prior else (None, None)), room, page)
    return result


def blocks(doc, pages):
    """Group the PDF's positioned labels and text by section heading and presentation code."""
    section = ''
    heading_parts = []
    for page in pages:
        pdf_page = doc[page - 1]
        rows = [row for row in lines(pdf_page) if 95 < row.y < 705]
        spans = typography(pdf_page)
        markers = []
        for row in rows:
            match = TALK.match(row.text)
            if match and row.x < 110 and row.size < 10:
                markers.append((row.y, 'code', match['code'], row))
            elif 11 <= row.size < 13 and 'Semibold' in row.font:
                markers.append((row.y, 'heading', row.text, row))
        for index, (y, kind, label, row) in enumerate(markers):
            if kind == 'heading':
                if index and markers[index - 1][1] == 'heading' and y - markers[index - 1][0] < 22:
                    heading_parts.append(label)
                else:
                    heading_parts = [label]
                section = wrapped(heading_parts)
                continue
            end = markers[index + 1][0] - 2 if index + 1 < len(markers) else 705
            body = [item for item in rows if y - 2.0 <= item.y < end and item is not row and item.x > 88 and not (item.size == 8 and item.text.isdigit() and item.x > 440)]
            inline = row.text[len(label):].strip()
            candidate = [span for span in spans if span['origin'][0] > 88 and y - 2 <= span['origin'][1] < end]
            author_spans = [span for span in candidate if 7.5 <= span['size'] < 9 and
                            'Regular' in span['font'] and not TIME.fullmatch(clean(span['text'])) and
                            not re.search(r'Department of|\bAffiliation\b', span['text'])]
            # The first author baseline ends the title even if a subsequent
            # uncoded timetable entry follows the affiliation.
            title_end = min((span['origin'][1] - 2 for span in author_spans), default=end)
            title_spans = [span for span in candidate if span['origin'][1] < title_end and
                           span['size'] >= 9.2 and 'Semibold' in span['font']]
            title = assembled(candidate, title_spans, title=True)
            if inline and not TIME.fullmatch(inline) and not (title and title[0] == inline):
                title.insert(0, inline)
            if title_spans:
                title_bottom = max(span['origin'][1] for span in title_spans)
                author_spans = [span for span in author_spans if span['origin'][1] > title_bottom + 3]
            # Affiliations are italic and set smaller. Stop the byline there.
            if author_spans:
                first_author = min(span['origin'][1] for span in author_spans)
                affiliation = min((span['origin'][1] for span in candidate if
                                   span['origin'][1] > first_author and 'Light' in span['font']), default=end)
                author_spans = [span for span in author_spans if span['origin'][1] < affiliation]
            byline = assembled(candidate, author_spans)
            when = hours(row.text)
            if when[0] is None:
                when = next((hours(item.text) for item in body if TIME.fullmatch(item.text)), when)
            yield page, section, label, wrapped(title), authors(byline), when


def extraction(doc, special):
    issues = []
    mappings = table_mapping(doc, issues)
    sessions = {}
    presentations = []
    day_text = lambda day: f'2026-11-{day:02d}'

    def session(day, key, title, kind, when, room, page, timetable=None, track=None, code=None):
        identity = f'{day_text(day)}-{key}'
        item = sessions.setdefault(identity, dict(
            id=identity, date=day_text(day), code=code, title=title, type=kind, start=when[0],
            end=when[1], room=room, track=track, sourcePage=page, timetablePage=timetable))
        if item['sourcePage'] == item['timetablePage'] and page != timetable:
            item['sourcePage'] = page
            item['title'] = title
        return identity

    def talk(parent, code, title, names, kind, when, page, shared=False, schedule=None):
        source = sessions[parent]
        identity = f"{source['date']}-{code or 'p' + str(page) + '-' + (when[0] or '').replace(':', '')}"
        prior = [item for item in presentations if item['id'] == identity]
        if prior:
            issues.append(f'{code} is repeated on PDF pages {prior[0]["sourcePage"]} and {page}; page suffix retained.')
            identity += f'-p{page}'
        names = special.get('authorCorrections', {}).get(code, names)
        title = special.get('titleCorrections', {}).get(code, title)
        if code and (not title or not names):
            issues.append(f'{code} needs title/byline review (PDF page {page}).')
        if when[0] and source['start'] and (when[0] < source['start'] or when[1] > source['end']):
            issues.append(f'{code} {when[0]}–{when[1]} falls outside its overview session window (PDF pages {page}, {source["timetablePage"]}).')
        item = dict(id=identity, sessionId=parent, code=code, title=title or None,
                    authors=names, type=kind, date=source['date'], start=when[0], end=when[1],
                    sharedWindow=shared, sourcePage=page, schedulePage=schedule)
        if code in special['timeNotes']:
            item['timeNote'] = special['timeNotes'][code]
        presentations.append(item)

    for (day, code), (start, end, room, page) in mappings.items():
        if re.fullmatch(ORAL, code):
            session(day, code, code, 'oral', (start, end), room, page, page, TRACKS[int(code[0])], code)

    for day, (first, last) in DETAILS.items():
        for page, heading, code, title, names, when in blocks(doc, range(first, last + 1)):
            if code.startswith('Pl.'):
                key = f'Plenary Session {code[-1]}'
                start, end, room, timetable = mappings.get((day, key), (*when, None, None))
                if (start, end) != when:
                    issues.append(f'{code}: detailed listing and plenary speaker profile use {when[0]}–{when[1]}; room timetable uses {start}–{end} (PDF pages {page}, {timetable}). Detailed listing used.')
                parent = session(day, code, key, 'plenary', when, room, page, timetable, code=code)
                kind = 'plenary'
            elif re.match(ORAL, code):
                key = code.split('-')[0]
                start, end, room, timetable = mappings.get((day, key), (None, None, None, None))
                if not room:
                    issues.append(f'{code}: date/code has no matched timetable room (PDF page {page}).')
                title_heading = heading[len(key):].strip() if heading.startswith(key) else key
                parent = session(day, key, title_heading, 'oral', (start, end), room, page, timetable, TRACKS[int(key[0])], key)
                kind = 'invited' if '-IV-' in code else 'keynote' if '-KN-' in code else 'oral'
            else:
                issues.append(f'Unexpected oral-listing code {code} (PDF page {page}).')
                continue
            talk(parent, code, title, names, kind, when, page)

    for page, heading, code, title, names, _ in blocks(doc, range(166, 263)):
        match = re.fullmatch(r'(\d-\d)-([ABD])P-\d+', code)
        if not match:
            issues.append(f'Unexpected poster-listing code {code} (PDF page {page}).')
            continue
        area, group = match.groups()
        day = {'A': 16, 'B': 17, 'D': 19}[group]
        timed = special['posters'][str(day)]
        parent = session(day, f'poster-{area}', heading if heading.startswith(f'Area {area}') else f'Area {area}',
                         'poster', timed[:2], timed[2], page, timed[3], TRACKS[int(area[0])])
        talk(parent, code, title, names, 'poster', timed[:2], page, shared=True, schedule=timed[3])

    for first, last, items, kind in [(60, 61, special['tutorials'], 'tutorial'),
                                        (279, 287, special['workshops'], 'workshop')]:
        for page, _, code, title, names, when in blocks(doc, range(first, last + 1)):
            prefix = code.rsplit('-', 1)[0]
            if prefix not in items:
                issues.append(f'{code} has no recorded schedule join (PDF page {page}).')
                continue
            day, key, session_title, start, end, room, schedule, slots = items[prefix]
            parent = session(day, key, session_title, kind, (start, end), room, page, schedule)
            when = slots.get(code.rsplit('-', 1)[1], when)
            talk_kind = 'keynote' if code in special['keynotes'] else kind
            talk(parent, code, title, names, talk_kind, when, page, schedule=schedule)

    for day, key, title, kind, start, end, room, page in special['events']:
        session(day, key, title, kind, (start, end), room, page, page)
    for item in special.get('tablePresentations', []):
        day, key, code, title, kind, start, end, room, page, names = item
        parent = f'{day_text(day)}-{key}'
        if any(p['sessionId'] == parent and (p['start'], p['end']) == (start, end) for p in presentations):
            continue
        talk(parent, code, title, names, kind, (start, end), page, schedule=page)
    for item in sessions.values():
        if item['code'] in special.get('sessionTitles', {}):
            item['title'] = special['sessionTitles'][item['code']]
        if item['type'] == 'oral' and item['sourcePage'] == item['timetablePage']:
            issues.append(f'{item["code"]} has an overview entry but no matched detailed presentation (PDF page {item["sourcePage"]}).')
    return dict(event=dict(name='WCPEC-9', timezone='Asia/Seoul', city='Daejeon, South Korea'),
                sessions=sorted(sessions.values(), key=lambda item: (item['date'], item['start'] or '99:99', item['id'])),
                presentations=sorted(presentations, key=lambda item: (item['date'], item['start'] or '99:99', item['id']))), issues


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('pdf', type=Path)
    parser.add_argument('--output', type=Path, default=Path('data/programme.json'))
    parser.add_argument('--issues', type=Path)
    args = parser.parse_args()
    curated = json.loads(Path(__file__).with_name('source_schedule.json').read_text())
    with fitz.open(args.pdf) as doc:
        if len(doc) != 452:
            parser.error('This extractor expects the 452-page programme edition.')
        dataset, issues = extraction(doc, curated)
    args.output.write_text(json.dumps(dataset, ensure_ascii=False, separators=(',', ':')) + '\n', encoding='utf-8')
    if args.issues:
        args.issues.write_text('\n'.join(issues), encoding='utf-8')
    print(len(dataset['sessions']), 'sessions:', dict(Counter(s['type'] for s in dataset['sessions'])))
    print(len(dataset['presentations']), 'presentations:', dict(Counter(p['type'] for p in dataset['presentations'])))
    print(len(issues), 'extraction flags')


if __name__ == '__main__':
    main()
