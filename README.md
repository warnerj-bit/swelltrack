# SwellTrack

Surf conditions web app for the Surf Coast, Victoria. Powered by Open-Meteo Marine API.

## Deploy to Netlify

1. Push this folder to a GitHub repo
2. Connect the repo in Netlify → New site from Git
3. Build command: `npm run build`
4. Publish directory: `dist`
5. Deploy — done.

## Deploy to Vercel

1. Push this folder to a GitHub repo
2. Import in Vercel → Add New Project
3. Framework: Vite (auto-detected)
4. Deploy — done.

## Run locally

```bash
npm install
npm run dev
```

## Data sources

- **Waves / Wind / SST**: Open-Meteo Marine API (free, no key needed)
- **Tides**: Harmonic model (M2, S2, K1, O1) tuned for Bass Strait
- **Sun times**: Computed from coordinates

## Version

1.0.0-beta
