import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { norm, normRes, mergeRes, chunkText, isRoutable, markPast, applyResult, buildPrompt, yearOfItem } from "../src/brain.js";
import { fix } from "../src/model.js";

const cur = { c: { name: "Germany" }, city: { name: "Frankfurt" } };

describe("norm", () => {
  test("keeps only the listed keys, trimmed, as strings", () => {
    assert.deepEqual(norm({ name: "  Aloft ", cost: 540, extra: "x" }, ["name", "cost", "via"]), { name: "Aloft", cost: "540", via: "" });
  });
  test("status and booked fall back to tentative / no", () => {
    const x = norm({ status: "Confirmed", booked: "YES" }, ["status", "booked"]);
    assert.equal(x.status, "confirmed"); assert.equal(x.booked, "yes");
    const y = norm({ status: "reserved?", booked: "paid" }, ["status", "booked"]);
    assert.equal(y.status, "tentative"); assert.equal(y.booked, "no");
  });
  test("handles null input", () => {
    assert.deepEqual(norm(null, ["a"]), { a: "" });
  });
});

describe("normRes", () => {
  test("fills every list with empty arrays when the model returns little", () => {
    const r = normRes({}, null);
    for (const k of ["itin", "trans", "stays", "places", "budget", "packing"]) assert.deepEqual(r[k], []);
    assert.equal(r.city, ""); assert.equal(r.country, ""); assert.equal(r.notes, "");
  });

  test("survives null, arrays and strings from the model", () => {
    for (const bad of [null, undefined, [], "oops", 42]) {
      const r = normRes(bad, cur);
      assert.equal(r.city, "Frankfurt"); assert.deepEqual(r.trans, []);
    }
  });

  test("non-array lists are treated as empty", () => {
    const r = normRes({ city: "Lisbon", country: "Portugal", trans: "EK191", stays: { name: "x" } });
    assert.deepEqual(r.trans, []); assert.deepEqual(r.stays, []);
  });

  test("falls back to the current city when the model gives none", () => {
    const r = normRes({ stays: [{ name: "Aloft" }] }, cur);
    assert.equal(r.city, "Frankfurt"); assert.equal(r.country, "Germany");
    assert.equal(r.stays[0].city, "Frankfurt"); assert.equal(r.stays[0].country, "Germany");
  });

  test("items keep their own city when it differs from the top level", () => {
    const r = normRes({ city: "Düsseldorf", country: "Germany", trans: [{ route: "DUS to FRA", city: "Frankfurt", country: "Germany" }] });
    assert.equal(r.trans[0].city, "Frankfurt");
  });

  test("with no top-level city, takes the first item that has one", () => {
    const r = normRes({ places: [{ name: "Manteigaria", city: "Lisbon", country: "Portugal" }] });
    assert.equal(r.city, "Lisbon"); assert.equal(r.country, "Portugal");
  });

  test("unknown place categories become Other; known ones are kept", () => {
    const r = normRes({ city: "a", country: "b", places: [{ name: "x", cat: "Restaurant" }, { name: "y", cat: "Vineyard" }] });
    assert.equal(r.places[0].cat, "Other"); assert.equal(r.places[1].cat, "Vineyard");
  });

  test("currency is upper-cased and trimmed", () => {
    assert.equal(normRes({ currency: " eur " }).currency, "EUR");
  });

  test("keeps flight numbers and booking refs exactly", () => {
    const r = normRes({ city: "Düsseldorf", country: "Germany", trans: [{ no: "EK055", ref: "HG8P22", route: "DXB to DUS", status: "confirmed", booked: "yes", cost: 1800 }] });
    assert.equal(r.trans[0].no, "EK055"); assert.equal(r.trans[0].ref, "HG8P22"); assert.equal(r.trans[0].cost, "1800");
  });

  test("packing items keep only text", () => {
    assert.deepEqual(normRes({ packing: [{ text: " Umbrella ", qty: 2 }] }).packing, [{ text: "Umbrella" }]);
  });
});

describe("mergeRes", () => {
  const a = () => normRes({ city: "Lisbon", country: "Portugal", currency: "EUR", stays: [{ name: "Avenida" }], notes: "Tram 28 is busy." });
  const b = () => normRes({ city: "Porto", country: "Portugal", currency: "AED", stays: [{ name: "Torel" }], packing: [{ text: "Hat" }], notes: "Try francesinha." });

  test("concatenates lists in order", () => {
    const m = mergeRes(a(), b());
    assert.deepEqual(m.stays.map((s) => s.name), ["Avenida", "Torel"]);
    assert.deepEqual(m.packing, [{ text: "Hat" }]);
  });
  test("joins notes with a blank line", () => {
    assert.equal(mergeRes(a(), b()).notes, "Tram 28 is busy.\n\nTry francesinha.");
  });
  test("keeps the first city and currency", () => {
    const m = mergeRes(a(), b());
    assert.equal(m.city, "Lisbon"); assert.equal(m.currency, "EUR");
  });
  test("takes city and currency from b when a has none", () => {
    const m = mergeRes(normRes({}), b());
    assert.equal(m.city, "Porto"); assert.equal(m.country, "Portugal"); assert.equal(m.currency, "AED");
  });
  test("does not add notes separators when b has no notes", () => {
    assert.equal(mergeRes(a(), normRes({})).notes, "Tram 28 is busy.");
  });
});

describe("chunkText", () => {
  test("short text is one chunk", () => {
    assert.deepEqual(chunkText("a\nb", 100), ["a\nb\n"]);
  });
  test("splits on line boundaries and never exceeds n when lines fit", () => {
    const lines = Array.from({ length: 50 }, (_, i) => "line " + i + " " + "x".repeat(20));
    const chunks = chunkText(lines.join("\n"), 120);
    assert.ok(chunks.length > 1);
    for (const c of chunks) assert.ok(c.length <= 120, `chunk of ${c.length}`);
    assert.equal(chunks.join(""), lines.join("\n") + "\n");
  });
  test("loses no text", () => {
    const t = "Day 1\nSintra\n\nDay 2\nBelém\nPastéis";
    assert.equal(chunkText(t, 8).join("").trimEnd(), t);
  });
  test("a single line longer than n stays whole (known limit)", () => {
    const long = "y".repeat(50);
    assert.deepEqual(chunkText("a\n" + long + "\nb", 10), ["a\n", long + "\n", "b\n"]);
  });
  test("whitespace-only text gives no chunks", () => {
    assert.deepEqual(chunkText("\n\n  \n", 10), []);
  });
});

describe("isRoutable", () => {
  test("false when an item lacks a country", () => {
    assert.equal(isRoutable(normRes({ stays: [{ name: "x", city: "Lisbon" }] })), false);
  });
  test("false when notes have nowhere to go", () => {
    assert.equal(isRoutable(normRes({ notes: "tips" })), false);
  });
  test("true when everything has a city and country", () => {
    assert.equal(isRoutable(normRes({ stays: [{ name: "x" }], notes: "tips" }, cur)), true);
  });
});

describe("markPast", () => {
  test("confirms, books and copies cost into spent unless spent is set", () => {
    const r = markPast(normRes({ city: "a", country: "b", stays: [{ name: "x", cost: "540" }, { name: "y", cost: "100", spent: "90" }], budget: [{ label: "taxi", cost: "20" }] }));
    assert.equal(r.stays[0].status, "confirmed"); assert.equal(r.stays[0].booked, "yes"); assert.equal(r.stays[0].spent, "540");
    assert.equal(r.stays[1].spent, "90"); assert.equal(r.budget[0].spent, "20");
  });
});

describe("applyResult", () => {
  test("files each item under its own city and creates countries as needed", () => {
    const S = fix({ countries: [] });
    const r = normRes({
      city: "Düsseldorf", country: "Germany", currency: "EUR",
      trans: [
        { route: "DXB to DUS", no: "EK055", city: "Düsseldorf", country: "Germany", date: "2026-12-01" },
        { route: "DUS to FRA", city: "Frankfurt", country: "Germany", date: "2026-12-02" },
        { route: "FRA to DXB", city: "Frankfurt", country: "Germany", date: "2026-12-06" }
      ],
      stays: [{ name: "Aloft", city: "Frankfurt", country: "Germany" }],
      packing: [{ text: "Scarf" }], notes: "Christmas markets."
    });
    const main = applyResult(S, r, false);
    assert.equal(S.countries.length, 1);
    const [dus, fra] = S.countries[0].cities;
    assert.equal(dus.name, "Düsseldorf"); assert.equal(fra.name, "Frankfurt");
    assert.deepEqual(dus.trans.map((t) => t.route), ["DXB to DUS"]);
    assert.deepEqual(fra.trans.map((t) => t.route), ["DUS to FRA", "FRA to DXB"]);
    assert.equal(fra.stays[0].name, "Aloft");
    assert.equal(dus.cur, "EUR");
    assert.equal(main, dus);
    assert.deepEqual(S.countries[0].packing.map((p) => p.text), ["Scarf"]);
    assert.equal(dus.notes, "Christmas markets.");
    assert.equal(S.countries[0].status, "planned");
    assert.ok(!("city" in dus.trans[0]) && !("country" in dus.trans[0]));
    assert.ok(dus.trans[0].id);
  });

  test("matches existing countries and cities case-insensitively", () => {
    const S = fix({ countries: [{ id: "c1", name: "Portugal", cities: [{ id: "x1", name: "Lisbon" }] }] });
    applyResult(S, normRes({ stays: [{ name: "Avenida", city: "lisbon", country: "PORTUGAL" }] }), false);
    assert.equal(S.countries.length, 1); assert.equal(S.countries[0].cities.length, 1);
    assert.equal(S.countries[0].cities[0].stays.length, 1);
  });

  test("past trips mark city completed, country visited, and set the earliest year", () => {
    const S = fix({ countries: [] });
    applyResult(S, normRes({ city: "Lisbon", country: "Portugal", trans: [{ route: "DXB to LIS", date: "2024-03-12" }], stays: [{ name: "Avenida", checkin: "2023-03-12" }] }), true);
    const co = S.countries[0];
    assert.equal(co.status, "visited"); assert.equal(co.cities[0].status, "completed"); assert.equal(co.year, "2023");
  });

  test("does not overwrite a year the user already set", () => {
    const S = fix({ countries: [{ id: "c1", name: "Portugal", year: "2019", cities: [] }] });
    applyResult(S, normRes({ trans: [{ route: "x", date: "2024-01-01", city: "Lisbon", country: "Portugal" }] }), true);
    assert.equal(S.countries[0].year, "2019");
  });
});

describe("yearOfItem", () => {
  test("reads the year from date or checkin", () => {
    assert.equal(yearOfItem({ date: "2024-03-12" }), "2024");
    assert.equal(yearOfItem({ checkin: "2019-12-30" }), "2019");
    assert.equal(yearOfItem({}), "");
  });
});

describe("buildPrompt", () => {
  test("includes the routing rule, current city and text", () => {
    const p = buildPrompt("EK055 DXB to DUS", cur, false, 2026);
    assert.match(p, /FRA to DXB \(going home\) belongs to Frankfurt/);
    assert.match(p, /Current destination in the journal: Frankfurt, Germany/);
    assert.match(p, /assume 2026/);
    assert.ok(p.endsWith("TEXT:\nEK055 DXB to DUS"));
  });
  test("past-trip mode tells the model not to guess years", () => {
    assert.match(buildPrompt("x", null, true), /leave the date empty/);
    assert.match(buildPrompt("x", null, true), /Current destination in the journal: none/);
  });
});

import { packPrompt, PACK_SCHEMA } from "../src/brain.js";
describe("home and packing prompts", () => {
  test("the home city goes into the routing rule", () => {
    const p = buildPrompt("x", null, false, 2026, "Dubai");
    assert.match(p, /ends at the traveller home \(Dubai\), which belongs to the destination it departs from/);
    assert.match(p, /Never create a destination for the traveller home/);
    assert.match(buildPrompt("x", null, false, 2026), /\(the origin of the first flight\)/);
  });
  test("packPrompt carries weather, plans and dining", () => {
    const p = packPrompt({ trip: "Germany 2026", home: "Dubai", range: { start: "2026-12-01", end: "2026-12-06" }, have: ["Scarf"],
      dests: [{ name: "Düsseldorf", weather: "Usually 2–7°C, rain on 4 of 6 days", activities: ["Christmas market"], dining: ["Im Schiffchen (Fine dining, 1 star)"] }, { name: "Frankfurt", weather: "", activities: [], dining: [] }] });
    assert.match(p, /Germany 2026, 2026-12-01 to 2026-12-06\. Travelling from Dubai\./);
    assert.match(p, /- Düsseldorf: Usually 2–7°C, rain on 4 of 6 days\. Plans: Christmas market\. Dining: Im Schiffchen/);
    assert.match(p, /- Frankfurt: weather unknown, use the usual climate for the dates\./);
    assert.match(p, /Already packed or on the list: Scarf\./);
    assert.deepEqual(PACK_SCHEMA.properties.items.items.required, ["text", "cat", "why"]);
  });
});

import { itemKey, bookingsOnly } from "../src/brain.js";
describe("syncing the same booking twice", () => {
  const flight = (extra) => normRes({ city: "Düsseldorf", country: "Germany 2026", trans: [Object.assign({ no: "EK055", route: "DXB to DUS", date: "2026-12-01", via: "Emirates", status: "tentative", booked: "no" }, extra)] });
  test("a repeat updates instead of adding, and only upgrades status", () => {
    const S = fix({ countries: [] }), st = {};
    applyResult(S, flight({}), false, st);
    assert.equal(st.added.length, 1);
    const st2 = {};
    applyResult(S, flight({ ref: "HG8P22", status: "confirmed", booked: "yes", cost: "1800" }), false, st2);
    const t = S.countries[0].cities[0].trans;
    assert.equal(t.length, 1); assert.equal(st2.added.length, 0); assert.equal(st2.updated.length, 1);
    assert.deepEqual([t[0].ref, t[0].status, t[0].booked, t[0].cost], ["HG8P22", "confirmed", "yes", "1800"]);
    const st3 = {};
    applyResult(S, flight({ status: "tentative", booked: "no", via: "Other airline" }), false, st3);
    assert.deepEqual([t[0].status, t[0].booked, t[0].via], ["confirmed", "yes", "Emirates"]);
    assert.equal(st3.updated.length, 0, "nothing new, nothing reported");
  });
  test("the same booking reference matches even if the route is written differently", () => {
    const S = fix({ countries: [] });
    applyResult(S, flight({ ref: "HG8P22" }), false);
    applyResult(S, normRes({ city: "Düsseldorf", country: "Germany 2026", trans: [{ ref: "hg8p22", route: "Dubai - Düsseldorf", date: "2026-12-01" }] }), false);
    assert.equal(S.countries[0].cities[0].trans.length, 1);
  });
  test("stays match on name and check-in; restaurants on name", () => {
    const S = fix({ countries: [] });
    const r = () => normRes({ city: "Tokyo", country: "Japan", stays: [{ name: "Blossom Shinjuku", checkin: "2024-04-08" }], food: [{ name: "Den", bookDate: "2024-04-09" }] });
    applyResult(S, r(), false); applyResult(S, r(), false);
    const c = S.countries[0].cities[0];
    assert.equal(c.stays.length, 1); assert.equal(c.food.length, 1);
    assert.equal(itemKey("stays", { name: " Blossom  Shinjuku ", checkin: "2024-04-08" }), "blossom shinjuku|2024-04-08");
  });
  test("packing from Claude goes to the trip's list, without duplicates", () => {
    const S = fix({ countries: [] });
    applyResult(S, normRes({ city: "Tokyo", country: "Japan", packing: [{ text: "Umbrella" }] }), false);
    applyResult(S, normRes({ city: "Tokyo", country: "Japan", packing: [{ text: "umbrella" }, { text: "Scarf" }] }), false);
    assert.deepEqual(S.countries[0].packing.map((p) => p.text), ["Umbrella", "Scarf"]);
    assert.equal(S.countries[0].cities[0].packing.length, 0);
  });
  test("bookingsOnly keeps bookings and drops the rest", () => {
    const r = bookingsOnly(normRes({ city: "Tokyo", country: "Japan", notes: "tips", packing: [{ text: "x" }],
      trans: [{ route: "SIN to KIX" }, { route: "lost", city: "" }], places: [{ name: "Shrine" }], budget: [{ label: "taxi" }],
      food: [{ name: "Sezanne", bookDate: "2024-04-10" }, { name: "Den" }] }));
    assert.equal(r.trans.length, 2, "normRes fills the destination from the top level");
    assert.deepEqual(r.food.map((f) => f.name), ["Sezanne"]);
    assert.deepEqual([r.places.length, r.budget.length, r.packing.length, r.notes], [0, 0, 0, ""]);
  });
});
