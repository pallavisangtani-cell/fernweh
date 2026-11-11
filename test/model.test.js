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
