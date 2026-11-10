import { test } from "node:test";
import assert from "node:assert/strict";
import { slug, esc, planned, fmt, setCur } from "../src/util.js";

test("slug keeps accented letters as their base letter", () => {
  assert.equal(slug("Düsseldorf"), "dusseldorf");
  assert.equal(slug("São Paulo"), "sao-paulo");
  assert.equal(slug("!!!"), "trip");
  assert.equal(slug(""), "trip");
});
test("esc escapes HTML", () => { assert.equal(esc('<a href="x">&</a>'), "&lt;a href=&quot;x&quot;&gt;&amp;&lt;/a&gt;"); });
test("planned prefers cost, falls back to legacy amount", () => {
  assert.equal(planned({ cost: "12.5" }), 12.5);
  assert.equal(planned({ cost: "", amount: "7" }), 7);
  assert.equal(planned({}), 0);
});
test("fmt uses the current currency", () => { setCur("EUR"); assert.equal(fmt(1234.5), "EUR 1,234.5"); setCur(); });
