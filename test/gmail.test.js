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
  assert.match(q, /^newer_than:3m /); assert.match(q, /subject:\(booking OR/); assert.match(q, /from:\(booking\.com OR airbnb/);
});
test("emailForClaude labels and trims", () => {
  const t = emailForClaude({ subject: "S", from: "F", date: "D", text: "x".repeat(50) }, 10);
  assert.equal(t, "## Email: S\nFrom: F\nDate: D\n\nxxxxxxxxxx\n[…]");
});
