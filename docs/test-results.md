# Test results

Tested 16 November 2026 with Python 3.12, Poppler `pdftotext`, Playwright and Chromium Headless Shell 153 on Linux. Local preview used Python’s static HTTP server on the site root and under `/WCPEC-Planner/`.

| Check | Result |
|---|---|
| Data validation with the source PDF | Pass. 166 sessions and events, 1,326 presentation records, 12 content fixtures and all 87 technical room joins. All coded presentations reconciled against the independent extraction. |
| Navigation and details | Pass. The suite exercised the room timetable, list toggle, mobile schedule, session and talk details, full author list, Escape and focus return. |
| Explore | Pass. Search by multiple keywords across author and title, combine date, area, type and room filters, show an empty state, preserve selected filters across views. |
| My Agenda | Pass. Save and remove across views, restore after reload, flag true overlaps, ignore adjoining endpoints and same-window posters, sort by time and confirm a clear. |
| Storage and loading failures | Pass. Corrupt or stale saved IDs, blocked localStorage and a simulated programme load failure. |
| PNG | Pass. Two-talk preview and download, and a 20-poster agenda across seven parts. Every PNG was 1080 pixels wide and byte-for-byte identical to its preview. The suite checked all individual and bulk download names, required title/time/room text, and layout bounds. The short card and a dense part were visually inspected. |
| Responsive layout | Pass. 375×812, 390×844, 430×932, 768×1024 and 1440×900. The checks cover each view, usable detail controls and horizontal overflow. Desktop and phone-sized captures were visually inspected. |
| HTTP paths and requests | Pass. Worked at root and at the Pages project subpath. The normal flow had no browser console errors or external runtime requests. |
| Local responsiveness | Sample run. Programme JSON loaded in 11 ms and an author-and-title search over the full data with one result rendered in 2 ms on the test environment. These figures describe a local run. |
| Physical Safari/iPhone and Microsoft Edge | Pending manual testing. Linux Chromium covered the browser automation and emulated phone sizes. |

Commands:

```sh
python scripts/validate_programme.py --pdf /path/to/original-programme.pdf
node tests/browser.cjs
```

See [the manual acceptance checklist](manual-testing.md) for Windows and phone testing and [data issues](data-issues.md) for source discrepancies. Test captures and downloaded PNGs are generated locally in `test-results/`.
