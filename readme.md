# Orbital Traffic 🛰️

Real-time 3D satellite and near-Earth object tracker. Runs entirely in the browser — no server, no install, no login.

**[→ Live site](https://yourusername.github.io/orbital-traffic)** *(replace with your URL after setup)*

---

## What it does

- 3D Earth globe with live satellite positions (Starlink, ISS, GPS, science, geostationary)
- 55 hazardous near-Earth objects with orbital rings
- Time Machine — scrub forward/backward through orbital history
- "Fetch Live Data" button refreshes satellite TLEs from CelesTrak on demand
- Works offline after first load (TLE data is bundled in the HTML)

---

## Setup (first time, ~5 minutes)

### 1. Create a GitHub repo

Create a new public repository on GitHub. Name it `orbital-traffic` (or anything you like).

### 2. Upload your built file

Rename your local `orbital-traffic-CLEAN.html` to `index.html` and upload it to the root of the repo.

### 3. Add the build files from this repo

Copy these files into your repo (maintaining the folder structure):

```
.github/
  workflows/
    update-tles.yml
scripts/
  update_tles.py
requirements.txt
README.md
```

### 4. Enable GitHub Pages

In your repo: **Settings → Pages → Source → Deploy from a branch → main → / (root) → Save**

Your site will be live at `https://yourusername.github.io/orbital-traffic` within ~60 seconds.

### 5. Enable the daily TLE refresh (optional but recommended)

The GitHub Action in `.github/workflows/update-tles.yml` runs every day at 06:00 UTC, fetches fresh TLE data from CelesTrak, and commits an updated `index.html` automatically. No configuration needed — it activates as soon as the workflow file is in the repo.

You can also trigger it manually: **Actions → Update TLE Data → Run workflow**.

---

## If the auto-patch can't find your satellite data

The update script tries three methods to locate the satellite array in `index.html`. If all three fail (it will tell you in the Action log), add these sentinel comments manually — it's a one-time, 30-second fix:

1. Open `index.html` in a text editor
2. Find the line containing your satellite data. It looks like:
   ```
   [{"name":"ISS (ZARYA)","l1":"1 25544U ...","l2":"2 25544 ...","cat":"stations"}, ...]
   ```
3. Wrap it with the sentinel comments (on the same line):
   ```
   /* SATS_DATA_START */[{"name":"ISS (ZARYA)",...}]/* SATS_DATA_END */
   ```
4. Commit and push — the Action will use these markers from now on.

---

## Custom domain

To use a custom domain (e.g. `orbitaltraffic.com`):

1. Add a `CNAME` file to the repo root containing just your domain:
   ```
   orbitaltraffic.com
   ```
2. In **Settings → Pages → Custom domain**, enter your domain and save.
3. Point your domain's DNS to GitHub Pages:
   - Add an `A` record for `@` pointing to `185.199.108.153`
   - (Repeat for `185.199.109.153`, `185.199.110.153`, `185.199.111.153`)
   - Add a `CNAME` record for `www` pointing to `yourusername.github.io`

HTTPS is provisioned automatically by GitHub — takes ~10 minutes.

---

## Local development

To update TLEs locally (useful for testing):

```bash
# From the repo root
python scripts/update_tles.py
```

Then open `index.html` in a browser. No server needed.

---

## Tech stack

| Layer | Technology |
|-------|-----------|
| 3D rendering | Three.js r128 (inlined) |
| Orbital mechanics | satellite.js 5.0.0 (inlined) |
| TLE source | [CelesTrak](https://celestrak.org) |
| NEO data | NASA/JPL |
| Hosting | GitHub Pages |
| CI/CD | GitHub Actions |
