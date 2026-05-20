// api.js — Open-Meteo access (no key, CORS-open, CC-BY-4.0). All calls are client-side.

const FORECAST = 'https://api.open-meteo.com/v1/forecast';
const GEOCODE = 'https://geocoding-api.open-meteo.com/v1/search';

// Hourly variables needed for WBGT + display. `_instant` radiation = value at the timestamp.
const HOURLY = [
  'temperature_2m', 'relative_humidity_2m', 'dew_point_2m', 'wind_speed_10m',
  'shortwave_radiation_instant', 'diffuse_radiation_instant', 'cloud_cover',
  'surface_pressure', 'apparent_temperature', 'uv_index', 'is_day',
].join(',');

// Place name → candidate locations (GeoNames, CC-BY).
export async function geocode(name) {
  const url = `${GEOCODE}?name=${encodeURIComponent(name)}&count=6&language=en&format=json`;
  const r = await fetch(url);
  if (!r.ok) throw new Error('geocoding failed (' + r.status + ')');
  const j = await r.json();
  return (j.results || []).map((p) => ({
    name: p.name, admin1: p.admin1, country: p.country, countryCode: p.country_code,
    lat: p.latitude, lon: p.longitude, tz: p.timezone,
  }));
}

// Hourly forecast for a location. Cached in sessionStorage for 30 min.
export async function fetchForecast(lat, lon) {
  const key = `wx:${lat.toFixed(2)},${lon.toFixed(2)}`;
  try {
    const c = JSON.parse(sessionStorage.getItem(key) || 'null');
    if (c && Date.now() - c.t < 1800000) return c.data;
  } catch (e) { /* ignore */ }
  const url = `${FORECAST}?latitude=${lat}&longitude=${lon}&hourly=${HOURLY}`
    + `&wind_speed_unit=ms&timezone=auto&forecast_days=7`;
  const r = await fetch(url);
  if (!r.ok) throw new Error('forecast fetch failed (' + r.status + ')');
  const data = await r.json();
  try { sessionStorage.setItem(key, JSON.stringify({ t: Date.now(), data })); } catch (e) { /* quota */ }
  return data;
}
