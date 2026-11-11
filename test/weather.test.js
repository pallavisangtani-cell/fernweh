import { test } from "node:test";
import assert from "node:assert/strict";
import { weatherPlan, summarize, weatherText } from "../src/weather.js";

test("weatherPlan: forecast when the trip is within 16 days", () => {
  assert.deepEqual(weatherPlan({ start: "2026-11-20", end: "2026-11-24" }, "2026-11-11"), { kind: "forecast", start: "2026-11-20", end: "2026-11-24" });
  // Already on the trip: from today. Runs past the forecast window: cut at 15 days out.
  assert.deepEqual(weatherPlan({ start: "2026-11-08", end: "2026-12-01" }, "2026-11-11"), { kind: "forecast", start: "2026-11-11", end: "2026-11-26" });
});
test("weatherPlan: same dates last year when the trip is further away", () => {
  assert.deepEqual(weatherPlan({ start: "2026-12-01", end: "2026-12-06" }, "2026-11-11"), { kind: "typical", start: "2025-12-01", end: "2025-12-06" });
  assert.deepEqual(weatherPlan({ start: "2028-02-29", end: "2028-03-02" }, "2026-11-11"), { kind: "typical", start: "2026-02-28", end: "2026-03-02" });
});
test("weatherPlan: actual weather for a past trip, and long trips are capped", () => {
  assert.deepEqual(weatherPlan({ start: "2024-03-12", end: "2024-03-16" }, "2026-11-11"), { kind: "actual", start: "2024-03-12", end: "2024-03-16" });
  assert.equal(weatherPlan({ start: "2027-06-01", end: "2027-08-30" }, "2026-11-11").end, "2026-06-21");
});
test("summarize forecast and archive data", () => {
  const f = summarize({ time: ["a", "b", "c"], temperature_2m_max: [8, 10, 9], temperature_2m_min: [2, 4, 3], precipitation_probability_max: [80, 20, 55] }, "forecast");
  assert.deepEqual(f, { kind: "forecast", days: 3, hi: 9, lo: 3, max: 10, min: 2, wet: 2 });
  const a = summarize({ time: ["a", "b"], temperature_2m_max: [30, 34], temperature_2m_min: [22, null], precipitation_sum: [0, 0.5] }, "typical");
  assert.equal(a.lo, 22); assert.equal(a.wet, 0);
  assert.equal(summarize({}, "typical"), null);
});
test("weatherText reads naturally", () => {
  assert.equal(weatherText({ kind: "typical", days: 6, hi: 9, lo: 4, max: 10, min: 3, wet: 3 }), "Usually 4–9°C, rain on 3 of 6 days");
  assert.equal(weatherText({ kind: "forecast", days: 3, hi: 30, lo: 22, max: 36, min: 21, wet: 0 }), "Forecast 22–30°C (21 to 36°C), mostly dry");
  assert.equal(weatherText(null), "");
});
