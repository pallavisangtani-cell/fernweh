// Everything that depends on where the app runs: AI calls, file saving and file reading.
// This is the seam to replace when moving off claude.ai Artifacts (see CLAUDE.md):
// swap sampleJson() for a Claude API call with structured output, and saveFile() for a normal download.
import { XLSX_SRC, MAMMOTH_SRC } from "./constants.js";

export async function cap(n) {
  try { return window.claude && window.claude.use ? await window.claude.use(n) : null; } catch (e) { return null; }
}

/** Ask the model for JSON. Throws an Error with a user-facing message when AI is unavailable. */
export async function sampleJson(prompt, unavailableMsg) {
  var sample = await cap("sample");
  if (!sample) throw new Error(unavailableMsg || "The AI helper is not available here.");
  return await sample.json(prompt);
}

export function aiError(e) {
  return e && e.code === "not_granted" ? "Permission for the AI helper was declined."
    : e && e.code === "rate_limited" ? "Too many requests. Wait a moment and try again."
    : ((e && e.message) || "Something went wrong. Try again.");
}

/** Returns a message for a toast, or null when nothing should be shown. */
export async function saveFile(name, data) {
  var d = await cap("downloads");
  if (!d) return "Saving files is not available in this view. Use Copy as text instead.";
  try { var r = await d.save({ filename: name, data: data }); return r.status === "saved" ? "Saved " + name : "Sent " + name; }
  catch (e) { return e && e.code !== "declined" ? "Could not save the file (" + ((e && e.code) || "error") + ")." : null; }
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
  if (["csv", "tsv", "txt", "md", "json"].indexOf(ext) >= 0) return await file.text();
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
