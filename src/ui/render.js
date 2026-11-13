// HTML for every screen, plus renderTree() (sidebar + tab bar) and renderMain().
import { TABS, CATS, BOOKABLE, CURS, SAMPLES, FOOD_TYPES, CUISINES } from "../constants.js";
import { esc, fmt, setCur, getCur, planned, spentOf, mapsUrl } from "../util.js";
import { filterFood, dateOfDay, reservations, findCity, findTrip, totalsOf, sortKey, title, groupByDay, tripRange, countdown, todayIso, routeParts, nights } from "../model.js";
import { shareItems, catsOf, tripShare } from "../share.js";
import { citiesOf } from "../brain.js";
import { getApiKey, MODEL } from "../platform.js";
import { weatherFor, weatherText } from "../weather.js";
import { getClientId } from "../gmail.js";
import { getMapsKey, pins, missingGeo, drawMap, KIND_STYLE, authFailed } from "../maps.js";
import { PACK_CATS } from "../brain.js";
import { S, sel, brain, shareOpt, ui } from "../state.js";
import { icon, coverStyle } from "./icons.js";

export function $(id) { return document.getElementById(id); }

var toastT;
export function toast(m) {
  if (!m) return;
  var t = $("toast"); t.textContent = m; t.style.display = "block";
  // Longer messages (errors) stay up long enough to read or screenshot.
  clearTimeout(toastT); toastT = setTimeout(function () { t.style.display = "none"; }, Math.min(15000, 3800 + m.length * 60));
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
function navOn(v) { return sel.view === v || (v === "home" && (sel.view === "trip" || sel.view === "share")); }

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
    var onTrip = sel.view === "trip" && sel.trip === co.id;
    h += '<button class="tree-city tree-head' + (onTrip && !sel.city ? ' on' : '') + '" data-act="trip" data-id="' + co.id + '"><i style="' + coverStyle(co.name) + '"></i><span>' + esc(co.name) + (yearTag(co) ? ' <small style="margin:0">' + esc(yearTag(co)) + '</small>' : '') + '</span>' + (co.status === "visited" ? '<small>Done</small>' : '') + '</button>';
    co.cities.forEach(function (ci) {
      h += '<button class="tree-city tree-sub' + (onTrip && ci.id === sel.city ? ' on' : '') + '" data-act="pick" data-id="' + ci.id + '"><span>' + esc(ci.name) + '</span></button>';
    });
  });
  $("tree").innerHTML = h;
}

/* ---------- Home: one cover card per trip ---------- */
function bookedOf(cities) { var n = 0, b = 0; cities.forEach(function (ci) { var x = bookedCount(ci); n += x.n; b += x.b; }); return { n: n, b: b }; }
function tripCard(co, today) {
  var r = tripRange(co), done = co.status === "visited", cd = done ? "" : countdown(r, today), bc = bookedOf(co.cities);
  setCur(co.cur); var T = totalsOf(co.cities), base = parseFloat(co.tbudget) || T.all.p, pct = base ? Math.min(100, T.all.s / base * 100) : 0;
  var names = co.cities.map(function (ci) { return ci.name; }).join(" · ");
  return '<button class="tcard" data-act="trip" data-id="' + co.id + '"><div class="cover" style="' + coverStyle(co.name) + '"><div class="top"><span class="co">' + esc(names || "No destinations yet") + '</span>'
    + (done ? '<span class="pill glass">' + icon("check") + 'Done</span>' : cd ? '<span class="pill glass">' + esc(cd) + '</span>' : '') + '</div>'
    + '<div><h3>' + esc(co.name) + '</h3><div style="font-size:.86rem;opacity:.92;margin-top:4px">' + esc(rangeText(r) || (done ? (co.year || 'Past trip') : 'Dates not set')) + (co.cities.length ? ' · ' + co.cities.length + (co.cities.length === 1 ? ' destination' : ' destinations') : '') + '</div></div></div>'
    + '<div class="body"><span><b>' + bc.b + '</b> of ' + bc.n + ' booked</span><span>' + (base ? '<b>' + esc(fmt(T.all.s)) + '</b> of ' + esc(fmt(base)) : 'No budget yet') + '</span></div>'
    + (base ? '<div class="meter' + (T.all.s > base ? ' over' : '') + '"><i style="width:' + pct + '%"></i></div>' : '') + '</button>';
}
function tripStart(co) { var r = tripRange(co); return r ? r.start : "9999"; }
function homeHtml() {
  var today = todayIso(), dests = 0;
  S.countries.forEach(function (c) { dests += c.cities.length; });
  var h = '<div class="hello"><div><div class="eyebrow">' + esc(new Date().toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" })) + '</div><h1 class="page">Where to next?</h1></div>'
    + '<button class="btn acc" data-act="brain">' + icon("sparkle") + 'Paste a booking</button></div>';
  h += '<div class="stats"><div class="stat"><b>' + S.countries.length + '</b><span>Trips</span></div><div class="stat"><b>' + dests + '</b><span>Destinations</span></div><div class="stat"><b>' + visitedCount() + '</b><span>Completed</span></div></div>';
  var gNeed = [!getMapsKey() ? "Google Maps" : "", !getClientId() ? "Gmail" : ""].filter(Boolean), hid = false;
  try { hid = localStorage.getItem("fernweh-hide-google") === "1"; } catch (e) {}
  if (gNeed.length && !hid) h += '<div class="keynote" style="background:var(--brand-soft)">' + icon("map") + '<div style="flex:1"><b>Reminder: finish the Google setup.</b> ' + esc(gNeed.join(" and ")) + (gNeed.length > 1 ? ' are' : ' is') + ' not connected yet. It takes about 15 minutes, once.<div class="acts" style="margin-top:8px"><button class="btn sm pri" data-act="settings">Set up now</button><button class="btn sm ghost" data-act="hideGoogle">Hide</button></div></div></div>';
  h += '<div class="addtrip"><input id="newCountry" placeholder="Plan a new trip, e.g. Germany 2026" aria-label="New trip name"><button class="btn pri" data-act="addCountry">' + icon("plus") + 'Add trip</button></div>';
  if (!S.countries.length) {
    return h + '<div class="panel" style="text-align:center;padding:34px 20px"><div class="ticon acc" style="margin:0 auto 12px;width:52px;height:52px;border-radius:16px">' + icon("Flight") + '</div><h2 style="font:500 1.4rem var(--display)">Your first trip starts here</h2><p class="lede" style="margin:8px auto 0">Add a trip above, or paste a flight or hotel confirmation and Claude will set it up for you.</p></div>';
  }
  var up = S.countries.filter(function (c) { return c.status !== "visited"; }).sort(function (a, b) { return tripStart(a).localeCompare(tripStart(b)) || a.name.localeCompare(b.name); });
  var past = S.countries.filter(function (c) { return c.status === "visited"; }).sort(function (a, b) { return tripStart(b).localeCompare(tripStart(a)) || (parseInt(b.year) || 0) - (parseInt(a.year) || 0); });
  if (up.length) h += '<div class="section"><h2>Upcoming</h2><span class="meta">' + up.length + (up.length === 1 ? ' trip' : ' trips') + '</span></div><div class="grid g3">' + up.map(function (c) { return tripCard(c, today); }).join("") + '</div>';
  if (past.length) h += '<div class="section"><h2>Past trips</h2><span class="meta">' + past.length + '</span></div><div class="grid g3">' + past.map(function (c) { return tripCard(c, today); }).join("") + '</div>';
  return h;
}

/* ---------- Destination ---------- */
/** One form field. `item` pre-fills it (editing); `attr` is data-f for the add form, data-e for the edit form. */
function fieldHtml(f, item, attr) {
  attr = attr || "data-f";
  var st = f.grow ? "" : "width:" + (f.w || 140) + "px", inp, v = item && item[f.k] != null ? String(item[f.k]) : "", val = item ? ' value="' + esc(v) + '"' : '';
  if (f.type === "select") inp = '<select ' + attr + '="' + f.k + '" aria-label="' + esc(f.ph) + '" style="' + st + '">' + f.opts.map(function (o) { return '<option value="' + esc(o[0]) + '"' + (item && o[0] === v ? ' selected' : '') + '>' + esc(o[1]) + '</option>'; }).join("") + '</select>';
  else if (f.type === "list") inp = '<input ' + attr + '="' + f.k + '"' + val + ' list="dl-' + f.k + '" aria-label="' + esc(f.ph) + '" style="' + st + '"><datalist id="dl-' + f.k + '">' + CUISINES.map(function (c) { return '<option value="' + esc(c) + '"></option>'; }).join("") + '</datalist>';
  else inp = '<input ' + attr + '="' + f.k + '"' + val + ' type="' + (f.type || "text") + '" aria-label="' + esc(f.ph) + '" style="' + st + '">';
  return '<label class="fld' + (f.grow ? ' g' : '') + '">' + esc(f.ph) + inp + '</label>';
}
function badges(k, it, cid) {
  var c = it.status === "confirmed", b = it.booked === "yes", a = ' data-list="' + k + '" data-id="' + it.id + '" data-cid="' + cid + '" title="Tap to change"';
  return '<div class="badges"><button class="pill ' + (c ? 'ok' : 'warn') + '" data-act="flip" data-k="status"' + a + '>' + (c ? 'Confirmed' : 'Tentative') + '</button><button class="pill ' + (b ? 'ok' : '') + '" data-act="flip" data-k="booked"' + a + '>' + (b ? 'Booked' : 'Not booked') + '</button>' + (it.via && k !== "trans" ? '<span class="pill brand">via ' + esc(it.via) + '</span>' : '') + '</div>';
}
function moneyHtml(k, it, cid) {
  var p = planned(it);
  return '<div class="money"><span>' + (p ? 'Planned <strong>' + esc(fmt(p)) + '</strong>' : 'No cost set') + '</span><label>Spent <input type="number" inputmode="decimal" data-spent="' + it.id + '" data-list="' + k + '" data-cid="' + cid + '" value="' + esc(it.spent || "") + '" placeholder="0" aria-label="Amount spent"></label></div>';
}
function del(k, it, cid) {
  var a = ' data-list="' + k + '" data-id="' + it.id + '" data-cid="' + cid + '"';
  return '<span class="itemacts"><button class="x" data-act="edit"' + a + ' aria-label="Edit">' + icon("edit") + '</button><button class="x" data-act="del"' + a + ' aria-label="Delete">' + icon("x") + '</button></span>';
}
/** The edit form shown in place of an item's card. */
function isEditing(it) { return sel.edit && sel.edit.id === it.id; }
function editForm(k, it, cid) {
  var fields = k === "packing" ? [{ k: "text", ph: "Item", grow: 1 }] : TABS[k].fields;
  return '<div class="card form editing" id="editcard"><div class="eyebrow" style="margin-bottom:6px">Edit ' + esc(title(k, it) || "item") + '</div><div class="row" id="editform" style="margin:0" data-list="' + k + '" data-id="' + it.id + '" data-cid="' + cid + '">' + fields.map(function (f) { return fieldHtml(f, it, "data-e"); }).join("") + '<button class="btn pri" data-act="saveEdit">Save</button><button class="btn ghost" data-act="cancelEdit">Cancel</button></div></div>';
}

function passHtml(it, cid) {
  if (isEditing(it)) return editForm("trans", it, cid);
  var rp = routeParts(it.route), long = function (s) { return s.length > 4 ? ' class="long"' : ''; };
  var facts = [["Date", it.date ? niceDate(it.date, true) : ""], ["Time", it.time], ["Ref", it.ref]].filter(function (f) { return f[1]; });
  return '<div class="pass"><div class="ptop"><span style="display:flex;align-items:center;gap:8px">' + icon(it.mode || "Flight") + esc([it.via, it.no].filter(Boolean).join(" · ") || it.mode || "Transport") + '</span>' + del("trans", it, cid) + '</div>'
    + '<div class="route"><div class="end"><b' + long(rp[0]) + '>' + esc(rp[0] || "?") + '</b><small>From</small></div><div class="path">' + icon(it.mode || "Flight") + '</div><div class="end to"><b' + long(rp[1]) + '>' + esc(rp[1] || "?") + '</b><small>To</small></div></div>'
    + '<div class="tear"></div><div class="stub">' + (facts.length ? '<div class="facts">' + facts.map(function (f) { return '<div>' + f[0] + '<b>' + esc(f[1]) + '</b></div>'; }).join("") + '</div>' : '') + badges("trans", it, cid) + moneyHtml("trans", it, cid) + '</div></div>';
}
function stayHtml(it, cid) {
  if (isEditing(it)) return editForm("stays", it, cid);
  var n = nights(it.checkin, it.checkout), dates = (it.checkin || it.checkout) ? niceDate(it.checkin, true) + " – " + niceDate(it.checkout, true) : "";
  return '<div class="card item"><div class="cardhead"><div class="ttl"><span class="ticon">' + icon("Bed") + '</span><div><b>' + esc(it.name) + '</b>' + (n ? '<div class="nights">' + n + (n === 1 ? ' night' : ' nights') + '</div>' : '') + (it.area ? '<div class="meta">' + icon("pin") + ' ' + esc(it.area) + '</div>' : '') + '<div class="meta">' + esc([dates, it.conf ? "Conf. " + it.conf : ""].filter(Boolean).join(" · ")) + '</div></div></div>' + del("stays", it, cid) + '</div>' + badges("stays", it, cid) + moneyHtml("stays", it, cid) + '</div>';
}
/** Best Maps link for an item: its own link, the exact Google place once found, else a search. */
function mapLink(it, city) { return /^https?:/i.test(it.link || "") ? it.link : (it.geo && it.geo.url) || mapsUrl(it.name, (it.area ? it.area + ", " : "") + city.name); }
function placeHtml(it, city, cid) {
  if (isEditing(it)) return editForm("places", it, cid);
  var u = mapLink(it, city);
  return '<div class="card item place"><div class="cardhead"><div><div class="pcat">' + esc(it.cat || "Other") + '</div><b>' + esc(it.name) + '</b></div>' + del("places", it, cid) + '</div>' + (it.note ? '<div class="meta">' + esc(it.note) + '</div>' : '') + '<div class="go"><a class="btn sm" href="' + esc(u) + '" target="_blank" rel="noopener">' + icon("map") + 'Open in Maps</a></div></div>';
}
function michelinLabel(m) {
  if (!m) return "";
  var n = { "1 star": 1, "2 stars": 2, "3 stars": 3 }[m];
  return n ? new Array(n + 1).join("★") + " Michelin" : m;
}
function foodHtml(it, city, cid) {
  if (isEditing(it)) return editForm("food", it, cid);
  var u = mapLink(it, city), v = it.status === "visited";
  var awards = (it.michelin ? '<span class="pill mich">' + esc(michelinLabel(it.michelin)) + '</span>' : '') + (it.best50 === "yes" ? '<span class="pill b50">World\'s 50 Best</span>' : '');
  return '<div class="card item place food"><div class="cardhead"><div><div class="pcat">' + esc([it.cuisine, it.type && it.type !== "Other" ? it.type : ""].filter(Boolean).join(" · ") || "Restaurant") + '</div><b>' + esc(it.name) + '</b></div>' + del("food", it, cid) + '</div>'
    + (awards ? '<div class="badges" style="margin-top:2px">' + awards + '</div>' : '')
    + (it.bookDate ? '<div class="booked">' + icon("cal") + '<span>Table booked ' + esc(niceDate(it.bookDate, false)) + (it.bookTime ? ' at ' + esc(it.bookTime) : '') + (it.bookVia ? ' · via ' + esc(it.bookVia) : '') + '</span></div>' : it.bookVia ? '<div class="meta">Book via ' + esc(it.bookVia) + '</div>' : '')
    + (it.recBy ? '<div class="meta">Recommended by ' + esc(it.recBy) + '</div>' : '') + (it.note ? '<div class="meta">' + esc(it.note) + '</div>' : '')
    + '<div class="go" style="display:flex;gap:8px;flex-wrap:wrap;align-items:center"><button class="pill ' + (v ? 'ok' : 'brand') + '" data-act="flip" data-k="visit" data-list="food" data-id="' + it.id + '" data-cid="' + cid + '" title="Tap to change">' + (v ? icon("check") + 'Visited' : 'Want to visit') + '</button><a class="btn sm" href="' + esc(u) + '" target="_blank" rel="noopener">' + icon("map") + 'Maps</a></div></div>';
}
function costHtml(it, cid) {
  if (isEditing(it)) return editForm("budget", it, cid);
  return '<div class="card item"><div class="cardhead"><div class="ttl"><span class="ticon acc">' + icon("wallet") + '</span><div><b>' + esc(it.label) + '</b>' + (it.cat ? '<div class="meta">' + esc(it.cat) + '</div>' : '') + '</div></div>' + del("budget", it, cid) + '</div>' + moneyHtml("budget", it, cid) + '</div>';
}
function actHtml(it, cid) {
  if (isEditing(it)) return editForm("itin", it, cid);
  if (it._res) return '<div class="act res"><div class="tm">' + esc(it.time || "Booked") + '</div><b>' + icon("fork") + ' Table at ' + esc(it.text) + '</b><div class="meta">' + esc([it.food.cuisine, it.via ? "via " + it.via : ""].filter(Boolean).join(" · ")) + '</div><div class="badges"><button class="pill brand" data-act="tab" data-id="food">See in Restaurants</button></div></div>';
  var link = /^https?:/i.test(it.link || "") ? '<a class="btn sm" style="margin-top:8px" href="' + esc(it.link) + '" target="_blank" rel="noopener">' + icon("share") + 'Open link</a>' : '';
  return '<div class="act"><div class="cardhead" style="display:flex;justify-content:space-between;gap:10px"><div>' + (it.time ? '<div class="tm">' + esc(it.time) + '</div>' : '') + '<b>' + esc(it.text) + '</b></div>' + del("itin", it, cid) + '</div>' + link + badges("itin", it, cid) + moneyHtml("itin", it, cid) + '</div>';
}

/* ---------- Weather ---------- */
/** Dates used for a destination's weather: its own bookings, else the trip's dates. */
export function destRange(co, ci) { return tripRange(ci) || tripRange(co); }
export function weatherKey(ci, r) { return ci.name.toLowerCase() + "|" + r.start + "|" + r.end; }
function wxIcon(w) { return !w ? "sun" : w.wet * 3 >= w.days ? "rain" : w.hi <= 12 ? "thermo" : "sun"; }
function wxCard(co, ci) {
  var r = destRange(co, ci);
  if (!r) return '<div class="wx"><span class="ticon">' + icon("cal") + '</span><div><b>' + esc(ci.name) + '</b><div class="meta">Add trip dates to see the expected weather.</div></div></div>';
  var key = weatherKey(ci, r), st = ui.weather[key];
  if (!st) {
    st = ui.weather[key] = { state: "loading" };
    weatherFor(ci.name, r, todayIso()).then(function (w) { ui.weather[key] = { state: "ok", w: w }; renderMain(); }, function (e) { ui.weather[key] = { state: "err", msg: (e && e.message) || "Weather unavailable." }; renderMain(); });
  }
  var w = st.w;
  return '<div class="wx"><span class="ticon' + (w && w.hi >= 28 ? ' acc' : '') + '">' + icon(wxIcon(w)) + '</span><div style="min-width:0"><b>' + esc(ci.name) + '</b><span class="meta"> · ' + esc(rangeText(r)) + '</span>'
    + (st.state === "ok" ? '<div class="wxline">' + esc(weatherText(w)) + '</div>' + (w.kind === "typical" ? '<div class="meta">Based on the same dates last year. The forecast appears 16 days before.</div>' : '')
      : st.state === "err" ? '<div class="meta">Weather unavailable: ' + esc(st.msg) + '</div>' : '<div class="meta">Checking the weather…</div>') + '</div></div>';
}
function wxPanel(co, cities) {
  if (!cities.length) return "";
  return '<div class="card wxpanel"><h3 style="font:500 1.1rem var(--display);margin-bottom:4px">Expected weather</h3>' + cities.map(function (ci) { return wxCard(co, ci); }).join("") + '</div>';
}

const KIND_ICON = { itin: "cal", trans: "Flight", stays: "Bed" };
function overHtml(co, cities) {
  var n = { c: 0, t: 0, b: 0, u: 0, all: 0 }, need = [], car = {}, T = totalsOf(cities), many = cities.length > 1;
  cities.forEach(function (ci) {
    BOOKABLE.forEach(function (k) {
      ci[k].forEach(function (it) {
        n.all++; if (it.status === "confirmed") n.c++; else n.t++;
        if (it.booked === "yes") n.b++; else { n.u++; need.push({ k: k, it: it, ci: ci }); }
        if (k === "trans" && it.via) car[it.via] = 1;
      });
    });
  });
  var pct = n.all ? Math.round(n.b / n.all * 100) : 0, carriers = Object.keys(car);
  var h = wxPanel(co, cities) + '<div class="overview" style="margin-top:14px"><div class="card ov-card"><div class="ring" style="--p:' + pct + '"><b>' + pct + '%</b></div><div><div class="big">' + n.b + ' <span class="meta">of ' + n.all + '</span></div><div class="meta">booked</div></div></div>';
  h += '<div class="card"><div class="meta">Confirmation</div><div style="display:flex;gap:22px;margin-top:4px"><div><div class="ov-card big" style="color:var(--ok)">' + n.c + '</div><div class="meta">Confirmed</div></div><div><div class="ov-card big" style="color:var(--warn)">' + n.t + '</div><div class="meta">Tentative</div></div></div></div>';
  h += '<div class="card"><div class="meta">Carriers</div><div style="font-weight:600;margin-top:8px">' + (carriers.length ? esc(carriers.join(", ")) : 'None added yet') + '</div></div>';
  h += '<div class="card"><div class="meta">Still to book</div><div class="big" style="font:500 1.7rem var(--display);color:' + (n.u ? 'var(--bad)' : 'var(--ok)') + '">' + n.u + '</div></div></div>';
  h += '<div class="grid g2" style="margin-top:14px">';
  if (many) {
    h += '<div class="card"><h3 style="font:500 1.1rem var(--display)">By destination</h3>';
    cities.forEach(function (ci) { var t = totalsOf([ci]), r = tripRange(ci); h += '<button class="todo" data-act="dest" data-id="' + ci.id + '" style="width:100%;border-left:0;border-right:0;border-bottom:0;background:none;text-align:left"><i style="width:34px;height:34px;border-radius:10px;flex:none;' + coverStyle(ci.name) + '"></i><div style="flex:1;min-width:0"><b>' + esc(ci.name) + '</b><div class="meta">' + esc(rangeText(r) || 'Dates not set') + '</div></div><span class="meta" style="text-align:right">' + esc(fmt(t.all.s)) + '<br>of ' + esc(fmt(t.all.p)) + '</span></button>'; });
    h += '</div>';
  }
  h += '<div class="card"><h3 style="font:500 1.1rem var(--display)">Cost by category</h3>';
  CATS.forEach(function (x) { var t = T[x[0]], p = t.p ? Math.min(100, t.s / t.p * 100) : 0; h += '<div class="catrow"><div><span>' + t.label + '</span><span style="font-variant-numeric:tabular-nums">' + esc(fmt(t.s)) + ' of ' + esc(fmt(t.p)) + '</span></div><div class="meter' + (t.s > t.p && t.p ? ' over' : '') + '"><i style="width:' + p + '%"></i></div></div>'; });
  h += '</div><div class="card"><h3 style="font:500 1.1rem var(--display);margin-bottom:6px">To book or confirm</h3>';
  if (!need.length) h += '<p class="empty">Nothing waiting. Everything is booked.</p>';
  need.slice(0, 12).forEach(function (x) { var it = x.it; h += '<div class="todo"><span class="ticon">' + icon(x.k === "trans" ? (it.mode || "Flight") : KIND_ICON[x.k]) + '</span><div style="flex:1;min-width:0"><b>' + esc(title(x.k, it)) + '</b><div class="meta">' + esc((many ? x.ci.name + ' · ' : '') + TABS[x.k].label) + '</div>' + badges(x.k, it, x.ci.id) + '</div></div>'; });
  return h + '</div></div>';
}

function curInput(co) {
  return '<input data-cur="1" id="cursel" list="curlist" aria-label="Trip currency" value="' + esc(co.cur) + '" maxlength="4" autocapitalize="characters"><datalist id="curlist">' + CURS.map(function (c) { return '<option value="' + c + '"></option>'; }).join("") + '</datalist>';
}
function catCounts(list) { var m = {}; list.forEach(function (x) { var c = x.cat || "Other"; m[c] = (m[c] || 0) + 1; }); return m; }

/** One destination's items for list tab k (already filtered and sorted). */
function dayLabel(start, d) {
  var iso = dateOfDay(start, d);
  return iso ? new Date(iso + "T12:00:00").toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" }) : "";
}
function listBody(k, ci, list, co) {
  var cid = ci.id, h = "";
  if (k === "itin") {
    var start = (tripRange(co) || {}).start || "", days = groupByDay(list), keys = Object.keys(days);
    // Numbered days in order, then anything without a day.
    keys.sort(function (a, b) { var x = parseFloat(a), y = parseFloat(b); return (isNaN(x) ? 1e9 : x) - (isNaN(y) ? 1e9 : y); });
    keys.forEach(function (d) {
      var p = 0, s2 = 0, num = !isNaN(parseFloat(d)); days[d].forEach(function (it) { if (!it._res) { p += planned(it); s2 += spentOf(it); } });
      var dl = num ? dayLabel(start, d) : "";
      h += '<div class="day"><div class="dayhead"><div class="dd"><b>' + (num ? 'Day ' + esc(d) : 'No day set') + '</b>' + (dl ? '<span>' + esc(dl) + '</span>' : '') + '</div>'
        + (num ? '<input class="dayplace" data-dayplace="' + esc(d) + '" value="' + esc(co.days[d] || "") + '" placeholder="Where to?" aria-label="Where you go on day ' + esc(d) + '">' : '') + (p || s2 ? '<span class="dsum">' + esc(fmt(s2)) + ' of ' + esc(fmt(p)) + '</span>' : '') + '</div>'
        + days[d].map(function (it) { return actHtml(it, cid); }).join("") + '</div>';
    });
    return h;
  }
  if (k === "packing") {
    return list.map(function (it) { return '<div class="pk' + (it.done ? ' done' : '') + '"><input type="checkbox" data-act="tick" data-id="' + it.id + '" data-cid="' + cid + '"' + (it.done ? ' checked' : '') + ' aria-label="Packed"><span>' + esc(it.text) + '</span>' + del("packing", it, cid) + '</div>'; }).join("");
  }
  var one = { trans: passHtml, stays: stayHtml, food: function (it) { return foodHtml(it, ci, cid); }, places: function (it) { return placeHtml(it, ci, cid); }, budget: costHtml }[k];
  return '<div class="grid g2">' + list.map(function (it) { return one(it, cid); }).join("") + '</div>';
}

function packItem(it, tid) {
  if (isEditing(it)) return editForm("packing", it, tid);
  return '<div class="pk' + (it.done ? ' done' : '') + '"><input type="checkbox" data-act="tick" data-id="' + it.id + '" data-cid="' + tid + '"' + (it.done ? ' checked' : '') + ' aria-label="Packed"><span>' + esc(it.text) + (it.why ? '<small>' + esc(it.why) + '</small>' : '') + '</span>' + del("packing", it, tid) + '</div>';
}
function packingHtml(co) {
  var tid = "trip:" + co.id, list = co.packing, done = list.filter(function (x) { return x.done; }).length;
  var h = wxPanel(co, co.cities);
  h += '<div class="head" style="margin-top:18px"><h2>Packing</h2><div class="acts"><button class="btn sm acc" data-act="suggestPack"' + (ui.packBusy ? ' disabled' : '') + '>' + icon("sparkle") + (ui.packBusy ? 'Claude is thinking…' : 'Smart suggestions') + '</button>' + (list.length ? '' : '<button class="btn sm" data-act="starter">Starter list</button>') + '<button class="btn sm pri" data-act="toggleForm">' + (sel.form ? icon("x") + 'Close' : icon("plus") + 'Item') + '</button></div></div>';
  h += '<p class="meta" style="margin:-6px 0 12px">One list for the whole trip. Smart suggestions use the weather, your plans and your restaurant bookings.</p>';
  if (sel.form) h += '<div class="card form"><div class="row" id="form" style="margin:0">' + TABS.packing.fields.map(fieldHtml).join("") + '<button class="btn pri" data-act="add">Save</button></div></div>';
  if (!list.length) return h + '<p class="empty">Nothing on the list yet.</p>';
  var grouped = list.some(function (x) { return x.cat; });
  if (!grouped) h += list.map(function (it) { return packItem(it, tid); }).join("");
  else PACK_CATS.forEach(function (c) {
    var xs = list.filter(function (x) { return (PACK_CATS.indexOf(x.cat) >= 0 ? x.cat : "Other") === c; });
    if (xs.length) h += '<div class="pkcat">' + c + '</div>' + xs.map(function (it) { return packItem(it, tid); }).join("");
  });
  return h + '<p class="meta" style="margin-top:10px">' + done + ' of ' + list.length + ' packed</p>';
}

const TAB_ICON = { over: "grid", map: "map", itin: "cal", trans: "Flight", stays: "Bed", food: "fork", places: "pin", budget: "wallet", packing: "bag", notes: "note" };
/* ---------- Map (Google Maps) ---------- */
function mapTabHtml(co, cities) {
  var h = '<div class="head"><h2>Map</h2></div>';
  if (!getMapsKey()) return h + '<div class="panel" style="margin-top:0"><p class="lede">See your stays, restaurants and places on Google Maps, with exact locations from Google. Add a Google Maps key in Settings first.</p><div class="row"><button class="btn sm pri" data-act="settings">Open Settings</button></div></div>';
  var kinds = Object.keys(KIND_STYLE).filter(function (k) { return sel.mapKinds[k]; });
  var all = missingGeo(cities), list = pins(cities, kinds), g = ui.geo;
  h += '<div class="chips">' + Object.keys(KIND_STYLE).map(function (k) { var n = pins(cities, [k]).length; return '<button class="chip mapk' + (sel.mapKinds[k] ? ' on' : '') + '" data-act="mapKind" data-id="' + k + '"><i style="background:' + KIND_STYLE[k].color + '"></i>' + KIND_STYLE[k].label + ' ' + n + '</button>'; }).join("") + '</div>';
  if (all.length || g.busy) h += '<div class="geo-note">' + icon("pin") + '<span>' + (g.busy ? esc(g.status) : all.length + (all.length === 1 ? ' item has' : ' items have') + ' no location yet.') + '</span>' + (g.busy ? '' : '<button class="btn sm pri" data-act="geoFind">Find with Google</button>') + '</div>';
  if (g.err) h += '<p class="err">' + esc(g.err) + '</p>';
  if (!list.length) return h + '<p class="empty">' + (pins(cities).length ? 'Nothing to show with these filters.' : 'No locations yet. Tap Find with Google to place your stays, restaurants and places.') + '</p>';
  return h + '<div id="gmap" class="gmap" aria-label="Map"></div><p class="meta" style="margin-top:8px">Tap a pin for details and directions in Google Maps.</p>';
}
export function mapPopup(x) {
  var it = x.item, sub = x.kind === "food" ? [it.cuisine, it.type !== "Other" ? it.type : "", michelinLabel(it.michelin)].filter(Boolean).join(" · ") : x.kind === "stays" ? (it.area || "Stay") : (it.cat || "Place");
  var u = mapLink(it, x.city);
  return '<div class="pop"><b>' + esc(it.name) + '</b><div>' + esc(sub) + '</div>' + (it.geo.addr ? '<div class="addr">' + esc(it.geo.addr) + '</div>' : '') + '<a href="' + esc(u) + '" target="_blank" rel="noopener">Open in Google Maps</a></div>';
}
function paintMap(co, cities) {
  var el = document.getElementById("gmap"); if (!el) return;
  var kinds = Object.keys(KIND_STYLE).filter(function (k) { return sel.mapKinds[k]; });
  drawMap(el, pins(cities, kinds), mapPopup).then(function () {
    setTimeout(function () { if (authFailed()) el.outerHTML = '<p class="err">Google did not accept the Maps key. Check it in Settings and that the Maps JavaScript API is enabled.</p>'; }, 1500);
  }, function (e) { el.outerHTML = '<p class="err">' + esc((e && e.message) || 'Could not load the map.') + '</p>'; });
}

function tabHtml(co, cities) {
  var k = sel.tab, Tb = TABS[k], h = "", many = cities.length > 1;
  if (k === "over") return overHtml(co, cities);
  if (!co.cities.length) return '<p class="empty">Add a destination above to start planning.</p>';
  if (k === "notes") {
    return cities.map(function (ci) { return (many ? '<div class="section" style="margin-top:18px"><h2 style="font-size:1.1rem">' + esc(ci.name) + '</h2></div>' : '') + '<textarea data-notes="' + ci.id + '" aria-label="Notes for ' + esc(ci.name) + '" style="min-height:' + (many ? 160 : 320) + 'px" placeholder="Neighbourhoods, tips, transport, food to try, things to avoid…">' + esc(ci.notes) + '</textarea>'; }).join("");
  }
  if (k === "packing") return packingHtml(co);
  if (k === "map") return mapTabHtml(co, cities);
  h += '<div class="head"><h2>' + Tb.label + '</h2><div class="acts">';
  if (k === "places") h += '<button class="btn sm" data-act="importPick">' + icon("upload") + 'Import Maps CSV</button><input type="file" id="csv" accept=".csv,text/csv" hidden>';
  h += '<button class="btn sm pri" data-act="toggleForm">' + (sel.form ? icon("x") + 'Close' : icon("plus") + Tb.add.replace(/^Add /, '').replace(/^./, function (c) { return c.toUpperCase(); })) + '</button></div></div>';
  if (sel.form) {
    var pick = many ? '<label class="fld"><span>Destination</span><select data-f="__city" aria-label="Destination">' + cities.map(function (ci) { return '<option value="' + ci.id + '">' + esc(ci.name) + '</option>'; }).join("") + '</select></label>' : '';
    h += '<div class="card form"><div class="row" id="form" style="margin:0">' + pick + Tb.fields.map(fieldHtml).join("") + '<button class="btn pri" data-act="add">Save</button></div></div>';
  }
  var lists = cities.map(function (ci) { return { ci: ci, list: ci[k].slice().sort(function (a, b) { return sortKey(k, a, b); }) }; });
  if (k === "places") {
    var all = [].concat.apply([], lists.map(function (x) { return x.list; }));
    if (all.length) {
      var cc = catCounts(all), names = Object.keys(cc);
      h += '<div class="chips"><button class="chip' + (sel.pcat === "All" ? ' on' : '') + '" data-act="pcat" data-id="All">All ' + all.length + '</button>' + names.map(function (c) { return '<button class="chip' + (sel.pcat === c ? ' on' : '') + '" data-act="pcat" data-id="' + esc(c) + '">' + esc(c) + ' ' + cc[c] + '</button>'; }).join("") + '</div>';
      if (sel.pcat !== "All") lists.forEach(function (x) { x.list = x.list.filter(function (it) { return (it.cat || "Other") === sel.pcat; }); });
    }
  }
  if (k === "food") {
    var allf = [].concat.apply([], lists.map(function (x) { return x.list; }));
    if (allf.length) {
      var nv = allf.filter(function (r) { return r.status === "visited"; }).length;
      h += '<div class="seg" role="group" aria-label="Show">' + [["all", "All", allf.length], ["want", "Want to visit", allf.length - nv], ["visited", "Visited", nv]].map(function (o) { return '<button class="' + (sel.fstat === o[0] ? 'on' : '') + '" data-act="fstat" data-id="' + o[0] + '">' + o[1] + ' <span>' + o[2] + '</span></button>'; }).join("") + '</div>';
      var types = {}; allf.forEach(function (r) { var t = r.type || "Other"; types[t] = (types[t] || 0) + 1; });
      var order = FOOD_TYPES.filter(function (t) { return types[t]; });
      h += '<div class="chips"><button class="chip' + (sel.ftype === "All" ? ' on' : '') + '" data-act="ftype" data-id="All">All types</button>' + order.map(function (t) { return '<button class="chip' + (sel.ftype === t ? ' on' : '') + '" data-act="ftype" data-id="' + esc(t) + '">' + esc(t) + ' ' + types[t] + '</button>'; }).join("")
        + '<button class="chip award' + (sel.faward === "michelin" ? ' on' : '') + '" data-act="faward" data-id="michelin">★ Michelin</button><button class="chip award' + (sel.faward === "best50" ? ' on' : '') + '" data-act="faward" data-id="best50">World\'s 50 Best</button></div>';
      var cus = {}; allf.forEach(function (r) { var c = String(r.cuisine || "").trim(); if (c) { var key = c.toLowerCase(); cus[key] = cus[key] || { name: c, n: 0 }; cus[key].n++; } });
      var cl = Object.keys(cus).sort(function (a, b) { return cus[b].n - cus[a].n || a.localeCompare(b); });
      if (cl.length) h += '<div class="chips"><button class="chip' + (sel.fcuisine === "All" ? ' on' : '') + '" data-act="fcuisine" data-id="All">All cuisines</button>' + cl.map(function (key) { return '<button class="chip' + (sel.fcuisine.toLowerCase() === key ? ' on' : '') + '" data-act="fcuisine" data-id="' + esc(cus[key].name) + '">' + esc(cus[key].name) + ' ' + cus[key].n + '</button>'; }).join("") + '</div>';
      lists.forEach(function (x) { x.list = filterFood(x.list, sel.fstat, sel.ftype, sel.faward, sel.fcuisine); });
      if (!lists.some(function (x) { return x.list.length; })) return h + '<p class="empty">No restaurants match these filters.</p>';
    }
  }
  if (k === "itin") {
    var st0 = (tripRange(co) || {}).start || "";
    lists.forEach(function (x) { x.list = x.list.concat(reservations(x.ci, st0)).sort(function (a, b) { return sortKey("itin", a, b); }); });
  }
  var shown = lists.filter(function (x) { return x.list.length; });
  if (!shown.length) return h + '<p class="empty">Nothing here yet. Add one, or paste a confirmation into Claude.</p>';
  shown.forEach(function (x) {
    if (many) h += '<div class="dest-head"><i style="' + coverStyle(x.ci.name) + '"></i><b>' + esc(x.ci.name) + '</b><span class="meta">' + x.list.length + '</span></div>';
    h += listBody(k, x.ci, x.list, co);
  });
  return h;
}

function renameRow(name) {
  return '<div class="card form" style="margin-top:10px"><div class="row" style="margin:0"><label class="fld g">New name<input id="renameIn" value="' + esc(name) + '"></label><button class="btn pri" data-act="renameSave">Save</button><button class="btn ghost" data-act="renameCancel">Cancel</button></div></div>';
}
function tripHtml(co) {
  var today = todayIso(), city = sel.city && co.cities.filter(function (c) { return c.id === sel.city; })[0];
  if (!city) sel.city = null;
  var cities = city ? [city] : co.cities;
  setCur(co.cur);
  var CUR = getCur(), T = totalsOf(co.cities), bud = parseFloat(co.tbudget) || 0, base = bud || T.all.p, left = base - T.all.s, pct = base ? Math.min(100, T.all.s / base * 100) : 0, done = co.status === "visited";
  var r = tripRange(co), cd = done ? "" : countdown(r, today), n = r ? Math.max(0, Math.round((Date.parse(r.end) - Date.parse(r.start)) / 86400000)) : 0;
  var h = '<section class="hero cover" style="' + coverStyle(co.name) + '"><div class="bar"><button class="back" data-act="home" aria-label="Back to trips">' + icon("back") + '</button><span class="pill glass">' + (done ? icon("check") + 'Completed' : 'Planning') + '</span></div>';
  h += '<div><div class="co">' + esc(co.cities.map(function (c) { return c.name; }).join(" · ") || "Trip") + '</div><h1>' + esc(co.name) + '</h1><div class="when">' + (r ? '<span class="pill glass">' + icon("cal") + esc(rangeText(r)) + '</span>' : '') + (n ? '<span class="pill glass">' + n + (n === 1 ? ' night' : ' nights') + '</span>' : '') + (cd ? '<span class="pill glass">' + esc(cd) + '</span>' : '') + '</div></div>';
  h += '<div class="acts"><button class="btn sm" data-act="toggleDone">' + (done ? 'Reopen trip' : icon("check") + 'Mark trip completed') + '</button><button class="btn sm light" data-act="share">' + icon("share") + 'Share trip</button></div></section>';
  var auto = !co.start && !co.end && r;
  h += '<div class="card dates"><span class="ticon">' + icon("cal") + '</span><label class="fld">From<input type="date" data-tdate="start" value="' + esc(co.start || (auto ? r.start : "")) + '"></label><label class="fld">To<input type="date" data-tdate="end" value="' + esc(co.end || (auto ? r.end : "")) + '"></label><span class="meta">' + (auto ? 'From your bookings' : co.start || co.end ? '<button class="btn sm ghost" data-act="clearDates">Use booking dates</button>' : 'Set the trip dates') + '</span></div>';
  h += '<div class="budget"><div class="stat"><span>Trip budget</span><div class="cur"><input id="tb" data-tb="1" type="number" inputmode="decimal" min="0" placeholder="Set" value="' + esc(co.tbudget) + '" aria-label="Trip budget in ' + esc(CUR) + '"></div><div class="cur" style="margin-top:6px"><span class="meta">Currency</span>' + curInput(co) + '</div></div><div class="stat"><span>Planned</span><b>' + esc(fmt(T.all.p)) + '</b></div><div class="stat"><span>Spent</span><b>' + esc(fmt(T.all.s)) + '</b></div><div class="stat"><span>' + (left < 0 ? 'Over by' : (bud ? 'Left of budget' : 'Left of plan')) + '</span><b style="color:' + (left < 0 ? 'var(--bad)' : 'var(--ink)') + '">' + esc(fmt(Math.abs(left))) + '</b></div></div>';
  h += '<div class="meter bmeter' + (left < 0 ? ' over' : '') + '" role="img" aria-label="' + Math.round(pct) + '% of ' + (bud ? 'trip budget' : 'planned costs') + ' spent"><i style="width:' + pct + '%"></i></div>';
  if (!bud) h += '<p class="note">Set a trip budget to track spending across all destinations. Until then, spending is compared with your planned costs.</p>';
  else if (T.all.p > bud) h += '<p class="note warn">Planned costs are ' + esc(fmt(T.all.p - bud)) + ' over your trip budget.</p>';
  // Destination switcher
  h += '<div class="section" style="margin-top:24px"><h2>Destinations</h2><span class="meta">' + co.cities.length + '</span></div><div class="dests">';
  if (co.cities.length > 1) h += '<button class="dest' + (!city ? ' on' : '') + '" data-act="dest" data-id=""><i style="' + coverStyle(co.name) + '">' + icon("globe") + '</i><span><b>All</b><small>Whole trip</small></span></button>';
  co.cities.forEach(function (ci) { var cr = tripRange(ci); h += '<button class="dest' + (city === ci ? ' on' : '') + '" data-act="dest" data-id="' + ci.id + '"><i style="' + coverStyle(ci.name) + '"></i><span><b>' + esc(ci.name) + '</b><small>' + esc(cr ? rangeText(cr) : (ci.status === "completed" ? "Done" : "No dates")) + '</small></span></button>'; });
  h += '<div class="dest add"><input data-cityin="' + co.id + '" placeholder="Add destination" aria-label="New destination in ' + esc(co.name) + '"><button class="btn sm pri" data-act="addCity" data-id="' + co.id + '" aria-label="Add destination">' + icon("plus") + '</button></div></div>';
  if (city) h += '<div class="dest-bar"><span>Showing <b>' + esc(city.name) + '</b></span>' + (sel.confirmCity === city.id ? '<span class="acts"><button class="btn sm" style="color:var(--bad)" data-act="delCityYes" data-id="' + city.id + '">Remove ' + esc(city.name) + '</button><button class="btn sm ghost" data-act="delCityNo">Cancel</button></span>' : '<span class="acts"><button class="btn sm ghost" style="color:var(--mute)" data-act="rename" data-id="' + city.id + '">' + icon("edit") + 'Rename</button><button class="btn sm ghost" style="color:var(--mute)" data-act="delCity" data-id="' + city.id + '">' + icon("x") + 'Remove destination</button></span>') + '</div>';
  if (city && sel.rename === city.id) h += renameRow(city.name);
  h += '<div class="tabs" role="tablist">';
  Object.keys(TABS).forEach(function (k) {
    var cnt = 0; if (k === "packing") cnt = co.packing.length; else cities.forEach(function (ci) { if (Array.isArray(ci[k])) cnt += ci[k].length; });
    h += '<button class="tab' + (k === sel.tab ? ' on' : '') + '" role="tab" aria-selected="' + (k === sel.tab) + '" data-act="tab" data-id="' + k + '">' + icon(TAB_ICON[k]) + TABS[k].label + (cnt ? '<span class="n">' + cnt + '</span>' : '') + '</button>';
  });
  h += '</div>' + tabHtml(co, cities);
  h += '<div class="danger">' + (sel.confirmDel === co.id ? '<span class="meta">Remove this trip and all its destinations?</span><button class="btn sm" style="color:var(--bad)" data-act="delYes" data-id="' + co.id + '">Remove trip</button><button class="btn sm ghost" data-act="delNo">Cancel</button>' : '<button class="btn sm ghost" style="color:var(--mute)" data-act="rename" data-id="' + co.id + '">' + icon("edit") + 'Rename trip</button><button class="btn sm ghost" style="color:var(--mute)" data-act="delCountry" data-id="' + co.id + '">' + icon("x") + 'Remove trip</button>') + '</div>';
  if (sel.rename === co.id) h += renameRow(co.name);
  return h;
}

export function renderMain() {
  var m = $("main"), co = sel.trip && findTrip(S, sel.trip);
  var h;
  if (sel.view === "brain") h = brainHtml();
  else if (sel.view === "settings") h = settingsHtml();
  else if (sel.view === "world") h = worldHtml();
  else if ((sel.view === "trip" || sel.view === "share") && co) { setCur(co.cur); h = sel.view === "share" ? shareView(co) : tripHtml(co); }
  else { sel.view = "home"; h = homeHtml(); }
  m.innerHTML = h;
  if (sel.view === "trip" && sel.tab === "map" && co) { var cs = sel.city ? co.cities.filter(function (c) { return c.id === sel.city; }) : co.cities; paintMap(co, cs); }
  // Keep the selected tab and destination visible in their sideways-scrolling rows.
  m.querySelectorAll(".tab.on, .dest.on").forEach(function (on) {
    var row = on.parentElement;
    row.scrollLeft = Math.max(0, on.offsetLeft - row.offsetLeft - (row.clientWidth - on.offsetWidth) / 2);
  });
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
  h += '<div class="panel"><div style="display:flex;gap:12px;align-items:center"><span class="ticon">' + icon("home") + '</span><div><h3 style="font:500 1.15rem var(--display)">Home</h3><div class="meta">Where your trips start and end</div></div></div><div class="row"><label class="fld g">Home city<input data-home="1" value="' + esc(S.home) + '" placeholder="e.g. Dubai"></label></div><p class="meta">Claude files a flight back home under the city you leave from, and never makes your home a destination.</p></div>';
  h += '<div class="panel"><div style="display:flex;gap:12px;align-items:center"><span class="ticon">' + icon("key") + '</span><div><h3 style="font:500 1.15rem var(--display)">Claude</h3><div class="meta">' + (has ? 'Connected. Model: ' + esc(MODEL) : 'Not connected') + '</div></div></div>';
  h += '<p class="lede" style="margin-top:12px">Claude powers the Brain Box and packing suggestions. Create an API key in the Claude Console at <a href="https://platform.claude.com/settings/keys" target="_blank" rel="noopener">platform.claude.com</a> and paste it here. The key is stored only on this device and is never included in backups. API use is billed to your Anthropic account, usually a few cents per paste.</p>';
  h += '<div class="row"><label class="fld g">API key<input id="apikey" type="password" autocomplete="off" spellcheck="false" placeholder="' + (has ? 'Saved. Paste a new key to replace it' : 'sk-ant-…') + '"></label><button class="btn pri" data-act="saveKey">Save</button>' + (has ? '<button class="btn" data-act="testKey"' + (ui.keyBusy ? ' disabled' : '') + '>' + (ui.keyBusy ? 'Checking…' : 'Test') + '</button><button class="btn ghost" style="color:var(--bad)" data-act="clearKey">Remove</button>' : '') + '</div></div>';
  var gid = getClientId(), mk = getMapsKey(), origin = esc(location.origin);
  h += '<div class="panel"><div style="display:flex;gap:12px;align-items:center"><span class="ticon">' + icon("map") + '</span><div><h3 style="font:500 1.15rem var(--display)">Google: Maps and Gmail</h3><div class="meta">Maps ' + (mk ? 'on' : 'not set up') + ' · Gmail ' + (gid ? 'on' : 'not set up') + '</div></div></div>'
    + '<p class="lede" style="margin-top:12px">Google Maps shows your places on a map with exact locations. Gmail lets Claude read booking emails, read-only. Both are set up once in the same free Google Cloud project. Keys stay on this device.</p>'
    + '<details class="steps"><summary>Set up both in one go (about 15 minutes)</summary>'
    + '<p class="pkcat" style="margin-left:0">1 · Project and billing</p><ol>'
    + '<li>Open <a href="https://console.cloud.google.com/projectcreate" target="_blank" rel="noopener">Google Cloud Console</a> and create a project called Fernweh.</li>'
    + '<li>Open <a href="https://console.cloud.google.com/billing" target="_blank" rel="noopener">Billing</a> and link a billing account. Maps needs one even though personal use stays inside the free monthly allowance. Optional: under Budgets &amp; alerts, set a small budget so Google emails you if anything is ever charged.</li>'
    + '<li>In <a href="https://console.cloud.google.com/apis/library" target="_blank" rel="noopener">APIs &amp; Services → Library</a>, enable <b>Maps JavaScript API</b>, <b>Places API (New)</b> and <b>Gmail API</b>.</li></ol>'
    + '<p class="pkcat" style="margin-left:0">2 · Maps key</p><ol>'
    + '<li>In <a href="https://console.cloud.google.com/apis/credentials" target="_blank" rel="noopener">Credentials</a>, choose Create credentials → <b>API key</b>.</li>'
    + '<li>Edit the key. Under Application restrictions choose <b>Websites</b> and add <code>' + origin + '/*</code>. Under API restrictions choose <b>Maps JavaScript API</b> and <b>Places API (New)</b>. Save.</li>'
    + '<li>Copy the key into <b>Google Maps key</b> below.</li></ol>'
    + '<p class="pkcat" style="margin-left:0">3 · Gmail client ID</p><ol>'
    + '<li>Open <a href="https://console.cloud.google.com/auth/overview" target="_blank" rel="noopener">Google Auth Platform</a>, click Get started, name the app Fernweh, choose <b>External</b>, and enter your email.</li>'
    + '<li>Under <b>Audience</b>, add your own Gmail address as a <b>test user</b>.</li>'
    + '<li>Under <b>Clients</b>, create a client of type <b>Web application</b>. Under Authorized JavaScript origins, add <code>' + origin + '</code>.</li>'
    + '<li>Copy the <b>Client ID</b> (it ends in .apps.googleusercontent.com) into <b>Gmail client ID</b> below.</li></ol>'
    + '<p class="meta">When you first connect Gmail, Google warns that the app is unverified. That is expected for an app only you use: choose Continue.</p></details>'
    + '<div class="row"><label class="fld g">Google Maps key<input id="mapskey" type="password" autocomplete="off" spellcheck="false" placeholder="' + (mk ? 'Saved. Paste a new key to replace it' : 'AIza…') + '"></label><button class="btn pri" data-act="saveMaps">Save</button>' + (mk ? '<button class="btn ghost" style="color:var(--bad)" data-act="clearMaps">Remove</button>' : '') + '</div>'
    + '<div class="row"><label class="fld g">Gmail client ID<input id="gclient" value="' + esc(gid) + '" placeholder="1234-abc.apps.googleusercontent.com" autocomplete="off" spellcheck="false"></label><button class="btn pri" data-act="saveGmail">Save</button>' + (gid ? '<button class="btn ghost" style="color:var(--bad)" data-act="clearGmail">Remove</button>' : '') + '</div>' + (gid ? '<p class="meta">Gmail sync skips emails it has read before. <button class="link2" data-act="gmailForget">Read all again next time</button></p>' : '') + '</div>';
  h += '<div class="panel"><div style="display:flex;gap:12px;align-items:center"><span class="ticon">' + icon("plus") + '</span><div><h3 style="font:500 1.15rem var(--display)">Add trips from a file</h3><div class="meta">Adds to your journal. Nothing is replaced.</div></div></div><p class="lede" style="margin-top:12px">Use this for a Fernweh file of past trips. Trips and destinations with the same name are combined, and adding the same file twice does not duplicate anything.</p><div class="row"><button class="btn pri" data-act="mergePick">' + icon("upload") + 'Choose file</button><input type="file" id="mergeFile" accept=".json,application/json" hidden></div></div>';
  h += '<div class="panel"><div style="display:flex;gap:12px;align-items:center"><span class="ticon acc">' + icon("upload") + '</span><div><h3 style="font:500 1.15rem var(--display)">Backup and restore</h3><div class="meta">Your journal is saved on this device</div></div></div><p class="lede" style="margin-top:12px">Download a copy now and then. To move your trips to another device, copy this text and paste it into Restore there.</p><textarea id="bk" aria-label="Backup data" style="margin-top:12px;min-height:140px">' + esc(JSON.stringify(S)) + '</textarea><div class="row"><button class="btn pri" data-act="dlBackup">Download backup</button><button class="btn" data-act="restore">Restore from text</button></div></div>';
  return h;
}

/* ---------- Share ---------- */
function shareView(co) {
  var f = tripShare(co), city = f.city, items = shareItems(city), cats = catsOf(items), done = co.status === "visited";
  var h = '<section class="hero cover" style="' + coverStyle(city.name) + ';min-height:170px"><div class="bar"><button class="back" data-act="closeView" aria-label="Back to trip">' + icon("back") + '</button><span class="pill glass">Share</span></div><div><div class="co">' + esc(f.c.name) + '</div><h1>' + esc(city.name) + '</h1></div></section>';
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

/* ---------- Gmail import ---------- */
function gmailHtml() {
  var g = ui.gmail, h = '<div class="panel gmail"><div style="display:flex;gap:12px;align-items:center"><span class="ticon">' + icon("mail") + '</span><div style="flex:1"><h3 style="font:500 1.15rem var(--display)">Sync from Gmail</h3><div class="meta">Reads emails titled "your reservation", "your itinerary", "your booking" and similar, and files the bookings into your trips</div></div></div>';
  if (!getClientId()) return h + '<p class="meta" style="margin-top:10px">Set up Gmail once in Settings first.</p><div class="row"><button class="btn sm" data-act="settings">Open Settings</button></div></div>';
  if (!getApiKey()) return h + '<p class="meta" style="margin-top:10px">Connect Claude in Settings first. Claude reads the emails.</p><div class="row"><button class="btn sm" data-act="settings">Open Settings</button></div></div>';
  h += '<div class="row"><label class="fld">Look back<select id="gmonths">' + [["1", "1 month"], ["3", "3 months"], ["6", "6 months"], ["12", "1 year"], ["36", "3 years"]].map(function (o) { return '<option value="' + o[0] + '"' + (g.months === o[0] ? ' selected' : '') + '>' + o[1] + '</option>'; }).join("") + '</select></label><button class="btn acc" data-act="gmailSync"' + (g.busy ? ' disabled' : '') + '>' + icon("mail") + (g.busy ? esc(g.status || 'Working…') : 'Sync from Gmail') + '</button></div>';
  if (g.err) h += '<p class="err">' + esc(g.err) + '</p>';
  var r = g.result;
  if (r) {
    if (!r.emails) h += '<p class="meta" style="margin-top:6px">' + (r.found ? 'No new booking emails. All ' + r.found + ' found were synced before.' : 'No booking emails found in that period.') + '</p>';
    else {
      h += '<div class="syncres"><b>Read ' + r.emails + (r.emails === 1 ? ' email' : ' emails') + ': ' + r.added.length + ' added, ' + r.updated.length + ' updated.</b>';
      var label = { trans: "Transport", stays: "Stay", itin: "Activity", food: "Table" };
      var line = function (x, how) { return '<li><span class="pill ' + (how === "added" ? "ok" : "brand") + '">' + how + '</span> ' + esc(label[x.list] || x.list) + ': <b>' + esc(x.title) + '</b> <span class="meta">' + esc(x.trip + " › " + x.city) + '</span></li>'; };
      if (r.added.length || r.updated.length) h += '<ul>' + r.added.map(function (x) { return line(x, "added"); }).join("") + r.updated.map(function (x) { return line(x, "updated"); }).join("") + '</ul>';
      else h += '<p class="meta">These emails had no new booking details.</p>';
      h += '<div class="acts">' + (g.undo ? '<button class="btn sm" data-act="gmailUndo">Undo this sync</button>' : '') + (r.more ? '<button class="btn sm pri" data-act="gmailSync">Sync ' + r.more + ' more</button>' : '') + '</div></div>';
    }
  }
  return h + '</div>';
}

/* ---------- Brain Box (Claude) ---------- */
function brainHtml() {
  var h = '<section class="claude-hero"><div class="eyebrow" style="color:rgba(255,255,255,.8)">Brain Box · Claude</div><h1>Paste it, Claude sorts it</h1><p>Paste plans, a booking email, a bank SMS or notes from an old trip, or upload a spreadsheet. Claude files everything under the right trip, destination and tab, and reads status, booking and provider from your text.</p></section>';
  if (!getApiKey()) h += '<div class="keynote">' + icon("key") + '<div><b>Connect Claude first.</b> Add your Claude API key in Settings. It stays on this device.<div style="margin-top:8px"><button class="btn sm pri" data-act="settings">Open Settings</button></div></div></div>';
  h += gmailHtml();
  h += '<div class="chips" style="margin-top:16px">' + SAMPLES.map(function (s, i) { return '<button class="chip" data-act="sample" data-id="' + i + '">Try: ' + s[0] + '</button>'; }).join("") + '</div>';
  h += '<div class="panel" style="margin-top:6px"><textarea id="brainIn" aria-label="Plans or bookings" placeholder="e.g. Lisbon, Portugal 12–16 March. Emirates EK191 DXB to LIS, booked, 2,400. Hotel Avenida via Booking.com, conf. 88213, 540, paid. Day 2: Sintra day trip, not booked yet.">' + esc(brain.text) + '</textarea>';
  h += '<div class="row"><button class="btn sm" data-act="pickFile">' + icon("upload") + 'Upload a file</button><input type="file" id="brainFile" accept=".csv,.tsv,.txt,.md,.json,.eml,.xlsx,.xls,.docx" hidden><span class="meta">Excel, Word, CSV or text. PDFs: paste the text instead.</span></div>';
  h += '<label class="check"><input type="checkbox" data-act="bdone"' + (brain.done ? ' checked' : '') + '><span>These are past trips. Mark them as completed, booked and spent, and add them to my passport.</span></label>';
  h += '<div class="row" style="margin-bottom:0"><button class="btn acc" data-act="organise"' + (brain.busy ? ' disabled' : '') + '>' + icon("sparkle") + (brain.busy ? esc(brain.status || 'Claude is sorting…') : 'Sort it with Claude') + '</button><button class="btn ghost" data-act="home">Cancel</button></div>';
  if (brain.err) h += '<p class="err">' + esc(brain.err) + '</p>';
  var r = brain.res;
  if (r) {
    var L = [['itin', 'activities'], ['trans', 'transport'], ['stays', 'stays'], ['food', 'restaurants'], ['places', 'places'], ['budget', 'costs'], ['packing', 'packing items']];
    h += '<div class="divider"></div><h3 style="font:500 1.2rem var(--display)">Ready to add to ' + esc(citiesOf(r)) + '</h3><p class="meta">' + L.map(function (p) { return r[p[0]].length + ' ' + p[1]; }).join(' · ') + (r.notes ? ' · notes' : '') + '</p>';
    ['trans', 'stays', 'itin', 'food', 'budget'].forEach(function (k) {
      r[k].slice(0, 8).forEach(function (it) {
        h += '<div class="preview"><span class="ticon' + (k === "budget" ? ' acc' : '') + '">' + icon(k === "trans" ? (it.mode || "Flight") : k === "budget" ? "wallet" : k === "food" ? "fork" : KIND_ICON[k]) + '</span><div style="min-width:0"><b>' + esc(title(k, it)) + '</b><div class="meta">' + esc(it.city) + ', ' + esc(it.country) + '</div>' + (BOOKABLE.indexOf(k) >= 0 ? '<div class="badges"><span class="pill ' + (it.status === 'confirmed' ? 'ok' : 'warn') + '">' + (it.status === 'confirmed' ? 'Confirmed' : 'Tentative') + '</span><span class="pill ' + (it.booked === 'yes' ? 'ok' : '') + '">' + (it.booked === 'yes' ? 'Booked' : 'Not booked') + '</span>' + (it.via ? '<span class="pill brand">via ' + esc(it.via) + '</span>' : '') + '</div>' : '<div class="meta">' + esc(k === 'food' ? [it.type, michelinLabel(it.michelin), it.best50 === 'yes' ? "World's 50 Best" : '', it.status === 'visited' ? 'Visited' : 'Want to visit'].filter(Boolean).join(' · ') : (it.cat || '') + (it.spent ? ' · spent ' + it.spent : '')) + '</div>') + '</div></div>';
      });
    });
    h += '<div class="row"><button class="btn pri" data-act="applyBrain">' + icon("check") + 'Add to journal</button><button class="btn" data-act="discardBrain">Discard</button></div>';
  }
  return h + '</div>';
}
