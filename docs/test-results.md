# Test results

The 16 November 2026 redesign was checked with Python, Poppler, Playwright and Chromium Headless Shell 153 on Linux. The static site was served both at the root and under `/WCPEC-Planner/`.

| Check | Result |
|---|---|
| Source data | The validator passed for 166 sessions and events, 1,326 presentations, 12 source fixtures and 87 technical room joins. An independent PDF extraction matched every coded presentation. |
| Programme and navigation | The tests switched days, opened and closed time blocks, opened a session and a presentation, checked full ordered authors and room, returned to the parent and checked Escape and focus return. The old Explore address still opens Programme with search focused. |
| Unified search | Keyword search matched an author and title, and combined Date, Area, Type and Room filters worked. The suite exercised the empty state, filter visibility, clearing back to browse, and preserving selections across navigation. |
| My Agenda | Add and remove worked across views. Selections survived reload. The suite checked actual overlaps, adjoining endpoints, the shared poster window, time order and clear confirmation. |
| PNG | Two talks and a dense selection of 20 posters each produced a single image. A 52-poster stress case used three numbered parts. Each downloaded 1080-pixel-wide PNG matched its preview. Canvas checks covered the complete title, room, code, shared time and text bounds. Short and dense exports were visually inspected. |
| Layout and appearance | Passed at 375×812, 390×844, 430×932, 768×1024 and 1440×900. Programme, filters, details and My Agenda stayed within the viewport. Desktop and phone-width captures were visually reviewed. The refraction filter was active in Chromium, and the higher-contrast preference selected the solid fallback. |
| Storage and fetch errors | Blocked or malformed storage, stale IDs, and a simulated programme load failure were exercised. The normal flow had no console errors or external asset requests. |
| Physical-device check | Physical iPhone and Safari testing remains part of the manual acceptance checklist. |

Run `node tests/browser.cjs` with the local HTTP server running. Use `python scripts/validate_programme.py --pdf /path/to/original-programme.pdf` to repeat the source check. The [manual acceptance checklist](manual-testing.md) covers the Windows update and phone preview.

The navigation treatment follows [Apple’s materials guidance](https://developer.apple.com/design/human-interface-guidelines/materials) by applying the glass effects to controls and navigation. Browsers without the SVG backdrop filter use the translucent blur and edge highlights.
