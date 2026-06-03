# Metro Alert 🚇

> Never miss your metro station again — even with earphones in or while you're asleep.

A **Progressive Web App (PWA)** that tracks your GPS location and fires a loud alarm, vibration, and full-screen alert the moment your destination station is within range. No app store. No install required. Works on any modern phone browser.

---

## Screenshots

| City Selection | Station Search | Alert Settings |
|:-:|:-:|:-:|
| ![City](docs/01-city.png) | ![Station](docs/02-stations.png) | ![Settings](docs/04-settings.png) |

---

## Features

### 🔔 Sleep-proof alerting
- **Loud audio alarm** via Web Audio API — routes directly through earphones or speakers
- **Continuous vibration** pattern repeats until you dismiss
- **Full-screen overlay** with flashing animation — hard to sleep through
- **System push notifications** — fires even when the browser is in the background

### 📍 GPS tracking
- High-accuracy `watchPosition` polling, updated every 5 seconds
- **Two-stage alert system:**
  - ⚠️ **Early warning** at 2× your chosen radius — single beep + light vibration
  - 🚨 **Arrival alarm** at your chosen radius — looping siren + continuous vibration + red overlay

### 📱 Mobile-first PWA
- **Wake Lock API** — keeps your screen on while tracking so the alarm can fire
- Installable to home screen (Android & iOS)
- Offline-ready via Service Worker cache
- Dark glassmorphic UI inspired by DMRC Momentum 2.0

### ⚙️ Configurable
- Alert radius: **300 m / 500 m / 800 m / 1 km**
- Toggle sound, vibration, and screen wake lock independently
- Settings persist across sessions

---

## City & Station Coverage

| City | Metro System | Lines | Stations |
|------|-------------|-------|----------|
| 🏛️ Delhi | Delhi Metro (DMRC) | Yellow, Blue, Red, Green, Violet, Pink, Magenta, Grey, Airport Express | 200+ |
| 🌊 Mumbai | Mumbai Metro | Line 1 (Versova–Ghatkopar), 2A, 7 | 40+ |
| 🌿 Bangalore | Namma Metro | Purple Line, Green Line | 45+ |
| 🦅 Hyderabad | Hyderabad Metro | Red, Blue, Green | 55+ |
| 🏖️ Chennai | Chennai Metro | Blue Line, Green Line | 35+ |
| 🎭 Kolkata | Kolkata Metro | Blue (N–S), Green (E–W) | 40+ |

---

## How It Works

```
1. Pick city  →  2. Search & select station  →  3. Set radius & options
                                                          ↓
                                                   Start Alert
                                                          ↓
                                            GPS tracking begins (live map)
                                                          ↓
                               At 2× radius: ⚠️  Early warning beep + vibration
                                                          ↓
                               At radius:    🚨  Loud alarm + full-screen overlay
                                                          ↓
                                                    Tap DISMISS
```

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| UI | Vanilla HTML / CSS / JS — no framework, no build step |
| Fonts | Inter (Google Fonts) |
| Map | [Leaflet.js](https://leafletjs.com/) + OpenStreetMap tiles |
| Location | Geolocation API (`watchPosition`, `enableHighAccuracy`) |
| Audio | Web Audio API — sawtooth oscillator, plays through earphones |
| Vibration | Vibration API |
| Screen | Screen Wake Lock API |
| Notifications | Notifications API + Service Worker push |
| Offline | Service Worker + Cache API |
| PWA | Web App Manifest (`manifest.json`) |

---

## Running Locally

```bash
# Clone
git clone https://github.com/De-Coder05/metro-station-alert.git
cd metro-station-alert

# Serve (any static server works)
python3 -m http.server 8080
# or: npx serve .
# or: npx http-server .
```

Open **`http://localhost:8080`** in Chrome on Android (or any modern browser).

> **HTTPS required for GPS on real devices.** Use `localhost` for local dev, or deploy to GitHub Pages / Netlify for a live HTTPS URL.

---

## Deploying (GitHub Pages — free & instant)

1. Go to your repo → **Settings → Pages**
2. Source: **Deploy from a branch**
3. Branch: `main` (or your feature branch) → folder: `/ (root)`
4. Save — your live URL appears in ~2 min:
   ```
   https://de-coder05.github.io/metro-station-alert/
   ```
5. Open that URL in **Chrome on Android**, allow Location + Notifications, done.

---

## Platform Notes

| Feature | Android Chrome | iOS Safari |
|---------|:-:|:-:|
| GPS tracking | ✅ Full | ⚠️ Throttled when screen off |
| Wake Lock | ✅ | ❌ Not supported |
| Vibration | ✅ | ❌ |
| Audio alarm | ✅ | ✅ |
| Notifications | ✅ | ✅ (iOS 16.4+) |
| Install to home screen | ✅ PWA | ✅ Add to Home Screen |

**Best experience: Chrome on Android.** iPhone users will hear the alarm and see the overlay, but background GPS and vibration are limited by iOS.

---

## Project Structure

```
metro-station-alert/
├── index.html          # App shell — all three setup steps + tracking + alert overlay
├── manifest.json       # PWA manifest (name, icons, theme)
├── sw.js               # Service worker — offline cache + push notification handler
├── css/
│   └── styles.css      # Full dark-theme styles, animations, glassmorphism
├── js/
│   ├── stations.js     # Station database — 300+ stations with GPS coordinates
│   └── app.js          # All app logic: geo, audio, map, alerts, PWA
└── icons/
    ├── icon.svg        # Vector app icon
    ├── icon-192.png    # PWA home-screen icon
    └── icon-512.png    # PWA splash icon
```

---

## License

MIT — free to use, modify, and deploy.
