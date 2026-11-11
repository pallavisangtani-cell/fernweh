// Data-model helpers. Every function takes the state object explicitly so it can be tested.
import { LISTS, CATS } from "./constants.js";
import { uid, planned, spentOf } from "./util.js";

/** Fill in fields that older saves may lack. Mutates and returns S. */
export function fix(S) {
  if (!S.countries) S.countries = [];
  S.countries.forEach(function (c) {
    if (!c.status) c.status = "planned";
    if (c.year == null) c.year = "";
    if (c.note == null) c.note = "";
    if (!c.cities) c.cities = [];
    c.cities.forEach(function (ci) {
      LISTS.forEach(function (k) { if (!ci[k]) ci[k] = []; });
      if (!ci.cur) ci.cur = "USD";
      if (ci.notes == null) ci.notes = "";
      if (ci.tbudget == null) ci.tbudget = "";
      if (!ci.status) ci.status = "planning";
    });
  });
  return S;
}

export function findCity(S, id) {
  for (var i = 0; i < S.countries.length; i++) {
    var cs = S.countries[i].cities;
    for (var j = 0; j < cs.length; j++) if (cs[j].id === id) return { c: S.countries[i], city: cs[j] };
  }
  return null;
}

export function newCity(n, cur, status) {
  return { id: uid(), name: n, cur: cur || "USD", tbudget: "", status: status || "planning", itin: [], trans: [], stays: [], places: [], budget: [], packing: [], notes: "" };
}

export function totals(city) {
  var T = { all: { p: 0, s: 0 } };
  CATS.forEach(function (x) {
    var p = 0, s = 0;
    city[x[0]].forEach(function (it) { p += planned(it); s += spentOf(it); });
    T[x[0]] = { label: x[1], p: p, s: s };
    T.all.p += p; T.all.s += s;
  });
  return T;
}

export function sortKey(k, a, b) {
  if (k === "itin") return (parseFloat(a.day) || 0) - (parseFloat(b.day) || 0) || String(a.time).localeCompare(b.time);
  if (k === "trans") return String(a.date).localeCompare(b.date) || String(a.time).localeCompare(b.time);
  if (k === "stays") return String(a.checkin).localeCompare(String(b.checkin));
  return 0;
}

export function title(k, it) {
  return k === "itin" ? it.text : k === "trans" ? (it.no ? it.no + " · " : "") + it.route : k === "stays" ? it.name : k === "budget" ? it.label : it.name || it.text;
}

export function groupByDay(list) {
  var days = {};
  list.forEach(function (it) { var d = it.day || "?"; (days[d] = days[d] || []).push(it); });
  return days;
}

/* ---------- Dates and routes for the travel-style cards ---------- */
const ISO = /^\d{4}-\d{2}-\d{2}$/;

/** Earliest and latest ISO date across a destination's transport and stays. */
export function tripRange(city) {
  var ds = [];
  city.trans.forEach(function (t) { ds.push(t.date); });
  city.stays.forEach(function (s) { ds.push(s.checkin, s.checkout); });
  ds = ds.filter(function (d) { return ISO.test(d || ""); }).sort();
  return ds.length ? { start: ds[0], end: ds[ds.length - 1] } : null;
}

/** Whole days from `today` (ISO) to `iso`. Negative when in the past. */
export function daysBetween(today, iso) {
  return Math.round((Date.parse(iso + "T00:00:00Z") - Date.parse(today + "T00:00:00Z")) / 86400000);
}

export function todayIso(d) {
  d = d || new Date();
  return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
}

/** "in 12 days", "Tomorrow", "Today", "On the trip", or "" once it is over or undated. */
export function countdown(range, today) {
  if (!range) return "";
  var a = daysBetween(today, range.start), b = daysBetween(today, range.end);
  if (a > 1) return "in " + a + " days";
  if (a === 1) return "Tomorrow";
  if (a === 0) return "Today";
  if (b >= 0) return "On the trip";
  return "";
}

/** Split "DXB to DUS", "DXB-DUS", "Dubai → Düsseldorf" into [from, to]. */
export function routeParts(route) {
  var p = String(route || "").split(/\s*(?:\bto\b|→|->|–|—|-|\/|>)\s*/i).map(function (x) { return x.trim(); }).filter(Boolean);
  return p.length >= 2 ? [p[0], p[p.length - 1]] : [String(route || "").trim(), ""];
}

export function nights(checkin, checkout) {
  if (!ISO.test(checkin || "") || !ISO.test(checkout || "")) return 0;
  return Math.max(0, daysBetween(checkin, checkout));
}
