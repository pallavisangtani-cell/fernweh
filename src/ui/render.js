// HTML builders for every view, plus renderTree() and renderMain().
import { TABS, CATS, BOOKABLE, CURS, SAMPLES } from "../constants.js";
import { esc, fmt, setCur, getCur, planned, spentOf, mapsUrl } from "../util.js";
import { findCity, totals, sortKey, title, groupByDay } from "../model.js";
import { shareItems, catsOf } from "../share.js";
import { citiesOf } from "../brain.js";
import { S, sel, brain, shareOpt, ui } from "../state.js";

export function $(id) { return document.getElementById(id); }

var toastT;
export function toast(m) {
  if (!m) return;
  var t = $("toast"); t.textContent = m; t.style.display = "block";
  clearTimeout(toastT); toastT = setTimeout(function () { t.style.display = "none"; }, 3800);
}

export function renderTree() {
  var h = "", v = 0;
  S.countries.forEach(function (co) {
    if (co.status === "visited") v++;
    h += '<div class="country"><span><i class="dot' + (co.status === "visited" ? ' v' : '') + '"></i>' + esc(co.name) + (co.year ? '<small>' + esc(co.year) + '</small>' : '') + '</span>' + (sel.confirmDel === co.id ? '<span><button class="b warn" data-act="delYes" data-id="' + co.id + '">Remove</button> <button class="x" data-act="delNo" style="font-size:.8rem">Cancel</button></span>' : '<button class="x" data-act="delCountry" data-id="' + co.id + '" aria-label="Remove ' + esc(co.name) + '">×</button>') + '</div>';
    co.cities.forEach(function (ci) { h += '<button class="city' + (ci.id === sel.city && sel.view === "city" ? ' on' : '') + '" data-act="pick" data-id="' + ci.id + '"><span>' + esc(ci.name) + '</span>' + (ci.status === "completed" ? '<small>Done</small>' : '') + '</button>'; });
    h += '<div class="addrow"><input data-cityin="' + co.id + '" placeholder="Add a city" aria-label="New city in ' + esc(co.name) + '" style="flex:1"><button class="btn" data-act="addCity" data-id="' + co.id + '">Add</button></div>';
  });
  $("tree").innerHTML = h;
  $("passport").textContent = v + (v === 1 ? " country" : " countries");
}

function fieldHtml(f) {
  var st = f.grow ? "" : "width:" + (f.w || 140) + "px", inp;
  if (f.type === "select") inp = '<select data-f="' + f.k + '" aria-label="' + esc(f.ph) + '" style="' + st + '">' + f.opts.map(function (o) { return '<option value="' + esc(o[0]) + '">' + esc(o[1]) + '</option>'; }).join("") + '</select>';
  else inp = '<input data-f="' + f.k + '" type="' + (f.type || "text") + '" aria-label="' + esc(f.ph) + '" style="' + st + '">';
  return '<label class="fld' + (f.grow ? ' g' : '') + '">' + esc(f.ph) + inp + '</label>';
}
function badges(k, it) {
  var c = it.status === "confirmed", b = it.booked === "yes", a = ' data-list="' + k + '" data-id="' + it.id + '" title="Click to change"';
  return '<div class="badges"><button class="b ' + (c ? 'ok' : 'warn') + '" data-act="flip" data-k="status"' + a + '>' + (c ? 'Confirmed' : 'Tentative') + '</button><button class="b ' + (b ? 'ok' : '') + '" data-act="flip" data-k="booked"' + a + '>' + (b ? 'Booked' : 'Not booked') + '</button>' + (it.via ? '<span class="b via">via ' + esc(it.via) + '</span>' : '') + '</div>';
}
function moneyHtml(k, it) {
  var p = planned(it);
  return '<div class="money"><span>' + (p ? 'Planned <strong>' + fmt(p) + '</strong>' : 'No cost set') + '</span><label>Spent <input type="number" data-spent="' + it.id + '" data-list="' + k + '" value="' + esc(it.spent || "") + '" placeholder="0" aria-label="Amount spent"></label></div>';
}
function cardHtml(k, it, city) {
  var del = '<button class="x" data-act="del" data-list="' + k + '" data-id="' + it.id + '" aria-label="Delete">×</button>', meta = "";
  if (k === "itin") meta = it.time || "";
  else if (k === "trans") meta = [it.mode, it.date, it.time, it.ref ? "Ref " + it.ref : ""].filter(Boolean).join(" · ");
  else if (k === "stays") meta = [(it.checkin || it.checkout) ? (it.checkin || "?") + " to " + (it.checkout || "?") : "", it.conf ? "Conf. " + it.conf : ""].filter(Boolean).join(" · ");
  else if (k === "budget") meta = it.cat || "";
  else if (k === "places") {
    var u = /^https?:/i.test(it.link || "") ? it.link : mapsUrl(it.name, city.name);
    return '<div class="card"><div class="cardhead"><div><div class="pcat">' + esc(it.cat || "Other") + '</div><b>' + esc(it.name) + '</b></div>' + del + '</div>' + (it.note ? '<div class="meta" style="margin-top:4px">' + esc(it.note) + '</div>' : '') + '<div style="margin-top:10px"><a class="link" href="' + esc(u) + '" target="_blank" rel="noopener">Open in Maps</a></div></div>';
  }
  return '<div class="' + (k === "itin" ? 'act' : 'card') + '"><div class="cardhead"><div><b>' + esc(title(k, it)) + '</b>' + (meta ? '<div class="meta">' + esc(meta) + '</div>' : '') + '</div>' + del + '</div>' + (BOOKABLE.indexOf(k) >= 0 ? badges(k, it) : '') + moneyHtml(k, it) + '</div>';
}

function overHtml(city, T) {
  var n = { c: 0, t: 0, b: 0, u: 0, all: 0 }, need = [], car = {};
  BOOKABLE.forEach(function (k) {
    city[k].forEach(function (it) {
      n.all++; if (it.status === "confirmed") n.c++; else n.t++;
      if (it.booked === "yes") n.b++; else { n.u++; need.push({ k: k, it: it }); }
      if (k === "trans" && it.via) car[it.via] = 1;
    });
  });
  var pct = n.all ? Math.round(n.b / n.all * 100) : 0, carriers = Object.keys(car);
  var h = '<div class="grid g4"><div class="card"><div class="k"><span>Booked</span><span>' + pct + '%</span></div><div class="big">' + n.b + '<span class="meta" style="font:400 .9rem var(--body)"> of ' + n.all + '</span></div><div class="meter"><i style="width:' + pct + '%"></i></div></div>';
  h += '<div class="card"><div class="k"><span>Confirmation</span></div><div style="display:flex;gap:26px"><div><div class="big" style="color:var(--ok)">' + n.c + '</div><div class="meta">Confirmed</div></div><div><div class="big" style="color:var(--warn)">' + n.t + '</div><div class="meta">Tentative</div></div></div></div>';
  h += '<div class="card"><div class="k"><span>Carriers</span></div><div style="font-weight:600;margin-top:10px">' + (carriers.length ? esc(carriers.join(", ")) : 'None added yet') + '</div><div class="meta">From your transport</div></div>';
  h += '<div class="card"><div class="k"><span>Still to book</span></div><div class="big" style="color:' + (n.u ? 'var(--bad)' : 'var(--ok)') + '">' + n.u + '</div><div class="meta">items not booked yet</div></div></div>';
  h += '<div class="grid g2" style="margin-top:14px"><div class="card"><h3>Cost by category</h3>';
  CATS.forEach(function (x) { var t = T[x[0]], p = t.p ? Math.min(100, t.s / t.p * 100) : 0; h += '<div class="catrow"><div><span>' + t.label + '</span><span style="font-variant-numeric:tabular-nums">' + fmt(t.s) + ' of ' + fmt(t.p) + '</span></div><div class="meter' + (t.s > t.p && t.p ? ' over' : '') + '"><i style="width:' + p + '%"></i></div></div>'; });
  h += '</div><div class="card"><h3>Still to book or confirm</h3>';
  if (!need.length) h += '<p class="empty">Nothing waiting. Everything is booked.</p>';
  need.slice(0, 10).forEach(function (x) { var it = x.it; h += '<div style="padding:11px 0;border-top:1px solid var(--line);margin-top:10px"><b>' + esc(title(x.k, it)) + '</b><div class="meta">' + TABS[x.k].label + '</div>' + badges(x.k, it) + '</div>'; });
  return h + '</div></div>';
}

function curSelect(city) {
  var l = CURS.indexOf(city.cur) < 0 ? CURS.concat([city.cur]) : CURS;
  return '<select data-cur="1" id="cursel" aria-label="Currency">' + l.map(function (c) { return '<option' + (c === city.cur ? ' selected' : '') + '>' + c + '</option>'; }).join("") + '</select>';
}
function catCounts(list) { var m = {}; list.forEach(function (x) { var c = x.cat || "Other"; m[c] = (m[c] || 0) + 1; }); return m; }

function tabHtml(city, T) {
  var k = sel.tab, Tb = TABS[k], h = "";
  if (k === "over") return overHtml(city, T);
  if (k === "notes") return '<textarea id="notes" aria-label="Notes" style="min-height:320px" placeholder="Neighbourhoods, tips, transport, food to try, things to avoid…">' + esc(city.notes) + '</textarea>';
  h += '<div class="head"><h3>' + Tb.label + '</h3><div class="acts">';
  if (k === "places") h += '<button class="btn" data-act="importPick">Import Maps CSV</button><input type="file" id="csv" accept=".csv,text/csv" hidden>';
  if (k === "packing") h += '<button class="btn" data-act="suggestPack"' + (ui.packBusy ? ' disabled' : '') + '>' + (ui.packBusy ? 'Thinking…' : 'Suggest for this trip') + '</button>' + (city.packing.length ? '' : '<button class="btn" data-act="starter">Starter list</button>');
  h += '<button class="btn pri" data-act="toggleForm">' + (sel.form ? 'Close' : 'Add ' + Tb.add.replace(/^Add /, '')) + '</button></div></div>';
  if (sel.form) h += '<div class="card" style="margin-bottom:14px"><div class="row" id="form" style="margin:0">' + Tb.fields.map(fieldHtml).join("") + '<button class="btn pri" data-act="add">Save</button></div></div>';
  var list = city[k].slice().sort(function (a, b) { return sortKey(k, a, b); });
  if (k === "places" && list.length) {
    var cc = catCounts(list), names = Object.keys(cc);
    h += '<div class="chips"><button class="chip' + (sel.pcat === "All" ? ' on' : '') + '" data-act="pcat" data-id="All">All ' + list.length + '</button>' + names.map(function (c) { return '<button class="chip' + (sel.pcat === c ? ' on' : '') + '" data-act="pcat" data-id="' + esc(c) + '">' + esc(c) + ' ' + cc[c] + '</button>'; }).join("") + '</div>';
    if (sel.pcat !== "All") list = list.filter(function (x) { return (x.cat || "Other") === sel.pcat; });
  }
  if (!list.length) return h + '<p class="empty">Nothing here yet.</p>';
  if (k === "itin") {
    var days = groupByDay(list);
    Object.keys(days).forEach(function (d) { var p = 0, s = 0; days[d].forEach(function (it) { p += planned(it); s += spentOf(it); }); h += '<div class="daycard"><div class="dayhead"><span>Day ' + esc(d) + '</span><span>' + fmt(s) + ' of ' + fmt(p) + '</span></div>' + days[d].map(function (it) { return cardHtml("itin", it, city); }).join("") + '</div>'; });
  } else if (k === "packing") {
    list.forEach(function (it) { h += '<div class="pk' + (it.done ? ' done' : '') + '"><input type="checkbox" data-act="tick" data-id="' + it.id + '"' + (it.done ? ' checked' : '') + ' aria-label="Packed"><span>' + esc(it.text) + '</span><button class="x" data-act="del" data-list="packing" data-id="' + it.id + '" aria-label="Delete">×</button></div>'; });
    h += '<p class="meta" style="margin-top:8px">' + list.filter(function (x) { return x.done; }).length + ' of ' + list.length + ' packed</p>';
  } else h += '<div class="grid g2">' + list.map(function (it) { return cardHtml(k, it, city); }).join("") + '</div>';
  return h;
}

export function renderMain() {
  var m = $("main"), f = sel.city && findCity(S, sel.city);
  if (sel.view === "brain") { m.innerHTML = brainHtml(); return; }
  if (sel.view === "backup") { m.innerHTML = backupHtml(); return; }
  if (sel.view === "world" || !f) { m.innerHTML = worldHtml(); return; }
  var city = f.city; setCur(city.cur);
  if (sel.view === "share") { m.innerHTML = shareView(f); return; }
  var CUR = getCur();
  var T = totals(city), bud = parseFloat(city.tbudget) || 0, base = bud || T.all.p, left = base - T.all.s, pct = base ? Math.min(100, T.all.s / base * 100) : 0, done = city.status === "completed";
  var h = '<div class="crumb">' + esc(f.c.name) + '</div><div class="titlebar"><div class="row1"><h2>' + esc(city.name) + '</h2><span class="b ' + (done ? 'ok' : 'via') + '">' + (done ? 'Completed' : 'Planning') + '</span></div><div class="acts"><button class="btn" data-act="toggleDone">' + (done ? 'Reopen trip' : 'Mark as completed') + '</button><button class="btn pri" data-act="share">Share trip</button></div></div>';
  h += '<div class="strip"><div class="cell"><label for="tb">Trip budget</label><div class="inl"><span>' + esc(CUR) + '</span><input id="tb" data-tb="1" type="number" min="0" placeholder="Set budget" value="' + esc(city.tbudget) + '"></div></div><div class="cell"><div class="l">Planned</div><div class="v">' + esc(fmt(T.all.p)) + '</div></div><div class="cell"><div class="l">Spent</div><div class="v">' + esc(fmt(T.all.s)) + '</div></div><div class="cell"><div class="l">' + (left < 0 ? 'Over by' : (bud ? 'Left of budget' : 'Left of plan')) + '</div><div class="v" style="color:' + (left < 0 ? 'var(--bad)' : 'var(--ink)') + '">' + esc(fmt(Math.abs(left))) + '</div></div><div class="cell"><label for="cursel">Currency</label>' + curSelect(city) + '</div></div>';
  h += '<div class="meter' + (left < 0 ? ' over' : '') + '" role="img" aria-label="' + Math.round(pct) + '% of ' + (bud ? 'trip budget' : 'planned costs') + ' spent"><i style="width:' + pct + '%"></i></div>';
  if (!bud) h += '<p class="note">Set a trip budget above to track spending against it. Until then, spending is compared with your planned costs.</p>';
  else if (T.all.p > bud) h += '<p class="note warn">Planned costs are ' + esc(fmt(T.all.p - bud)) + ' over your trip budget.</p>';
  h += '<div class="tabs" role="tablist">';
  Object.keys(TABS).forEach(function (k) { h += '<button class="tab' + (k === sel.tab ? ' on' : '') + '" role="tab" data-act="tab" data-id="' + k + '">' + TABS[k].label + '</button>'; });
  m.innerHTML = h + '</div>' + tabHtml(city, T);
}

/* ---------- Passport ---------- */
function worldHtml() {
  var vis = S.countries.filter(function (c) { return c.status === "visited"; }).length, pl = S.countries.length - vis;
  var h = '<div class="crumb">Passport</div><h2>Where you have been</h2><p class="lede">Add countries you have already visited without planning anything, or mark a planned country as visited once you return.</p>';
  h += '<div class="panel"><h3>Add a country you have visited</h3><div class="row"><label class="fld g">Country<input id="pc-name" placeholder="e.g. Japan"></label><label class="fld" style="width:110px">Year<input id="pc-year" placeholder="e.g. 2019" inputmode="numeric"></label><label class="fld g">Cities (optional, comma separated)<input id="pc-cities" placeholder="Tokyo, Kyoto"></label><label class="fld g">Note (optional)<input id="pc-note" placeholder="Cherry blossom season"></label><button class="btn pri" data-act="addPast">Add to passport</button></div></div>';
  if (!S.countries.length) return h + '<p class="empty">No countries yet.</p>';
  h += '<div class="head" style="margin-top:26px"><h3>' + vis + ' visited · ' + pl + ' planned</h3><div class="chips" style="margin:0">' + [["all", "All"], ["visited", "Visited"], ["planned", "Planned"]].map(function (c) { return '<button class="chip' + (sel.pf === c[0] ? ' on' : '') + '" data-act="pf" data-id="' + c[0] + '">' + c[1] + '</button>'; }).join("") + '</div></div>';
  var list = S.countries.filter(function (c) { return sel.pf === "all" || c.status === sel.pf; }).slice().sort(function (a, b) {
    if (a.status !== b.status) return a.status === "visited" ? -1 : 1;
    return (parseInt(b.year) || 0) - (parseInt(a.year) || 0) || a.name.localeCompare(b.name);
  });
  if (!list.length) h += '<p class="empty">Nothing in this view.</p>';
  h += '<div class="grid g2">';
  list.forEach(function (co) {
    var v = co.status === "visited", items = 0;
    co.cities.forEach(function (ci) { BOOKABLE.forEach(function (k) { items += ci[k].length; }); });
    h += '<div class="card"><div class="cardhead"><h3 style="font:500 1.3rem var(--display)">' + esc(co.name) + '</h3><button class="b ' + (v ? 'ok' : 'via') + '" data-act="cstatus" data-id="' + co.id + '" title="Click to change">' + (v ? 'Visited' : 'Planned') + '</button></div><div class="meta" style="margin-top:2px">' + co.cities.length + (co.cities.length === 1 ? ' city' : ' cities') + ' · ' + items + ' bookings</div><div class="row" style="margin:12px 0 4px"><label class="fld" style="width:90px">Year<input data-cyear="' + co.id + '" value="' + esc(co.year) + '" inputmode="numeric"></label><label class="fld g">Note<input data-cnote="' + co.id + '" value="' + esc(co.note) + '"></label></div><div class="chips">' + co.cities.map(function (ci) { return '<button class="chip" data-act="pick" data-id="' + ci.id + '">' + esc(ci.name) + '</button>'; }).join("") + '</div></div>';
  });
  return h + '</div>';
}

/* ---------- Backup ---------- */
function backupHtml() {
  return '<div class="crumb">Data</div><h2>Backup and restore</h2><p class="lede">Your journal is saved in this browser. Download a copy, or paste a saved copy below and restore it.</p><div class="panel"><textarea id="bk" aria-label="Backup data">' + esc(JSON.stringify(S)) + '</textarea><div class="row"><button class="btn pri" data-act="restore">Restore from text</button><button class="btn" data-act="dlBackup">Download backup file</button><button class="btn" data-act="closeView">Close</button></div></div>';
}

/* ---------- Share ---------- */
function shareView(f) {
  var city = f.city, items = shareItems(city), cats = catsOf(items), done = city.status === "completed";
  var h = '<div class="crumb">' + esc(f.c.name) + ' / ' + esc(city.name) + '</div><div class="titlebar"><div><h2>Share this trip</h2><p class="lede">Download a single page with your places, filterable by type, each with a Google Maps link. Booking references and costs are left out unless you include costs below.</p></div><div class="acts"><button class="btn" data-act="closeView">Back to trip</button></div></div>';
  h += '<div class="panel"><div class="head" style="margin:0"><div><h3>' + esc(city.name) + ', ' + esc(f.c.name) + '</h3><div class="meta">' + (done ? 'Completed trip' : 'Trip in planning') + ' · ' + items.length + ' places and stays</div></div></div>';
  h += '<label class="check"><input type="checkbox" data-act="shopt" data-k="itin"' + (shareOpt.itin ? ' checked' : '') + '><span>Include the day-by-day itinerary</span></label><label class="check" style="margin-top:0"><input type="checkbox" data-act="shopt" data-k="costs"' + (shareOpt.costs ? ' checked' : '') + '><span>Include budget and costs</span></label>';
  h += '<div class="divider"></div>';
  if (!items.length) h += '<p class="empty">Add places on the Places tab, or paste details into the Brain Box, to build the list.</p>';
  else {
    h += '<div class="chips"><button class="chip' + (shareOpt.cat === "All" ? ' on' : '') + '" data-act="shcat" data-id="All">All ' + items.length + '</button>' + cats.map(function (c) { return '<button class="chip' + (shareOpt.cat === c ? ' on' : '') + '" data-act="shcat" data-id="' + esc(c) + '">' + esc(c) + ' ' + items.filter(function (i) { return i.cat === c; }).length + '</button>'; }).join("") + '</div>';
    h += '<div class="grid g2">' + items.filter(function (i) { return shareOpt.cat === "All" || i.cat === shareOpt.cat; }).map(function (i) { return '<div class="card"><div class="pcat">' + esc(i.cat) + '</div><b>' + esc(i.name) + '</b>' + (i.note ? '<div class="meta">' + esc(i.note) + '</div>' : '') + '<div style="margin-top:8px"><a class="link" href="' + esc(i.url) + '" target="_blank" rel="noopener">Open in Maps</a></div></div>'; }).join("") + '</div>';
  }
  h += '<div class="row" style="margin-top:22px"><button class="btn pri" data-act="dlShare">Download shareable page</button><button class="btn" data-act="copyShare">Copy as text</button><button class="btn" data-act="dlCsv">Download sheet (CSV)</button></div>';
  if (sel.shareText) h += '<p class="meta">Select and copy this text:</p><textarea id="shtxt" readonly style="min-height:160px">' + esc(sel.shareText) + '</textarea>';
  return h + '</div>';
}

/* ---------- Brain box ---------- */
function brainHtml() {
  var h = '<div class="crumb">AI</div><h2>Brain Box</h2><p class="lede">Paste plans, a booking email, a bank SMS or notes from an old trip, or upload a past itinerary or spreadsheet. It sorts everything into the right country, city and tab, and reads status, booking and provider from your text.</p><div class="chips">' + SAMPLES.map(function (s, i) { return '<button class="chip" data-act="sample" data-id="' + i + '">Try: ' + s[0] + '</button>'; }).join("") + '</div><div class="panel" style="margin-top:8px"><textarea id="brainIn" aria-label="Plans or bookings" placeholder="e.g. Lisbon, Portugal 12–16 March. Emirates EK191 DXB to LIS, booked, 2,400. Hotel Avenida via Booking.com, conf. 88213, 540, paid. Day 2: Sintra day trip, not booked yet.">' + esc(brain.text) + '</textarea>';
  h += '<div class="row"><button class="btn" data-act="pickFile">Upload a file</button><input type="file" id="brainFile" accept=".csv,.tsv,.txt,.md,.json,.xlsx,.xls,.docx" hidden><span class="meta">Excel, Word, CSV or text. PDFs: paste the text instead.</span></div>';
  h += '<label class="check"><input type="checkbox" data-act="bdone"' + (brain.done ? ' checked' : '') + '><span>These are past trips. Mark them as completed, as booked and as spent, and add the countries to my passport.</span></label>';
  h += '<div class="row" style="margin-bottom:0"><button class="btn pri" data-act="organise"' + (brain.busy ? ' disabled' : '') + '>' + (brain.busy ? (brain.status || 'Organising…') : 'Organise it') + '</button><button class="btn" data-act="closeView">Cancel</button></div>';
  if (brain.err) h += '<p class="err">' + esc(brain.err) + '</p>';
  var r = brain.res;
  if (r) {
    var L = [['itin', 'activities'], ['trans', 'transport'], ['stays', 'stays'], ['places', 'places'], ['budget', 'costs'], ['packing', 'packing items']];
    h += '<div class="divider"></div><h3>Ready to add to ' + esc(citiesOf(r)) + '</h3><p class="meta">' + L.map(function (p) { return r[p[0]].length + ' ' + p[1]; }).join(' · ') + (r.notes ? ' · notes' : '') + '</p>';
    ['trans', 'stays', 'itin', 'budget'].forEach(function (k) {
      r[k].slice(0, 8).forEach(function (it) {
        h += '<div class="card" style="margin:10px 0"><b>' + esc(title(k, it)) + '</b><div class="meta">' + esc(it.city) + ', ' + esc(it.country) + '</div>' + (BOOKABLE.indexOf(k) >= 0 ? '<div class="badges"><span class="b ' + (it.status === 'confirmed' ? 'ok' : 'warn') + '">' + (it.status === 'confirmed' ? 'Confirmed' : 'Tentative') + '</span><span class="b ' + (it.booked === 'yes' ? 'ok' : '') + '">' + (it.booked === 'yes' ? 'Booked' : 'Not booked') + '</span>' + (it.via ? '<span class="b via">via ' + esc(it.via) + '</span>' : '') + '</div>' : '<div class="meta">' + esc(it.cat || '') + (it.spent ? ' · spent ' + esc(it.spent) : '') + '</div>') + '</div>';
      });
    });
    h += '<div class="row"><button class="btn pri" data-act="applyBrain">Add to journal</button><button class="btn" data-act="discardBrain">Discard</button></div>';
  }
  return h + '</div>';
}
