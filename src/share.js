// The shareable trip guide (standalone HTML) and its plain-text version.
import { PCATS } from "./constants.js";
import { esc, fmt, setCur, planned, mapsUrl } from "./util.js";
import { totals, sortKey, groupByDay } from "./model.js";

export function shareItems(city) {
  var out = [], seen = {};
  city.places.forEach(function (p) {
    var k = p.name.toLowerCase(); if (seen[k]) return; seen[k] = 1;
    out.push({ name: p.name, cat: p.cat || "Other", note: p.note || "", url: /^https?:/i.test(p.link || "") ? p.link : mapsUrl(p.name, city.name) });
  });
  city.stays.forEach(function (s) {
    var k = s.name.toLowerCase(); if (seen[k]) return; seen[k] = 1;
    out.push({ name: s.name, cat: "Hotel", note: (s.checkin || s.checkout) ? (s.checkin || "?") + " to " + (s.checkout || "?") : "", url: mapsUrl(s.name, city.name) });
  });
  return out;
}

export function catsOf(items) {
  var c = [];
  PCATS.forEach(function (x) { if (items.some(function (i) { return i.cat === x; })) c.push(x); });
  items.forEach(function (i) { if (c.indexOf(i.cat) < 0) c.push(i.cat); });
  return c;
}

// Runs inside the downloaded page, so it must not reference anything outside itself.
function shareFilter() {
  var chips = document.querySelectorAll(".chip"), pls = document.querySelectorAll(".pl");
  chips.forEach(function (b) {
    b.onclick = function () {
      var c = b.getAttribute("data-c");
      chips.forEach(function (x) { x.classList.toggle("on", x === b); });
      pls.forEach(function (p) { p.hidden = !(c === "All" || p.getAttribute("data-c") === c); });
    };
  });
}

const SHARE_CSS = '*{box-sizing:border-box}body{margin:0;background:#f6f7fb;color:#0e1630;font:15px/1.55 Inter,system-ui,sans-serif}main{max-width:760px;margin:0 auto;padding:40px 20px 64px}h1{font:600 2.3rem/1.1 Georgia,serif;margin:4px 0 6px}h2{font:600 1.15rem Georgia,serif;margin:34px 0 10px}.k{font-size:.75rem;letter-spacing:.08em;text-transform:uppercase;color:#6b7692;font-weight:600}.m{color:#6b7692;font-size:.88rem}.chips{display:flex;gap:6px;flex-wrap:wrap;margin:18px 0}.chip{border:1px solid #d3d9e8;background:#fff;color:#3b4663;border-radius:99px;padding:5px 14px;font:inherit;font-size:.82rem;cursor:pointer}.chip.on{background:#2b46c9;color:#fff;border-color:#2b46c9}.pl{background:#fff;border:1px solid #e4e8f1;border-radius:12px;padding:14px 16px;margin:8px 0}.pl[hidden]{display:none}.pl b{display:block}.tag{font-size:.72rem;color:#2b46c9;font-weight:600;text-transform:uppercase;letter-spacing:.06em}.day{background:#fff;border:1px solid #e4e8f1;border-radius:12px;padding:6px 16px 10px;margin:8px 0}.day h3{font-size:.78rem;letter-spacing:.07em;text-transform:uppercase;color:#2b46c9;margin:10px 0 4px}.act{padding:8px 0;border-top:1px solid #e4e8f1}a{color:#2b46c9}@media(prefers-color-scheme:dark){body{background:#0a1126;color:#eaeeff}.pl,.day{background:#111a33;border-color:#1d2848}.act{border-color:#1d2848}.m,.k{color:#8c98ba}.chip{background:#111a33;color:#bcc6e4;border-color:#2a3860}.chip.on{background:#8fa6ff;color:#0a1126;border-color:#8fa6ff}a,.tag,.day h3{color:#8fa6ff}}';

function sortedDays(city) {
  return groupByDay(city.itin.slice().sort(function (a, b) { return sortKey("itin", a, b); }));
}

/** opts: {itin: boolean, costs: boolean}. Costs and booking refs stay out unless opts.costs. */
export function buildShareDoc(f, opts) {
  var city = f.city, T = totals(city), items = shareItems(city), cats = catsOf(items), done = city.status === "completed";
  setCur(city.cur);
  var h = '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>' + esc(city.name) + ' trip guide</title><style>' + SHARE_CSS + '</style></head><body><main>';
  h += '<div class="k">' + esc(f.c.name) + ' · ' + (done ? 'Completed trip' : 'Trip in planning') + '</div><h1>' + esc(city.name) + '</h1>';
  if (opts.costs) { var bud = parseFloat(city.tbudget) || 0; h += '<p class="m">' + (bud ? 'Trip budget ' + esc(fmt(bud)) + ' · ' : '') + 'Planned ' + esc(fmt(T.all.p)) + ' · Spent ' + esc(fmt(T.all.s)) + '</p>'; }
  if (items.length) {
    h += '<div class="chips"><button class="chip on" data-c="All">All (' + items.length + ')</button>' + cats.map(function (c) { return '<button class="chip" data-c="' + esc(c) + '">' + esc(c) + ' (' + items.filter(function (x) { return x.cat === c; }).length + ')</button>'; }).join("") + '</div>';
    h += items.map(function (x) { return '<div class="pl" data-c="' + esc(x.cat) + '"><span class="tag">' + esc(x.cat) + '</span><b>' + esc(x.name) + '</b>' + (x.note ? '<div class="m">' + esc(x.note) + '</div>' : '') + '<a href="' + esc(x.url) + '" target="_blank" rel="noopener">Open in Maps</a></div>'; }).join("");
  }
  if (opts.itin && city.itin.length) {
    h += '<h2>Itinerary</h2>';
    var days = sortedDays(city);
    Object.keys(days).forEach(function (d) {
      h += '<div class="day"><h3>Day ' + esc(d) + '</h3>' + days[d].map(function (it) { return '<div class="act">' + (it.time ? '<span class="m">' + esc(it.time) + '</span> ' : '') + esc(it.text) + (it.via ? ' <span class="m">· ' + esc(it.via) + '</span>' : '') + (opts.costs && planned(it) ? ' <span class="m">· ' + esc(fmt(planned(it))) + '</span>' : '') + '</div>'; }).join("") + '</div>';
    });
  }
  h += '<p class="m" style="margin-top:40px">Shared from Fernweh</p></main><script>(' + shareFilter.toString() + ')()<\/script></body></html>';
  return h;
}

export function shareText(f, opts) {
  var city = f.city, items = shareItems(city), cats = catsOf(items);
  var t = city.name + ", " + f.c.name + " (" + (city.status === "completed" ? "completed trip" : "trip in planning") + ")\n";
  cats.forEach(function (c) {
    t += "\n" + c + "\n";
    items.filter(function (i) { return i.cat === c; }).forEach(function (i) { t += "- " + i.name + (i.note ? " (" + i.note + ")" : "") + " " + i.url + "\n"; });
  });
  if (opts.itin && city.itin.length) {
    t += "\nItinerary\n";
    var days = sortedDays(city);
    Object.keys(days).forEach(function (d) {
      t += "Day " + d + "\n";
      days[d].forEach(function (it) { t += "- " + (it.time ? it.time + " " : "") + it.text + "\n"; });
    });
  }
  return t;
}
