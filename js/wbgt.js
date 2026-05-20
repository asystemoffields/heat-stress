// wbgt.js — Wet-Bulb Globe Temperature via the Kong & Huber (2024) zero-iteration
// analytic Liljegren model. Ported from QINQINKONG/PyWBGT_analytic (see docs/SPEC.md).
// Internally: temperatures in KELVIN, pressure in Pa, radiation in W/m².
//
// IMPORTANT CAVEAT: Open-Meteo provides no longwave or reflected-shortwave radiation, so
// rlds/rlus/rsus are SYNTHESIZED here (synthRadiation). That is the dominant accuracy
// uncertainty; the functions are isolated so they can be swapped/tuned. WBGT is "estimated",
// not a measured black-globe reading.

const C = {
  diamglobe: 0.0508, emisglobe: 0.95, albglobe: 0.05, albsfc: 0.45,
  emiswick: 0.95, albwick: 0.4, diamwick: 0.007, lenwick: 0.0254,
  stefanb: 5.6696e-8, mair: 28.97, mh2o: 18.015, rgas: 8314.34, cp: 1003.5,
};
C.rair = C.rgas / C.mair;
C.Pr = C.cp / (C.cp + 1.25 * C.rair);
const HORIZON = Math.cos(89.5 * Math.PI / 180); // ~0.0087 — below this the sun is down (f=0)
const COSZ_SLANT_FLOOR = Math.cos(80 * Math.PI / 180); // ~0.174 — cap the low-sun beam-slant
// projection so the globe/wick direct-beam terms can't blow up just above the horizon.

// --- psychrometrics / properties (T in K, P in Pa) ---
function esat(T, P) {
  return T > 273.15
    ? (1.0007 + 3.46e-6 * P / 100) * 611.21 * Math.exp(17.502 * (T - 273.15) / (T - 32.18))
    : (1.0003 + 4.18e-6 * P / 100) * 611.15 * Math.exp(22.452 * (T - 273.15) / (T - 0.6));
}
function desatDT(T, P) {
  const es = esat(T, P);
  return T > 273.15
    ? es * 17.502 * (273.15 - 32.18) / Math.pow(T - 32.18, 2)
    : es * 22.452 * (273.15 - 0.6) / Math.pow(T - 0.6, 2);
}
const hEvap = (T) => (313.15 - T) / 30 * (-71100) + 2.4073e6;
const viscosity = (T) => 2.6693e-6 * Math.sqrt(28.97 * T) / (13.082689 * (1.2945 - T / 1141.176470588));
const thermcond = (T) => (C.cp + 1.25 * C.rair) * viscosity(T);
const diffusivity = (T, P) => 2.471773765165648e-5 * Math.pow(T * 0.0034210563748421257, 2.334) * Math.pow(P / 101325, -1);
const density = (T, P) => P / (C.rair * T);

function hSphere(T, P, w) {
  const Re = w * density(T, P) * C.diamglobe / viscosity(T);
  return (2 + 0.6 * Math.sqrt(Re) * Math.pow(C.Pr, 0.3333)) * thermcond(T) / C.diamglobe;
}
function hCylinder(T, P, w) {
  const Re = w * density(T, P) * C.diamwick / viscosity(T);
  return 0.281 * Math.pow(Re, 0.6) * Math.pow(C.Pr, 0.44) * thermcond(T) / C.diamwick;
}
function convMass(T, P, w) {
  const Sc = viscosity(T) / (density(T, P) * diffusivity(T, P));
  return hCylinder(T, P, w) / (C.cp * C.mair) * Math.pow(C.Pr / Sc, 0.56);
}
// Stull (2011) wet-bulb first guess; Ta in °C, RH in %, returns °C.
function twStull(TaC, RH) {
  return TaC * Math.atan(0.151977 * Math.sqrt(RH + 8.313659)) + Math.atan(TaC + RH)
    - Math.atan(RH - 1.676331) + 0.00391838 * Math.pow(RH, 1.5) * Math.atan(0.023101 * RH) - 4.686035;
}

// --- wind 10 m → ~2 m (stability-class log profile) ---
function windExp(cosz, w, rsds) {
  if (cosz > 0) {
    if (rsds >= 925) return w >= 5 ? 0.20 : 0.15;
    if (rsds >= 675) return w >= 6 ? 0.25 : w >= 5 ? 0.20 : 0.15;
    if (rsds >= 175) return w >= 5 ? 0.25 : w >= 2 ? 0.20 : 0.15;
    return 0.25; // daytime, low sun
  }
  return w >= 2.5 ? 0.25 : 0.30; // night
}
const wind2m = (w10, cosz, rsds) => Math.max(0.13, w10 * Math.pow(0.2, windExp(cosz, w10, rsds)));

// Direct-beam fraction of global shortwave.
function directFraction(rsds, diffuse, cosz) {
  if (rsds <= 0 || cosz <= HORIZON) return 0;
  let f = (rsds - diffuse) / rsds;
  if (f > 0.9) f = 0.9;
  if (f < 0) f = 0;
  return f;
}

// SYNTHESIZED downwelling/upwelling longwave (Open-Meteo lacks it). The accuracy caveat.
// Longwave depends only on air temp, humidity, and cloud — same whether in sun or shade.
export function synthLongwave(TaK, eaPa, cloudPct) {
  const epsCs = 0.52 + 0.065 * Math.sqrt(eaPa / 100); // Brunt clear-sky emissivity (ea in hPa)
  const cf = cloudPct / 100;
  const eps = epsCs * (1 - cf * cf) + cf * cf;
  const rlds = eps * C.stefanb * Math.pow(TaK, 4);
  const rlus = 0.95 * C.stefanb * Math.pow(TaK, 4) + 0.05 * rlds;
  return { rlds, rlus };
}

function calcTg(Ta, P, w2, rsds, f, coszda, rsus, rlds, rlus) {
  const hc = hSphere(Ta, P, w2);
  const hr = 4 * C.emisglobe * C.stefanb * Math.pow(Ta, 3);
  const SR = 0.5 * (1 - C.albglobe) * rsds * (1 - f + 0.5 * f / coszda) + 0.5 * (1 - C.albglobe) * rsus;
  const LR = 0.5 * C.emisglobe * (rlds + rlus) - C.stefanb * C.emisglobe * Math.pow(Ta, 4);
  return Ta + (SR + LR) / (hc + hr);
}
function calcTnw(Ta, P, w2, rsds, f, coszda, rsus, rlds, rlus, ea) {
  const es = esat(Ta, P);
  const rh = ea / es * 100;
  const tw = twStull(Ta - 273.15, rh) + 273.15;
  const tf = (tw + Ta) / 2;
  const lv = hEvap(tf), kx = convMass(tf, P, w2), hc = hCylinder(tf, P, w2);
  const beta = kx * C.mh2o * lv / (P - esat(tw, P));
  const he = beta * desatDT(tf, P);
  const hr = C.stefanb * C.emiswick * (tw * tw + Ta * Ta) * (tw + Ta);
  const SR = (1 - C.albwick) * ((1 + 0.25 * C.diamwick / C.lenwick) * (1 - f) * rsds
    + (Math.tan(Math.acos(coszda)) / Math.PI + 0.25 * C.diamwick / C.lenwick) * f * rsds + rsus);
  const LR = 0.5 * C.emiswick * (rlds + rlus) - C.stefanb * C.emiswick * Math.pow(Ta, 4);
  const VPD = beta * (es - ea);
  return Ta + (SR + LR - VPD) / (he + hc + hr);
}

// Main entry. inp: { Ta(°C), RH(%) | dewpoint(°C), wind10(m/s), rsds, rsdsDiffuse (W/m²),
//   pressure(hPa), cloud(%), cosz }. Returns °C values.
export function computeWBGT(inp) {
  const Ta = inp.Ta + 273.15;
  const P = inp.pressure * 100;
  const ea = inp.dewpoint != null
    ? 611.2 * Math.exp(17.62 * inp.dewpoint / (243.12 + inp.dewpoint))
    : (inp.RH / 100) * esat(Ta, P);
  const w2 = wind2m(inp.wind10, inp.cosz, inp.rsds);
  const coszda = Math.max(inp.cosz, COSZ_SLANT_FLOOR); // floored so low-sun beam terms stay finite
  const { rlds, rlus } = synthLongwave(Ta, ea, inp.cloud);

  // Sun-exposed globe & natural wet-bulb (full shortwave load).
  const f = directFraction(inp.rsds, inp.rsdsDiffuse, inp.cosz);
  const rsus = C.albsfc * inp.rsds;
  const TgSun = calcTg(Ta, P, w2, inp.rsds, f, coszda, rsus, rlds, rlus);
  const TnwSun = calcTnw(Ta, P, w2, inp.rsds, f, coszda, rsus, rlds, rlus, ea);

  // Shaded estimate: no shortwave load (conservative; longwave still applies).
  const TgSh = calcTg(Ta, P, w2, 0, 0, coszda, 0, rlds, rlus);
  const TnwSh = calcTnw(Ta, P, w2, 0, 0, coszda, 0, rlds, rlus, ea);

  return {
    wbgt: 0.7 * TnwSun + 0.2 * TgSun + 0.1 * Ta - 273.15,
    wbgtShade: 0.7 * TnwSh + 0.3 * TgSh - 273.15,
    Tg: TgSun - 273.15, Tnw: TnwSun - 273.15, wind2m: w2, f,
  };
}

// Australian BoM "simplified WBGT" (shade estimate) — independent cross-check. Ta °C, RH %.
export function wbgtBoM(TaC, RH) {
  const e = (RH / 100) * 6.105 * Math.exp(17.27 * TaC / (237.7 + TaC));
  return 0.567 * TaC + 0.393 * e + 3.94;
}
