// Entry point: event wiring and the actions that change state.
import { TABS, STARTER, SAMPLES } from "./constants.js";
import { uid, arr, slug } from "./util.js";
import { findCity, findTrip, newCity, newTrip, mergeJournal } from "./model.js";
import { buildPrompt, normRes, mergeRes, chunkText, isRoutable, markPast, applyResult, BRAIN_SCHEMA, PACK_SCHEMA, packPrompt } from "./brain.js";
import { buildShareDoc, shareText, tripShare } from "./share.js";
import { buildCsv, placesFromCsv } from "./csv.js";
import { claudeJson, aiError, saveFile, readUpload, setApiKey, testKey } from "./platform.js";
import { S, sel, brain, shareOpt, ui, load, save, replaceState } from "./state.js";
import { $, toast, renderTree, renderMain } from "./ui/render.js";

const CHUNK = 12000, MAX_CHUNKS = 6;
// The open trip and, if one is chosen, the destination: {c, city} (city may be null).
const cur = () => { var co = sel.trip && findTrip(S, sel.trip); if (!co) return null; var ci = sel.city && co.cities.filter(function (x) { return x.id === sel.city; })[0]; return { c: co, city: ci || null }; };
// The destination an item belongs to, from its data-cid.
const cityOf = (el) => { var r = el && el.dataset.cid && findCity(S, el.dataset.cid); return r ? r.city : null; };
function openTrip(tripId, cityId, tab) { sel.view = "trip"; sel.trip = tripId; sel.city = cityId || null; sel.form = false; sel.pcat = "All"; sel.confirmDel = null; sel.confirmCity = null; if (tab) sel.tab = tab; renderTree(); renderMain(); window.scrollTo(0, 0); }
function download(name, data, type) { saveFile(name, data, type).then(toast); }

function addPast() {
  var name = $("pc-name").value.trim(); if (!name) { toast("Enter a trip name first."); return; }
  var year = $("pc-year").value.trim(), cs = $("pc-cities").value.split(",").map(function (x) { return x.trim(); }).filter(Boolean), note = $("pc-note").value.trim();
  var co = S.countries.filter(function (c) { return c.name.toLowerCase() === name.toLowerCase(); })[0];
  if (!co) { co = newTrip(name, "visited"); co.year = year; co.note = note; S.countries.push(co); }
  else { co.status = "visited"; if (year) co.year = year; if (note) co.note = note; }
  cs.forEach(function (n) { if (!co.cities.some(function (c) { return c.name.toLowerCase() === n.toLowerCase(); })) co.cities.push(newCity(n, "USD", "completed")); });
  save(); renderTree(); renderMain(); toast(name + " added to your passport.");
}

async function runBrain() {
  var text = brain.text.trim(); if (!text || brain.busy) return;
  brain.busy = true; brain.err = ""; brain.res = null; brain.status = ""; renderMain();
  try {
    var f = cur(), chunks = chunkText(text, CHUNK), capped = chunks.length > MAX_CHUNKS, merged = null;
    if (capped) chunks = chunks.slice(0, MAX_CHUNKS);
    for (var i = 0; i < chunks.length; i++) {
      brain.status = chunks.length > 1 ? "Reading part " + (i + 1) + " of " + chunks.length + "…" : ""; renderMain();
      var r = await claudeJson(buildPrompt(chunks[i], f, brain.done), BRAIN_SCHEMA, "medium");
      var res = normRes(r, f);
      merged = merged ? mergeRes(merged, res) : res;
    }
    if (!isRoutable(merged)) throw new Error('I could not tell which trip and destination this is. Add them to your text, for example "Lisbon, Portugal".');
    if (brain.done) markPast(merged);
    if (capped) toast("That file is long. I read the first part only.");
    brain.res = merged;
  } catch (e) { brain.err = aiError(e); }
  brain.busy = false; brain.status = ""; renderMain();
}

function applyBrain() {
  var r = brain.res; if (!r) return;
  var done = brain.done, main = applyResult(S, r, done);
  brain.text = ""; brain.res = null; save();
  var where = findCity(S, main.id);
  openTrip(where.c.id, where.c.cities.length > 1 ? null : main.id, "over");
  toast(done ? "Past trip added to your journal and passport." : "Added to your journal.");
}

async function suggestPack() {
  var f = cur(); if (!f || !f.city || ui.packBusy) return;
  ui.packBusy = true; renderMain();
  try {
    var have = f.city.packing.map(function (x) { return x.text; }).join(", ");
    var r = await claudeJson(packPrompt(f, have), PACK_SCHEMA, "low");
    arr(r && r.items).slice(0, 15).forEach(function (t) { f.city.packing.push({ id: uid(), text: String(t).trim() }); });
    save();
  } catch (e) { toast(aiError(e)); }
  ui.packBusy = false; renderMain();
}

function importCSV(text) {
  var f = cur(); if (!f || !f.city) { toast("Choose a destination first, then import."); return; }
  var rows = placesFromCsv(text); if (!rows.length) return;
  rows.forEach(function (p) { p.id = uid(); f.city.places.push(p); });
  save(); renderMain(); toast("Places imported. Set a type on each one so they filter when you share.");
}

function importJournal(text) {
  var d; try { d = JSON.parse(text); } catch (e) { toast("That file is not a Fernweh file."); return; }
  if (!d || !Array.isArray(d.countries)) { toast("That file is not a Fernweh file."); return; }
  var n = mergeJournal(S, d); save(); renderTree(); renderMain();
  toast("Added " + n.trips + (n.trips === 1 ? " trip, " : " trips, ") + n.destinations + (n.destinations === 1 ? " destination and " : " destinations and ") + n.items + (n.items === 1 ? " item." : " items."));
}

/** The destination a new item goes to: the chosen one, or the one picked in the form. */
function formCity(f) {
  if (f.city) return f.city;
  var pick = document.querySelector('#form [data-f="__city"]');
  var id = pick ? pick.value : (f.c.cities[0] && f.c.cities[0].id);
  return f.c.cities.filter(function (c) { return c.id === id; })[0] || null;
}

document.addEventListener("click", function (e) {
  var b = e.target.closest("[data-act]"); if (!b) return;
  var a = b.dataset.act, id = b.dataset.id, L = b.dataset.list, f = cur(), ic = cityOf(b);
  if (a === "addCountry") { var i = $("newCountry"), v = i.value.trim(); if (!v) return; var t = newTrip(v); S.countries.push(t); i.value = ""; save(); openTrip(t.id, null, "over"); toast("Trip added. Now add its destinations."); }
  else if (a === "trip") { openTrip(id, null, "over"); }
  else if (a === "pick") { var w = findCity(S, id); if (w) openTrip(w.c.id, id, sel.tab === "over" ? "itin" : sel.tab); }
  else if (a === "dest") { sel.city = id || null; sel.form = false; sel.pcat = "All"; sel.confirmCity = null; renderTree(); renderMain(); }
  else if (a === "delCountry") { sel.confirmDel = id; renderMain(); }
  else if (a === "delNo") { sel.confirmDel = null; renderMain(); }
  else if (a === "delYes") { sel.confirmDel = null; S.countries = S.countries.filter(function (c) { return c.id !== id; }); sel.trip = null; sel.city = null; sel.view = "home"; save(); renderTree(); renderMain(); toast("Trip removed."); }
  else if (a === "delCity") { sel.confirmCity = id; renderMain(); }
  else if (a === "delCityNo") { sel.confirmCity = null; renderMain(); }
  else if (a === "delCityYes" && f) { f.c.cities = f.c.cities.filter(function (c) { return c.id !== id; }); sel.city = null; sel.confirmCity = null; save(); renderTree(); renderMain(); toast("Destination removed."); }
  else if (a === "addCity") { var inp = document.querySelector('[data-cityin="' + id + '"]'), v2 = inp.value.trim(); if (!v2) return; var co = findTrip(S, id), nc = newCity(v2, co.cur, co.status === "visited" ? "completed" : "planning"); co.cities.push(nc); save(); openTrip(co.id, nc.id, sel.tab === "over" ? "itin" : sel.tab); }
  else if (a === "tab") { sel.tab = id; sel.form = false; renderMain(); }
  else if (a === "toggleForm") { sel.form = !sel.form; renderMain(); }
  else if (a === "add" && f) {
    var tc = formCity(f); if (!tc) { toast("Add a destination first."); return; }
    var o = { id: uid() }; document.querySelectorAll("#form [data-f]").forEach(function (x) { if (x.dataset.f !== "__city") o[x.dataset.f] = x.value.trim(); });
    if (!o[TABS[sel.tab].req]) return;
    tc[sel.tab].push(o); sel.form = false; save(); renderTree(); renderMain();
  }
  else if (a === "del" && ic) { ic[L] = ic[L].filter(function (x) { return x.id !== id; }); save(); renderMain(); }
  else if (a === "flip" && ic) {
    ic[L].forEach(function (x) {
      if (x.id !== id) return;
      if (b.dataset.k === "status") x.status = x.status === "confirmed" ? "tentative" : "confirmed";
      else if (b.dataset.k === "visit") x.status = x.status === "visited" ? "want" : "visited";
      else x.booked = x.booked === "yes" ? "no" : "yes";
    });
    save(); renderMain();
  }
  else if (a === "tick" && ic) { ic.packing.forEach(function (x) { if (x.id === id) x.done = b.checked; }); save(); renderMain(); }
  else if (a === "starter" && f && f.city) { STARTER.forEach(function (t) { f.city.packing.push({ id: uid(), text: t }); }); save(); renderMain(); }
  else if (a === "suggestPack") { suggestPack(); }
  else if (a === "importPick") { if (!f || !f.city) { toast("Choose a destination first, then import."); return; } $("csv").click(); }
  else if (a === "pcat") { sel.pcat = id; renderMain(); }
  else if (a === "fstat") { sel.fstat = id; renderMain(); }
  else if (a === "ftype") { sel.ftype = id; renderMain(); }
  else if (a === "faward") { sel.faward = sel.faward === id ? "" : id; renderMain(); }
  else if (a === "toggleDone" && f) {
    var d = f.c.status === "visited"; f.c.status = d ? "planned" : "visited";
    f.c.cities.forEach(function (ci) { ci.status = d ? "planning" : "completed"; });
    save(); renderTree(); renderMain(); toast(d ? "Trip reopened." : "Trip marked as completed and added to your passport.");
  }
  else if (a === "share" && f) { sel.view = "share"; sel.shareText = ""; shareOpt.cat = "All"; renderMain(); window.scrollTo(0, 0); }
  else if (a === "shopt") { shareOpt[b.dataset.k] = b.checked; }
  else if (a === "shcat") { shareOpt.cat = id; renderMain(); }
  else if (a === "dlShare" && f) { download(slug(f.c.name) + "-trip-guide.html", buildShareDoc(tripShare(f.c), shareOpt), "text/html"); }
  else if (a === "dlCsv" && f) { download(slug(f.c.name) + "-trip.csv", buildCsv(tripShare(f.c)), "text/csv"); }
  else if (a === "copyShare" && f) { var t2 = shareText(tripShare(f.c), shareOpt); try { navigator.clipboard.writeText(t2).then(function () { toast("Copied to clipboard."); }, function () { sel.shareText = t2; renderMain(); }); } catch (x) { sel.shareText = t2; renderMain(); } }
  else if (a === "cstatus") { S.countries.forEach(function (c) { if (c.id === id) c.status = c.status === "visited" ? "planned" : "visited"; }); save(); renderTree(); renderMain(); }
  else if (a === "pf") { sel.pf = id; renderMain(); }
  else if (a === "addPast") { addPast(); }
  else if (a === "world" || a === "home" || a === "settings" || a === "brain") { sel.view = a; sel.confirmDel = null; renderTree(); renderMain(); window.scrollTo(0, 0); }
  else if (a === "saveKey") { var k = $("apikey").value.trim(); if (!k) { toast("Paste your API key first."); return; } setApiKey(k); renderMain(); toast("Claude key saved on this device."); }
  else if (a === "clearKey") { setApiKey(""); renderMain(); toast("Claude key removed from this device."); }
  else if (a === "testKey") { ui.keyBusy = true; renderMain(); testKey().then(function () { toast("Claude is connected and working."); }, function (err) { toast(aiError(err)); }).then(function () { ui.keyBusy = false; renderMain(); }); }
  else if (a === "backup") { sel.view = "settings"; renderTree(); renderMain(); }
  else if (a === "dlBackup") { download("fernweh-backup-" + new Date().toISOString().slice(0, 10) + ".json", JSON.stringify(S, null, 2), "application/json"); }
  else if (a === "mergePick") { $("mergeFile").click(); }
  else if (a === "closeView") { sel.view = "trip"; sel.shareText = ""; renderTree(); renderMain(); }
  else if (a === "sample") { brain.text = SAMPLES[+id][1]; renderMain(); }
  else if (a === "bdone") { brain.done = b.checked; }
  else if (a === "pickFile") { $("brainFile").click(); }
  else if (a === "organise") { runBrain(); }
  else if (a === "applyBrain") { applyBrain(); }
  else if (a === "discardBrain") { brain.res = null; renderMain(); }
  else if (a === "restore") { try { var d2 = JSON.parse($("bk").value); if (!d2 || !Array.isArray(d2.countries)) throw 0; replaceState(d2); sel.trip = null; sel.city = null; sel.view = "home"; save(); renderTree(); renderMain(); toast("Journal restored."); } catch (x) { toast("That text is not a valid backup."); } }
});

document.addEventListener("change", function (e) {
  var t = e.target, f = cur(), ic = cityOf(t);
  if (t.id === "csv" && t.files[0]) { var r = new FileReader(); r.onload = function () { importCSV(String(r.result)); }; r.readAsText(t.files[0]); t.value = ""; }
  else if (t.id === "mergeFile" && t.files[0]) { var r2 = new FileReader(); r2.onload = function () { importJournal(String(r2.result)); }; r2.readAsText(t.files[0]); t.value = ""; }
  else if (t.id === "brainFile" && t.files[0]) {
    var file = t.files[0]; t.value = "";
    readUpload(file).then(function (txt) { brain.text = (brain.text ? brain.text + "\n\n" : "") + "## File: " + file.name + "\n" + txt; brain.err = ""; renderMain(); toast("Loaded " + file.name + " (" + txt.length.toLocaleString() + " characters)."); }).catch(function (err) { brain.err = (err && err.message) || "Could not read that file."; renderMain(); });
  }
  else if (t.dataset && t.dataset.spent && ic) { ic[t.dataset.list].forEach(function (x) { if (x.id === t.dataset.spent) x.spent = t.value; }); save(); renderMain(); }
  else if (t.dataset && t.dataset.cur && f) { f.c.cur = t.value.trim().toUpperCase().slice(0, 4) || "USD"; save(); renderMain(); }
  else if (t.dataset && t.dataset.tb && f) { f.c.tbudget = t.value; save(); renderMain(); }
  else if (t.dataset && t.dataset.cyear) { S.countries.forEach(function (c) { if (c.id === t.dataset.cyear) c.year = t.value.trim(); }); save(); renderTree(); }
  else if (t.dataset && t.dataset.cnote) { S.countries.forEach(function (c) { if (c.id === t.dataset.cnote) c.note = t.value.trim(); }); save(); }
});

document.addEventListener("input", function (e) {
  var t = e.target;
  if (t.id === "brainIn") { brain.text = t.value; return; }
  if (t.dataset && t.dataset.notes) { var w = findCity(S, t.dataset.notes); if (w) { w.city.notes = t.value; save(); } }
});

document.addEventListener("keydown", function (e) {
  if (e.key !== "Enter") return; var t = e.target;
  if (t.id === "newCountry") document.querySelector('[data-act="addCountry"]').click();
  else if (t.dataset && t.dataset.cityin) t.nextElementSibling.click();
  else if (t.dataset && t.dataset.f) document.querySelector('[data-act="add"]').click();
});

load();
renderTree();
renderMain();

if ("serviceWorker" in navigator && location.protocol !== "file:") {
  navigator.serviceWorker.register("sw.js").catch(function () {});
}
