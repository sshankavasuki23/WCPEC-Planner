"""Check dataset integrity and, optionally, reconcile programme codes with the PDF."""
import argparse
from collections import Counter, defaultdict
from datetime import date
import json
from pathlib import Path
import re
import subprocess

ROOT = Path(__file__).resolve().parent.parent
TIME = re.compile(r'(?:[01]\d|2[0-3]):[0-5]\d')
CODE = re.compile(
    r'^\s*(Pl\.\d+|[1-7][A-E]O\.\d+-(?:OP|IV|KN)-\d+|[1-7]-\d-[ABD]P-\d+|'
    r'(?:TS|KSM|KCJ|AF|ASIA-EU|EU-KOR|IEA-MP|Task12)(?:-[A-Z0-9]+)?-\d+)(?=\s|$)', re.M
)
DATES = {f'2026-11-{i}' for i in range(15, 21)}
SESSION_TYPES = {'oral', 'poster', 'plenary', 'tutorial', 'workshop', 'social',
                 'exhibition', 'ceremony', 'break', 'event', 'tour'}
PRESENTATION_TYPES = {'oral', 'poster', 'plenary', 'tutorial', 'workshop', 'keynote', 'invited'}
KNOWN_WINDOW_EXCEPTIONS = {'4CO.9-OP-2', '7DO.8-OP-1'}
MISSING_TIMES = {'TS-S-1', 'TS-S-2', 'TS-PV-1', 'TS-PV-2', 'TS-T-1', 'TS-T-2'}


def errors_for(dataset, fixtures, pdf=None):
    errors = []
    sessions, talks = dataset['sessions'], dataset['presentations']
    by_id = {item['id']: item for item in sessions}
    by_code = {item['code']: item for item in talks if item['code']}
    for collection, valid_types in [(sessions, SESSION_TYPES), (talks, PRESENTATION_TYPES)]:
        counts = Counter(item['id'] for item in collection)
        for item in collection:
            label = item['id']
            if counts[label] != 1 or not label.startswith(item['date'] + '-'):
                errors.append(f'{label}: duplicate or date-inconsistent ID')
            if 'abstract' in item or item['type'] not in valid_types or not isinstance(item['title'], str) or not item['title'].strip():
                errors.append(f'{label}: invalid title, type or schema')
            if date.fromisoformat(item['date']).isoformat() != item['date'] or item['date'] not in DATES:
                errors.append(f'{label}: invalid date')
            start, end = item['start'], item['end']
            if (start, end) != (None, None) and (
                    not start or not end or not TIME.fullmatch(start) or not TIME.fullmatch(end) or start >= end):
                errors.append(f'{label}: invalid time range {start}–{end}')
            if not 1 <= item['sourcePage'] <= 452:
                errors.append(f'{label}: invalid provenance page')
    if dataset['event']['timezone'] != 'Asia/Seoul' or {item['date'] for item in sessions} != DATES:
        errors.append('Unexpected event timezone or schedule dates')
    if len(by_code) != sum(item['code'] is not None for item in talks):
        errors.append('Duplicate presentation code')
    for item in sessions:
        if item['type'] != 'break' and not item['room']:
            errors.append(f'{item["id"]}: missing session room')
        if item['type'] == 'oral' and not item['timetablePage']:
            errors.append(f'{item["id"]}: missing room-timetable provenance')
    seen_exceptions = set()
    for item in talks:
        parent = by_id.get(item['sessionId'])
        code = item['code']
        label = item['id']
        if not parent or parent['date'] != item['date']:
            errors.append(f'{label}: missing or inconsistent session')
            continue
        if not isinstance(item['authors'], list) or any(not isinstance(name, str) or not name.strip() for name in item['authors']):
            errors.append(f'{label}: invalid author list')
        if code and not item['authors']:
            errors.append(f'{label}: missing coded presentation authors')
        if (item['start'] is None) != (code in MISSING_TIMES):
            errors.append(f'{label}: unexpected missing or supplied time')
        if item['start'] and parent['start'] and (item['start'] < parent['start'] or item['end'] > parent['end']):
            seen_exceptions.add(code)
            if code not in KNOWN_WINDOW_EXCEPTIONS or not item.get('timeNote'):
                errors.append(f'{label}: undocumented time outside session')
        poster = item['type'] == 'poster'
        if poster != item['sharedWindow'] or (poster and (
                parent['type'] != 'poster' or parent['room'] != 'DCC 2, Exhibition Hall'
                or (item['start'], item['end']) != (parent['start'], parent['end'])
                or not re.fullmatch(r'[1-7]-\d-[ABD]P-\d+', code or ''))):
            errors.append(f'{label}: incorrect poster schedule or code')
        if code and re.match(r'^[1-7][A-E]O\.\d+-', code) and parent['code'] != code.split('-')[0]:
            errors.append(f'{label}: code disagrees with parent session')
    if seen_exceptions != KNOWN_WINDOW_EXCEPTIONS:
        errors.append('Expected documented time exceptions changed')

    for key, expected in fixtures['presentations'].items():
        item = by_code.get(key)
        if not item:
            errors.append(f'{key}: fixture presentation missing')
            continue
        actual = {**item, 'room': by_id[item['sessionId']]['room']}
        for name, value in expected.items():
            if actual[name] != value:
                errors.append(f'{key}: {name} differs from PDF fixture')
    lookup = {(item['date'], item['code']): item for item in sessions if item['type'] == 'oral'}
    expected_joins = set()
    for day, mapping in fixtures['technicalRooms'].items():
        for room, codes in mapping.items():
            for code in codes.split():
                expected_joins.add((day, code))
                session = lookup.get((day, code))
                if not session or not re.match(fr'Session Room {room}\b', session['room'] or ''):
                    errors.append(f'{day} {code}: mismatch with PDF room column {room}')
    if set(lookup) != expected_joins:
        errors.append('Timetable and technical-room inventory differ')
    counts = defaultdict(Counter)
    for item in talks:
        counts[item['date']][item['type']] += 1
    if dict(counts) != fixtures['dailyPresentationCounts']:
        errors.append('Daily presentation counts changed')
    if pdf:
        layout = subprocess.run(['pdftotext', '-layout', str(pdf), '-'], check=True,
                                capture_output=True, encoding='utf-8').stdout.split('\f')
        census = Counter(CODE.findall('\n'.join(layout[59:61] + layout[88:164] + layout[165:262] + layout[278:287])))
        extracted = Counter(item['code'] for item in talks if item['code'])
        if census != extracted:
            errors.append(f'Independent PDF code census mismatch. Missing {census - extracted}, extra {extracted - census}')
    return errors


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--pdf', type=Path, help='Optional original programme for independent Poppler code reconciliation')
    args = parser.parse_args()
    dataset = json.loads((ROOT / 'data/programme.json').read_text(encoding='utf-8'))
    fixtures = json.loads((ROOT / 'tests/programme-fixtures.json').read_text(encoding='utf-8'))
    errors = errors_for(dataset, fixtures, args.pdf)
    if errors:
        parser.exit(1, '\n'.join(errors) + '\n')
    print(f'Passed: {len(dataset["sessions"])} sessions, {len(dataset["presentations"])} presentations, '
          f'{len(fixtures["presentations"])} source fixtures and all 87 coded technical room assignments.')
    if args.pdf:
        print('Independent PDF code census matched every extracted presentation code.')


if __name__ == '__main__':
    main()
