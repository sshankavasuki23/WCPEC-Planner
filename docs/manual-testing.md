# WCPEC-9 planner acceptance test

## Update the Windows preview

In your existing clone, check your working tree before pulling.

```powershell
cd C:\WCPEC-Planner
git status --short
```

With a clean working tree, update your local branch and start the preview.

```powershell
git switch development
git pull --ff-only origin development
py -m http.server 8000
```

If you have yet to create a local `development` branch, run `git fetch origin` and `git switch --track origin/development` before starting the server. Open <http://localhost:8000/> and refresh. If the Python launcher is unavailable, use `python -m http.server 8000`. Press Ctrl+C to stop the server.

## Acceptance checklist

- [ ] Open **Programme → Tuesday**. Compare the golden-cream to blue background and check the Inter headings and controls. Scroll until the schedule passes behind both fixed bars and check that the content shows softly through the glass. Open **Filters** and compare the search, selectors, and date tabs with the floating bars.
- [ ] Expand **08:30 start**. Compare `2BO.3` (silicon green), `3BO.3` (perovskite peach), and `4BO.3` (thin-film yellow-green) with the official programme's area legend (physical PDF page 74, printed page 79). The web accents use muted versions of those hues. A session’s area and room appear in its details.
- [ ] Use the search to add `2BO.3-OP-3` and `4BO.3-OP-3`. Both run **09:05–09:20**, in Session Room 1 (101–102) and Room 3 (105–106), respectively. Save `Pl.2` and a poster such as `3-2-BP-01` to check the later parts of the calendar.
- [ ] Open **My Agenda → Tuesday → Preview agenda**. Check that **Preview agenda** and **Clear My Agenda** sit on one row, and that the preview opens without downloading. Close it, then reopen it and choose **Download PNG**. Time should run down the left. The 09:05 talks should appear on the same row in separate columns. Scroll down in the preview to reach the 18:00 poster window and inspect the gaps. Check that you receive one file named `WCPEC9-Agenda-2026-11-17.png`, with all selected titles, time blocks, and rooms.
- [ ] Refresh and confirm the saved talks remain. The parallel 09:05 talks should still show an overlap. Two selected posters in the same poster window should share the block and remain free of an overlap warning with each other.

## Phone check

In desktop Chrome or Edge, press **Ctrl+Shift+I**, then **Ctrl+Shift+M**. Set the viewport to 390×844. Repeat the scroll, filter, and preview checks. Look for enough space under the floating navigation to reach the bottom of the page.

On a real phone, connect the phone and Windows laptop to the same trusted Wi-Fi or use your phone’s hotspot. Find the laptop’s Wi-Fi IPv4 address with `ipconfig`, then start `py -m http.server 8000 --bind YOUR_PC_LAN_IP`. Open `http://YOUR_PC_LAN_IP:8000/` on the phone. If Windows prompts for firewall access, use the private network option. Test the preview sheet, close it, then download and open the calendar in your phone’s image viewer. Stop the server when done.
