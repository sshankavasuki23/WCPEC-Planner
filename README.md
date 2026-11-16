# WCPEC-9 Conference Planner

A static planner for 15–20 November 2026 in Daejeon. Browse the programme by day, search individual presentations, and save a private daily agenda. The agenda card preview renders the same canvas used for the 1080-pixel PNG download.

## Run locally

In your existing clone, switch to the planner branch after checking your working tree.

```powershell
cd C:\WCPEC-Planner
git status --short
git fetch origin
git switch --track origin/development
py -m http.server 8000
```

If you already have a local `development` branch, use `git switch development` and `git pull --ff-only origin development` after fetching. Open <http://localhost:8000/> and stop the server with Ctrl+C. See [manual testing](docs/manual-testing.md) for alternatives, mobile preview and specific programme checks.

## Files and data updates

- `index.html`, `css/styles.css`, and `js/` contain the three views, agenda state and canvas renderer. The deployed site needs only these assets and `data/programme.json`.
- `data/programme.json` joins presentations to sessions by `sessionId`. Dates and times are in `Asia/Seoul`. Room and track come from the session. An entry’s `sourcePage` is the physical PDF page, starting at 1. `timetablePage` and `schedulePage` identify separate room or time evidence where applicable. A poster uses `sharedWindow: true` and its session window. A null field means its value was unavailable or inapplicable.
- `scripts/extract_programme.py` rebuilds the data from the supplied November 2026 programme edition using PyMuPDF. `scripts/source_schedule.json` records the workshop, tutorial and special-event table transcriptions and source-specific corrections. Keep the original programme outside this public repository.

```powershell
py -m pip install pymupdf
py scripts/extract_programme.py C:\path\to\programme.pdf
py scripts/validate_programme.py
```

The optional `--pdf` argument to the validator also uses Poppler’s `pdftotext` to compare the source and output code inventories. For a new programme edition, review the page ranges, section layouts, schedule transcriptions and fixtures before rebuilding. See the [extraction report](docs/extraction-and-validation.md) and [data issues](docs/data-issues.md).

Browser tests use the development-only Playwright package. With the preview server running:

```powershell
npm install --no-save playwright
npx playwright install chromium
node tests/browser.cjs
```

To test the Pages project path, serve the clone’s parent directory on another port, then set `WCPEC_SUBPATH_URL` to the corresponding `/WCPEC-Planner/` URL. See [test results](docs/test-results.md).

## Data, privacy and hosting

The programme is derived from the WCPEC-9 conference programme supplied for this planner. See the [official programme](https://wcpec-9.com/en/detailed_program) for organiser updates. The repository contains itinerary metadata. The original PDF, abstract text, exhibitor profiles and official logos are excluded.

Selections are stored in the current browser profile. They can be lost if storage is blocked or cleared, and they do not transfer to other devices. PNGs are static snapshots. A connection may be required when revisiting the hosted site.

Once local acceptance testing is complete and publication is approved, merge the tested `development` branch into `main`, and configure GitHub Pages to deploy from `main` and `/(root)`. The expected URL is <https://sshankavasuki23.github.io/WCPEC-Planner/>. Verify the live programme and PNG download on a phone before sharing. Subsequent changes merged to the configured Pages source update the site after GitHub completes its deployment.
