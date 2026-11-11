// Expected weather per destination, from Open-Meteo (free, no key).
// Within 16 days of the trip: the forecast. Further out: the same dates last year, shown as "typical".
// After the trip: what it actually was.
import { daysBetween } from "./model.js";

const GEO = "https://geocoding-api.open-meteo.com/v1/search";
const FORECAST = "https://api.open-meteo.com/v1/forecast";
const ARCHIVE = "https://archive-api.open-meteo.com/v1/archive";
const STORE = "fernweh-weather";

function shiftYear(iso, n) { return (parseInt(iso.slice(0, 4), 10) + n) + iso.slice(4).replace("-02-29", "-02-28"); }
function addDays(iso, n) { var d = new Date(iso + "T00:00:00Z"); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); }

/** Which data to ask for: {kind: "forecast"|"typical"|"actual", start, end}. Long trips are capped at 21 days. */
export function weatherPlan(range, today) {
  var start = range.start, end = range.end;
  if (daysBetween(start, end) > 20) end = addDays(start, 20);
  if (daysBetween(today, end) >= 0 && daysBetween(today, start) <= 15) {
    var s = daysBetween(today, start) < 0 ? today : start, e = daysBetween(today, end) > 15 ? addDays(today, 15) : end;
    return { kind: "forecast", start: s, end: e };
  }
  if (daysBetween(end, today) >= 6) return { kind: "actual", start: start, end: end };
  var n = -1;
  while (daysBetween(shiftYear(end, n), today) < 6) n--;
  return { kind: "typical", start: shiftYear(start, n), end: shiftYear(end, n) };
}

function avg(xs) { xs = xs.filter(function (x) { return typeof x === "number"; }); return xs.length ? xs.reduce(function (a, b) { return a + b; }, 0) / xs.length : null; }

/** Boil Open-Meteo's daily arrays down to what the card and Claude need. */
export function summarize(daily, kind) {
  daily = daily || {};
  var hi = daily.temperature_2m_max || [], lo = daily.temperature_2m_min || [];
  var wet = kind === "forecast"
    ? (daily.precipitation_probability_max || []).filter(function (p) { return p >= 50; }).length
    : (daily.precipitation_sum || []).filter(function (p) { return p >= 1; }).length;
  var h = avg(hi), l = avg(lo);
  if (h == null || l == null) return null;
  return {
    kind: kind, days: (daily.time || hi).length, hi: Math.round(h), lo: Math.round(l),
    max: Math.round(Math.max.apply(null, hi.filter(Number.isFinite))), min: Math.round(Math.min.apply(null, lo.filter(Number.isFinite))), wet: wet
  };
}

/** One line for people and for Claude, e.g. "Usually 4–9°C, rain on 3 of 6 days". */
export function weatherText(w) {
  if (!w) return "";
  var lead = w.kind === "forecast" ? "Forecast" : w.kind === "actual" ? "It was" : "Usually";
  return lead + " " + w.lo + "–" + w.hi + "°C" + (w.min < w.lo - 2 || w.max > w.hi + 2 ? " (" + w.min + " to " + w.max + "°C)" : "") + ", " + (w.wet ? (w.kind === "forecast" ? "rain likely" : "rain") + " on " + w.wet + " of " + w.days + " days" : "mostly dry");
}

function readStore() { try { return JSON.parse(localStorage.getItem(STORE) || "{}"); } catch (e) { return {}; } }
function writeStore(o) { try { localStorage.setItem(STORE, JSON.stringify(o)); } catch (e) {} }

async function getJson(url) {
  var r = await fetch(url);
  if (!r.ok) throw new Error("Weather service error " + r.status);
  return r.json();
}

export async function geocode(name) {
  var store = readStore(), k = "geo:" + name.toLowerCase();
  if (store[k]) return store[k];
  var d = await getJson(GEO + "?count=1&language=en&format=json&name=" + encodeURIComponent(name));
  var g = d && d.results && d.results[0];
  if (!g) throw new Error("Could not find " + name + " on the map.");
  var out = { lat: g.latitude, lon: g.longitude, name: g.name, country: g.country || "" };
  store[k] = out; writeStore(store);
  return out;
}

/** Weather summary for a destination name and date range. Cached: forecasts for 6 hours, the rest for good. */
export async function weatherFor(name, range, today) {
  var plan = weatherPlan(range, today), store = readStore(), k = "wx:" + name.toLowerCase() + ":" + plan.kind + ":" + plan.start + ":" + plan.end;
  var hit = store[k];
  if (hit && (plan.kind !== "forecast" || Date.now() - hit.at < 6 * 3600 * 1000)) return hit.w;
  var g = await geocode(name);
  var q = "?latitude=" + g.lat + "&longitude=" + g.lon + "&timezone=auto&start_date=" + plan.start + "&end_date=" + plan.end;
  var d = plan.kind === "forecast"
    ? await getJson(FORECAST + q + "&daily=temperature_2m_max,temperature_2m_min,precipitation_probability_max")
    : await getJson(ARCHIVE + q + "&daily=temperature_2m_max,temperature_2m_min,precipitation_sum");
  var w = summarize(d.daily, plan.kind);
  if (!w) throw new Error("No weather data for these dates.");
  store = readStore(); store[k] = { at: Date.now(), w: w }; writeStore(store);
  return w;
}
