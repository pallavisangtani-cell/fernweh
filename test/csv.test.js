import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { buildCsv, csvCell, parseCSV, placesFromCsv, CSV_HEADER } from "../src/csv.js";
import { newCity } from "../src/model.js";

function trip() {
  const city = newCity("Lisbon", "EUR");
  city.itin.push({ id: "1", day: "2", time: "09:00", text: "Sintra day trip", via: "GetYourGuide", cost: "60", spent: "", status: "tentative", booked: "no" });
  city.trans.push({ id: "2", mode: "Flight", no: "EK191", route: "DXB to LIS", via: "Emirates", date: "2024-03-12", time: "08:15", ref: "HG8P22", cost: "2400", spent: "2400", status: "confirmed", booked: "yes" });
  city.stays.push({ id: "3", name: "Hotel Avenida", via: "Booking.com", checkin: "2024-03-12", checkout: "2024-03-16", conf: "88213", cost: "540", spent: "", status: "confirmed", booked: "yes" });
  city.places.push({ id: "4", name: "Manteigaria", cat: "Food & drink", note: "pastéis, go early" });
  city.budget.push({ id: "5", label: "Viva Viagem card", cat: "Transport", cost: "20", spent: "20" });
  return { c: { name: "Portugal" }, city };
}

describe("csvCell", () => {
  test("leaves plain values alone", () => { assert.equal(csvCell("Lisbon"), "Lisbon"); });
  test("null and undefined become empty", () => { assert.equal(csvCell(null), ""); assert.equal(csvCell(undefined), ""); });
  test("quotes commas, quotes and newlines", () => {
    assert.equal(csvCell("a,b"), '"a,b"');
    assert.equal(csvCell('say "hi"'), '"say ""hi"""');
    assert.equal(csvCell("a\nb"), '"a\nb"');
    assert.equal(csvCell("a\rb"), '"a\rb"');
  });
  test("numbers become strings", () => { assert.equal(csvCell(0), "0"); });
});

describe("buildCsv", () => {
  test("has a header and one row per item, in tab order", () => {
    const rows = parseCSV(buildCsv(trip()));
    assert.deepEqual(rows[0], CSV_HEADER);
    assert.deepEqual(rows.slice(1).map((r) => r[0]), ["Activity", "Transport", "Stay", "Place", "Cost"]);
    for (const r of rows) assert.equal(r.length, CSV_HEADER.length);
  });

  test("transport row carries number, route and booking ref", () => {
    const t = parseCSV(buildCsv(trip()))[2];
    assert.deepEqual(t, ["Transport", "EK191 DXB to LIS", "Flight", "2024-03-12", "08:15", "Emirates", "2400", "2400", "confirmed", "yes", "HG8P22"]);
  });

  test("activity day and stay dates are formatted", () => {
    const rows = parseCSV(buildCsv(trip()));
    assert.equal(rows[1][3], "Day 2");
    assert.equal(rows[3][3], "2024-03-12 to 2024-03-16");
    assert.equal(rows[3][10], "88213");
  });

  test("place detail joins category and note, and survives the comma", () => {
    assert.equal(parseCSV(buildCsv(trip()))[4][2], "Food & drink - pastéis, go early");
  });

  test("missing day and dates give empty cells, not 'Day ' or ' to '", () => {
    const f = { c: { name: "x" }, city: newCity("y") };
    f.city.itin.push({ text: "Walk" });
    f.city.stays.push({ name: "Somewhere" });
    f.city.stays.push({ name: "Half", checkout: "2024-01-02" });
    const rows = parseCSV(buildCsv(f));
    assert.equal(rows[1][3], ""); assert.equal(rows[2][3], ""); assert.equal(rows[3][3], "? to 2024-01-02");
  });

  test("an empty city gives just the header", () => {
    assert.equal(buildCsv({ c: { name: "x" }, city: newCity("y") }), CSV_HEADER.join(","));
  });
});

describe("parseCSV / placesFromCsv", () => {
  test("handles quoted fields, escaped quotes and CRLF", () => {
    assert.deepEqual(parseCSV('a,"b,c","d ""e"""\r\n1,2,3'), [["a", "b,c", 'd "e"'], ["1", "2", "3"]]);
  });
  test("reads a Google Takeout saved-places export", () => {
    const csv = "Title,Note,URL,Comment\nTime Out Market,lunch,https://maps.google.com/?cid=1,\n,,,\nBelém Tower,,https://maps.google.com/?cid=2,sunset\n";
    assert.deepEqual(placesFromCsv(csv), [
      { name: "Time Out Market", cat: "Other", note: "lunch", link: "https://maps.google.com/?cid=1" },
      { name: "Belém Tower", cat: "Other", note: "sunset", link: "https://maps.google.com/?cid=2" }
    ]);
  });
  test("header-only or empty input gives nothing", () => {
    assert.deepEqual(placesFromCsv("Title,Note"), []);
    assert.deepEqual(placesFromCsv(""), []);
  });
});
