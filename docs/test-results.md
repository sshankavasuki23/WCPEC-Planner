# Test results

The calendar revision was checked on 16 November 2026 with Python, Poppler, Playwright and Chromium Headless Shell 153 on Linux. The static site was served at the root and under `/WCPEC-Planner/`.

| Check | Result |
|---|---|
| Programme data | The validator passed for 166 sessions and events, 1,326 presentations, 12 source fixtures and 87 technical room joins. The independent PDF text extraction matched every coded presentation. |
| Programme and search | Day selection, nested session and presentation details, ordered authors, room, Escape and focus return, combined filters, empty results and clearing filters passed. |
| Session colours | The colour families follow the seven-area legend on physical PDF page 74 (printed p. 79). Special-event colours follow the at-a-glance programme on physical pp. 24–25 and 73–74 where shown. Browser tests verified the silicon green and perovskite peach accents. |
| Fixed bars and mobile layout | Passed at 375×812, 390×844, 430×932, 768×1024 and 1440×900. The top and bottom bars retained their viewport positions while content scrolled. Computed styles confirmed the backdrop refraction and the higher-contrast fallback. Desktop and phone-width captures were visually reviewed. |
| Agenda | Add and remove, persistence after reload, chronological order, genuine overlaps, adjoining talks and the shared poster window passed. |
| Preview | The preview opened before any download action. Close and Escape dismissed it. Browser tests confirmed the ordinary PNG exports match the preview pixel for pixel. |
| Calendar | Two simultaneous 09:05 talks shared the vertical coordinate and occupied separate lanes. The time scale follows actual chronological order, shows gaps, and expands occupied intervals for legibility. Shared posters use their official 18:00–19:00 window. |
| Single PNG | Two talks, the 10-talk Tuesday example, and every one of Tuesday’s 421 presentations each produced one PNG. The full-day image measured 2721×24775 pixels. The suite inflated its PNG stream and verified that its dimensions matched the complete set of scanlines. |
| Storage and request failures | Blocked or malformed browser storage, stale IDs, and a simulated programme load failure were covered. The ordinary flow had zero console errors or external asset requests. |
| Physical devices | Physical iPhone and Safari testing remains a manual acceptance item. The glass includes blur and specular highlights for browsers without the SVG backdrop displacement. |

Run `node tests/browser.cjs` with the local HTTP server running. Use `python scripts/validate_programme.py --pdf /path/to/original-programme.pdf` to repeat the data check. The [acceptance checklist](manual-testing.md) covers local and phone testing.

The optical material follows [Apple’s materials guidance](https://developer.apple.com/design/human-interface-guidelines/materials) for floating navigation and controls. Calendar blocks use solid, muted fills derived from the programme categories.
