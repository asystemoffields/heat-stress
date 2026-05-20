// indices.js — secondary heat indices. All public-domain formulas (NWS / Environment Canada).

// NWS Heat Index (Rothfusz regression). Input/250 output in °C (RH in %).
export function heatIndexC(TaC, RH) {
  const T = TaC * 9 / 5 + 32; // °F
  let hi = 0.5 * (T + 61 + (T - 68) * 1.2 + RH * 0.094); // Steadman simple form
  if ((hi + T) / 2 >= 80) {
    hi = -42.379 + 2.04901523 * T + 10.14333127 * RH - 0.22475541 * T * RH
      - 0.00683783 * T * T - 0.05481717 * RH * RH + 0.00122874 * T * T * RH
      + 0.00085282 * T * RH * RH - 0.00000199 * T * T * RH * RH;
    if (RH < 13 && T >= 80 && T <= 112) hi -= ((13 - RH) / 4) * Math.sqrt((17 - Math.abs(T - 95)) / 17);
    else if (RH > 85 && T >= 80 && T <= 87) hi += ((RH - 85) / 10) * ((87 - T) / 5);
  }
  return (hi - 32) * 5 / 9; // °C
}

// Environment Canada Humidex. Ta, Td in °C.
export function humidex(TaC, TdC) {
  const e = 6.11 * Math.exp(5417.7530 * (1 / 273.16 - 1 / (273.15 + TdC)));
  return TaC + 0.5555 * (e - 10);
}
