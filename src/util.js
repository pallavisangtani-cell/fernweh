// Small pure helpers shared by every module. No DOM or storage access here.

let CUR = "USD";
export function setCur(c) { CUR = c || "USD"; }
export function getCur() { return CUR; }

export function uid() { return Math.random().toString(36).slice(2, 9); }
export function esc(s) {
  return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) {
    return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c];
  });
}
export function arr(v) { return Array.isArray(v) ? v : []; }
export function planned(it) {
  var v = (it.cost !== undefined && it.cost !== "") ? it.cost : it.amount;
  return parseFloat(v) || 0;
}
export function spentOf(it) { return parseFloat(it.spent) || 0; }
export function fmt(n) {
  return CUR + " " + (+n || 0).toLocaleString(undefined, { maximumFractionDigits: 2 });
}
export function slug(s) {
  return String(s || "trip").normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "trip";
}
export function mapsUrl(name, city) {
  return "https://www.google.com/maps/search/?api=1&query=" + encodeURIComponent(name + ", " + city);
}
