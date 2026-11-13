import { test } from "node:test";
import assert from "node:assert/strict";
import { decodeB64url, htmlToText, extractText, header, bookingQuery, emailForClaude } from "../src/gmail.js";

const b64url = (s) => Buffer.from(s, "utf8").toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

test("decodeB64url handles UTF-8 and missing padding", () => {
  assert.equal(decodeB64url(b64url("Düsseldorf → Frankfurt ✈")), "Düsseldorf → Frankfurt ✈");
});
test("htmlToText keeps line breaks and drops styles", () => {
  assert.equal(htmlToText("<style>.x{}</style><p>Booking&nbsp;ref: <b>HG8P22</b></p><div>Emirates &amp; flydubai</div>"), "Booking ref: HG8P22\nEmirates & flydubai");
});
test("extractText prefers plain text, falls back to HTML", () => {
  const plain = "Your flight EK055 DXB to DUS on 1 December is confirmed. Booking reference HG8P22. Seat 32A.";
  const p1 = { mimeType: "multipart/alternative", parts: [{ mimeType: "text/plain", body: { data: b64url(plain) } }, { mimeType: "text/html", body: { data: b64url("<p>x</p>") } }] };
  assert.equal(extractText(p1), plain);
  const p2 = { mimeType: "multipart/mixed", parts: [{ mimeType: "multipart/alternative", parts: [{ mimeType: "text/plain", body: { data: b64url("See HTML") } }, { mimeType: "text/html", body: { data: b64url("<table><tr><td>Hotel Aloft</td></tr><tr><td>2–6 Dec</td></tr></table>") } }] }] };
  assert.equal(extractText(p2), "Hotel Aloft\n2–6 Dec");
});
test("header lookup ignores case", () => {
  assert.equal(header({ headers: [{ name: "Subject", value: "Your booking" }] }, "subject"), "Your booking");
  assert.equal(header({}, "From"), "");
});
test("bookingQuery limits the period and looks for confirmations", () => {
  const q = bookingQuery(3);
  assert.match(q, /^newer_than:3m /); assert.match(q, /-category:promotions/);
});
test("emailForClaude labels and trims", () => {
  const t = emailForClaude({ subject: "S", from: "F", date: "D", text: "x".repeat(50) }, 10);
  assert.equal(t, "## Email: S\nFrom: F\nDate: D\n\nxxxxxxxxxx\n[…]");
});

import { isBookingSubject } from "../src/gmail.js";
import { gmailPreamble } from "../src/brain.js";
import { fix, newCity } from "../src/model.js";
test("only booking subjects pass", () => {
  for (const s of ["Your reservation at Den is confirmed", "Your itinerary: DXB – NRT", "Your booking at Hotel Aloft", "Booking confirmation 88213", "Emirates e-ticket receipt", "Reservation confirmed for 2 people"])
    assert.equal(isBookingSubject(s), true, s);
  for (const s of ["How was your stay at Hotel Aloft?", "Your booking has been cancelled", "Flash sale: 30% off flights", "Complete your booking now", "Weekly newsletter", "Your receipt from Uber", ""])
    assert.equal(isBookingSubject(s), false, s);
});
test("the search asks Gmail for those phrases only", () => {
  const q = bookingQuery(6);
  assert.match(q, /subject:\("your reservation" OR "your itinerary" OR "your booking"/);
  assert.doesNotMatch(q, /from:/);
});
test("gmailPreamble lists existing trips so bookings join them", () => {
  const a = newCity("Düsseldorf"); a.trans.push({ date: "2026-12-01" });
  const S = fix({ countries: [{ name: "Germany 2026", cities: [a] }] });
  const p = gmailPreamble(S, "2026-11-13");
  assert.match(p, /- Germany 2026 \(2026-12-01 to 2026-12-01\): Düsseldorf/);
  assert.match(p, /Today is 2026-11-13/);
  assert.match(gmailPreamble(fix({ countries: [] }), "x"), /\(none yet\)/);
});
