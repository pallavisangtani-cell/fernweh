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
