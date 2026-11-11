// Everything that talks to the outside world: Claude, file downloads and reading uploads.
import { XLSX_SRC, MAMMOTH_SRC } from "./constants.js";

/* ---------- Claude ---------- */
// The API key lives only in this browser, under its own key, so it never ends up in a backup.
const KEY_STORE = "fernweh-claude-key";
export const MODEL = "claude-opus-5-5";
const SDK_SRC = "../vendor/anthropic-sdk-1.5.0.js";

export function getApiKey() { try { return localStorage.getItem(KEY_STORE) || ""; } catch (e) { return ""; } }
export function setApiKey(k) { try { if (k) localStorage.setItem(KEY_STORE, k); else localStorage.removeItem(KEY_STORE); } catch (e) {} }

var sdk = null;
async function client() {
  var key = getApiKey();
  if (!key) { var e = new Error("Add your Claude API key in Settings to use this."); e.code = "no_key"; throw e; }
  if (!sdk) sdk = (await import(SDK_SRC)).default;
  // The key is the user's own and stays on their device, which is why browser use is allowed here.
  return { Anthropic: sdk, c: new sdk({ apiKey: key, dangerouslyAllowBrowser: true }) };
}

/**
 * Ask Claude for JSON that matches `schema` (structured outputs). Returns the parsed object.
 * effort: "low" | "medium" | "high". Server-side fallbacks retry on another model if this one declines.
 */
export async function claudeJson(prompt, schema, effort) {
  var x = await client(), msg;
  try {
    msg = await x.c.beta.messages.create({
      model: MODEL,
      max_tokens: 16000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: { effort: effort || "medium", format: { type: "json_schema", schema: schema } },
      messages: [{ role: "user", content: prompt }]
    });
  } catch (e) { throw friendly(x.Anthropic, e); }
  if (msg.stop_reason === "refusal") throw new Error("Claude declined to process this text. Try removing anything unrelated to your trip.");
  if (msg.stop_reason === "max_tokens") throw new Error("That was too much to sort in one go. Try pasting a smaller part.");
  var text = msg.content.filter(function (b) { return b.type === "text"; }).map(function (b) { return b.text; }).join("");
  try { return JSON.parse(text); } catch (e) { throw new Error("Claude's answer could not be read. Try again."); }
}

/** A tiny request to check the saved key works. */
export async function testKey() {
  var x = await client();
  try { await x.c.messages.create({ model: MODEL, max_tokens: 16, output_config: { effort: "low" }, messages: [{ role: "user", content: "Reply with OK." }] }); }
  catch (e) { throw friendly(x.Anthropic, e); }
}

function friendly(A, e) {
  if (e instanceof A.AuthenticationError) return new Error("Claude did not accept that API key. Check it in Settings.");
  if (e instanceof A.PermissionDeniedError) return new Error("That API key is not allowed to use this model.");
  if (e instanceof A.RateLimitError) return new Error("Too many requests. Wait a moment and try again.");
  if (e instanceof A.APIConnectionError) return new Error("Could not reach Claude. Check your connection.");
  if (e instanceof A.BadRequestError && /credit balance/i.test(e.message || "")) return new Error("Your Anthropic account is out of credits. Add credits in the Claude Console under Billing.");
  if (e instanceof A.APIError) return new Error("Claude returned an error" + (e.status ? " (" + e.status + ")" : "") + ". Try again.");
  return e;
}

export function aiError(e) { return (e && e.message) || "Something went wrong. Try again."; }

/* ---------- Files ---------- */
/** Download text as a file. Returns a message for a toast. */
export async function saveFile(name, data, type) {
  try {
    var url = URL.createObjectURL(new Blob([data], { type: (type || "text/plain") + ";charset=utf-8" }));
    var a = document.createElement("a");
    a.href = url; a.download = name; a.style.display = "none";
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
    return "Saved " + name;
  } catch (e) { return "Could not save the file."; }
}

function loadScript(src) {
  return new Promise(function (res, rej) {
    var s = document.createElement("script");
    s.src = src; s.onload = res;
    s.onerror = function () { rej(new Error("Could not load the file reader. Paste the text instead.")); };
    document.head.appendChild(s);
  });
}

export async function readUpload(file) {
  var ext = (file.name.split(".").pop() || "").toLowerCase();
  if (["csv", "tsv", "txt", "md", "json", "eml"].indexOf(ext) >= 0) return await file.text();
  if (ext === "xlsx" || ext === "xls") {
    if (!window.XLSX) await loadScript(XLSX_SRC);
    var wb = window.XLSX.read(await file.arrayBuffer(), { type: "array" });
    return wb.SheetNames.map(function (n) { return "## Sheet: " + n + "\n" + window.XLSX.utils.sheet_to_csv(wb.Sheets[n]); }).join("\n\n");
  }
  if (ext === "docx") {
    if (!window.mammoth) await loadScript(MAMMOTH_SRC);
    var r = await window.mammoth.extractRawText({ arrayBuffer: await file.arrayBuffer() });
    return r.value;
  }
  throw new Error("That file type is not supported. Use Excel, Word, CSV or text, or paste the text.");
}
