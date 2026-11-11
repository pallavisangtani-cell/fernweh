import { test } from "node:test";
import assert from "node:assert/strict";
import { fix, filterFood, newCity } from "../src/model.js";
import { normRes, normFood, markPast, buildPrompt, BRAIN_SCHEMA } from "../src/brain.js";
import { buildCsv, parseCSV } from "../src/csv.js";

test("old Food & drink places move to Restaurants once, other places stay", () => {
  const S = fix({ countries: [{ name: "Portugal", cities: [
    { name: "Lisbon", status: "completed", places: [{ id: "a", name: "Manteigaria", cat: "Food & drink", note: "pastéis" }, { id: "b", name: "Belém Tower", cat: "Sights" }] },
    { name: "Porto", places: [{ id: "c", name: "Cafe Santiago", cat: "Food & drink" }] } ] }] });
  const [lis, opo] = S.countries[0].cities;
  assert.deepEqual(lis.places.map((p) => p.name), ["Belém Tower"]);
  assert.equal(lis.food[0].name, "Manteigaria"); assert.equal(lis.food[0].status, "visited"); assert.equal(lis.food[0].note, "pastéis");
  assert.equal(opo.food[0].status, "want");
  // A restaurant the user later saves as a place by hand stays a place.
  lis.places.push({ id: "z", name: "Kiosk", cat: "Food & drink" });
  fix(S);
  assert.equal(lis.places.length, 2); assert.equal(lis.food.length, 1);
});

test("filterFood by status, category and award", () => {
  const list = [
    { name: "A", type: "Fine dining", status: "visited", michelin: "2 stars", best50: "yes" },
    { name: "B", type: "Cafe", status: "want" },
    { name: "C", type: "Bar", status: "want", best50: "yes" },
    { name: "D", status: "want", michelin: "Bib Gourmand" }
  ];
  const names = (xs) => xs.map((x) => x.name);
  assert.deepEqual(names(filterFood(list, "want", "All", "")), ["B", "C", "D"]);
  assert.deepEqual(names(filterFood(list, "all", "Bar", "")), ["C"]);
  assert.deepEqual(names(filterFood(list, "all", "Other", "")), ["D"]);
  assert.deepEqual(names(filterFood(list, "all", "All", "michelin")), ["A", "D"]);
  assert.deepEqual(names(filterFood(list, "want", "All", "best50")), ["C"]);
});

test("normFood keeps only known values", () => {
  const r = normFood({ name: " Noma ", type: "Tasting menu", status: "VISITED", michelin: "4 stars", best50: "Yes" });
  assert.deepEqual([r.name, r.type, r.status, r.michelin, r.best50], ["Noma", "Other", "visited", "", "yes"]);
  assert.equal(normFood({ name: "x", michelin: "Bib Gourmand" }).michelin, "Bib Gourmand");
  assert.equal(normFood({ name: "x" }).status, "want");
});

test("Brain Box results carry restaurants, and past trips mark them visited", () => {
  const r = normRes({ city: "Lisbon", country: "Portugal", food: [{ name: "Belcanto", type: "Fine dining", michelin: "2 stars" }] });
  assert.equal(r.food[0].city, "Lisbon"); assert.equal(r.food[0].status, "want");
  assert.equal(markPast(r).food[0].status, "visited");
  assert.ok(BRAIN_SCHEMA.required.includes("food"));
  assert.match(buildPrompt("x", null, false, 2026), /Put every named restaurant, cafe, bar or bakery in food/);
});

test("CSV includes restaurants", () => {
  const c = newCity("Lisbon");
  c.food.push({ name: "Belcanto", type: "Fine dining", michelin: "2 stars", best50: "yes", status: "visited" });
  const row = parseCSV(buildCsv({ c: { name: "P" }, city: c }))[1];
  assert.deepEqual(row.slice(0, 3), ["Restaurant", "Belcanto", "Fine dining - 2 stars - World's 50 Best - Visited"]);
});
