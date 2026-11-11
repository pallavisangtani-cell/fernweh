// The live journal plus UI state. S is never reassigned, so every module that imports it sees the same object.
import { KEY } from "./constants.js";
import { fix } from "./model.js";

export const S = { countries: [] };
export const sel = { trip: null, city: null, confirmCity: null, tab: "over", view: "home", form: false, confirmDel: null, pcat: "All", pf: "all", fstat: "all", ftype: "All", faward: "", shareText: "" };
export const brain = { text: "", busy: false, err: "", res: null, done: false, status: "" };
export const shareOpt = { itin: true, costs: false, cat: "All" };
export const ui = { packBusy: false, keyBusy: false, weather: {}, gmail: { busy: false, list: null, picked: {}, err: "", months: "6", status: "" } };

/** Replace the journal contents in place (used by load and restore). */
export function replaceState(d) {
  Object.keys(S).forEach(function (k) { delete S[k]; });
  Object.assign(S, d);
  fix(S);
}

export function load() {
  try { var raw = localStorage.getItem(KEY); if (raw) replaceState(JSON.parse(raw)); } catch (e) {}
  fix(S);
}

export function save() {
  try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) {}
}
