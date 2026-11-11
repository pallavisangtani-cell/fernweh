// Google Maps inside the app: the user's own Maps Platform key (Settings, kept on this device only).
// Place search (Places API, New) finds each stay, restaurant and place once and stores its location on the item
// as geo: {lat, lng, addr, url}. The Map tab then shows them as coloured pins.
const KEY_STORE = "fernweh-maps-key";
export const MAP_ID = "DEMO_MAP_ID"; // Google's shared map ID for advanced markers; fine for personal use.
export const KIND_STYLE = {
  stays: { label: "Stays", color: "#0e6b72" },
  food: { label: "Restaurants", color: "#e2643f" },
  places: { label: "Places", color: "#5a3e9b" }
};

export function getMapsKey() { try { return localStorage.getItem(KEY_STORE) || ""; } catch (e) { return ""; } }
export function setMapsKey(k) { try { if (k) localStorage.setItem(KEY_STORE, k); else localStorage.removeItem(KEY_STORE); } catch (e) {} }

/** Items that can be pinned, for the given destinations: [{kind, item, city}]. */
export function pinnable(cities, kinds) {
  var out = [];
  cities.forEach(function (ci) {
    (kinds || Object.keys(KIND_STYLE)).forEach(function (k) { (ci[k] || []).forEach(function (it) { if (it.name) out.push({ kind: k, item: it, city: ci }); }); });
  });
  return out;
}
export function missingGeo(cities, kinds) { return pinnable(cities, kinds).filter(function (x) { return !x.item.geo; }); }
export function pins(cities, kinds) {
  return pinnable(cities, kinds).filter(function (x) { return x.item.geo && isFinite(x.item.geo.lat) && isFinite(x.item.geo.lng); });
}
/** What Google is asked for: the name plus its destination, so "Den" finds the restaurant in Tokyo. */
export function searchText(name, city, area) { return [name, area, city].filter(Boolean).join(", "); }

/* ---------- Google ---------- */
var loading = null;
export function loadMaps() {
  if (window.google && window.google.maps && window.google.maps.importLibrary) return Promise.resolve(window.google.maps);
  if (loading) return loading;
  var key = getMapsKey();
  if (!key) { var e = new Error("Add your Google Maps key in Settings to see the map."); e.code = "no_key"; return Promise.reject(e); }
  loading = new Promise(function (res, rej) {
    window.__fernwehMaps = function () { res(window.google.maps); };
    window.gm_authFailure = function () { window.__fernwehMapsAuth = true; };
    var s = document.createElement("script");
    s.src = "https://maps.googleapis.com/maps/api/js?key=" + encodeURIComponent(key) + "&v=weekly&loading=async&libraries=places,marker&callback=__fernwehMaps";
    s.async = true;
    s.onerror = function () { loading = null; rej(new Error("Could not load Google Maps. Check your connection.")); };
    document.head.appendChild(s);
  });
  return loading;
}
export function authFailed() { return !!window.__fernwehMapsAuth; }

/** Find one place with Google. Returns {lat, lng, addr, url} or null when Google finds nothing. */
export async function findPlace(text) {
  await loadMaps();
  var lib = await window.google.maps.importLibrary("places");
  var r = await lib.Place.searchByText({ textQuery: text, fields: ["displayName", "location", "formattedAddress", "googleMapsURI"], maxResultCount: 1 });
  var p = r && r.places && r.places[0];
  if (!p || !p.location) return null;
  return { lat: p.location.lat(), lng: p.location.lng(), addr: p.formattedAddress || "", url: p.googleMapsURI || "" };
}

/** Draw the map into `el` with one pin per entry from pins(). */
export async function drawMap(el, list, onOpen) {
  await loadMaps();
  var maps = await window.google.maps.importLibrary("maps"), marker = await window.google.maps.importLibrary("marker");
  var map = new maps.Map(el, { mapId: MAP_ID, center: { lat: list[0].item.geo.lat, lng: list[0].item.geo.lng }, zoom: 13, gestureHandling: "greedy", mapTypeControl: false, streetViewControl: false, fullscreenControl: true });
  var info = new maps.InfoWindow(), bounds = new window.google.maps.LatLngBounds();
  list.forEach(function (x) {
    var st = KIND_STYLE[x.kind], pos = { lat: x.item.geo.lat, lng: x.item.geo.lng };
    var pin = new marker.PinElement({ background: st.color, borderColor: "#ffffff", glyphColor: "#ffffff", scale: x.kind === "stays" ? 1.15 : 1 });
    var m = new marker.AdvancedMarkerElement({ map: map, position: pos, title: x.item.name, content: pin.element, gmpClickable: true });
    m.addListener("click", function () { info.setContent(onOpen(x)); info.open({ map: map, anchor: m }); });
    bounds.extend(pos);
  });
  if (list.length > 1) map.fitBounds(bounds, 48);
  return map;
}
