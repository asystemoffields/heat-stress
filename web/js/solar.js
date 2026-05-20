// solar.js — cosine of the solar zenith angle from lat/lon and a UTC time.
// Standard NOAA solar-position equations (https://gml.noaa.gov/grad/solcalc/).
// cosz > 0 = sun above horizon; <= 0 = below.

const RAD = Math.PI / 180;

export function cosZenith(latDeg, lonDeg, date) {
  // Fractional day-of-year (1-based) and UTC hour.
  const startOfYear = Date.UTC(date.getUTCFullYear(), 0, 0);
  const doy = (date.getTime() - startOfYear) / 86400000; // 1.xxx … 365/366
  const hours = date.getUTCHours() + date.getUTCMinutes() / 60 + date.getUTCSeconds() / 3600;

  // Fractional year γ (radians).
  const g = (2 * Math.PI / 365) * (doy - 1 + (hours - 12) / 24);

  // Equation of time (minutes) and solar declination (radians).
  const eqtime = 229.18 * (0.000075 + 0.001868 * Math.cos(g) - 0.032077 * Math.sin(g)
    - 0.014615 * Math.cos(2 * g) - 0.040849 * Math.sin(2 * g));
  const decl = 0.006918 - 0.399912 * Math.cos(g) + 0.070257 * Math.sin(g)
    - 0.006758 * Math.cos(2 * g) + 0.000907 * Math.sin(2 * g)
    - 0.002697 * Math.cos(3 * g) + 0.00148 * Math.sin(3 * g);

  // True solar time → hour angle. lon in degrees east; time is UTC so no tz term.
  const tst = hours * 60 + eqtime + 4 * lonDeg; // minutes
  const ha = (tst / 4 - 180) * RAD;             // radians

  const lat = latDeg * RAD;
  return Math.sin(lat) * Math.sin(decl) + Math.cos(lat) * Math.cos(decl) * Math.cos(ha);
}
