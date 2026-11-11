// CSV in (Google Maps saved-places export) and out (trip sheet).

export function csvCell(v) {
  v = String(v == null ? "" : v);
  return /[",\r\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v;
}

export const CSV_HEADER = ["Type", "Name", "Detail", "Day or date", "Time", "Provider", "Planned cost", "Spent", "Status", "Booked", "Reference"];

function range(a, b) { return (a || b) ? (a || "?") + " to " + (b || "?") : ""; }

export function buildCsv(f) {
  var c = f.city, rows = [CSV_HEADER];
  c.itin.forEach(function (i) { rows.push(["Activity", i.text, "", i.day ? "Day " + i.day : "", i.time, i.via, i.cost, i.spent, i.status, i.booked, ""]); });
  c.trans.forEach(function (i) { rows.push(["Transport", (i.no ? i.no + " " : "") + i.route, i.mode, i.date, i.time, i.via, i.cost, i.spent, i.status, i.booked, i.ref]); });
  c.stays.forEach(function (i) { rows.push(["Stay", i.name, "", range(i.checkin, i.checkout), "", i.via, i.cost, i.spent, i.status, i.booked, i.conf]); });
  (c.food || []).forEach(function (i) { rows.push(["Restaurant", i.name, [i.type, i.michelin, i.best50 === "yes" ? "World's 50 Best" : "", i.status === "visited" ? "Visited" : "Want to visit", i.note].filter(Boolean).join(" - "), "", "", "", "", "", "", "", ""]); });
  c.places.forEach(function (i) { rows.push(["Place", i.name, (i.cat || "Other") + (i.note ? " - " + i.note : ""), "", "", "", "", "", "", "", ""]); });
  c.budget.forEach(function (i) { rows.push(["Cost", i.label, i.cat, "", "", "", i.cost, i.spent, "", "", ""]); });
  return rows.map(function (r) { return r.map(csvCell).join(","); }).join("\n");
}

export function parseCSV(t) {
  var rows = [], r = [], c = "", q = false;
  for (var i = 0; i < t.length; i++) {
    var ch = t[i];
    if (q) { if (ch === '"') { if (t[i + 1] === '"') { c += '"'; i++; } else q = false; } else c += ch; }
    else if (ch === '"') q = true;
    else if (ch === ",") { r.push(c); c = ""; }
    else if (ch === "\n" || ch === "\r") { if (ch === "\r" && t[i + 1] === "\n") i++; r.push(c); rows.push(r); r = []; c = ""; }
    else c += ch;
  }
  if (c || r.length) { r.push(c); rows.push(r); }
  return rows;
}

/** Rows of a Google Takeout saved-places CSV as place items (without ids). */
export function placesFromCsv(text) {
  var rows = parseCSV(text);
  if (rows.length < 2) return [];
  var head = rows[0].map(function (x) { return x.trim().toLowerCase(); });
  var ti = head.indexOf("title"), ni = head.indexOf("note"), ci = head.indexOf("comment"), ui = head.indexOf("url");
  if (ti < 0) ti = 0;
  var out = [];
  rows.slice(1).forEach(function (r) {
    var name = (r[ti] || "").trim();
    if (!name) return;
    out.push({ name: name, cat: "Other", note: ((ni >= 0 && r[ni]) || (ci >= 0 && r[ci]) || "").trim(), link: ui >= 0 ? (r[ui] || "").trim() : "" });
  });
  return out;
}
