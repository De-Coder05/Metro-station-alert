/* ── Metro Alert — App Logic ───────────────────────────────── */

// ── State ─────────────────────────────────────────────────────
const state = {
  city: null,
  station: null,
  alertRadius: 500,
  sound: true,
  vibrate: true,
  wakeLock: true,
  // runtime
  watching: false,
  watchId: null,
  watchIdFallback: null,
  fallbackTimer: null,
  gotFirstFix: false,
  wakeLockSentinel: null,
  alarmPlaying: false,
  warningFired: false,
  alarmFired: false,
  audioCtx: null,
  alarmTimer: null,
  map: null,
  userMarker: null,
  destMarker: null,
  routeLine: null,
  currentStep: 1,
};

// ── DOM shorthand ──────────────────────────────────────────────
const $ = id => document.getElementById(id);

const permsScreen    = $('perms-screen');
const setupScreen    = $('setup-screen');
const trackingScreen = $('tracking-screen');
const overlay        = $('alert-overlay');

// ── Init ───────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  loadPrefs();
  buildCityGrid();
  bindSetupEvents();
  bindTrackingEvents();
  $('btn-dismiss').addEventListener('click', dismissAlert);
  registerSW();
  maybeShowInstallBanner();
  syncSettingsUI();
  initPermsScreen();
});

// ── Permissions onboarding ─────────────────────────────────────
async function initPermsScreen() {
  // Skip onboarding if user already went through it
  const done = localStorage.getItem('metro-perms-done');

  // Check current permission states
  const locState   = await queryPerm('geolocation');
  const notifState = 'Notification' in window ? Notification.permission : 'denied';

  // If both already granted, go straight to setup
  if (done && locState === 'granted' && notifState === 'granted') {
    showScreen(setupScreen);
    return;
  }

  // Update badges to reflect current state
  setBadge('perm-loc-badge',   locState);
  setBadge('perm-notif-badge', notifState);

  // Show permissions screen (already active by default in HTML)
  $('grant-perms-btn').addEventListener('click', async () => {
    $('grant-perms-btn').disabled = true;
    $('grant-perms-btn').querySelector('.cta-label').textContent = 'Requesting…';

    // 1. Location — triggers the browser prompt
    const locGranted = await requestLocation();
    setBadge('perm-loc-badge', locGranted ? 'granted' : 'denied');

    // 2. Notifications — triggers the browser prompt
    const notifGranted = await requestNotifications();
    setBadge('perm-notif-badge', notifGranted ? 'granted' : 'denied');

    // 3. Audio — warm up AudioContext (requires user gesture, no separate prompt)
    try { getAudioCtx().resume(); } catch (_) {}

    await delay(500); // brief pause so user sees the granted badges
    localStorage.setItem('metro-perms-done', '1');
    showScreen(setupScreen);
  });

  $('skip-perms-btn').addEventListener('click', () => {
    localStorage.setItem('metro-perms-done', '1');
    showScreen(setupScreen);
  });
}

async function queryPerm(name) {
  try {
    const res = await navigator.permissions.query({ name });
    return res.state; // 'granted' | 'denied' | 'prompt'
  } catch (_) { return 'prompt'; }
}

async function requestLocation() {
  return new Promise(resolve => {
    if (!navigator.geolocation) { resolve(false); return; }
    navigator.geolocation.getCurrentPosition(
      () => resolve(true),
      () => resolve(false),
      { timeout: 10000, maximumAge: 0 }
    );
  });
}

async function requestNotifications() {
  if (!('Notification' in window)) return false;
  if (Notification.permission === 'granted') return true;
  const result = await Notification.requestPermission().catch(() => 'denied');
  return result === 'granted';
}

function setBadge(id, state) {
  const el = $(id);
  if (!el) return;
  const map = {
    granted: ['✓ Granted',  'perm-badge-granted'],
    denied:  ['✗ Denied',   'perm-badge-denied'],
    prompt:  ['Required',   'perm-badge-required'],
    default: ['Required',   'perm-badge-required'],
  };
  const [text, cls] = map[state] || map.prompt;
  el.textContent = text;
  el.className = `perm-badge ${cls}`;
}

function delay(ms) { return new Promise(r => setTimeout(r, ms)); }

// ── Service Worker ─────────────────────────────────────────────
function registerSW() {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  }
}

// ── Prefs ──────────────────────────────────────────────────────
function loadPrefs() {
  try {
    const p = JSON.parse(localStorage.getItem('metro-prefs') || '{}');
    if (p.alertRadius) state.alertRadius = p.alertRadius;
    if (typeof p.sound   !== 'undefined') state.sound   = p.sound;
    if (typeof p.vibrate !== 'undefined') state.vibrate = p.vibrate;
    if (typeof p.wakeLock !== 'undefined') state.wakeLock = p.wakeLock;
  } catch (_) {}
}
function savePrefs() {
  try {
    localStorage.setItem('metro-prefs', JSON.stringify({
      alertRadius: state.alertRadius, sound: state.sound,
      vibrate: state.vibrate, wakeLock: state.wakeLock,
    }));
  } catch (_) {}
}

// ── Panel navigation (directional slide) ──────────────────────
function goToStep(n) {
  const dir = n > state.currentStep ? 'forward' : 'back';

  // Hide current
  const cur = $(`step-${state.currentStep}`);
  cur.classList.remove('active', 'back');

  // Show next
  const next = $(`step-${n}`);
  next.classList.remove('active', 'back');
  // force reflow so animation re-triggers
  void next.offsetWidth;
  next.classList.add('active');
  if (dir === 'back') next.classList.add('back');

  state.currentStep = n;

  // Progress bar
  $('progress-bar').style.width = `${Math.round((n / 3) * 100)}%`;
}

// ── City Grid ──────────────────────────────────────────────────
const CITY_LINE_COLORS = {
  delhi:     ['#f1c40f','#3498db','#e74c3c','#2ecc71','#9b59b6','#e91e8c'],
  mumbai:    ['#ff6b35','#e74c3c','#3498db'],
  bangalore: ['#9b59b6','#2ecc71'],
  hyderabad: ['#e74c3c','#3498db','#2ecc71'],
  chennai:   ['#3498db','#2ecc71'],
  kolkata:   ['#3498db','#2ecc71'],
};

function buildCityGrid() {
  const container = $('city-grid');
  container.innerHTML = Object.entries(METRO_SYSTEMS).map(([key, c]) => {
    const pips = (CITY_LINE_COLORS[key] || []).map(col =>
      `<span class="city-line-pip" style="background:${col}"></span>`
    ).join('');
    return `
    <button class="city-card" data-city="${key}">
      <div class="city-icon-bg">${c.icon}</div>
      <div class="city-info">
        <div class="city-name">${c.name}</div>
        <div class="city-meta">${c.meta}</div>
        <div class="city-lines">${pips}</div>
      </div>
      <svg class="city-chevron" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M9 18l6-6-6-6"/></svg>
    </button>`;
  }).join('');

  container.addEventListener('click', e => {
    const btn = e.target.closest('.city-card');
    if (!btn) return;
    state.city = btn.dataset.city;
    buildLineFilter(state.city);
    buildStationList(state.city, 'All Lines', '');
    $('station-search').value = '';
    $('clear-search').hidden = true;
    goToStep(2);
    setTimeout(() => $('station-search').focus(), 400);
  });
}

// ── Line filter ────────────────────────────────────────────────
function buildLineFilter(cityKey) {
  const city = METRO_SYSTEMS[cityKey];
  const wrap = $('line-filter');
  const lines = Object.keys(city.lines);

  wrap.innerHTML = [
    `<button class="line-chip active" data-line="All Lines">All</button>`,
    ...lines.map(l => {
      const col = city.lines[l].color;
      return `<button class="line-chip" data-line="${l}"
        style="border-color:${col}44;color:${col}"
        data-color="${col}">${shortLine(l)}</button>`;
    }),
  ].join('');

  wrap.querySelectorAll('.line-chip').forEach(btn => {
    btn.addEventListener('click', () => {
      wrap.querySelectorAll('.line-chip').forEach(b => {
        b.classList.remove('active');
        b.style.background = '';
        b.style.color = b.dataset.color || '';
      });
      btn.classList.add('active');
      btn.style.background = btn.dataset.color
        ? btn.dataset.color + '22'
        : '';
      buildStationList(cityKey, btn.dataset.line, $('station-search').value);
    });
  });
}

function shortLine(name) {
  return name.replace(/ Line.*$/, '').replace(/ \(.*\)$/, '');
}

// ── Station list ───────────────────────────────────────────────
function buildStationList(cityKey, lineName, query) {
  const city = METRO_SYSTEMS[cityKey];
  const q = query.trim().toLowerCase();
  const items = [];

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

  const list = $('station-list');
  if (!items.length) {
    list.innerHTML = `<div class="empty-state">No stations found for "${query}"</div>`;
    return;
  }

  list.innerHTML = items.map((s, i) => `
    <button class="station-item" data-idx="${i}" style="animation-delay:${Math.min(i * 0.03, 0.3)}s">
      <span class="line-dot" style="background:${s.lineColor};box-shadow:0 0 7px ${s.lineColor}88"></span>
      <span class="stn-info">
        <span class="stn-name">${highlight(s.name, q)}</span>
        <span class="stn-line-label">${s.lineName}</span>
      </span>
      <svg class="stn-chevron" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M9 18l6-6-6-6"/></svg>
    </button>
  `).join('');

  list.querySelectorAll('.station-item').forEach((btn, i) => {
    btn.addEventListener('click', () => selectStation(items[i]));
  });
}

function highlight(text, q) {
  if (!q) return text;
  const re = new RegExp(`(${q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
  return text.replace(re, '<mark>$1</mark>');
}

// ── Station selection ──────────────────────────────────────────
function selectStation(stn) {
  state.station = stn;
  const el = $('selected-station-display');
  el.innerHTML = `
    <div class="selected-stn-card">
      <span class="stn-dot-lg" style="background:${stn.lineColor};box-shadow:0 0 8px ${stn.lineColor}99"></span>
      <div>
        <div class="selected-stn-name">${stn.name}</div>
        <div class="selected-stn-meta">${stn.lineName} · ${METRO_SYSTEMS[state.city].name}</div>
      </div>
    </div>`;
  syncSettingsUI();
  goToStep(3);
}

// ── Settings sync ──────────────────────────────────────────────
function syncSettingsUI() {
  document.querySelectorAll('.radius-pill').forEach(btn => {
    btn.classList.toggle('active', +btn.dataset.radius === state.alertRadius);
  });
  updateWarnChip();
  $('toggle-sound').checked    = state.sound;
  $('toggle-vibrate').checked  = state.vibrate;
  $('toggle-wakelock').checked = state.wakeLock;
}

function updateWarnChip() {
  const w = state.alertRadius * 2;
  const label = w >= 1000 ? `${(w/1000).toFixed(1)} km` : `${w} m`;
  $('early-warning-display').innerHTML = `
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
      <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
      <line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
    </svg>
    Early warning ${label} before station`;
}

// ── Setup event bindings ───────────────────────────────────────
function bindSetupEvents() {
  $('back-to-step1').addEventListener('click', () => goToStep(1));
  $('back-to-step1-2').addEventListener('click', () => goToStep(1));
  $('back-to-step2').addEventListener('click', () => goToStep(2));

  const search = $('station-search');
  const clearBtn = $('clear-search');
  search.addEventListener('input', () => {
    clearBtn.hidden = !search.value;
    const activeLine = $('line-filter').querySelector('.line-chip.active')?.dataset.line || 'All Lines';
    buildStationList(state.city, activeLine, search.value);
  });
  clearBtn.addEventListener('click', () => {
    search.value = '';
    clearBtn.hidden = true;
    const activeLine = $('line-filter').querySelector('.line-chip.active')?.dataset.line || 'All Lines';
    buildStationList(state.city, activeLine, '');
    search.focus();
  });

  document.querySelectorAll('.radius-pill').forEach(btn => {
    btn.addEventListener('click', () => {
      state.alertRadius = +btn.dataset.radius;
      document.querySelectorAll('.radius-pill').forEach(b => b.classList.toggle('active', b === btn));
      updateWarnChip();
    });
  });

  $('toggle-sound').addEventListener('change',    e => { state.sound    = e.target.checked; savePrefs(); });
  $('toggle-vibrate').addEventListener('change',  e => { state.vibrate  = e.target.checked; savePrefs(); });
  $('toggle-wakelock').addEventListener('change', e => { state.wakeLock = e.target.checked; savePrefs(); });

  $('start-tracking').addEventListener('click', startTracking);
}

// ── Tracking ───────────────────────────────────────────────────
function startTracking() {
  if (!state.station) return;
  if (!navigator.geolocation) {
    showGpsError('Geolocation is not supported by this browser. Open the app in Chrome on Android.');
    return;
  }

  savePrefs();
  state.warningFired = false;
  state.alarmFired   = false;
  state.watching     = true;

  try { getAudioCtx().resume(); } catch (_) {}

  showScreen(trackingScreen);
  $('destination-name').textContent = state.station.name;
  $('alert-radius-display').textContent = state.alertRadius >= 1000
    ? `${(state.alertRadius/1000).toFixed(1)} km`
    : `${state.alertRadius} m`;
  $('alert-arm-badge').hidden = false;
  clearGpsError();

  initMap();
  requestWakeLock();
  startWatching();

  // After the CSS opacity transition (300ms), force Leaflet to recalculate
  // tile dimensions — without this the map stays black on mobile.
  setTimeout(() => { if (state.map) state.map.invalidateSize(); }, 350);
}

function startWatching() {
  // Clear any existing watches and timers
  if (state.watchId !== null) { navigator.geolocation.clearWatch(state.watchId); state.watchId = null; }
  if (state.watchIdFallback !== null) { navigator.geolocation.clearWatch(state.watchIdFallback); state.watchIdFallback = null; }
  if (state.fallbackTimer) { clearTimeout(state.fallbackTimer); state.fallbackTimer = null; }
  state.gotFirstFix = false;

  setStatus('locating', 'Waiting for GPS…');
  $('ring-distance').textContent = '···';
  $('ring-unit').textContent = '';

  // Primary: high-accuracy GPS (may take 20-60s for first satellite lock)
  state.watchId = navigator.geolocation.watchPosition(
    onPosition, onGeoError,
    { enableHighAccuracy: true, maximumAge: 30000, timeout: Infinity }
  );

  // Fallback: after 8s with no fix, also start a network-based watch
  // (WiFi/cell tower, fast but less accurate) — whichever fires first wins.
  state.fallbackTimer = setTimeout(() => {
    if (!state.gotFirstFix && state.watching) {
      state.watchIdFallback = navigator.geolocation.watchPosition(
        onPosition,
        () => {}, // silent — primary watch handles errors
        { enableHighAccuracy: false, maximumAge: 60000, timeout: 15000 }
      );
    }
  }, 8000);
}

function stopTracking() {
  if (state.watchId !== null) { navigator.geolocation.clearWatch(state.watchId); state.watchId = null; }
  if (state.watchIdFallback !== null) { navigator.geolocation.clearWatch(state.watchIdFallback); state.watchIdFallback = null; }
  if (state.fallbackTimer) { clearTimeout(state.fallbackTimer); state.fallbackTimer = null; }
  state.watching = false;
  stopAlarm();
  stopVibration();
  releaseWakeLock();
  clearGpsError();
  overlay.classList.add('hidden');
  showScreen(setupScreen);
}

function onPosition(pos) {
  clearGpsError();
  // On first fix, cancel the fallback watch — primary GPS has taken over
  if (!state.gotFirstFix) {
    state.gotFirstFix = true;
    if (state.fallbackTimer) { clearTimeout(state.fallbackTimer); state.fallbackTimer = null; }
    if (state.watchIdFallback !== null) { navigator.geolocation.clearWatch(state.watchIdFallback); state.watchIdFallback = null; }
  }
  const { latitude: lat, longitude: lng, accuracy } = pos.coords;
  const dist = haversine(lat, lng, state.station.lat, state.station.lng);
  setStatus('tracking', 'Tracking');
  updateDistanceUI(dist, accuracy);
  updateMap(lat, lng);
  checkAlerts(dist);
}

function onGeoError(err) {
  const msgs = {
    1: 'Location access denied. Open browser Settings and allow Location for this site.',
    2: 'GPS signal not available. Move to an open area or check that Location is on.',
    3: 'GPS timed out. Make sure Location is enabled on your phone.',
  };
  const msg = msgs[err.code] || 'Could not get your location. Please try again.';
  setStatus('locating', 'GPS error');
  showGpsError(msg);
}

function showGpsError(msg) {
  clearGpsError();
  const el = document.createElement('div');
  el.id = 'gps-error-banner';
  el.innerHTML = `
    <div class="gps-err-icon">📍</div>
    <div class="gps-err-text">${msg}</div>
    <button class="gps-retry-btn" id="gps-retry-btn">Retry</button>`;
  document.querySelector('.bottom-sheet').appendChild(el);
  $('gps-retry-btn').addEventListener('click', () => {
    clearGpsError();
    startWatching();
  });
}

function clearGpsError() {
  document.getElementById('gps-error-banner')?.remove();
}

// ── Distance UI ────────────────────────────────────────────────
function updateDistanceUI(dist, accuracy) {
  const [dVal, dUnit] = fmtDist(dist);
  $('ring-distance').textContent = dVal;
  $('ring-unit').textContent     = dUnit;
  $('accuracy-value').textContent = accuracy ? `±${Math.round(accuracy)}m` : '—';
  $('eta-value').textContent = fmtTime(dist / (30 / 3.6));

  // Ring fill (circumference 314 for r=50)
  const maxD = state.alertRadius * 3;
  const pct  = Math.max(0, Math.min(1, 1 - dist / maxD));
  const offset = 314 * (1 - pct);
  const ring = $('ring-progress');
  const glow = $('ring-glow');
  ring.style.strokeDashoffset = offset;
  glow.style.strokeDashoffset = offset;

  // Colour states
  if (dist <= state.alertRadius) {
    ring.style.stroke = 'var(--red)';
    glow.style.stroke = 'var(--red)';
    $('ring-distance').style.color = 'var(--red)';
  } else if (dist <= state.alertRadius * 2) {
    ring.style.stroke = 'var(--amber)';
    glow.style.stroke = 'var(--amber)';
    $('ring-distance').style.color = 'var(--amber)';
  } else {
    ring.style.stroke = 'var(--blue)';
    glow.style.stroke = 'var(--blue)';
    $('ring-distance').style.color = '';
  }
}

function fmtDist(m) {
  return m >= 1000 ? [(m/1000).toFixed(1), 'km'] : [Math.round(m), 'm'];
}
function fmtTime(secs) {
  if (!isFinite(secs)) return '—';
  const min = Math.round(secs / 60);
  if (min < 1)  return '< 1 min';
  if (min < 60) return `${min} min`;
  return `${Math.floor(min/60)}h ${min%60}m`;
}

// ── Alerts ─────────────────────────────────────────────────────
function checkAlerts(dist) {
  if (!state.warningFired && dist <= state.alertRadius * 2 && dist > state.alertRadius) {
    state.warningFired = true;
    triggerWarning(dist);
  }
  if (!state.alarmFired && dist <= state.alertRadius) {
    state.alarmFired = true;
    triggerAlarm(dist);
  }
}

function triggerWarning(dist) {
  const [d, u] = fmtDist(dist);
  setStatus('near', `Warning — ${d}${u} away`);
  if (state.vibrate) doVibrate([200, 100, 200]);
  if (state.sound)   playTone('warning');
  showSystemNotif('⚠️ Approaching Station', `${state.station.name} is ${d}${u} away.`);
  showOverlay('warning', dist);
}

function triggerAlarm(dist) {
  const [d, u] = fmtDist(dist);
  setStatus('near', `ARRIVING — ${d}${u}`);
  if (state.vibrate) startVibration([500, 200, 500, 200, 500, 200, 500]);
  if (state.sound)   startAlarm();
  showSystemNotif('🚨 Arriving!', `${state.station.name} — Get ready to exit!`);
  showOverlay('arrival', dist);
}

// ── Overlay ────────────────────────────────────────────────────
function showOverlay(type, dist) {
  const [d, u] = fmtDist(dist);
  overlay.className = `overlay type-${type}`;
  $('alert-icon').textContent    = type === 'arrival' ? '🚨' : '⚠️';
  $('alert-title').textContent   = type === 'arrival' ? 'ARRIVING!' : 'APPROACHING';
  $('alert-msg').textContent     = type === 'arrival' ? 'Get ready to exit!' : 'Your station is near.';
  $('alert-station').textContent = state.station.name;
  $('alert-dist').textContent    = `${d} ${u} away`;
  overlay.classList.remove('hidden');
}

function dismissAlert() {
  overlay.classList.add('hidden');
  stopAlarm();
  stopVibration();
}

// ── Audio (Web Audio API — routes through earphones) ───────────
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
        _beep(ctx, 880, 0,   0.5, 0.7);
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
      // Sawtooth wave — cuts through ambient noise, noticeable through earphones
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
function _beep(ctx, freq, delay, dur, vol) {
  try {
    const osc  = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.value = freq;
    const t0 = ctx.currentTime + delay;
    gain.gain.setValueAtTime(0, t0);
    gain.gain.linearRampToValueAtTime(vol, t0 + 0.015);
    gain.gain.setValueAtTime(vol, t0 + dur - 0.015);
    gain.gain.linearRampToValueAtTime(0, t0 + dur);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(t0);
    osc.stop(t0 + dur);
  } catch (_) {}
}
function stopAlarm() {
  state.alarmPlaying = false;
  if (state.alarmTimer) { clearTimeout(state.alarmTimer); state.alarmTimer = null; }
}

// ── Vibration ──────────────────────────────────────────────────
let _vibTimer = null;
function doVibrate(pattern) {
  if (navigator.vibrate) navigator.vibrate(pattern);
}
function startVibration(pattern) {
  if (!navigator.vibrate) return;
  const loop = () => {
    navigator.vibrate(pattern);
    _vibTimer = setTimeout(loop, pattern.reduce((a,b)=>a+b,0) + 400);
  };
  loop();
}
function stopVibration() {
  if (_vibTimer) { clearTimeout(_vibTimer); _vibTimer = null; }
  if (navigator.vibrate) navigator.vibrate(0);
}

// ── Wake Lock ──────────────────────────────────────────────────
async function requestWakeLock() {
  if (!state.wakeLock || !('wakeLock' in navigator)) return;
  try {
    state.wakeLockSentinel = await navigator.wakeLock.request('screen');
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible' && state.watching) requestWakeLock();
    });
  } catch (_) {}
}
function releaseWakeLock() {
  if (state.wakeLockSentinel) { state.wakeLockSentinel.release().catch(()=>{}); state.wakeLockSentinel = null; }
}

// ── Notifications ──────────────────────────────────────────────
async function requestNotifPermission() {
  if (!('Notification' in window) || Notification.permission !== 'default') return;
  const banner = $('notif-prompt');
  banner.classList.remove('hidden');
  $('notif-allow').addEventListener('click', async () => {
    banner.classList.add('hidden');
    await Notification.requestPermission();
  }, { once: true });
  $('notif-deny').addEventListener('click', () => banner.classList.add('hidden'), { once: true });
}
function showSystemNotif(title, body) {
  if (Notification.permission === 'granted') {
    try { new Notification(title, { body, icon: '/icons/icon.svg', tag: 'metro-alert', renotify: true }); }
    catch (_) {}
  }
}

// ── Map ────────────────────────────────────────────────────────
function initMap() {
  if (state.map) { state.map.remove(); state.map = null; state.userMarker = null; state.destMarker = null; state.routeLine = null; }
  const map = L.map('map', { zoomControl: true, attributionControl: false });
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19 }).addTo(map);

  const destIcon = L.divIcon({
    html: `<div style="
      width:16px;height:16px;border-radius:50%;
      background:${state.station.lineColor||'#2563EB'};
      border:3px solid white;
      box-shadow:0 2px 10px ${state.station.lineColor||'#2563EB'}99
    "></div>`,
    className: '', iconAnchor: [8,8],
  });
  state.destMarker = L.marker([state.station.lat, state.station.lng], { icon: destIcon })
    .bindPopup(`<b>${state.station.name}</b>`).addTo(map);
  map.setView([state.station.lat, state.station.lng], 14);
  state.map = map;
}

function updateMap(lat, lng) {
  if (!state.map) return;
  const userIcon = L.divIcon({
    html: `<div style="
      width:14px;height:14px;border-radius:50%;
      background:#2563EB;border:3px solid white;
      box-shadow:0 0 0 6px rgba(37,99,235,0.25)
    "></div>`,
    className: '', iconAnchor: [7,7],
  });
  if (!state.userMarker) state.userMarker = L.marker([lat,lng], { icon: userIcon }).addTo(state.map);
  else { state.userMarker.setLatLng([lat,lng]); state.userMarker.setIcon(userIcon); }

  if (state.routeLine) state.map.removeLayer(state.routeLine);
  state.routeLine = L.polyline(
    [[lat,lng],[state.station.lat,state.station.lng]],
    { color: state.station.lineColor||'#2563EB', weight:3, dashArray:'8 10', opacity:0.7 }
  ).addTo(state.map);

  state.map.fitBounds([[lat,lng],[state.station.lat,state.station.lng]], { padding:[50,50] });
}

// ── Haversine ──────────────────────────────────────────────────
function haversine(lat1, lng1, lat2, lng2) {
  const R = 6371e3;
  const f1 = lat1*Math.PI/180, f2 = lat2*Math.PI/180;
  const df = (lat2-lat1)*Math.PI/180, dl = (lng2-lng1)*Math.PI/180;
  const a  = Math.sin(df/2)**2 + Math.cos(f1)*Math.cos(f2)*Math.sin(dl/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

// ── Screen switch ──────────────────────────────────────────────
function showScreen(el) {
  [permsScreen, setupScreen, trackingScreen].forEach(s => s.classList.remove('active'));
  el.classList.add('active');
}

// ── Status ─────────────────────────────────────────────────────
function setStatus(type, text) {
  $('status-dot').className = `live-dot ${type}`;
  $('status-text').textContent = text;
}

// ── Tracking events ────────────────────────────────────────────
function bindTrackingEvents() {
  $('stop-tracking').addEventListener('click', stopTracking);
}

// ── PWA Install ────────────────────────────────────────────────
let _deferredPrompt = null;
function maybeShowInstallBanner() {
  window.addEventListener('beforeinstallprompt', e => {
    e.preventDefault();
    _deferredPrompt = e;
    const banner = $('install-banner');
    banner.classList.remove('hidden');
    $('install-allow').addEventListener('click', async () => {
      banner.classList.add('hidden');
      if (_deferredPrompt) { _deferredPrompt.prompt(); _deferredPrompt = null; }
    }, { once: true });
    $('install-deny').addEventListener('click', () => banner.classList.add('hidden'), { once: true });
  });
}
