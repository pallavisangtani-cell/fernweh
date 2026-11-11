import { test } from "node:test";
import assert from "node:assert/strict";
import { tripRange, daysBetween, countdown, routeParts, nights, newCity, todayIso } from "../src/model.js";

test("tripRange spans transport dates and stays, ignoring bad dates", () => {
  const c = newCity("Frankfurt");
  c.trans.push({ date: "2026-12-06" }, { date: "1 Dec" });
  c.stays.push({ checkin: "2026-12-02", checkout: "2026-12-06" });
  assert.deepEqual(tripRange(c), { start: "2026-12-02", end: "2026-12-06" });
  assert.equal(tripRange(newCity("x")), null);
});
test("countdown wording", () => {
  const r = { start: "2026-12-01", end: "2026-12-06" };
  assert.equal(countdown(r, "2026-11-11"), "in 20 days");
  assert.equal(countdown(r, "2026-11-30"), "Tomorrow");
  assert.equal(countdown(r, "2026-12-01"), "Today");
  assert.equal(countdown(r, "2026-12-04"), "On the trip");
  assert.equal(countdown(r, "2026-12-07"), "");
  assert.equal(countdown(null, "2026-12-07"), "");
});
test("daysBetween ignores daylight saving", () => {
  assert.equal(daysBetween("2026-03-28", "2026-03-30"), 2);
});
test("routeParts reads common route spellings", () => {
  assert.deepEqual(routeParts("DXB to DUS"), ["DXB", "DUS"]);
  assert.deepEqual(routeParts("DXB-LIS"), ["DXB", "LIS"]);
  assert.deepEqual(routeParts("Dubai → Düsseldorf"), ["Dubai", "Düsseldorf"]);
  assert.deepEqual(routeParts("Frankfurt Hbf"), ["Frankfurt Hbf", ""]);
});
test("nights between check-in and check-out", () => {
  assert.equal(nights("2026-12-02", "2026-12-06"), 4);
  assert.equal(nights("", "2026-12-06"), 0);
});
test("todayIso pads month and day", () => {
  assert.equal(todayIso(new Date(2026, 0, 5)), "2026-01-05");
});

import { fix, totalsOf, findTrip, newTrip } from "../src/model.js";
import { normRes, buildPrompt, applyResult } from "../src/brain.js";

test("fix moves budget and currency up to the trip", () => {
  const S = fix({ countries: [{ id: "t", name: "Germany", cities: [
    { name: "Düsseldorf", cur: "EUR", tbudget: "1000" }, { name: "Frankfurt", cur: "EUR", tbudget: "500" }, { name: "Köln" } ] }] });
  assert.equal(S.countries[0].tbudget, "1500"); assert.equal(S.countries[0].cur, "EUR");
  const T = fix({ countries: [{ name: "Japan", cities: [] }] }).countries[0];
  assert.equal(T.tbudget, ""); assert.equal(T.cur, "USD");
});
test("fix keeps a trip budget that is already set", () => {
  const S = fix({ countries: [{ name: "x", tbudget: "200", cur: "AED", cities: [{ name: "y", tbudget: "999", cur: "EUR" }] }] });
  assert.equal(S.countries[0].tbudget, "200"); assert.equal(S.countries[0].cur, "AED");
});
test("totalsOf adds up every destination", () => {
  const a = newCity("a"), b = newCity("b");
  a.trans.push({ cost: "100", spent: "100" }); b.stays.push({ cost: "50" }); b.budget.push({ cost: "5", spent: "5" });
  const T = totalsOf([a, b]);
  assert.equal(T.all.p, 155); assert.equal(T.all.s, 105); assert.equal(T.trans.p, 100); assert.equal(T.stays.p, 50);
});
test("tripRange spans every destination of a trip", () => {
  const a = newCity("a"), b = newCity("b");
  a.trans.push({ date: "2026-12-01" }); b.stays.push({ checkin: "2026-12-02", checkout: "2026-12-06" });
  assert.deepEqual(tripRange({ cities: [a, b] }), { start: "2026-12-01", end: "2026-12-06" });
});
test("findTrip and newTrip", () => {
  const t = newTrip("Peru", "planned", "PEN");
  assert.equal(findTrip({ countries: [t] }, t.id), t);
  assert.equal(findTrip({ countries: [t] }, "nope"), null);
  assert.equal(t.cur, "PEN"); assert.equal(t.tbudget, "");
});
test("Brain Box works with a trip open but no destination chosen", () => {
  const cur = { c: { name: "Germany 2026" }, city: null };
  assert.match(buildPrompt("x", cur, false, 2026), /\(none chosen\) in trip Germany 2026/);
  assert.equal(normRes({}, cur).country, "Germany 2026");
  assert.equal(normRes({}, cur).city, "");
});
test("applyResult gives a new trip the pasted currency", () => {
  const S = fix({ countries: [] });
  applyResult(S, normRes({ currency: "aed", stays: [{ name: "x", city: "Lisbon", country: "Portugal" }] }), false);
  assert.equal(S.countries[0].cur, "AED"); assert.equal(S.countries[0].tbudget, "");
});

import { mergeJournal } from "../src/model.js";
test("mergeJournal adds new trips, fills existing ones, and is safe to repeat", () => {
  const S = fix({ countries: [{ id: "t1", name: "Portugal", cities: [{ id: "c1", name: "Lisbon", stays: [{ id: "s1", name: "Avenida" }] }] }] });
  const incoming = () => ({ countries: [
    { name: "portugal", status: "visited", year: "2024", cities: [{ name: "LISBON", status: "completed", stays: [{ id: "s1", name: "Avenida" }, { id: "s2", name: "Memmo" }], food: [{ id: "f1", name: "Belcanto", status: "visited" }] }, { name: "Porto" }] },
    { name: "Japan", year: "2019", status: "visited", cities: [{ name: "Kyoto" }] } ] });
  const n = mergeJournal(S, incoming());
  assert.deepEqual(n, { trips: 1, destinations: 2, items: 2 });
  const pt = S.countries[0];
  assert.equal(pt.status, "visited"); assert.equal(pt.year, "2024");
  assert.deepEqual(pt.cities[0].stays.map((x) => x.name), ["Avenida", "Memmo"]);
  assert.equal(pt.cities[0].status, "completed");
  assert.equal(S.countries[1].name, "Japan");
  assert.deepEqual(mergeJournal(S, incoming()), { trips: 0, destinations: 0, items: 0 });
});
