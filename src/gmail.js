// Read booking emails from Gmail, straight from the browser, with read-only access.
// Sign-in uses Google Identity Services with the user's own OAuth client ID (Settings). No server involved:
// emails go Gmail -> this device -> Claude, and nothing is stored except what the user adds to the journal.
const GIS_SRC = "https://accounts.google.com/gsi/client";
const API = "https://gmail.googleapis.com/gmail/v1/users/me";
const SCOPE = "https://www.googleapis.com/auth/gmail.readonly";
const ID_STORE = "fernweh-gmail-client";

export function getClientId() { try { return localStorage.getItem(ID_STORE) || ""; } catch (e) { return ""; } }
export function setClientId(v) { try { if (v) localStorage.setItem(ID_STORE, v); else localStorage.removeItem(ID_STORE); } catch (e) {} }

/** Gmail search for confirmations. `months` limits how far back to look. */
export function bookingQuery(months) {
  return "newer_than:" + (months || 6) + "m -category:promotions -category:social "
    + "(subject:(booking OR booked OR confirmation OR confirmed OR reservation OR itinerary OR e-ticket OR eticket OR \"boarding pass\" OR receipt) "
    + "OR from:(booking.com OR airbnb OR expedia OR agoda OR hotels.com OR trip.com OR emirates OR flydubai OR etihad OR qatarairways OR lufthansa OR britishairways OR klm OR airfrance OR opentable OR resy OR sevenrooms OR thefork OR getyourguide OR viator OR trainline OR bahn OR eurostar OR uber))";
}

/** Base64url (as Gmail sends it) to a UTF-8 string. */
export function decodeB64url(s) {
  var b = String(s || "").replace(/-/g, "+").replace(/_/g, "/");
  while (b.length % 4) b += "=";
  var bin = atob(b), bytes = new Uint8Array(bin.length);
  for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new TextDecoder("utf-8").decode(bytes);
}

export function htmlToText(h) {
  return String(h || "")
    .replace(/<(style|script|head)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<br\s*\/?>|<\/(p|div|tr|li|h\d|table)>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ").replace(/&amp;/gi, "&").replace(/&lt;/gi, "<").replace(/&gt;/gi, ">").replace(/&quot;/gi, '"').replace(/&#39;|&apos;/gi, "'")
    .replace(/[ \t ]+/g, " ").replace(/\s*\n\s*/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
}

/** The readable text of a Gmail message payload: plain text if there is any, otherwise the HTML as text. */
export function extractText(payload) {
  var plain = [], html = [];
  (function walk(p) {
    if (!p) return;
    if (p.mimeType === "text/plain" && p.body && p.body.data) plain.push(decodeB64url(p.body.data));
    else if (p.mimeType === "text/html" && p.body && p.body.data) html.push(decodeB64url(p.body.data));
    (p.parts || []).forEach(walk);
  })(payload);
  var t = plain.join("\n").trim();
  return t.length > 80 ? t : htmlToText(html.join("\n")) || t;
}

export function header(payload, name) {
  var h = ((payload && payload.headers) || []).filter(function (x) { return x.name.toLowerCase() === name.toLowerCase(); })[0];
  return h ? h.value : "";
}

/** Text Claude gets for one email, trimmed so a long newsletter-style email does not crowd out the rest. */
export function emailForClaude(m, max) {
  var body = m.text.length > (max || 6000) ? m.text.slice(0, max || 6000) + "\n[…]" : m.text;
  return "## Email: " + m.subject + "\nFrom: " + m.from + "\nDate: " + m.date + "\n\n" + body;
}

/* ---------- Network ---------- */
function loadGis() {
  if (window.google && window.google.accounts && window.google.accounts.oauth2) return Promise.resolve();
  return new Promise(function (res, rej) {
    var s = document.createElement("script"); s.src = GIS_SRC; s.async = true;
    s.onload = function () { res(); };
    s.onerror = function () { rej(new Error("Could not load Google sign-in. Check your connection.")); };
    document.head.appendChild(s);
  });
}

var token = null, tokenUntil = 0;
/** Ask Google for a short-lived read-only token. Opens Google's sign-in popup when needed. */
export async function signIn() {
  if (token && Date.now() < tokenUntil) return token;
  var id = getClientId();
  if (!id) { var e = new Error("Add your Google client ID in Settings to connect Gmail."); e.code = "no_client"; throw e; }
  await loadGis();
  return new Promise(function (res, rej) {
    var tc = window.google.accounts.oauth2.initTokenClient({
      client_id: id, scope: SCOPE,
      callback: function (r) {
        if (r.error) { rej(new Error(r.error === "access_denied" ? "Gmail access was not allowed." : "Google sign-in failed (" + r.error + ").")); return; }
        token = r.access_token; tokenUntil = Date.now() + ((r.expires_in || 3600) - 60) * 1000; res(token);
      },
      error_callback: function (err) { rej(new Error(err && err.type === "popup_closed" ? "Google sign-in was closed." : "Google sign-in failed. If you are on iPhone, allow pop-ups for this site.")); }
    });
    tc.requestAccessToken();
  });
}
export function signOut() {
  if (token && window.google && window.google.accounts) window.google.accounts.oauth2.revoke(token, function () {});
  token = null; tokenUntil = 0;
}

async function api(path) {
  var r = await fetch(API + path, { headers: { Authorization: "Bearer " + token } });
  if (r.status === 401) { token = null; throw new Error("Your Gmail sign-in expired. Try again."); }
  if (!r.ok) throw new Error("Gmail returned an error (" + r.status + ").");
  return r.json();
}

/** Find likely booking emails. Returns [{id, subject, from, date, snippet}] newest first. */
export async function findBookings(months, max) {
  await signIn();
  var list = await api("/messages?maxResults=" + (max || 40) + "&q=" + encodeURIComponent(bookingQuery(months)));
  var ids = (list.messages || []).map(function (m) { return m.id; });
  var out = [];
  for (var i = 0; i < ids.length; i++) {
    var m = await api("/messages/" + ids[i] + "?format=metadata&metadataHeaders=Subject&metadataHeaders=From&metadataHeaders=Date");
    out.push({ id: m.id, subject: header(m.payload, "Subject") || "(no subject)", from: header(m.payload, "From").replace(/<[^>]+>/, "").replace(/"/g, "").trim(), date: header(m.payload, "Date"), snippet: m.snippet || "" });
  }
  return out;
}

/** Full text of the chosen emails. */
export async function readEmails(ids) {
  await signIn();
  var out = [];
  for (var i = 0; i < ids.length; i++) {
    var m = await api("/messages/" + ids[i] + "?format=full");
    out.push({ id: m.id, subject: header(m.payload, "Subject"), from: header(m.payload, "From"), date: header(m.payload, "Date"), text: extractText(m.payload) });
  }
  return out;
}
