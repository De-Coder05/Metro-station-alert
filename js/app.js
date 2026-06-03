/* === Metro Alert — Main App === */

// ── State ────────────────────────────────────────────────────────────────────
const state = {
  city: null,
  station: null,
  alertRadius: 500,      // metres — trigger alarm
  warnRadius: 1000,      // metres — early vibration/notification
  sound: true,
  vibrate: true,
  wakeLock: true,
  // runtime
  watching: false,
  watchId: null,
  wakeLockSentinel: null,
  alarmPlaying: false,
  warningFired: false,
  alarmFired: false,
  currentLat: null,
  currentLng: null,
  currentDist: Infinity,
  audioCtx: null,
  alarmTimer: null,
  map: null,
  userMarker: null,
  destMarker: null,
  routeLine: null,
};

// ── DOM refs ─────────────────────────────────────────────────────────────────
const $ = id => document.getElementById(id);
const setupScreen   = $('setup-screen');
const trackingScreen = $('tracking-screen');
const overlay       = $('alert-overlay');

// ── Init ─────────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  loadPrefs();
  buildCityGrid();
  bindSetupEvents();
  bindTrackingEvents();
  bindOverlayEvents();
  registerSW();
  maybeShowInstallBanner();
});

// ── Service Worker ────────────────────────────────────────────────────────────
function registerSW() {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  }
}

// ── Preferences (localStorage) ────────────────────────────────────────────────
function loadPrefs() {
  try {
    const p = JSON.parse(localStorage.getItem('metro-prefs') || '{}');
    if (p.alertRadius) state.alertRadius = p.alertRadius;
    if (typeof p.sound !== 'undefined') state.sound = p.sound;
    if (typeof p.vibrate !== 'undefined') state.vibrate = p.vibrate;
    if (typeof p.wakeLock !== 'undefined') state.wakeLock = p.wakeLock;
  } catch (_) {}
}

function savePrefs() {
  try {
    localStorage.setItem('metro-prefs', JSON.stringify({
      alertRadius: state.alertRadius,
      sound: state.sound,
      vibrate: state.vibrate,
      wakeLock: state.wakeLock,
    }));
  } catch (_) {}
}

// ── Step navigation ───────────────────────────────────────────────────────────
function goToStep(n) {
  [1, 2, 3].forEach(i => {
    $(`step-${i}`).classList.toggle('active', i === n);
    const dot = $(`step-${i}-dot`);
    dot.classList.remove('active', 'done');
    if (i < n) dot.classList.add('done');
    else if (i === n) dot.classList.add('active');
    const line = document.querySelectorAll('.step-line')[i - 1];
    if (line) line.classList.toggle('done', i < n);
  });
}

// ── City grid ─────────────────────────────────────────────────────────────────
function buildCityGrid() {
  const grid = $('city-grid');
  grid.innerHTML = Object.entries(METRO_SYSTEMS).map(([key, c]) => `
    <button class="city-card" data-city="${key}">
      <span class="city-icon">${c.icon}</span>
      <span class="city-name">${c.name}</span>
      <span class="city-meta">${c.meta}</span>
    </button>
  `).join('');

  grid.addEventListener('click', e => {
    const btn = e.target.closest('.city-card');
    if (!btn) return;
    state.city = btn.dataset.city;
    buildStationList(state.city, 'All Lines', '');
    buildLineFilter(state.city);
    goToStep(2);
    $('station-search').focus();
  });
}

// ── Station list ──────────────────────────────────────────────────────────────
function buildLineFilter(cityKey) {
  const city = METRO_SYSTEMS[cityKey];
  const container = $('line-filter');
  const lines = Object.keys(city.lines);
  container.innerHTML = [
    `<button class="line-btn active" data-line="All Lines">All</button>`,
    ...lines.map(l => `<button class="line-btn" data-line="${l}" style="--lc:${city.lines[l].color}">${shortLineName(l)}</button>`),
  ].join('');

  container.querySelectorAll('.line-btn').forEach(btn => {
    if (btn.dataset.line !== 'All Lines') {
      btn.style.borderColor = METRO_SYSTEMS[cityKey].lines[btn.dataset.line]?.color || '';
    }
    btn.addEventListener('click', () => {
      container.querySelectorAll('.line-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      buildStationList(cityKey, btn.dataset.line, $('station-search').value);
    });
  });
}

function shortLineName(name) {
  return name.replace(/ Line.*$/, '').replace(/ \(.*\)$/, '');
}

function buildStationList(cityKey, lineName, query) {
  const city = METRO_SYSTEMS[cityKey];
  const list = $('station-list');
  const q = query.trim().toLowerCase();
  let items = [];

  const lines = lineName === 'All Lines' ? Object.keys(city.lines) : [lineName];
  for (const ln of lines) {
    const line = city.lines[ln];
    if (!line) continue;
    for (const stn of line.stations) {
      if (!q || stn.name.toLowerCase().includes(q)) {
        items.push({ ...stn, lineName: ln, lineColor: line.color });
      }
    }
  }

  if (!items.length) {
    list.innerHTML = `<div class="empty-state">No stations found</div>`;
    return;
  }

  list.innerHTML = items.map((s, idx) => `
    <button class="station-item" data-idx="${idx}">
      <span class="line-dot" style="background:${s.lineColor};box-shadow:0 0 6px ${s.lineColor}"></span>
      <span class="station-info">
        <span class="station-name">${highlight(s.name, q)}</span>
        <span class="station-line-label">${s.lineName}</span>
      </span>
    </button>
  `).join('');

  list.querySelectorAll('.station-item').forEach((btn, idx) => {
    btn.addEventListener('click', () => selectStation(items[idx]));
  });
}

function highlight(text, q) {
  if (!q) return text;
  const re = new RegExp(`(${q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
  return text.replace(re, '<mark style="background:rgba(79,142,247,0.35);color:inherit;border-radius:2px">$1</mark>');
}

function selectStation(stn) {
  state.station = stn;
  const display = $('selected-station-display');
  display.innerHTML = `
    <div class="stn-name">${stn.name}</div>
    <div class="stn-meta">
      <span class="stn-dot" style="background:${stn.lineColor}"></span>
      ${stn.lineName} · ${METRO_SYSTEMS[state.city].name}
    </div>
  `;
  syncSettingsUI();
  goToStep(3);
}

// ── Settings UI ───────────────────────────────────────────────────────────────
function syncSettingsUI() {
  document.querySelectorAll('.radius-btn').forEach(btn => {
    btn.classList.toggle('active', +btn.dataset.radius === state.alertRadius);
  });
  updateWarnDisplay();
  $('toggle-sound').checked   = state.sound;
  $('toggle-vibrate').checked = state.vibrate;
  $('toggle-wakelock').checked = state.wakeLock;
}

function updateWarnDisplay() {
  const warn = state.alertRadius * 2;
  $('early-warning-display').textContent = warn >= 1000
    ? `${(warn / 1000).toFixed(1)} km before your station`
    : `${warn} m before your station`;
}

// ── Bind setup events ─────────────────────────────────────────────────────────
function bindSetupEvents() {
  $('back-to-step1').addEventListener('click', () => goToStep(1));
  $('back-to-step2').addEventListener('click', () => goToStep(2));

  const search = $('station-search');
  const clearBtn = $('clear-search');
  search.addEventListener('input', () => {
    clearBtn.hidden = !search.value;
    const activeLine = $('line-filter').querySelector('.line-btn.active')?.dataset.line || 'All Lines';
    buildStationList(state.city, activeLine, search.value);
  });
  clearBtn.addEventListener('click', () => {
    search.value = '';
    clearBtn.hidden = true;
    const activeLine = $('line-filter').querySelector('.line-btn.active')?.dataset.line || 'All Lines';
    buildStationList(state.city, activeLine, '');
    search.focus();
  });

  document.querySelectorAll('.radius-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      state.alertRadius = +btn.dataset.radius;
      document.querySelectorAll('.radius-btn').forEach(b => b.classList.toggle('active', b === btn));
      updateWarnDisplay();
    });
  });

  $('toggle-sound').addEventListener('change', e => { state.sound = e.target.checked; savePrefs(); });
  $('toggle-vibrate').addEventListener('change', e => { state.vibrate = e.target.checked; savePrefs(); });
  $('toggle-wakelock').addEventListener('change', e => { state.wakeLock = e.target.checked; savePrefs(); });

  $('start-tracking').addEventListener('click', startTracking);
}

// ── Tracking ──────────────────────────────────────────────────────────────────
function startTracking() {
  if (!state.station) return;
  if (!navigator.geolocation) {
    showGeoError('Geolocation is not supported by your browser.');
    return;
  }
  savePrefs();
  state.warningFired = false;
  state.alarmFired   = false;
  state.watching     = true;

  // Warm up AudioContext inside the user-gesture handler so autoplay policy allows it
  try { getAudioCtx().resume(); } catch (_) {}

  showScreen(trackingScreen);
  $('destination-name').textContent = state.station.name;
  $('alert-radius-display').textContent = state.alertRadius >= 1000
    ? `${(state.alertRadius / 1000).toFixed(1)} km`
    : `${state.alertRadius} m`;
  $('alert-arm-badge').hidden = false;

  initMap();
  requestWakeLock();
  requestNotifPermission();

  setStatus('locating', 'Locating…');

  state.watchId = navigator.geolocation.watchPosition(
    onPosition,
    onGeoError,
    { enableHighAccuracy: true, maximumAge: 5000, timeout: 15000 }
  );
}

function stopTracking() {
  if (state.watchId !== null) navigator.geolocation.clearWatch(state.watchId);
  state.watchId = null;
  state.watching = false;
  stopAlarm();
  releaseWakeLock();
  overlay.classList.add('hidden');
  showScreen(setupScreen);
}

function onPosition(pos) {
  const { latitude: lat, longitude: lng, accuracy } = pos.coords;
  state.currentLat = lat;
  state.currentLng = lng;
  const dist = haversine(lat, lng, state.station.lat, state.station.lng);
  state.currentDist = dist;

  setStatus('tracking', 'Tracking');
  updateDistanceUI(dist, accuracy);
  updateMap(lat, lng);
  checkAlerts(dist);
}

function onGeoError(err) {
  const msgs = ['', 'Location permission denied.', 'Position unavailable.', 'Location request timed out.'];
  setStatus('locating', msgs[err.code] || 'Location error');
}

// ── Distance UI ───────────────────────────────────────────────────────────────
function updateDistanceUI(dist, accuracy) {
  const [dVal, dUnit] = formatDist(dist);
  $('ring-distance').textContent = dVal;
  $('ring-unit').textContent = dUnit;
  $('accuracy-value').textContent = accuracy ? `±${Math.round(accuracy)}m` : '—';

  // Ring progress: 0% at alertRadius*3, 100% at 0m
  const maxDist = state.alertRadius * 3;
  const progress = Math.max(0, Math.min(1, 1 - dist / maxDist));
  const circumference = 289;
  const offset = circumference * (1 - progress);
  const ring = $('ring-progress');
  ring.style.strokeDashoffset = offset;

  // Colour shift as approaching
  if (dist <= state.alertRadius) {
    ring.style.stroke = 'var(--danger)';
    $('ring-distance').style.color = 'var(--danger)';
  } else if (dist <= state.alertRadius * 2) {
    ring.style.stroke = 'var(--warning)';
    $('ring-distance').style.color = 'var(--warning)';
  } else {
    ring.style.stroke = 'var(--accent)';
    $('ring-distance').style.color = 'var(--text)';
  }

  // ETA — assume average metro travel + walk: 30 km/h
  const speed = 30 / 3.6; // m/s
  const eta = dist / speed;
  $('eta-value').textContent = formatTime(eta);
}

function formatDist(m) {
  if (m >= 1000) return [(m / 1000).toFixed(1), 'km'];
  return [Math.round(m), 'm'];
}

function formatTime(secs) {
  if (!isFinite(secs)) return '—';
  const min = Math.round(secs / 60);
  if (min < 1) return '< 1 min';
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60), m = min % 60;
  return `${h}h ${m}m`;
}

// ── Alerts ────────────────────────────────────────────────────────────────────
function checkAlerts(dist) {
  const warnAt = state.alertRadius * 2;

  if (!state.warningFired && dist <= warnAt && dist > state.alertRadius) {
    state.warningFired = true;
    triggerWarning(dist);
  }

  if (!state.alarmFired && dist <= state.alertRadius) {
    state.alarmFired = true;
    triggerAlarm(dist);
  }
}

function triggerWarning(dist) {
  const [dVal, dUnit] = formatDist(dist);
  setStatus('near', `Warning — ${dVal}${dUnit} away`);
  if (state.vibrate) doVibrate([200, 150, 200]);
  if (state.sound) playTone('warning');
  showSystemNotif('⚠️ Approaching Station', `${state.station.name} is ${dVal}${dUnit} away.`);
  showOverlay('warning', dist);
}

function triggerAlarm(dist) {
  const [dVal, dUnit] = formatDist(dist);
  setStatus('near', `ARRIVING — ${dVal}${dUnit}`);
  if (state.vibrate) startVibration([500, 200, 500, 200, 500, 200, 500]);
  if (state.sound) startAlarm();
  showSystemNotif('🚨 Arriving at Station!', `${state.station.name} — Get ready!`);
  showOverlay('arrival', dist);
}

// ── Overlay ───────────────────────────────────────────────────────────────────
function showOverlay(type, dist) {
  const [dVal, dUnit] = formatDist(dist);
  overlay.className = `overlay type-${type}`;
  $('alert-icon').textContent   = type === 'arrival' ? '🚨' : '⚠️';
  $('alert-title').textContent  = type === 'arrival' ? 'ARRIVING!' : 'APPROACHING';
  $('alert-msg').textContent    = type === 'arrival' ? 'Get ready to exit!' : 'Your station is near.';
  $('alert-station').textContent = state.station.name;
  $('alert-dist').textContent   = `${dVal} ${dUnit} away`;
  overlay.classList.remove('hidden');
}

function bindOverlayEvents() {
  $('btn-dismiss').addEventListener('click', () => {
    overlay.classList.add('hidden');
    stopAlarm();
    stopVibration();
  });
}

// ── Audio (Web Audio API — plays through earphones) ───────────────────────────
function getAudioCtx() {
  if (!state.audioCtx) {
    state.audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  }
  return state.audioCtx;
}

function playTone(type) {
  try {
    const ctx = getAudioCtx();
    ctx.resume().then(() => {
      if (type === 'warning') {
        _beep(ctx, 880, 0, 0.5, 0.7);
        _beep(ctx, 1100, 0.4, 0.5, 0.7);
      }
    });
  } catch (_) {}
}

function startAlarm() {
  if (state.alarmPlaying) return;
  state.alarmPlaying = true;
  _alarmLoop();
}

function _alarmLoop() {
  if (!state.alarmPlaying) return;
  try {
    const ctx = getAudioCtx();
    ctx.resume().then(() => {
      // Two alternating tones — cuts through even ambient noise
      const pattern = [960, 0.18, 720, 0.18, 960, 0.18, 720, 0.18, 1200, 0.28];
      let t = 0;
      for (let i = 0; i < pattern.length; i += 2) {
        _beep(ctx, pattern[i], t, pattern[i + 1], 0.9);
        t += pattern[i + 1] + 0.04;
      }
      state.alarmTimer = setTimeout(_alarmLoop, (t + 0.15) * 1000);
    });
  } catch (_) {}
}

function _beep(ctx, freq, startDelay, dur, vol) {
  try {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sawtooth'; // harsh, attention-grabbing
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0, ctx.currentTime + startDelay);
    gain.gain.linearRampToValueAtTime(vol, ctx.currentTime + startDelay + 0.015);
    gain.gain.setValueAtTime(vol, ctx.currentTime + startDelay + dur - 0.015);
    gain.gain.linearRampToValueAtTime(0, ctx.currentTime + startDelay + dur);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(ctx.currentTime + startDelay);
    osc.stop(ctx.currentTime + startDelay + dur);
  } catch (_) {}
}

function stopAlarm() {
  state.alarmPlaying = false;
  if (state.alarmTimer) { clearTimeout(state.alarmTimer); state.alarmTimer = null; }
}

// ── Vibration ─────────────────────────────────────────────────────────────────
let _vibTimer = null;

function doVibrate(pattern) {
  if (navigator.vibrate) navigator.vibrate(pattern);
}

function startVibration(pattern) {
  if (!navigator.vibrate) return;
  const loop = () => {
    navigator.vibrate(pattern);
    _vibTimer = setTimeout(loop, pattern.reduce((a, b) => a + b, 0) + 300);
  };
  loop();
}

function stopVibration() {
  if (_vibTimer) { clearTimeout(_vibTimer); _vibTimer = null; }
  if (navigator.vibrate) navigator.vibrate(0);
}

// ── Wake Lock ─────────────────────────────────────────────────────────────────
async function requestWakeLock() {
  if (!state.wakeLock) return;
  try {
    if ('wakeLock' in navigator) {
      state.wakeLockSentinel = await navigator.wakeLock.request('screen');
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible' && state.watching) requestWakeLock();
      }, { once: false });
    }
  } catch (_) {}
}

function releaseWakeLock() {
  if (state.wakeLockSentinel) {
    state.wakeLockSentinel.release().catch(() => {});
    state.wakeLockSentinel = null;
  }
}

// ── System Notifications ──────────────────────────────────────────────────────
async function requestNotifPermission() {
  if (!('Notification' in window)) return;
  if (Notification.permission === 'default') {
    const banner = $('notif-prompt');
    banner.classList.remove('hidden');
    $('notif-allow').addEventListener('click', async () => {
      banner.classList.add('hidden');
      await Notification.requestPermission();
    }, { once: true });
    $('notif-deny').addEventListener('click', () => banner.classList.add('hidden'), { once: true });
  }
}

function showSystemNotif(title, body) {
  if (Notification.permission === 'granted') {
    try {
      new Notification(title, { body, icon: '/icons/icon.svg', tag: 'metro-alert', renotify: true });
    } catch (_) {}
  }
}

// ── Map (Leaflet) ─────────────────────────────────────────────────────────────
function initMap() {
  if (state.map) {
    state.map.remove();
    state.map = null;
    state.userMarker = null;
    state.destMarker = null;
    state.routeLine  = null;
  }

  const map = L.map('map', { zoomControl: true, attributionControl: false });
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '© OpenStreetMap',
  }).addTo(map);

  // Destination marker
  const destIcon = L.divIcon({
    html: `<div style="
      width:18px;height:18px;border-radius:50%;
      background:${state.station.lineColor || '#4f8ef7'};
      border:3px solid white;
      box-shadow:0 2px 8px rgba(0,0,0,0.5)
    "></div>`,
    className: '',
    iconAnchor: [9, 9],
  });
  state.destMarker = L.marker([state.station.lat, state.station.lng], { icon: destIcon })
    .bindPopup(`<b>${state.station.name}</b>`)
    .addTo(map);

  map.setView([state.station.lat, state.station.lng], 14);
  state.map = map;
}

function updateMap(lat, lng) {
  if (!state.map) return;
  const userIcon = L.divIcon({
    html: `<div style="
      width:14px;height:14px;border-radius:50%;
      background:#4f8ef7;border:3px solid white;
      box-shadow:0 0 0 4px rgba(79,142,247,0.3)
    "></div>`,
    className: '',
    iconAnchor: [7, 7],
  });
  if (!state.userMarker) {
    state.userMarker = L.marker([lat, lng], { icon: userIcon }).addTo(state.map);
  } else {
    state.userMarker.setLatLng([lat, lng]);
    state.userMarker.setIcon(userIcon);
  }

  // Route polyline
  if (state.routeLine) state.map.removeLayer(state.routeLine);
  state.routeLine = L.polyline(
    [[lat, lng], [state.station.lat, state.station.lng]],
    { color: state.station.lineColor || '#4f8ef7', weight: 3, dashArray: '6 8', opacity: 0.7 }
  ).addTo(state.map);

  // Fit both markers
  state.map.fitBounds([[lat, lng], [state.station.lat, state.station.lng]], { padding: [40, 40] });
}

// ── Haversine distance (metres) ────────────────────────────────────────────────
function haversine(lat1, lng1, lat2, lng2) {
  const R = 6371e3;
  const f1 = lat1 * Math.PI / 180, f2 = lat2 * Math.PI / 180;
  const df = (lat2 - lat1) * Math.PI / 180;
  const dl = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(df / 2) ** 2 + Math.cos(f1) * Math.cos(f2) * Math.sin(dl / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// ── Screen transitions ────────────────────────────────────────────────────────
function showScreen(el) {
  [setupScreen, trackingScreen].forEach(s => s.classList.remove('active'));
  el.classList.add('active');
}

// ── Status line ───────────────────────────────────────────────────────────────
function setStatus(type, text) {
  const dot = $('status-dot');
  dot.className = `status-dot ${type}`;
  $('status-text').textContent = text;
}

// ── Geo error message ─────────────────────────────────────────────────────────
function showGeoError(msg) {
  const existing = document.querySelector('.gps-error');
  if (existing) existing.remove();
  const el = document.createElement('div');
  el.className = 'gps-error';
  el.textContent = msg;
  $('step-3').appendChild(el);
}

// ── Tracking stop ─────────────────────────────────────────────────────────────
function bindTrackingEvents() {
  $('stop-tracking').addEventListener('click', stopTracking);
}

// ── PWA Install ───────────────────────────────────────────────────────────────
let _deferredPrompt = null;

function maybeShowInstallBanner() {
  window.addEventListener('beforeinstallprompt', e => {
    e.preventDefault();
    _deferredPrompt = e;
    const banner = $('install-banner');
    banner.classList.remove('hidden');
    $('install-allow').addEventListener('click', async () => {
      banner.classList.add('hidden');
      if (_deferredPrompt) {
        _deferredPrompt.prompt();
        _deferredPrompt = null;
      }
    }, { once: true });
    $('install-deny').addEventListener('click', () => banner.classList.add('hidden'), { once: true });
  });
}
