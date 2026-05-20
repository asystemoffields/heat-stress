# Heat-Stress Index

Free, zero-backend **global Wet-Bulb Globe Temperature (WBGT)** + heat-index forecast with
plain-language activity guidance, for any location on Earth. Runs entirely in your browser —
no login, nothing stored or sent anywhere.

> **Planning & education only — not an official heat warning.** Values are *estimated* from a
> weather forecast (the globe/longwave terms are modeled, not measured). Follow your national
> weather service and local authorities.

**Live:** https://asystemoffields.github.io/heat-stress/

## Why this exists

Extreme heat is the deadliest weather hazard, and **WBGT** — not air temperature — is the
measure militaries, athletics, and occupational-safety bodies use, because it accounts for
humidity, sun, and wind. But the free WBGT tools are almost all US-only or paid. This gives
anyone, anywhere, a WBGT-based heat-stress forecast with activity guidance, for free.

## Features

- Search any place (or use your location) → current **WBGT (in sun + in shade)**, heat index,
  and the air/feels-like/humidity/wind that drive them.
- **WBGT flag** (White→Black, US-military categories) with plain activity guidance, plus the
  NWS Heat-Index health category.
- Next-24-hour WBGT strip and 7-day peak-WBGT outlook.
- °C / °F toggle. Everything computed client-side.

## Run locally

No build step. `cd web && python -m http.server 8000`, then open `http://localhost:8000/`.

## The model & its limits

WBGT via **Kong & Huber (2024)**, an analytic (zero-iteration) form of the **Liljegren et al.
(2008)** model, evaluated per hour with a NOAA solar-position estimate. Heat Index = NWS
Rothfusz; Humidex = Environment Canada. Activity thresholds are public-domain (US military
WBGT flags, NWS, NIOSH); ACSM sport guidance is paraphrased.

**Accuracy caveat:** the weather API provides no longwave or reflected-shortwave radiation, so
those are *synthesized* from temperature, humidity, and cloud cover — the main source of
uncertainty. WBGT "in sun" assumes direct sun on open ground; shade and wind reduce real heat
stress. Treat the numbers as estimates. Full details + equations in [`docs/SPEC.md`](docs/SPEC.md).

## Attribution & license

Weather & geocoding by **Open-Meteo** ([CC BY 4.0](https://creativecommons.org/licenses/by/4.0/))
and **GeoNames**. Guidance from US **NWS**, **DoD/HPRC**, and **NIOSH** (public domain). WBGT
model: **Kong & Huber 2024** / **Liljegren et al. 2008**. Released under the **MIT License**
(see [`LICENSE`](LICENSE)).

One of a series of small, free, give-away tools for real science communities.
