# WCPEC-9 planner acceptance test

## Open the development branch on Windows

In PowerShell, open your existing clone and check for local changes.

```powershell
cd C:\WCPEC-Planner
git status --short
```

If Git lists changes, save them in a commit on their current branch or set them aside with `git stash push -u -m "Before planner preview"`. If the output is empty, fetch and open the development branch.

```powershell
git fetch origin
git switch --track origin/development
```

If `development` already exists locally:

```powershell
git switch development
git pull --ff-only origin development
```

Start the preview with `py -m http.server 8000` and open <http://localhost:8000/>. If `py` is unavailable, try `python -m http.server 8000`. With Node installed, `npx http-server . -p 8000` is another option. Choose another port such as `8002` in both the command and browser address if port 8000 is occupied. Stop the server with Ctrl+C.

## Checklist

- [ ] Open Programme, Explore and My Agenda. On Monday, compare the desktop room timetable and list view. In Explore, search for `Xuefeng Han` and filter by Monday and Oral.
- [ ] Open `2AO.1-OP-3`. Check the title, ordered authors and 15:40–15:55 against PDF page 89 (printed 94). The room is Session Room 1 (101–102), PDF page 87 (printed 92).
- [ ] Open `5DO.15-OP-3` on Thursday. Check the SWIFT title, four authors and 14:20–14:35 against PDF page 152 (printed 157). The room is Session Room 4 (107–108), PDF page 140 (printed 145).
- [ ] Open `2EO.14-IV-1` on Friday. Verify 08:30–08:50 and the six authors on PDF page 162, and Session Room 1 (101–102) on PDF page 159. Open `TS-F-1` on Sunday to check a different day and type.
- [ ] Save `2AO.1-OP-3` and `2AO.1-OP-4` on Monday. Their times touch at 15:55. My Agenda should show chronological order and no overlap. Save `3AO.1-IV-2` to produce an overlap with the Room 1 selection, then remove it.
- [ ] Save `2-1-AP-01` and `2-1-AP-02` from PDF page 166. Both should show 18:00–19:00 at DCC 2, Exhibition Hall, without an overlap warning between the posters.
- [ ] Save Thursday’s SWIFT talk. Switch agenda dates, refresh, then close and reopen the tab in the same browser profile. Verify that both days still have their selections.
- [ ] Preview and download Monday’s PNG. Open it in Photos. Verify titles, times and rooms against My Agenda. Add enough talks for several parts and download each part.
- [ ] Use Chrome or Edge device emulation at 390 × 844. Check that the date controls, mobile navigation, details and PNG action stay accessible.
- [ ] On an actual phone, open a preview over a trusted private Wi-Fi network. Bind the server to the PC’s local IP using `py -m http.server 8000 --bind YOUR_PC_LAN_IP`. Find that IP with `ipconfig`. With both devices on the same Wi-Fi, open `http://YOUR_PC_LAN_IP:8000/` on the phone. If Windows prompts, allow access only on the private network. Stop the server after the test. Repeat search, adding a talk, refreshing and PNG download in the phone’s browser.
- [ ] Check [the documented discrepancies](data-issues.md) before relying on or sharing affected times.

For feedback, share the view, presentation code if relevant, steps to reproduce, what you expected, what happened, browser and device, and a screenshot if the issue is visual. For the first pass, the Monday room timetable, phone detail sheet and Monday PNG are the most useful screens to compare.
