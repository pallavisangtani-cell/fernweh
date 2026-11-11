// HTML for every screen, plus renderTree() (sidebar + tab bar) and renderMain().
import { TABS, CATS, BOOKABLE, CURS, SAMPLES } from "../constants.js";
import { esc, fmt, setCur, getCur, planned, spentOf, mapsUrl } from "../util.js";
import { findCity, totals, sortKey, title, groupByDay, tripRange, countdown, todayIso, routeParts, nights } from "../model.js";
import { shareItems, catsOf } from "../share.js";
import { citiesOf } from "../brain.js";
import { getApiKey, MODEL } from "../platform.js";
import { S, sel, brain, shareOpt, ui } from "../state.js";
import { icon, coverStyle } from "./icons.js";

export function $(id) { return document.getElementById(id); }

var toastT;
export function toast(m) {
  if (!m) return;
  var t = $("toast"); t.textContent = m; t.style.display = "block";
  clearTimeout(toastT); toastT = setTimeout(function () { t.style.display = "none"; }, 3800);
}

/* ---------- Small formatters ---------- */
function niceDate(iso, withYear) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso || "")) return iso || "";
  var d = new Date(iso + "T12:00:00");
  return d.toLocaleDateString(undefined, withYear ? { day: "numeric", month: "short", year: "numeric" } : { day: "numeric", month: "short" });
}
function rangeText(r) {
  if (!r) return "";
  var sameYear = r.start.slice(0, 4) === r.end.slice(0, 4);
  return r.start === r.end ? niceDate(r.start, true) : niceDate(r.start, !sameYear) + " – " + niceDate(r.end, true);
}
function bookedCount(city) {
  var n = 0, b = 0;
  BOOKABLE.forEach(function (k) { city[k].forEach(function (it) { n++; if (it.booked === "yes") b++; }); });
  return { n: n, b: b };
}
function yearTag(co) { return co.year && co.name.indexOf(co.year) < 0 ? co.year : ""; }
function visitedCount() { return S.countries.filter(function (c) { return c.status === "visited"; }).length; }

/* ---------- Navigation: sidebar + phone tab bar ---------- */
const NAV = [["home", "home", "Trips"], ["world", "globe", "Passport"], ["brain", "sparkle", "Claude"], ["settings", "gear", "Settings"]];
function navOn(v) { return sel.view === v || (v === "home" && (sel.view === "city" || sel.view === "share")); }

export function renderTree() {
  var v = visitedCount();
  $("snav").innerHTML = NAV.map(function (n) {
    return '<button class="snav' + (navOn(n[0]) ? ' on' : '') + '" data-act="' + n[0] + '">' + icon(n[1]) + '<span>' + n[2] + '</span>' + (n[0] === "world" ? '<small id="passport">' + v + (v === 1 ? ' trip' : ' trips') + '</small>' : '') + '</button>';
  }).join("");
  $("tabbar").innerHTML = NAV.map(function (n) {
    return '<button class="' + (navOn(n[0]) ? 'on' : '') + (n[0] === "brain" ? ' mid' : '') + '" data-act="' + n[0] + '" aria-label="' + n[2] + '">' + icon(n[1]) + '<span>' + n[2] + '</span></button>';
  }).join("");
  var h = "";
  if (!S.countries.length) h = '<p class="meta" style="padding:0 8px">No trips yet.</p>';
  S.countries.forEach(function (co) {
    h += '<div class="tree-trip"><span>' + esc(co.name) + (yearTag(co) ? '<small>' + esc(yearTag(co)) + '</small>' : '') + '</span></div>';
    co.cities.forEach(function (ci) {
      h += '<button class="tree-city' + (ci.id === sel.city && sel.view === "city" ? ' on' : '') + '" data-act="pick" data-id="' + ci.id + '"><i style="' + coverStyle(ci.name) + '"></i><span>' + esc(ci.name) + '</span>' + (ci.status === "completed" ? '<small>Done</small>' : '') + '</button>';
    });
  });
  $("tree").innerHTML = h;
}

/* ---------- Home: trips as cover cards ---------- */
function tripCard(co, ci, today) {
  var r = tripRange(ci), cd = countdown(r, today), bc = bookedCount(ci), done = ci.status === "completed";
  setCur(ci.cur); var T = totals(ci), base = parseFloat(ci.tbudget) || T.all.p, pct = base ? Math.min(100, T.all.s / base * 100) : 0;
  return '<button class="tcard" data-act="pick" data-id="' + ci.id + '"><div class="cover" style="' + coverStyle(ci.name) + '"><div class="top"><span class="co">' + esc(co.name) + '</span>'
    + (done ? '<span class="pill glass">' + icon("check") + 'Done</span>' : cd ? '<span class="pill glass">' + esc(cd) + '</span>' : '') + '</div>'
    + '<div><h3>' + esc(ci.name) + '</h3><div style="font-size:.86rem;opacity:.92;margin-top:4px">' + esc(rangeText(r) || (done ? 'Past trip' : 'Dates not set')) + '</div></div></div>'
    + '<div class="body"><span><b>' + bc.b + '</b> of ' + bc.n + ' booked</span><span>' + (base ? '<b>' + esc(fmt(T.all.s)) + '</b> of ' + esc(fmt(base)) : 'No budget yet') + '</span></div>'
    + (base ? '<div class="meter' + (T.all.s > base ? ' over' : '') + '"><i style="width:' + pct + '%"></i></div>' : '') + '</button>';
}
function tripStart(co) {
  var s = co.cities.map(function (ci) { var r = tripRange(ci); return r ? r.start : "9999"; }).sort()[0];
  return s || "9999";
}
function homeHtml() {
  var today = todayIso(), dests = 0;
  S.countries.forEach(function (c) { dests += c.cities.length; });
  var h = '<div class="hello"><div><div class="eyebrow">' + esc(new Date().toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" })) + '</div><h1 class="page">Where to next?</h1></div>'
    + '<button class="btn acc" data-act="brain">' + icon("sparkle") + 'Paste a booking</button></div>';
  h += '<div class="stats"><div class="stat"><b>' + S.countries.length + '</b><span>Trips</span></div><div class="stat"><b>' + dests + '</b><span>Destinations</span></div><div class="stat"><b>' + visitedCount() + '</b><span>Completed</span></div></div>';
  h += '<div class="addtrip"><input id="newCountry" placeholder="Plan a new trip, e.g. Germany 2026" aria-label="New trip name"><button class="btn pri" data-act="addCountry">' + icon("plus") + 'Add trip</button></div>';
  if (!S.countries.length) {
    return h + '<div class="panel" style="text-align:center;padding:34px 20px"><div class="ticon acc" style="margin:0 auto 12px;width:52px;height:52px;border-radius:16px">' + icon("Flight") + '</div><h2 style="font:500 1.4rem var(--display)">Your first trip starts here</h2><p class="lede" style="margin:8px auto 0">Add a trip above, or paste a flight or hotel confirmation and Claude will set it up for you.</p></div>';
  }
  var trips = S.countries.slice().sort(function (a, b) {
    if (a.status !== b.status) return a.status === "visited" ? 1 : -1;
    return tripStart(a).localeCompare(tripStart(b)) || a.name.localeCompare(b.name);
  });
  trips.forEach(function (co) {
    var v = co.status === "visited";
    h += '<div class="section"><h2>' + esc(co.name) + (yearTag(co) ? ' <span class="meta" style="font:500 .9rem var(--body)">' + esc(yearTag(co)) + '</span>' : '') + '</h2><div class="acts" style="align-items:center"><span class="pill ' + (v ? 'ok' : 'brand') + '">' + (v ? 'Completed' : 'Planned') + '</span>'
      + (sel.confirmDel === co.id ? '<button class="btn sm" style="color:var(--bad)" data-act="delYes" data-id="' + co.id + '">Remove trip</button><button class="btn sm ghost" data-act="delNo">Cancel</button>' : '<button class="x" data-act="delCountry" data-id="' + co.id + '" aria-label="Remove ' + esc(co.name) + '">' + icon("x") + '</button>') + '</div></div>';
    h += '<div class="grid g3">' + co.cities.map(function (ci) { return tripCard(co, ci, today); }).join("")
      + '<div class="card" style="display:flex;flex-direction:column;justify-content:center;gap:10px;box-shadow:none;border-style:dashed;background:none"><span class="meta">Add a destination to ' + esc(co.name) + '</span><div style="display:flex;gap:8px"><input data-cityin="' + co.id + '" placeholder="e.g. Lisbon" aria-label="New destination in ' + esc(co.name) + '" style="flex:1"><button class="btn" data-act="addCity" data-id="' + co.id + '">Add</button></div></div></div>';
  });
  return h;
}

/* ---------- Destination ---------- */
function fieldHtml(f) {
  var st = f.grow ? "" : "width:" + (f.w || 140) + "px", inp;
  if (f.type === "select") inp = '<select data-f="' + f.k + '" aria-label="' + esc(f.ph) + '" style="' + st + '">' + f.opts.map(function (o) { return '<option value="' + esc(o[0]) + '">' + esc(o[1]) + '</option>'; }).join("") + '</select>';
  else inp = '<input data-f="' + f.k + '" type="' + (f.type || "text") + '" aria-label="' + esc(f.ph) + '" style="' + st + '">';
  return '<label class="fld' + (f.grow ? ' g' : '') + '">' + esc(f.ph) + inp + '</label>';
}
function badges(k, it) {
  var c = it.status === "confirmed", b = it.booked === "yes", a = ' data-list="' + k + '" data-id="' + it.id + '" title="Tap to change"';
  return '<div class="badges"><button class="pill ' + (c ? 'ok' : 'warn') + '" data-act="flip" data-k="status"' + a + '>' + (c ? 'Confirmed' : 'Tentative') + '</button><button class="pill ' + (b ? 'ok' : '') + '" data-act="flip" data-k="booked"' + a + '>' + (b ? 'Booked' : 'Not booked') + '</button>' + (it.via && k !== "trans" ? '<span class="pill brand">via ' + esc(it.via) + '</span>' : '') + '</div>';
}
function moneyHtml(k, it) {
  var p = planned(it);
  return '<div class="money"><span>' + (p ? 'Planned <strong>' + esc(fmt(p)) + '</strong>' : 'No cost set') + '</span><label>Spent <input type="number" inputmode="decimal" data-spent="' + it.id + '" data-list="' + k + '" value="' + esc(it.spent || "") + '" placeholder="0" aria-label="Amount spent"></label></div>';
}
function del(k, it) { return '<button class="x" data-act="del" data-list="' + k + '" data-id="' + it.id + '" aria-label="Delete">' + icon("x") + '</button>'; }

function passHtml(it) {
  var rp = routeParts(it.route), long = function (s) { return s.length > 4 ? ' class="long"' : ''; };
  var facts = [["Date", it.date ? niceDate(it.date, true) : ""], ["Time", it.time], ["Ref", it.ref]].filter(function (f) { return f[1]; });
  return '<div class="pass"><div class="ptop"><span style="display:flex;align-items:center;gap:8px">' + icon(it.mode || "Flight") + esc([it.via, it.no].filter(Boolean).join(" · ") || it.mode || "Transport") + '</span>' + del("trans", it) + '</div>'
    + '<div class="route"><div class="end"><b' + long(rp[0]) + '>' + esc(rp[0] || "?") + '</b><small>From</small></div><div class="path">' + icon(it.mode || "Flight") + '</div><div class="end to"><b' + long(rp[1]) + '>' + esc(rp[1] || "?") + '</b><small>To</small></div></div>'
    + '<div class="tear"></div><div class="stub">' + (facts.length ? '<div class="facts">' + facts.map(function (f) { return '<div>' + f[0] + '<b>' + esc(f[1]) + '</b></div>'; }).join("") + '</div>' : '') + badges("trans", it) + moneyHtml("trans", it) + '</div></div>';
}
function stayHtml(it) {
  var n = nights(it.checkin, it.checkout), dates = (it.checkin || it.checkout) ? niceDate(it.checkin, true) + " – " + niceDate(it.checkout, true) : "";
  return '<div class="card item"><div class="cardhead"><div class="ttl"><span class="ticon">' + icon("Bed") + '</span><div><b>' + esc(it.name) + '</b>' + (n ? '<div class="nights">' + n + (n === 1 ? ' night' : ' nights') + '</div>' : '') + '<div class="meta">' + esc([dates, it.conf ? "Conf. " + it.conf : ""].filter(Boolean).join(" · ")) + '</div></div></div>' + del("stays", it) + '</div>' + badges("stays", it) + moneyHtml("stays", it) + '</div>';
}
function placeHtml(it, city) {
  var u = /^https?:/i.test(it.link || "") ? it.link : mapsUrl(it.name, city.name);
  return '<div class="card item place"><div class="cardhead"><div><div class="pcat">' + esc(it.cat || "Other") + '</div><b>' + esc(it.name) + '</b></div>' + del("places", it) + '</div>' + (it.note ? '<div class="meta">' + esc(it.note) + '</div>' : '') + '<div class="go"><a class="btn sm" href="' + esc(u) + '" target="_blank" rel="noopener">' + icon("map") + 'Open in Maps</a></div></div>';
}
function costHtml(it) {
  return '<div class="card item"><div class="cardhead"><div class="ttl"><span class="ticon acc">' + icon("wallet") + '</span><div><b>' + esc(it.label) + '</b>' + (it.cat ? '<div class="meta">' + esc(it.cat) + '</div>' : '') + '</div></div>' + del("budget", it) + '</div>' + moneyHtml("budget", it) + '</div>';
}
function actHtml(it) {
  return '<div class="act"><div class="cardhead" style="display:flex;justify-content:space-between;gap:10px"><div>' + (it.time ? '<div class="tm">' + esc(it.time) + '</div>' : '') + '<b>' + esc(it.text) + '</b></div>' + del("itin", it) + '</div>' + badges("itin", it) + moneyHtml("itin", it) + '</div>';
}

const KIND_ICON = { itin: "cal", trans: "Flight", stays: "Bed" };
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
  var h = '<div class="overview"><div class="card ov-card"><div class="ring" style="--p:' + pct + '"><b>' + pct + '%</b></div><div><div class="big">' + n.b + ' <span class="meta">of ' + n.all + '</span></div><div class="meta">booked</div></div></div>';
  h += '<div class="card"><div class="meta">Confirmation</div><div style="display:flex;gap:22px;margin-top:4px"><div><div class="ov-card big" style="color:var(--ok)">' + n.c + '</div><div class="meta">Confirmed</div></div><div><div class="ov-card big" style="color:var(--warn)">' + n.t + '</div><div class="meta">Tentative</div></div></div></div>';
  h += '<div class="card"><div class="meta">Carriers</div><div style="font-weight:600;margin-top:8px">' + (carriers.length ? esc(carriers.join(", ")) : 'None added yet') + '</div></div>';
  h += '<div class="card"><div class="meta">Still to book</div><div class="big" style="font:500 1.7rem var(--display);color:' + (n.u ? 'var(--bad)' : 'var(--ok)') + '">' + n.u + '</div></div></div>';
  h += '<div class="grid g2" style="margin-top:14px"><div class="card"><h3 style="font:500 1.1rem var(--display)">Cost by category</h3>';
  CATS.forEach(function (x) { var t = T[x[0]], p = t.p ? Math.min(100, t.s / t.p * 100) : 0; h += '<div class="catrow"><div><span>' + t.label + '</span><span style="font-variant-numeric:tabular-nums">' + esc(fmt(t.s)) + ' of ' + esc(fmt(t.p)) + '</span></div><div class="meter' + (t.s > t.p && t.p ? ' over' : '') + '"><i style="width:' + p + '%"></i></div></div>'; });
  h += '</div><div class="card"><h3 style="font:500 1.1rem var(--display);margin-bottom:6px">To book or confirm</h3>';
  if (!need.length) h += '<p class="empty">Nothing waiting. Everything is booked.</p>';
  need.slice(0, 10).forEach(function (x) { var it = x.it; h += '<div class="todo"><span class="ticon">' + icon(x.k === "trans" ? (it.mode || "Flight") : KIND_ICON[x.k]) + '</span><div style="flex:1;min-width:0"><b>' + esc(title(x.k, it)) + '</b><div class="meta">' + TABS[x.k].label + '</div>' + badges(x.k, it) + '</div></div>'; });
  return h + '</div></div>';
}

function curInput(city) {
  return '<input data-cur="1" id="cursel" list="curlist" aria-label="Currency" value="' + esc(city.cur) + '" maxlength="4" autocapitalize="characters"><datalist id="curlist">' + CURS.map(function (c) { return '<option value="' + c + '"></option>'; }).join("") + '</datalist>';
}
function catCounts(list) { var m = {}; list.forEach(function (x) { var c = x.cat || "Other"; m[c] = (m[c] || 0) + 1; }); return m; }

const TAB_ICON = { over: "grid", itin: "cal", trans: "Flight", stays: "Bed", places: "pin", budget: "wallet", packing: "bag", notes: "note" };
function tabHtml(city, T) {
  var k = sel.tab, Tb = TABS[k], h = "";
  if (k === "over") return overHtml(city, T);
  if (k === "notes") return '<textarea id="notes" aria-label="Notes" style="min-height:320px" placeholder="Neighbourhoods, tips, transport, food to try, things to avoid…">' + esc(city.notes) + '</textarea>';
  h += '<div class="head"><h2>' + Tb.label + '</h2><div class="acts">';
  if (k === "places") h += '<button class="btn sm" data-act="importPick">' + icon("upload") + 'Import Maps CSV</button><input type="file" id="csv" accept=".csv,text/csv" hidden>';
  if (k === "packing") h += '<button class="btn sm" data-act="suggestPack"' + (ui.packBusy ? ' disabled' : '') + '>' + icon("sparkle") + (ui.packBusy ? 'Thinking…' : 'Suggest with Claude') + '</button>' + (city.packing.length ? '' : '<button class="btn sm" data-act="starter">Starter list</button>');
  h += '<button class="btn sm pri" data-act="toggleForm">' + (sel.form ? icon("x") + 'Close' : icon("plus") + Tb.add.replace(/^Add /, '').replace(/^./, function (c) { return c.toUpperCase(); })) + '</button></div></div>';
  if (sel.form) h += '<div class="card form"><div class="row" id="form" style="margin:0">' + Tb.fields.map(fieldHtml).join("") + '<button class="btn pri" data-act="add">Save</button></div></div>';
  var list = city[k].slice().sort(function (a, b) { return sortKey(k, a, b); });
  if (k === "places" && list.length) {
    var cc = catCounts(list), names = Object.keys(cc);
    h += '<div class="chips"><button class="chip' + (sel.pcat === "All" ? ' on' : '') + '" data-act="pcat" data-id="All">All ' + list.length + '</button>' + names.map(function (c) { return '<button class="chip' + (sel.pcat === c ? ' on' : '') + '" data-act="pcat" data-id="' + esc(c) + '">' + esc(c) + ' ' + cc[c] + '</button>'; }).join("") + '</div>';
    if (sel.pcat !== "All") list = list.filter(function (x) { return (x.cat || "Other") === sel.pcat; });
  }
  if (!list.length) return h + '<p class="empty">Nothing here yet. Add one, or paste a confirmation into Claude.</p>';
  if (k === "itin") {
    var days = groupByDay(list);
    Object.keys(days).forEach(function (d) { var p = 0, s = 0; days[d].forEach(function (it) { p += planned(it); s += spentOf(it); }); h += '<div class="day"><div class="dayhead"><b>Day ' + esc(d) + '</b><span>' + esc(fmt(s)) + ' of ' + esc(fmt(p)) + '</span></div>' + days[d].map(actHtml).join("") + '</div>'; });
  } else if (k === "packing") {
    list.forEach(function (it) { h += '<div class="pk' + (it.done ? ' done' : '') + '"><input type="checkbox" data-act="tick" data-id="' + it.id + '"' + (it.done ? ' checked' : '') + ' aria-label="Packed"><span>' + esc(it.text) + '</span>' + del("packing", it) + '</div>'; });
    h += '<p class="meta" style="margin-top:8px">' + list.filter(function (x) { return x.done; }).length + ' of ' + list.length + ' packed</p>';
  } else {
    var one = { trans: passHtml, stays: stayHtml, places: function (it) { return placeHtml(it, city); }, budget: costHtml }[k];
    h += '<div class="grid g2">' + list.map(one).join("") + '</div>';
  }
  return h;
}

function cityHtml(f) {
  var city = f.city, today = todayIso();
  var CUR = getCur(), T = totals(city), bud = parseFloat(city.tbudget) || 0, base = bud || T.all.p, left = base - T.all.s, pct = base ? Math.min(100, T.all.s / base * 100) : 0, done = city.status === "completed";
  var r = tripRange(city), cd = countdown(r, today), n = r ? Math.max(0, Math.round((Date.parse(r.end) - Date.parse(r.start)) / 86400000)) : 0;
  var h = '<section class="hero cover" style="' + coverStyle(city.name) + '"><div class="bar"><button class="back" data-act="home" aria-label="Back to trips">' + icon("back") + '</button><span class="pill glass">' + (done ? icon("check") + 'Completed' : 'Planning') + '</span></div>';
  h += '<div><div class="co">' + esc(f.c.name) + '</div><h1>' + esc(city.name) + '</h1><div class="when">' + (r ? '<span class="pill glass">' + icon("cal") + esc(rangeText(r)) + '</span>' : '') + (n ? '<span class="pill glass">' + n + (n === 1 ? ' night' : ' nights') + '</span>' : '') + (cd && !done ? '<span class="pill glass">' + esc(cd) + '</span>' : '') + '</div></div>';
  h += '<div class="acts"><button class="btn sm" data-act="toggleDone">' + (done ? 'Reopen' : icon("check") + 'Mark as completed') + '</button><button class="btn sm light" data-act="share">' + icon("share") + 'Share</button></div></section>';
  h += '<div class="budget"><div class="stat"><span>Trip budget</span><input id="tb" data-tb="1" type="number" inputmode="decimal" min="0" placeholder="Set" value="' + esc(city.tbudget) + '" aria-label="Trip budget in ' + esc(CUR) + '"></div><div class="stat"><span>Planned</span><b>' + esc(fmt(T.all.p)) + '</b></div><div class="stat"><span>Spent</span><b>' + esc(fmt(T.all.s)) + '</b></div><div class="stat"><span>' + (left < 0 ? 'Over by' : (bud ? 'Left of budget' : 'Left of plan')) + '</span><b style="color:' + (left < 0 ? 'var(--bad)' : 'var(--ink)') + '">' + esc(fmt(Math.abs(left))) + '</b><div class="cur" style="margin-top:6px"><span class="meta">Currency</span>' + curInput(city) + '</div></div></div>';
  h += '<div class="meter bmeter' + (left < 0 ? ' over' : '') + '" role="img" aria-label="' + Math.round(pct) + '% of ' + (bud ? 'trip budget' : 'planned costs') + ' spent"><i style="width:' + pct + '%"></i></div>';
  if (!bud) h += '<p class="note">Set a trip budget to track spending against it. Until then, spending is compared with your planned costs.</p>';
  else if (T.all.p > bud) h += '<p class="note warn">Planned costs are ' + esc(fmt(T.all.p - bud)) + ' over your trip budget.</p>';
  h += '<div class="tabs" role="tablist">';
  Object.keys(TABS).forEach(function (k) {
    var cnt = city[k] && k !== "notes" ? city[k].length : 0;
    h += '<button class="tab' + (k === sel.tab ? ' on' : '') + '" role="tab" aria-selected="' + (k === sel.tab) + '" data-act="tab" data-id="' + k + '">' + icon(TAB_ICON[k]) + TABS[k].label + (cnt ? '<span class="n">' + cnt + '</span>' : '') + '</button>';
  });
  return h + '</div>' + tabHtml(city, T);
}

export function renderMain() {
  var m = $("main"), f = sel.city && findCity(S, sel.city);
  var h;
  if (sel.view === "brain") h = brainHtml();
  else if (sel.view === "settings") h = settingsHtml();
  else if (sel.view === "world") h = worldHtml();
  else if ((sel.view === "city" || sel.view === "share") && f) { setCur(f.city.cur); h = sel.view === "share" ? shareView(f) : cityHtml(f); }
  else { sel.view = "home"; h = homeHtml(); }
  m.innerHTML = h;
  // Keep the selected tab visible in the sideways-scrolling tab row.
  var on = m.querySelector(".tab.on"), row = on && on.parentElement;
  if (row) row.scrollLeft = Math.max(0, on.offsetLeft - (row.clientWidth - on.offsetWidth) / 2);
}

/* ---------- Passport ---------- */
function worldHtml() {
  var vis = visitedCount(), pl = S.countries.length - vis;
  var h = '<div class="eyebrow">Passport</div><h1 class="page">Where you have been</h1><p class="lede">Add trips you have already taken without planning anything, or mark a planned trip as completed once you are back.</p>';
  h += '<div class="panel"><h3 style="font:500 1.15rem var(--display)">Add a trip you have taken</h3><div class="row"><label class="fld g">Trip name<input id="pc-name" placeholder="e.g. Japan"></label><label class="fld" style="width:110px">Year<input id="pc-year" placeholder="e.g. 2019" inputmode="numeric"></label><label class="fld g">Destinations (optional, comma separated)<input id="pc-cities" placeholder="Tokyo, Kyoto"></label><label class="fld g">Note (optional)<input id="pc-note" placeholder="Cherry blossom season"></label><button class="btn pri" data-act="addPast">Add to passport</button></div></div>';
  if (!S.countries.length) return h + '<p class="empty">No trips yet.</p>';
  h += '<div class="section"><h2>' + vis + ' completed · ' + pl + ' planned</h2></div><div class="chips">' + [["all", "All"], ["visited", "Completed"], ["planned", "Planned"]].map(function (c) { return '<button class="chip' + (sel.pf === c[0] ? ' on' : '') + '" data-act="pf" data-id="' + c[0] + '">' + c[1] + '</button>'; }).join("") + '</div>';
  var list = S.countries.filter(function (c) { return sel.pf === "all" || c.status === sel.pf; }).slice().sort(function (a, b) {
    if (a.status !== b.status) return a.status === "visited" ? -1 : 1;
    return (parseInt(b.year) || 0) - (parseInt(a.year) || 0) || a.name.localeCompare(b.name);
  });
  if (!list.length) h += '<p class="empty">Nothing in this view.</p>';
  h += '<div class="grid g2">';
  list.forEach(function (co) {
    var v = co.status === "visited", items = 0;
    co.cities.forEach(function (ci) { BOOKABLE.forEach(function (k) { items += ci[k].length; }); });
    h += '<div class="card stamp"><div style="display:flex;gap:14px;align-items:center"><button class="seal ' + (v ? 'v' : 'p') + '" data-act="cstatus" data-id="' + co.id + '" title="Tap to change" style="background:none">' + (v ? 'Been<br>there' : 'Planned') + '</button><div style="min-width:0"><h3 style="font:500 1.35rem var(--display)">' + esc(co.name) + '</h3><div class="meta">' + co.cities.length + (co.cities.length === 1 ? ' destination' : ' destinations') + ' · ' + items + ' bookings</div></div></div>'
      + '<div class="row" style="margin:12px 0 4px"><label class="fld" style="width:90px">Year<input data-cyear="' + co.id + '" value="' + esc(co.year) + '" inputmode="numeric"></label><label class="fld g">Note<input data-cnote="' + co.id + '" value="' + esc(co.note) + '"></label></div><div class="chips">' + co.cities.map(function (ci) { return '<button class="chip" data-act="pick" data-id="' + ci.id + '">' + esc(ci.name) + '</button>'; }).join("") + '</div></div>';
  });
  return h + '</div>';
}

/* ---------- Settings (Claude key, backup) ---------- */
function settingsHtml() {
  var has = !!getApiKey();
  var h = '<div class="eyebrow">Settings</div><h1 class="page">Settings</h1>';
  h += '<div class="panel"><div style="display:flex;gap:12px;align-items:center"><span class="ticon">' + icon("key") + '</span><div><h3 style="font:500 1.15rem var(--display)">Claude</h3><div class="meta">' + (has ? 'Connected. Model: ' + esc(MODEL) : 'Not connected') + '</div></div></div>';
  h += '<p class="lede" style="margin-top:12px">Claude powers the Brain Box and packing suggestions. Create an API key in the Claude Console at <a href="https://platform.claude.com/settings/keys" target="_blank" rel="noopener">platform.claude.com</a> and paste it here. The key is stored only on this device and is never included in backups. API use is billed to your Anthropic account, usually a few cents per paste.</p>';
  h += '<div class="row"><label class="fld g">API key<input id="apikey" type="password" autocomplete="off" spellcheck="false" placeholder="' + (has ? 'Saved. Paste a new key to replace it' : 'sk-ant-…') + '"></label><button class="btn pri" data-act="saveKey">Save</button>' + (has ? '<button class="btn" data-act="testKey"' + (ui.keyBusy ? ' disabled' : '') + '>' + (ui.keyBusy ? 'Checking…' : 'Test') + '</button><button class="btn ghost" style="color:var(--bad)" data-act="clearKey">Remove</button>' : '') + '</div></div>';
  h += '<div class="panel"><div style="display:flex;gap:12px;align-items:center"><span class="ticon acc">' + icon("upload") + '</span><div><h3 style="font:500 1.15rem var(--display)">Backup and restore</h3><div class="meta">Your journal is saved on this device</div></div></div><p class="lede" style="margin-top:12px">Download a copy now and then. To move your trips to another device, copy this text and paste it into Restore there.</p><textarea id="bk" aria-label="Backup data" style="margin-top:12px;min-height:140px">' + esc(JSON.stringify(S)) + '</textarea><div class="row"><button class="btn pri" data-act="dlBackup">Download backup</button><button class="btn" data-act="restore">Restore from text</button></div></div>';
  return h;
}

/* ---------- Share ---------- */
function shareView(f) {
  var city = f.city, items = shareItems(city), cats = catsOf(items), done = city.status === "completed";
  var h = '<section class="hero cover" style="' + coverStyle(city.name) + ';min-height:170px"><div class="bar"><button class="back" data-act="closeView" aria-label="Back to destination">' + icon("back") + '</button><span class="pill glass">Share</span></div><div><div class="co">' + esc(f.c.name) + '</div><h1>' + esc(city.name) + '</h1></div></section>';
  h += '<div class="panel"><p class="lede">Download a single page with your places, filterable by type, each with a Google Maps link. Booking references and costs are left out unless you include costs below.</p><div class="meta" style="margin-top:8px">' + (done ? 'Completed trip' : 'Trip in planning') + ' · ' + items.length + ' places and stays</div>';
  h += '<label class="check"><input type="checkbox" data-act="shopt" data-k="itin"' + (shareOpt.itin ? ' checked' : '') + '><span>Include the day-by-day itinerary</span></label><label class="check" style="margin-top:0"><input type="checkbox" data-act="shopt" data-k="costs"' + (shareOpt.costs ? ' checked' : '') + '><span>Include budget and costs</span></label>';
  h += '<div class="divider"></div>';
  if (!items.length) h += '<p class="empty">Add places on the Places tab, or paste details into Claude, to build the list.</p>';
  else {
    h += '<div class="chips"><button class="chip' + (shareOpt.cat === "All" ? ' on' : '') + '" data-act="shcat" data-id="All">All ' + items.length + '</button>' + cats.map(function (c) { return '<button class="chip' + (shareOpt.cat === c ? ' on' : '') + '" data-act="shcat" data-id="' + esc(c) + '">' + esc(c) + ' ' + items.filter(function (i) { return i.cat === c; }).length + '</button>'; }).join("") + '</div>';
    h += '<div class="grid g2">' + items.filter(function (i) { return shareOpt.cat === "All" || i.cat === shareOpt.cat; }).map(function (i) { return '<div class="card item place"><div class="pcat">' + esc(i.cat) + '</div><b>' + esc(i.name) + '</b>' + (i.note ? '<div class="meta">' + esc(i.note) + '</div>' : '') + '<div class="go"><a class="btn sm" href="' + esc(i.url) + '" target="_blank" rel="noopener">' + icon("map") + 'Open in Maps</a></div></div>'; }).join("") + '</div>';
  }
  h += '<div class="row" style="margin-top:22px"><button class="btn pri" data-act="dlShare">Download shareable page</button><button class="btn" data-act="copyShare">Copy as text</button><button class="btn" data-act="dlCsv">Download sheet (CSV)</button></div>';
  if (sel.shareText) h += '<p class="meta">Select and copy this text:</p><textarea id="shtxt" readonly style="min-height:160px">' + esc(sel.shareText) + '</textarea>';
  return h + '</div>';
}

/* ---------- Brain Box (Claude) ---------- */
function brainHtml() {
  var h = '<section class="claude-hero"><div class="eyebrow" style="color:rgba(255,255,255,.8)">Brain Box · Claude</div><h1>Paste it, Claude sorts it</h1><p>Paste plans, a booking email, a bank SMS or notes from an old trip, or upload a spreadsheet. Claude files everything under the right trip, destination and tab, and reads status, booking and provider from your text.</p></section>';
  if (!getApiKey()) h += '<div class="keynote">' + icon("key") + '<div><b>Connect Claude first.</b> Add your Claude API key in Settings. It stays on this device.<div style="margin-top:8px"><button class="btn sm pri" data-act="settings">Open Settings</button></div></div></div>';
  h += '<div class="chips" style="margin-top:16px">' + SAMPLES.map(function (s, i) { return '<button class="chip" data-act="sample" data-id="' + i + '">Try: ' + s[0] + '</button>'; }).join("") + '</div>';
  h += '<div class="panel" style="margin-top:6px"><textarea id="brainIn" aria-label="Plans or bookings" placeholder="e.g. Lisbon, Portugal 12–16 March. Emirates EK191 DXB to LIS, booked, 2,400. Hotel Avenida via Booking.com, conf. 88213, 540, paid. Day 2: Sintra day trip, not booked yet.">' + esc(brain.text) + '</textarea>';
  h += '<div class="row"><button class="btn sm" data-act="pickFile">' + icon("upload") + 'Upload a file</button><input type="file" id="brainFile" accept=".csv,.tsv,.txt,.md,.json,.eml,.xlsx,.xls,.docx" hidden><span class="meta">Excel, Word, CSV or text. PDFs: paste the text instead.</span></div>';
  h += '<label class="check"><input type="checkbox" data-act="bdone"' + (brain.done ? ' checked' : '') + '><span>These are past trips. Mark them as completed, booked and spent, and add them to my passport.</span></label>';
  h += '<div class="row" style="margin-bottom:0"><button class="btn acc" data-act="organise"' + (brain.busy ? ' disabled' : '') + '>' + icon("sparkle") + (brain.busy ? esc(brain.status || 'Claude is sorting…') : 'Sort it with Claude') + '</button><button class="btn ghost" data-act="home">Cancel</button></div>';
  if (brain.err) h += '<p class="err">' + esc(brain.err) + '</p>';
  var r = brain.res;
  if (r) {
    var L = [['itin', 'activities'], ['trans', 'transport'], ['stays', 'stays'], ['places', 'places'], ['budget', 'costs'], ['packing', 'packing items']];
    h += '<div class="divider"></div><h3 style="font:500 1.2rem var(--display)">Ready to add to ' + esc(citiesOf(r)) + '</h3><p class="meta">' + L.map(function (p) { return r[p[0]].length + ' ' + p[1]; }).join(' · ') + (r.notes ? ' · notes' : '') + '</p>';
    ['trans', 'stays', 'itin', 'budget'].forEach(function (k) {
      r[k].slice(0, 8).forEach(function (it) {
        h += '<div class="preview"><span class="ticon' + (k === "budget" ? ' acc' : '') + '">' + icon(k === "trans" ? (it.mode || "Flight") : k === "budget" ? "wallet" : KIND_ICON[k]) + '</span><div style="min-width:0"><b>' + esc(title(k, it)) + '</b><div class="meta">' + esc(it.city) + ', ' + esc(it.country) + '</div>' + (BOOKABLE.indexOf(k) >= 0 ? '<div class="badges"><span class="pill ' + (it.status === 'confirmed' ? 'ok' : 'warn') + '">' + (it.status === 'confirmed' ? 'Confirmed' : 'Tentative') + '</span><span class="pill ' + (it.booked === 'yes' ? 'ok' : '') + '">' + (it.booked === 'yes' ? 'Booked' : 'Not booked') + '</span>' + (it.via ? '<span class="pill brand">via ' + esc(it.via) + '</span>' : '') + '</div>' : '<div class="meta">' + esc(it.cat || '') + (it.spent ? ' · spent ' + esc(it.spent) : '') + '</div>') + '</div></div>';
      });
    });
    h += '<div class="row"><button class="btn pri" data-act="applyBrain">' + icon("check") + 'Add to journal</button><button class="btn" data-act="discardBrain">Discard</button></div>';
  }
  return h + '</div>';
}
