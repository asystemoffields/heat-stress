// app.js — Heat-Stress Index UI: location → Open-Meteo → WBGT/heat-index → guidance.
import { fetchForecast, geocode } from './api.js';
import { cosZenith } from './solar.js';
import { computeWBGT } from './wbgt.js';
import { heatIndexC } from './indices.js';
import { wbgtFlag, sportGuidance, heatIndexCategory } from './thresholds.js';

const $ = (id) => document.getElementById(id);
const state = { unit: 'C', loc: null, hours: [], ci: 0 };
let geoResults = [], geoActive = -1;

const toUnit = (c) => (state.unit === 'C' ? c : c * 9 / 5 + 32);
const fmtT = (c, dp = 0) => (Number.isFinite(c) ? `${toUnit(c).toFixed(dp)}°${state.unit}` : '—');
const fmtWind = (ms) => (state.unit === 'C' ? `${(ms * 3.6).toFixed(0)} km/h` : `${(ms * 2.23694).toFixed(0)} mph`);

function showError(msg) {
  const b = $('err-banner'); if (b) { b.textContent = msg; b.classList.remove('hidden'); }
  ['current', 'hourly', 'daily'].forEach((id) => $(id).classList.add('hidden'));
  $('placeholder').classList.add('hidden');
}
function hideError() { const b = $('err-banner'); if (b) b.classList.add('hidden'); }

async function load(loc) {
  state.loc = loc; $('loc-label').textContent = '…loading'; hideError();
  try {
    const data = await fetchForecast(loc.lat, loc.lon);
    process(data, loc);
    $('loc-label').textContent = loc.label || '';
  } catch (e) {
    $('loc-label').textContent = '';
    showError('Couldn’t load the forecast — ' + e.message + '. Please try again.');
  }
}

function process(data, loc) {
  if (!data || !data.hourly || !Array.isArray(data.hourly.time) || !data.hourly.time.length)
    throw new Error('no forecast data for this location');
  const off = data.utc_offset_seconds || 0;
  const H = data.hourly;
  const hours = [];
  for (let i = 0; i < H.time.length; i++) {
    const ta = H.temperature_2m[i], rh = H.relative_humidity_2m[i];
    const wind = H.wind_speed_10m[i], pressure = H.surface_pressure[i];
    if (![ta, rh, wind, pressure].every(Number.isFinite)) continue; // skip data holes
    const utcMs = Date.parse(H.time[i] + 'Z') - off * 1000;
    const cosz = cosZenith(loc.lat, loc.lon, new Date(utcMs));
    const w = computeWBGT({
      Ta: ta, RH: rh, dewpoint: H.dew_point_2m[i], wind10: wind,
      rsds: H.shortwave_radiation_instant[i] || 0, rsdsDiffuse: H.diffuse_radiation_instant[i] || 0,
      pressure, cloud: H.cloud_cover[i] || 0, cosz,
    });
    if (!Number.isFinite(w.wbgt) || !Number.isFinite(w.wbgtShade)) continue;
    hours.push({
      utcMs, localIso: H.time[i], hr: +H.time[i].slice(11, 13), date: H.time[i].slice(0, 10),
      ta, rh, wind, feels: H.apparent_temperature[i], isDay: H.is_day[i],
      wbgt: w.wbgt, shade: w.wbgtShade, hi: heatIndexC(ta, rh),
    });
  }
  if (!hours.length) throw new Error('no usable forecast data for this location');
  const now = Date.now();
  let ci = 0, bd = Infinity;
  hours.forEach((h, i) => { const d = Math.abs(h.utcMs - now); if (d < bd) { bd = d; ci = i; } });
  state.hours = hours; state.ci = ci;
  window.__HOURS = hours.length;
  hideError();
  $('placeholder').classList.add('hidden');
  ['current', 'hourly', 'daily'].forEach((id) => $(id).classList.remove('hidden'));
  renderAll();
}

function renderAll() { renderCurrent(); renderHourly(); renderDaily(); }

function pillColors(el, flag) { el.style.background = flag.color; el.style.color = flag.text || '#0b0e13'; }

function renderCurrent() {
  const h = state.hours[state.ci]; if (!h) return;
  const flag = wbgtFlag(h.wbgt), cat = heatIndexCategory(h.hi);
  $('cur-wbgt').textContent = fmtT(h.wbgt, 1);
  const f = $('cur-flag'); f.textContent = flag.name + ' flag'; pillColors(f, flag);
  $('cur-advice').innerHTML = '';
  $('cur-advice').append(advice(flag.advice, sportGuidance(h.wbgt)));
  $('cur-ta').textContent = fmtT(h.ta);
  $('cur-feels').textContent = fmtT(h.feels);
  $('cur-hi').textContent = `${fmtT(h.hi)}${cat.name !== '—' ? ' · ' + cat.name : ''}`;
  $('cur-rh').textContent = `${Math.round(h.rh)}%`;
  $('cur-wind').textContent = fmtWind(h.wind);
  $('cur-shade').textContent = fmtT(h.shade, 1);
  window.__CUR = { wbgt: +h.wbgt.toFixed(2), shade: +h.shade.toFixed(2), flag: flag.name, hi: +h.hi.toFixed(1), ta: h.ta };
}
function advice(main, sport) {
  const frag = document.createDocumentFragment();
  frag.append(document.createTextNode(main));
  const d = document.createElement('div'); d.className = 'hint'; d.style.marginTop = '6px';
  d.textContent = 'Sport/exertion: ' + sport; frag.append(d);
  return frag;
}

function renderHourly() {
  const strip = $('hstrip'); strip.innerHTML = '';
  const slice = state.hours.slice(state.ci, state.ci + 24);
  const lo = 10, hi = 40, Hpx = 110;
  for (const h of slice) {
    const night = !h.isDay;
    const wbgt = night ? h.shade : h.wbgt; // "in sun" is meaningless at night → show shade
    const flag = wbgtFlag(wbgt);
    const ht = Math.max(4, Math.min(Hpx, (wbgt - lo) / (hi - lo) * Hpx));
    const el = document.createElement('div');
    el.className = 'hbar'; el.setAttribute('role', 'img');
    const lab = `${h.localIso.slice(11, 16)} · WBGT ${fmtT(wbgt, 1)}${night ? ' (shade, night)' : ''} (${flag.name}) · air ${fmtT(h.ta)}`;
    el.title = lab; el.setAttribute('aria-label', lab);
    const wb = document.createElement('div'); wb.className = 'wb'; wb.textContent = Math.round(toUnit(wbgt));
    const bar = document.createElement('div'); bar.className = 'bar'; bar.style.height = ht + 'px'; bar.style.background = flag.color;
    const hr = document.createElement('div'); hr.className = 'hr'; hr.textContent = String(h.hr).padStart(2, '0');
    el.append(wb, bar, hr); strip.appendChild(el);
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
    const el = document.createElement('div'); el.className = 'day';
    const dnEl = document.createElement('div'); dnEl.className = 'dn'; dnEl.textContent = dn;
    const dwEl = document.createElement('div'); dwEl.className = 'dw'; dwEl.textContent = Math.round(toUnit(peak.wbgt)) + '°';
    const dfEl = document.createElement('div'); dfEl.className = 'df'; dfEl.textContent = flag.name; pillColors(dfEl, flag);
    el.append(dnEl, dwEl, dfEl); days.appendChild(el);
  }
}

// ---- place search (accessible combobox) ----
let searchTimer = null;
function onSearchInput() {
  clearTimeout(searchTimer);
  const q = $('q').value.trim();
  if (q.length < 2) { renderResults([], null); return; }
  searchTimer = setTimeout(async () => {
    try { renderResults(await geocode(q), null); }
    catch (e) { renderResults(null, 'Search unavailable — check your connection'); }
  }, 300);
}
function renderResults(items, msg) {
  const box = $('results'); box.innerHTML = ''; geoActive = -1;
  geoResults = items || [];
  $('q').setAttribute('aria-activedescendant', '');
  if (msg) {
    const d = document.createElement('div'); d.className = 'noresult'; d.textContent = msg; box.appendChild(d);
    box.classList.remove('hidden'); $('q').setAttribute('aria-expanded', 'true'); return;
  }
  if (typeof items !== 'undefined' && items !== null && !geoResults.length && $('q').value.trim().length >= 2) {
    const d = document.createElement('div'); d.className = 'noresult'; d.textContent = 'No matches found'; box.appendChild(d);
    box.classList.remove('hidden'); $('q').setAttribute('aria-expanded', 'true'); return;
  }
  if (!geoResults.length) { box.classList.add('hidden'); $('q').setAttribute('aria-expanded', 'false'); return; }
  geoResults.forEach((r, i) => {
    const d = document.createElement('div'); d.id = 'opt-' + i; d.setAttribute('role', 'option');
    d.textContent = r.name + ' ';
    const span = document.createElement('span'); span.className = 'c';
    span.textContent = [r.admin1, r.country].filter(Boolean).join(', ');
    d.appendChild(span);
    d.addEventListener('click', () => selectResult(i));
    box.appendChild(d);
  });
  box.classList.remove('hidden'); $('q').setAttribute('aria-expanded', 'true');
}
function highlightResult() {
  const opts = [...$('results').querySelectorAll('[role=option]')];
  opts.forEach((el, i) => el.classList.toggle('active', i === geoActive));
  $('q').setAttribute('aria-activedescendant', geoActive >= 0 ? 'opt-' + geoActive : '');
  if (opts[geoActive]) opts[geoActive].scrollIntoView({ block: 'nearest' });
}
function selectResult(i) {
  const r = geoResults[i]; if (!r) return;
  const label = [r.name, r.admin1, r.country].filter(Boolean).join(', ');
  $('results').classList.add('hidden'); $('q').setAttribute('aria-expanded', 'false'); $('q').value = label;
  load({ lat: r.lat, lon: r.lon, label });
}

// ---- help modal ----
function openHelp() { $('help-modal').classList.remove('hidden'); $('help-close').focus(); }
function closeHelp() { $('help-modal').classList.add('hidden'); $('btn-help').focus(); }

function initTheme() {
  const THEMES = ['auto', 'light', 'dark'];
  const btn = $('btn-theme');
  let pref; try { pref = localStorage.getItem('sciproj-theme') || 'auto'; } catch (e) { pref = 'auto'; }
  const apply = () => {
    if (pref === 'auto') delete document.documentElement.dataset.theme;
    else document.documentElement.dataset.theme = pref;
    if (btn) { btn.textContent = pref === 'auto' ? '◐' : pref === 'light' ? '☀' : '☾'; btn.title = `Theme: ${pref}`; btn.setAttribute('aria-label', `Theme: ${pref}. Click to change.`); }
  };
  if (btn) btn.addEventListener('click', () => { pref = THEMES[(THEMES.indexOf(pref) + 1) % THEMES.length]; try { localStorage.setItem('sciproj-theme', pref); } catch (e) { /* private mode */ } apply(); });
  apply();
}

function init() {
  initTheme();
  const q = $('q');
  q.addEventListener('input', onSearchInput);
  q.addEventListener('keydown', (e) => {
    const open = !$('results').classList.contains('hidden') && geoResults.length;
    if (e.key === 'ArrowDown' && open) { geoActive = Math.min(geoActive + 1, geoResults.length - 1); highlightResult(); e.preventDefault(); }
    else if (e.key === 'ArrowUp' && open) { geoActive = Math.max(geoActive - 1, 0); highlightResult(); e.preventDefault(); }
    else if (e.key === 'Enter') { e.preventDefault(); if (open && geoActive >= 0) selectResult(geoActive); else onSearchInput(); }
    else if (e.key === 'Escape') { $('results').classList.add('hidden'); q.setAttribute('aria-expanded', 'false'); }
  });
  document.addEventListener('click', (e) => { if (!e.target.closest('.searchwrap')) { $('results').classList.add('hidden'); q.setAttribute('aria-expanded', 'false'); } });

  $('btn-geo').addEventListener('click', () => {
    if (!navigator.geolocation) { showError('Geolocation isn’t available in this browser — search a place instead.'); return; }
    $('loc-label').textContent = '…locating';
    navigator.geolocation.getCurrentPosition(
      (p) => load({ lat: p.coords.latitude, lon: p.coords.longitude, label: 'My location' }),
      (err) => {
        $('loc-label').textContent = '';
        showError(err.code === 1 ? 'Location permission denied — allow location, or search a place above.'
          : err.code === 3 ? 'Location request timed out — try again or search a place.'
            : 'Location unavailable — search a place above.');
      }, { timeout: 10000 });
  });
  $('unit-toggle').addEventListener('click', () => {
    state.unit = state.unit === 'C' ? 'F' : 'C';
    $('unit-toggle').textContent = '°' + state.unit;
    if (state.hours.length) renderAll();
  });
  $('btn-help').addEventListener('click', openHelp);
  $('why-link').addEventListener('click', (e) => { e.preventDefault(); openHelp(); });
  $('help-close').addEventListener('click', closeHelp);
  $('help-modal').addEventListener('click', (e) => { if (e.target.id === 'help-modal') closeHelp(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !$('help-modal').classList.contains('hidden')) closeHelp(); });

  window.__loadLatLon = (la, lo) => load({ lat: la, lon: lo, label: 'test' });
  window.__READY = true;
}

try { init(); } catch (e) { window.__ERR = String(e) + '\n' + (e && e.stack); }
