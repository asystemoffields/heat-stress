# Global Heat-Stress / WBGT tool — build spec & data contract

Condensed from verified deep-research. API contract confirmed against **live Open-Meteo
2026-05-20**; WBGT math is **verbatim** from Kong & Huber (2024). Location → forecast WBGT +
heat index + activity guidance + (deferred) "extreme for here?" climatology. Zero backend,
all client-side, GitHub Pages. **FRAMING: planning/education, NOT an official heat warning.**

## Data sources (ALL confirmed: no-key, CORS `Access-Control-Allow-Origin: *`, CC-BY-4.0)
- Forecast: `https://api.open-meteo.com/v1/forecast`
- Geocoding: `https://geocoding-api.open-meteo.com/v1/search?name=…&count=5` (GeoNames, CC-BY)
- Archive (climatology, deferred): `https://archive-api.open-meteo.com/v1/archive` (ERA5 1940+, ERA5-Land 1950+)
- Free tier <10k calls/day **per END-USER IP** (browser calls = each visitor's IP → no shared quota).
- Footer attribution to ship: **"Weather data by Open-Meteo.com" (CC BY 4.0)** + link; geocoding by GeoNames (CC BY).

## Forecast call (exact)
```
GET .../v1/forecast?latitude={lat}&longitude={lon}
 &hourly=temperature_2m,relative_humidity_2m,dew_point_2m,wind_speed_10m,
   shortwave_radiation_instant,direct_radiation_instant,diffuse_radiation_instant,
   direct_normal_irradiance_instant,cloud_cover,surface_pressure,apparent_temperature,
   uv_index,is_day,wet_bulb_temperature_2m
 &wind_speed_unit=ms&timezone=auto&forecast_days=7
```
- All vars CONFIRMED. Units °C/%/°C/(m/s)/W·m⁻²/%/hPa…; uv_index & is_day have empty unit strings.
- Use **`_instant` radiation** (instantaneous at timestamp), NOT default preceding-hour mean → keeps radiation/solar-geometry/temperature time-consistent.
- `surface_pressure` (hPa) REQUIRED for Kong (hPa→Pa ×100).
- Response: `hourly.<var>` parallel float arrays aligned to `hourly.time` (ISO8601 local); `hourly_units`; `utc_offset_seconds`; `timezone`. `forecast_days ≤ 16`.
- **NO LONGWAVE available** (longwave/thermal vars → HTTP 400). Must synthesize rlds/rlus/rsus (see GAP).
- `wet_bulb_temperature_2m` = *psychrometric* wet-bulb (≈aspirated), NOT the natural wet-bulb Tnw — cross-check only.

## WBGT — Kong & Huber (2024) zero-iteration analytic Liljegren (RECOMMENDED v1)
`WBGT_outdoor = 0.7·Tnw + 0.2·Tg + 0.1·Ta`; `WBGT_shade = 0.7·Tnw + 0.3·Tg`. Ta=temperature_2m;
Tnw=natural wet-bulb; Tg=black-globe. **ALL T in KELVIN, P in Pa, radiation W·m⁻².** Port verbatim
from `QINQINKONG/PyWBGT_analytic` (`WBGT_analytic.py`); every `np.`→`Math.`.

Constants:
```
diamglobe=0.0508; emisglobe=0.95; albglobe=0.05; albsfc=0.45; emiswick=0.95; albwick=0.4;
diamwick=0.007; lenwick=0.0254; stefanb=5.6696e-8; mair=28.97; mh2o=18.015; rgas=8314.34;
rair=rgas/mair; cp=1003.5; Pr=cp/(cp+1.25*rair)
```
Helpers (T in K, P in Pa):
```
esat(T,P)= T>273.15 ? (1.0007+3.46e-6*P/100)*611.21*exp(17.502*(T-273.15)/(T-32.18))
                    : (1.0003+4.18e-6*P/100)*611.15*exp(22.452*(T-273.15)/(T-0.6))   # Pa
desat_dT(T,P)= T>273.15 ? esat*17.502*(273.15-32.18)/(T-32.18)^2
                        : esat*22.452*(273.15-0.6)/(T-0.6)^2
h_evap(T)=(313.15-T)/30*(-71100)+2.4073e6
viscosity(T)=2.6693e-6*sqrt(28.97*T)/(13.082689*(1.2945-T/1141.176470588))
thermcond(T)=(cp+1.25*rair)*viscosity(T)
diffusivity(T,P)=2.471773765165648e-5*(T*0.0034210563748421257)^2.334*(P/101325)^-1
```
Convective:
```
density=P/(rair*T)
Re_g=wind2m*density*diamglobe/viscosity(T); Nu_g=2+0.6*sqrt(Re_g)*Pr^0.3333; h_sphere=Nu_g*thermcond(T)/diamglobe
Re_w=wind2m*density*diamwick/viscosity(T);  Nu_w=0.281*Re_w^0.6*Pr^0.44;     h_cylinder=Nu_w*thermcond(T)/diamwick
Sc=viscosity(T)/(density*diffusivity(T,P)); conv_mass=h_cylinder/(cp*mair)*(Pr/Sc)^0.56
```
Stull (2011) wet-bulb first guess (RH %, Ta °C; MAE~0.28°C):
```
Tw= Ta*atan(0.151977*sqrt(RH+8.313659)) + atan(Ta+RH) - atan(RH-1.676331)
   + 0.00391838*RH^1.5*atan(0.023101*RH) - 4.686035        # +273.15 → K
```
Direct-beam fraction: `f=(rsds - rsds_diffuse)/rsds`; clamp cosz≤cos89.5°→0; f>0.9→0.9; f<0→0; rsds≤0→0.
(`rsds=shortwave_radiation_instant`, `rsds_diffuse=diffuse_radiation_instant`.)
Globe (calc_Tg):
```
hc=h_sphere(Ta,P,wind2m); hr=4*emisglobe*stefanb*Ta^3
SR=0.5*(1-albglobe)*rsds*(1-f+0.5*f/coszda)+0.5*(1-albglobe)*rsus
LR=0.5*emisglobe*(rlds+rlus)-stefanb*emisglobe*Ta^4
Tg=Ta+(SR+LR)/(hc+hr)
```
Natural wet-bulb (calc_Tnw):
```
es=esat(Ta,P); rh=ea/es*100; tw=Tw_stull(Ta,rh); tf=(tw+Ta)/2
lv=h_evap(tf); kx=conv_mass(tf,P,wind2m); hc=h_cylinder(tf,P,wind2m)
beta=kx*mh2o*lv/(P-esat(tw,P)); he=beta*desat_dT(tf,P); hr=stefanb*emiswick*(tw^2+Ta^2)*(tw+Ta)
SR=(1-albwick)*((1+0.25*diamwick/lenwick)*(1-f)*rsds+(tan(acos(coszda))/PI+0.25*diamwick/lenwick)*f*rsds+rsus)
LR=0.5*emiswick*(rlds+rlus)-stefanb*emiswick*Ta^4; VPD=beta*(es-ea)
Tnw=Ta+(SR+LR-VPD)/(he+hc+hr)
```
`ea`=actual vapour pressure (Pa): from Td → `ea=611.2*exp(17.62*Td/(243.12+Td))`; or `ea=(RH/100)*esat(Ta,P)`.
Wind 10→2m: pick p∈{0.20,0.25,0.15,0.30} by (cosz,wind10m,rsds) stability branch (see research report);
`wind2m=wind10m*(2/10)^p`, clamp ≥0.13. Simple fallback `wind2m≈0.75*wind10m`.

## THE GAP — synthesize rlds, rlus, rsus (Open-Meteo lacks them). **MAIN ACCURACY CAVEAT — flag in UI.**
```
rsus = albsfc*rsds            # albsfc=0.45 default(high); make tunable (~0.2 vegetated/urban)
ε_cs = 0.23 + 0.484*sqrt(ea_hPa/Ta_K)                     # Brunt clear-sky
ε    = ε_cs*(1-(cloud/100)^2) + (cloud/100)^2             # cloud_cover %
rlds = ε*stefanb*Ta^4
rlus = 0.95*stefanb*Ta^4 + 0.05*rlds                      # Tsfc≈Ta, ε_sfc≈0.95
```
`cosz/coszda` from NOAA solar position (lat/lon+UTC time): declination, hour angle,
`cos(zenith)=sinφsinδ+cosφcosδcosH`; clamp coszda to small −ve (e.g. −0.5) when sun down.
Night (rsds≈0): SR→0, longwave-driven; well-behaved. **Mitigation:** offer **shade WBGT** (no
solar/longwave guesswork) as conservative default if validation is poor.

## Secondary indices
Rothfusz Heat Index (T °F, RH %): `HI_s=0.5*(T+61+(T-68)*1.2+RH*0.094)`; if `avg(HI_s,T)≥80` use
full `HI=-42.379+2.04901523*T+10.14333127*RH-0.22475541*T*RH-0.00683783*T²-0.05481717*RH²
+0.00122874*T²*RH+0.00085282*T*RH²-0.00000199*T²*RH²`; low-RH adj (RH<13 & 80≤T≤112):
`-((13-RH)/4)*sqrt((17-|T-95|)/17)`; high-RH adj (RH>85 & 80≤T≤87): `+((RH-85)/10)*((87-T)/5)`.
Humidex (Ta,Td °C): `Ta+0.5555*(e-10)`, `e=6.11*exp(5417.7530*(1/273.16-1/(273.15+Td)))`.

## Thresholds — SHIP-LIST (US-gov public domain) + attribution
- **US Military WBGT flags** (HPRC/DoD): White<82°F; Green 82–84.9; Yellow 85–87.9; Red 88–89.9; Black ≥90°F (+work/rest tiers).
- **NWS-Tulsa WBGT breaks:** 80–85→≥15min/hr; 85–88→≥30; 88–90→≥40; >90→≥45.
- **NWS Heat-Index categories:** Caution 80–90°F(27–32°C); Extreme Caution 90–103(32–39); Danger 103–124(39–51); Extreme Danger ≥125(≥52).
- **NIOSH RAL/REL:** `REL_acclim=56.7−11.5·log10(M)`; `RAL_unacclim=59.9−14.1·log10(M)` (WBGT °C, M=metabolic W).
- **ACSM sport flags:** PARAPHRASE only (numbers are facts; prose copyrighted) as "general sport guidance"; label "based on ACSM": Black>82°F/28°C; Red 73–82/23–28; Yellow 65–73/18–23; Green<65/18; White<50/10.
- **NEVER** ship ACGIH TLV tables (copyrighted, per OSHA). **DEFER** KSI/UGA regional (copyright + exact °C unverified).
- Attributions: Open-Meteo (CC BY)+GeoNames; NWS/NOAA; DoD/HPRC; NIOSH/CDC.

## IO contract & v1 scope
- **Input:** geolocation (`navigator.geolocation`) or place search (geocoding) → lat/lon(+tz).
- **Compute/hour:** cosz → wind2m → synth rsus/rlds/rlus → f → Tnw,Tg → WBGT outdoor & shade → flag; + Heat Index + Humidex.
- **UI:** current card (Ta,RH,wind,HI, WBGT-outdoor w/ flag color + plain guidance [sport + occupational toggle], shade WBGT secondary); 24–48h color-banded WBGT strip; 7-day daily-max WBGT+flag; climatology line (deferred); °C/°F toggle; disclaimer banner; attribution footer.
- **Modules:** `api.js`, `solar.js` (NOAA cosz), `wbgt.js` (Kong port; longwave fns swappable), `indices.js` (HI+Humidex), `thresholds.js` (4 public sets + paraphrased ACSM), `ui.js`. **No WASM needed.** Cache in `localStorage` by rounded lat/lon.
- **DEFER:** live climatology percentiles (ship later via precomputed Actions dataset; or windowed ±15d×~30yr archive call ≈ few MB), KSI tiers, NIOSH workload calculator, map, PWA.
- **REQUIRED UI caveats:** estimated (not measured black-globe); longwave/reflection approximated (worse on clear calm nights / snow/sand/asphalt); value is for direct sun ~2m open ground (shade differs, shown separately); forecasts uncertain; "**planning/education only — NOT an official heat warning; follow local authorities; individual tolerance varies (age, fitness, acclimatization, meds, hydration).**"

## Still-unverified (check before/while coding)
- **Longwave/rsus synthesis unvalidated vs Open-Meteo inputs — DOMINANT accuracy risk.** Sanity-check synth-WBGT vs BoM shade formula (`0.567·Ta+0.393·e+3.94`, e=hPa) + any station/Kestrel WBGT; tune albsfc + Brunt coeffs. Consider shade-WBGT as conservative default.
- Validate the JS Kong port vs PyWBGT reference values (clear-sky noon + night cases; expect Tg several °C > Ta in strong sun) BEFORE wiring UI.
- Re-confirm Open-Meteo keyless free tier + 10k/day-per-IP at build time.
- coszda vs instantaneous cosz for hourly `_instant` data; radiation timestamp vs `is_day` at sunrise/sunset.
- Open-Meteo exact attribution string (license page is JS-rendered; view in browser).
