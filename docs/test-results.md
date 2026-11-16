# Test results

The landscape planner revision was checked on 16 November 2026 with the source PDF, Playwright and Chromium Headless Shell 153 on Linux. The site was served at root and at `/WCPEC-Planner/`.

| Check | Result |
|---|---|
| Visual review | Desktop and mobile captures showed the warm cream-to-blue gradient, Baskervville headings, Instrument Sans controls, and scroll-through glass. The bundled fonts are served with the site. |
| Browsing, search and session colours | Day selection, session details, ordered authors, rooms, combined filters, clear and empty states, and PDF-based track colours passed. The data validator passed for 166 sessions and events, 1,326 presentations, 12 source fixtures and 87 technical room joins. |
| Fixed bars and mobile layout | Passed at 375×812, 390×844, 430×932, 768×1024 and 1440×900. The bars remained fixed while scrolling. Checks covered the translucency, refraction and higher-contrast fallback. |
| Agenda and storage | Adding, removing, reload persistence, true overlaps, adjacent talks and shared poster windows passed. Blocked or malformed storage, stale saved IDs, and a simulated programme load failure were covered. |
| Horizontal calendar and preview | Time coordinates increased left to right. Two Tuesday 09:05 talks shared the same start coordinate and occupied separate rows. The mobile preview scrolled horizontally. Close and Escape dismissed it, and ordinary downloads matched the preview pixels. |
| One PNG per day | The two-talk sample (1280×543), 10-talk Tuesday example (4157×828), all Tuesday posters (6470×5894) and all 421 Tuesday presentations (15139×6793) each downloaded as a single landscape PNG. The dense PNGs were decoded to verify all scanlines. |
| Hosting and devices | The GitHub Pages subpath passed. The ordinary workflow made no external asset requests. Physical iPhone and Safari testing remains a manual acceptance item. |

Run `node tests/browser.cjs` with the local HTTP server running. Use `python scripts/validate_programme.py --pdf /path/to/original-programme.pdf` for the source check. See the [acceptance checklist](manual-testing.md) for Windows and phone review.
