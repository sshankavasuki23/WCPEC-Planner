# WCPEC-9 planner acceptance test

## Update the Windows preview

In your existing clone, check your working tree before pulling.

```powershell
cd C:\WCPEC-Planner
git status --short
```

If Git lists changes, commit them on their branch or set them aside with `git stash push -u -m "Before planner preview"`. With a clean working tree, update your local branch and run the preview.

```powershell
git switch development
git pull --ff-only origin development
py -m http.server 8000
```

If you have yet to create a local `development` branch, use `git fetch origin` and `git switch --track origin/development` before starting the server. Open <http://localhost:8000/> and refresh. If the Python launcher is unavailable, try `python -m http.server 8000`. With Node installed, `npx http-server . -p 8000` is another option. Press Ctrl+C to stop the server.

## What to compare

- [ ] Start in **Programme → Monday**. Compare the lighter palette, shorter heading and two-tab navigation with the first version. Scroll a little and check that the floating navigation remains legible over the content.
- [ ] Scan Monday’s time blocks before opening one. Expand **15:00 start** and check whether you can compare the parallel sessions by time and room. Open `2AO.1`, then `2AO.1-OP-3`. It should show **15:40–15:55, Session Room 1 (101–102)** and five authors in programme order. Use **Session** to return to the parent and **Close** to return to your time block.
- [ ] Use search in **Programme** for `Xuefeng Han`. Open **Filters** and select Monday, Oral and Session Room 1. Check that `2AO.1-OP-3` is a match. Clear the search and filters to return to the day you were browsing.
- [ ] Save `2AO.1-OP-3`, `2AO.1-OP-4`, `2-1-AP-01` and `2-1-AP-02`. The first two talks touch at 15:55 and the posters share a window, so neither pair should show a conflict. Add `3AO.1-IV-2` to produce an overlap, then remove it. Refresh and check your other selections are still saved.
- [ ] In **My Agenda → Monday**, open **Daily agenda card**. Download the single PNG and compare it with the preview. The timeline should show the saved talks in time order, both posters under 18:00–19:00, and their DCC 2 Exhibition Hall location.
- [ ] Search for `5DO.15-OP-3`. The Thursday SWIFT talk should still show **14:20–14:35, Session Room 4 (107–108)** and its four authors.
- [ ] Check the page footer for **Made by Sathya · TU Delft**.

## Phone check

In desktop Chrome or Edge, press **Ctrl+Shift+I**, then **Ctrl+Shift+M** to use device emulation. Set the viewport to 390×844. Try switching days, expanding a block, filtering, and opening a presentation sheet. In My Agenda, tap **Preview agenda card** and check that **Download PNG** is above the image.

On a real phone, connect the phone and Windows laptop to the same trusted Wi-Fi or use your phone’s hotspot. Find your laptop’s Wi-Fi IPv4 address with `ipconfig`. Start `py -m http.server 8000 --bind YOUR_PC_LAN_IP` and open `http://YOUR_PC_LAN_IP:8000/` on the phone. If Windows prompts for firewall access, use the private network option. Repeat the search and PNG download in your phone browser. Open the downloaded image to check the time, title and room at phone scale. Stop the server when done.

Share the view, phone/browser, and a screenshot if you see a layout issue. For schedule discrepancies, include the presentation code and compare with the [known source issues](data-issues.md).
