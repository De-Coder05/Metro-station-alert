# Metro Alert

A Progressive Web App (PWA) that alerts you when your metro station is approaching — even when you have earphones in or fall asleep on the train.

## Features

- **GPS-based tracking** — uses device location via the Geolocation API
- **Earphone-aware alarm** — Web Audio API routes audio through whatever is connected (wired/Bluetooth earphones)
- **Two-stage alerts**
  - Early warning at 2× your chosen radius — gentle beep + vibration + notification
  - Arrival alarm at your chosen radius — loud looping siren, continuous vibration, full-screen overlay
- **Wake Lock** — keeps your screen on while tracking so the alarm can fire
- **System notifications** — works even if the browser is backgrounded (Android Chrome)
- **Dismissible overlay** — big full-screen alert, hard to sleep through
- **PWA installable** — install to home screen for offline use

## City Coverage

| City | Metro | Lines |
|------|-------|-------|
| Delhi | Delhi Metro (DMRC) | Yellow, Blue, Red, Green, Violet, Pink, Magenta, Grey, Airport Express |
| Mumbai | Mumbai Metro | Line 1, 2A, 7 |
| Bangalore | Namma Metro | Purple, Green |
| Hyderabad | Hyderabad Metro | Red, Blue, Green |
| Chennai | Chennai Metro | Blue, Green |
| Kolkata | Kolkata Metro | Blue (N-S), Green (E-W) |

## How It Works

1. **Select city** → **Select destination station** → **Set alert radius** (300m – 1km)
2. Tap **Start Alert** — the app begins tracking your GPS location
3. At 2× the radius: early warning beep + vibration + push notification
4. At the alert radius: looping alarm plays **through your earphones**, screen flashes, vibration starts — until you tap Dismiss

## Tech Stack

- Vanilla HTML/CSS/JS (no build step)
- Leaflet.js for the map (OpenStreetMap tiles)
- Web Audio API (sawtooth oscillator alarm, earphone-compatible)
- Geolocation API (`watchPosition` with `enableHighAccuracy`)
- Vibration API
- Screen Wake Lock API
- Notifications API
- Service Worker + Web App Manifest (PWA)

## Running Locally

```bash
# Any static file server works
npx serve .
# or
python3 -m http.server 8080
```

Then open `http://localhost:8080` in Chrome on Android for the best experience.

> **Note:** Location permission and HTTPS (or localhost) are required for the Geolocation API.
