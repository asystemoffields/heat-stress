// thresholds.js — heat-stress guidance categories. Only license-clean (US-gov public-domain)
// sources are shipped: US military (HPRC/DoD) WBGT flags, NWS heat-index categories, NIOSH
// occupational lines. ACSM sport guidance is PARAPHRASED (numbers are facts) and labeled.
// ACGIH TLV tables are copyrighted and intentionally NOT included.

// WBGT activity flags — US military categories (thresholds converted from °F to °C).
const WBGT_FLAGS = [
  { max: 27.8, name: 'White', color: '#9aa7b4', advice: 'Minimal heat-stress risk for most. Stay hydrated.' },
  { max: 29.4, name: 'Green', color: '#5fd38d', advice: 'Use discretion for intense or prolonged exertion (≈50 min work / 10 min rest).' },
  { max: 31.1, name: 'Yellow', color: '#ffd34d', advice: 'Limit intense exertion (≈30–40 min work / 20–30 min rest); hydrate, watch at-risk people.' },
  { max: 32.2, name: 'Red', color: '#ff9e57', advice: 'Curtail strenuous activity (≈20–30 min work / 30–40 min rest); seek shade.' },
  { max: Infinity, name: 'Black', color: '#ff6b81', advice: 'Suspend strenuous outdoor activity — extreme heat-stress risk.' },
];
export function wbgtFlag(wbgtC) {
  return WBGT_FLAGS.find((f) => wbgtC < f.max) || WBGT_FLAGS[WBGT_FLAGS.length - 1];
}

// Paraphrased ACSM continuous-activity sport guidance (general, not official ACSM output).
const SPORT = [
  { max: 18.0, text: 'Generally safe; usual heat awareness.' },
  { max: 23.0, text: 'Safe, but watch less-acclimatized / at-risk participants.' },
  { max: 28.0, text: 'Higher risk — slow pace, add fluid breaks, monitor closely.' },
  { max: Infinity, text: 'Consider postponing/canceling vigorous sport; very high risk.' },
];
export function sportGuidance(wbgtC) {
  return (SPORT.find((s) => wbgtC < s.max) || SPORT[SPORT.length - 1]).text;
}

// NWS Heat-Index health categories (thresholds converted from °F to °C).
const HI_CATS = [
  { max: 26.7, name: '—', color: '#9aa7b4', note: 'No heat caution.' },
  { max: 32.2, name: 'Caution', color: '#ffd34d', note: 'Fatigue possible with prolonged exposure / activity.' },
  { max: 39.4, name: 'Extreme Caution', color: '#ff9e57', note: 'Heat cramps & exhaustion possible; heatstroke with prolonged exposure.' },
  { max: 51.7, name: 'Danger', color: '#ff6b81', note: 'Heat cramps / exhaustion likely; heatstroke possible.' },
  { max: Infinity, name: 'Extreme Danger', color: '#c2185b', note: 'Heatstroke highly likely.' },
];
export function heatIndexCategory(hiC) {
  return HI_CATS.find((c) => hiC < c.max) || HI_CATS[HI_CATS.length - 1];
}

// NIOSH recommended WBGT ceilings (°C) for a given metabolic rate M (watts). Public-domain.
export function nioshCeiling(metabolicW, acclimatized = true) {
  return acclimatized ? 56.7 - 11.5 * Math.log10(metabolicW) : 59.9 - 14.1 * Math.log10(metabolicW);
}
