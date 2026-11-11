import { test } from "node:test";
import assert from "node:assert/strict";
import { pinnable, missingGeo, pins, searchText } from "../src/maps.js";
import { newCity, dateOfDay, dayOfDate, reservations, filterFood } from "../src/model.js";

test("pins and missing locations across destinations", () => {
  const a = newCity("Tokyo"), b = newCity("Kyoto");
  a.food.push({ id: "f1", name: "Den", geo: { lat: 35.67, lng: 139.71 } }, { id: "f2", name: "Florilege" });
  a.stays.push({ id: "s1", name: "Blossom Shinjuku", geo: { lat: 35.69, lng: 139.7 } });
  b.places.push({ id: "p1", name: "Fushimi Inari" }, { id: "p2", name: "" });
  assert.equal(pinnable([a, b]).length, 4);
  assert.deepEqual(missingGeo([a, b]).map((x) => x.item.name), ["Florilege", "Fushimi Inari"]);
  assert.deepEqual(pins([a, b]).map((x) => x.kind + ":" + x.item.name), ["stays:Blossom Shinjuku", "food:Den"]);
  assert.deepEqual(pins([a], ["food"]).map((x) => x.item.name), ["Den"]);
});
test("searchText adds the neighbourhood and destination", () => {
  assert.equal(searchText("Den", "Tokyo"), "Den, Tokyo");
  assert.equal(searchText("JR Kyushu Hotel Blossom", "Tokyo", "Shinjuku"), "JR Kyushu Hotel Blossom, Shinjuku, Tokyo");
});
test("itinerary days map to dates from the trip start", () => {
  assert.equal(dateOfDay("2024-03-31", 1), "2024-03-31");
  assert.equal(dateOfDay("2024-03-31", "11"), "2024-04-10");
  assert.equal(dateOfDay("", 3), ""); assert.equal(dateOfDay("2024-03-31", 0), "");
  assert.equal(dayOfDate("2024-03-31", "2024-04-10"), 11);
  assert.equal(dayOfDate("2024-03-31", "2024-03-30"), 0);
  assert.equal(dayOfDate("", "2024-04-10"), 0);
});
test("booked tables become itinerary entries", () => {
  const c = newCity("Tokyo");
  c.food.push({ id: "a", name: "Sezanne", bookDate: "2024-04-10", bookTime: "12:00", bookVia: "Omakase" }, { id: "b", name: "Den" });
  const r = reservations(c, "2024-03-31");
  assert.equal(r.length, 1);
  assert.deepEqual([r[0].day, r[0].time, r[0].text, r[0].via, r[0]._res], ["11", "12:00", "Sezanne", "Omakase", true]);
  assert.equal(reservations(c, "")[0].day, "");
});
test("filterFood by cuisine, ignoring case", () => {
  const list = [{ name: "Harutaka", cuisine: "Sushi" }, { name: "Kondo", cuisine: "Tempura" }, { name: "Den", cuisine: "" }];
  assert.deepEqual(filterFood(list, "all", "All", "", "sushi").map((x) => x.name), ["Harutaka"]);
  assert.equal(filterFood(list, "all", "All", "", "All").length, 3);
});
