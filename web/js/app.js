// app.js — Heat-Stress Index UI: location → Open-Meteo → WBGT/heat-index → guidance.
import { fetchForecast, geocode } from './api.js';
import { cosZenith } from './solar.js';
import { computeWBGT } from './wbgt.js';
import { heatIndexC } from './indices.js';
import { wbgtFlag, sportGuidance, heatIndexCategory } from './thresholds.js';

const $ = (id) => document.getElementById(id);
const state = { unit: 'C', loc: null, hours: [], ci: 0 };

const toUnit = (c) => (state.unit === 'C' ? c : c * 9 / 5 + 32);
const fmtT = (c, dp = 0) => `${toUnit(c).toFixed(dp)}°${state.unit}`;
const fmtWind = (ms) => (state.unit === 'C' ? `${(ms * 3.6).toFixed(0)} km/h` : `${(ms * 2.23694).toFixed(0)} mph`);

async function load(loc) {
  state.loc = loc;
  $('loc-label').textContent = '…loading';
  try {
    const data = await fetchForecast(loc.lat, loc.lon);
    process(data, loc);
    $('loc-label').textContent = loc.label || '';
  } catch (e) {
    $('loc-label').textContent = 'error: ' + e.message;
  }
}

function process(data, loc) {
  const off = data.utc_offset_seconds || 0;
  const H = data.hourly;
  const hours = [];
  for (let i = 0; i < H.time.length; i++) {
    const utcMs = Date.parse(H.time[i] + 'Z') - off * 1000;
    const cosz = cosZenith(loc.lat, loc.lon, new Date(utcMs));
    const w = computeWBGT({
      Ta: H.temperature_2m[i], RH: H.relative_humidity_2m[i], dewpoint: H.dew_point_2m[i],
      wind10: H.wind_speed_10m[i], rsds: H.shortwave_radiation_instant[i],
      rsdsDiffuse: H.diffuse_radiation_instant[i], pressure: H.surface_pressure[i],
      cloud: H.cloud_cover[i], cosz,
    });
    hours.push({
      utcMs, localIso: H.time[i], hr: +H.time[i].slice(11, 13), date: H.time[i].slice(0, 10),
      ta: H.temperature_2m[i], rh: H.relative_humidity_2m[i], wind: H.wind_speed_10m[i],
      feels: H.apparent_temperature[i], isDay: H.is_day[i],
      wbgt: w.wbgt, shade: w.wbgtShade, hi: heatIndexC(H.temperature_2m[i], H.relative_humidity_2m[i]),
    });
  }
  const now = Date.now();
  let ci = 0, bd = Infinity;
  hours.forEach((h, i) => { const d = Math.abs(h.utcMs - now); if (d < bd) { bd = d; ci = i; } });
  state.hours = hours; state.ci = ci;
  window.__HOURS = hours.length;
  $('placeholder').classList.add('hidden');
  ['current', 'hourly', 'daily'].forEach((id) => $(id).classList.remove('hidden'));
  renderAll();
}

function renderAll() { renderCurrent(); renderHourly(); renderDaily(); }

function renderCurrent() {
  const h = state.hours[state.ci]; if (!h) return;
  const flag = wbgtFlag(h.wbgt), cat = heatIndexCategory(h.hi);
  $('cur-wbgt').textContent = fmtT(h.wbgt, 1);
  const f = $('cur-flag'); f.textContent = flag.name + ' flag'; f.style.background = flag.color;
  $('cur-advice').innerHTML = `${flag.advice}<div class="hint" style="margin-top:6px">Sport/exertion: ${sportGuidance(h.wbgt)}</div>`;
  $('cur-ta').textContent = fmtT(h.ta);
  $('cur-feels').textContent = fmtT(h.feels);
  $('cur-hi').textContent = `${fmtT(h.hi)}${cat.name !== '—' ? ' · ' + cat.name : ''}`;
  $('cur-rh').textContent = `${Math.round(h.rh)}%`;
  $('cur-wind').textContent = fmtWind(h.wind);
  $('cur-shade').textContent = fmtT(h.shade, 1);
  window.__CUR = { wbgt: +h.wbgt.toFixed(2), shade: +h.shade.toFixed(2), flag: flag.name, hi: +h.hi.toFixed(1), ta: h.ta };
}

function renderHourly() {
  const strip = $('hstrip'); strip.innerHTML = '';
  const slice = state.hours.slice(state.ci, state.ci + 24);
  const lo = 10, hi = 40, Hpx = 110;
  for (const h of slice) {
    const flag = wbgtFlag(h.wbgt);
    const ht = Math.max(4, Math.min(Hpx, (h.wbgt - lo) / (hi - lo) * Hpx));
    const el = document.createElement('div');
    el.className = 'hbar';
    el.title = `${h.localIso.slice(11, 16)} · WBGT ${fmtT(h.wbgt, 1)} (${flag.name}) · air ${fmtT(h.ta)}`;
    el.innerHTML = `<div class="wb">${Math.round(toUnit(h.wbgt))}</div>`
      + `<div class="bar" style="height:${ht}px;background:${flag.color}"></div>`
      + `<div class="hr">${String(h.hr).padStart(2, '0')}</div>`;
    strip.appendChild(el);
  }
  $('hourly-sub').textContent = slice[0] ? `from ${slice[0].localIso.slice(11, 16)} local` : '';
}

function renderDaily() {
  const days = $('ddays'); days.innerHTML = '';
  const byDay = new Map();
  for (const h of state.hours) { if (!byDay.has(h.date)) byDay.set(h.date, []); byDay.get(h.date).push(h); }
  let count = 0;
  for (const [date, hrs] of byDay) {
    if (count++ >= 7) break;
    const dayHrs = hrs.filter((h) => h.isDay);
    const pool = dayHrs.length ? dayHrs : hrs;
    const peak = pool.reduce((m, h) => (h.wbgt > m.wbgt ? h : m), pool[0]);
    const flag = wbgtFlag(peak.wbgt);
    const dn = count === 1 ? 'Today' : new Date(date + 'T00:00:00').toLocaleDateString(undefined, { weekday: 'short' });
    const el = document.createElement('div');
    el.className = 'day';
    el.innerHTML = `<div class="dn">${dn}</div><div class="dw">${Math.round(toUnit(peak.wbgt))}°</div>`
      + `<div class="df" style="background:${flag.color}">${flag.name}</div>`;
    days.appendChild(el);
  }
}

// --- place search ---
let searchTimer = null;
function onSearchInput() {
  clearTimeout(searchTimer);
  const q = $('q').value.trim();
  if (q.length < 2) { $('results').classList.add('hidden'); return; }
  searchTimer = setTimeout(async () => {
    try {
      const res = await geocode(q);
      const box = $('results'); box.innerHTML = '';
      if (!res.length) { box.classList.add('hidden'); return; }
      for (const r of res) {
        const label = [r.name, r.admin1, r.country].filter(Boolean).join(', ');
        const div = document.createElement('div');
        div.innerHTML = `${r.name} <span class="c">${[r.admin1, r.country].filter(Boolean).join(', ')}</span>`;
        div.addEventListener('click', () => {
          $('results').classList.add('hidden'); $('q').value = label;
          load({ lat: r.lat, lon: r.lon, label });
        });
        box.appendChild(div);
      }
      box.classList.remove('hidden');
    } catch (e) { /* ignore transient geocode errors */ }
  }, 300);
}

function init() {
  $('q').addEventListener('input', onSearchInput);
  $('q').addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); onSearchInput(); } });
  document.addEventListener('click', (e) => { if (!e.target.closest('.searchwrap')) $('results').classList.add('hidden'); });
  $('btn-geo').addEventListener('click', () => {
    if (!navigator.geolocation) { $('loc-label').textContent = 'geolocation unavailable'; return; }
    $('loc-label').textContent = '…locating';
    navigator.geolocation.getCurrentPosition(
      (p) => load({ lat: p.coords.latitude, lon: p.coords.longitude, label: 'My location' }),
      () => { $('loc-label').textContent = 'location unavailable'; });
  });
  $('unit-toggle').addEventListener('click', () => {
    state.unit = state.unit === 'C' ? 'F' : 'C';
    $('unit-toggle').textContent = '°' + state.unit;
    if (state.hours.length) renderAll();
  });
  $('btn-help').addEventListener('click', () => $('help-modal').classList.remove('hidden'));
  $('why-link').addEventListener('click', (e) => { e.preventDefault(); $('help-modal').classList.remove('hidden'); });
  $('help-close').addEventListener('click', () => $('help-modal').classList.add('hidden'));
  $('help-modal').addEventListener('click', (e) => { if (e.target.id === 'help-modal') $('help-modal').classList.add('hidden'); });

  // test hook for headless verification
  window.__loadLatLon = (la, lo) => load({ lat: la, lon: lo, label: 'test' });
  window.__READY = true;
}

try { init(); } catch (e) { window.__ERR = String(e) + '\n' + (e && e.stack); }
