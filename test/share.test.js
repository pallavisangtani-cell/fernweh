import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { buildShareDoc, shareText, shareItems, catsOf } from "../src/share.js";
import { totals, fix } from "../src/model.js";
import { newCity } from "../src/model.js";

function trip() {
  const city = newCity("Lisbon", "EUR");
  city.tbudget = "3000";
  city.itin.push({ day: "1", time: "13:00", text: "Lunch at Time Out Market", cost: "40" });
  city.trans.push({ route: "DXB to LIS", no: "EK191", ref: "HG8P22", cost: "2400" });
  city.stays.push({ name: "Hotel Avenida", checkin: "2024-03-12", checkout: "2024-03-16", conf: "88213", cost: "540" });
  city.food = [{ name: "Time Out Market", type: "Casual", status: "want" }, { name: "Belcanto", type: "Fine dining", michelin: "2 stars", best50: "yes", status: "visited" }];
  city.places.push({ name: "time out market", cat: "Other" }, { name: "Belém Tower", cat: "Sights", link: "https://maps.app.goo.gl/abc" }, { name: "<script>", cat: "Other" });
  return { c: { name: "Portugal" }, city };
}

describe("shareItems", () => {
  test("dedupes by name and adds stays as hotels", () => {
    const items = shareItems(trip().city);
    assert.deepEqual(items.map((i) => i.name), ["Time Out Market", "Belcanto", "Belém Tower", "<script>", "Hotel Avenida"]);
    assert.equal(items[1].cat, "Restaurants"); assert.equal(items[1].note, "Fine dining · 2 stars · World's 50 Best");
    assert.equal(items[4].cat, "Hotel"); assert.equal(items[4].note, "2024-03-12 to 2024-03-16");
  });
  test("uses the saved link when it is a URL, else a Maps search", () => {
    const items = shareItems(trip().city);
    assert.equal(items[2].url, "https://maps.app.goo.gl/abc");
    assert.match(items[0].url, /^https:\/\/www\.google\.com\/maps\/search\/\?api=1&query=Time%20Out%20Market%2C%20Lisbon$/);
  });
  test("catsOf follows the app's category order", () => {
    assert.deepEqual(catsOf(shareItems(trip().city)), ["Restaurants", "Hotel", "Sights", "Other"]);
  });
});

describe("buildShareDoc", () => {
  test("leaves out costs and booking refs by default", () => {
    const html = buildShareDoc(trip(), { itin: true, costs: false });
    for (const secret of ["HG8P22", "88213", "2,400", "Planned", "3,000"]) assert.ok(!html.includes(secret), secret);
    assert.match(html, /Lunch at Time Out Market/);
  });
  test("includes the budget line when costs are on, still without booking refs", () => {
    const html = buildShareDoc(trip(), { itin: true, costs: true });
    assert.match(html, /Trip budget EUR 3,000/);
    assert.ok(!html.includes("HG8P22") && !html.includes("88213"));
  });
  test("escapes user text", () => {
    const html = buildShareDoc(trip(), { itin: false, costs: false });
    assert.ok(html.includes("&lt;script&gt;"));
    assert.equal(html.match(/<script>/g).length, 1, "only the page's own filter script");
  });
  test("omits the itinerary when asked", () => {
    assert.ok(!buildShareDoc(trip(), { itin: false, costs: false }).includes("<h2>Itinerary</h2>"));
  });
});

describe("shareText", () => {
  test("lists places by category and the itinerary", () => {
    const t = shareText(trip(), { itin: true });
    assert.ok(t.startsWith("Lisbon, Portugal (trip in planning)\n"));
    assert.match(t, /\nSights\n- Belém Tower https:\/\/maps\.app\.goo\.gl\/abc\n/);
    assert.match(t, /\nItinerary\nDay 1\n- 13:00 Lunch at Time Out Market\n/);
  });
});

describe("totals and fix", () => {
  test("totals sums planned and spent across categories", () => {
    const T = totals(trip().city);
    assert.equal(T.all.p, 40 + 2400 + 540); assert.equal(T.trans.p, 2400); assert.equal(T.all.s, 0);
  });
  test("fix fills in fields missing from old saves", () => {
    const S = fix({ countries: [{ name: "Japan", cities: [{ name: "Tokyo" }] }] });
    const co = S.countries[0], ci = co.cities[0];
    assert.equal(co.status, "planned"); assert.equal(co.year, "");
    assert.deepEqual(ci.packing, []); assert.equal(ci.cur, "USD"); assert.equal(ci.status, "planning");
  });
});

import { tripShare } from "../src/share.js";
test("tripShare covers every destination and links places to their own city", () => {
  const a = newCity("Düsseldorf"), b = newCity("Frankfurt");
  a.places.push({ name: "Rheinturm", cat: "Sights" }); b.stays.push({ name: "Aloft", conf: "X1" });
  const f = tripShare({ name: "Germany 2026", cur: "EUR", tbudget: "1500", status: "planned", cities: [a, b] });
  assert.equal(f.city.name, "Germany 2026"); assert.equal(f.c.name, "Düsseldorf · Frankfurt");
  const items = shareItems(f.city);
  assert.match(items[0].url, /Rheinturm%2C%20D%C3%BCsseldorf$/);
  assert.match(items[1].url, /Aloft%2C%20Frankfurt$/);
  assert.ok(!buildShareDoc(f, { itin: true, costs: false }).includes("X1"));
});
