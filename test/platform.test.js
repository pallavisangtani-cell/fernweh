import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";

const store = {};
globalThis.localStorage = { getItem: (k) => store[k] ?? null, setItem: (k, v) => { store[k] = String(v); }, removeItem: (k) => { delete store[k]; } };
const { claudeJson, _setSdkForTests, parseJsonReply, apiMessage, setApiKey } = await import("../src/platform.js");

class APIError extends Error { constructor(status, msg) { super(status + " " + JSON.stringify({ type: "error", error: { message: msg } })); this.status = status; this.error = { type: "error", error: { type: "x", message: msg } }; } }
class BadRequestError extends APIError {}
class AuthenticationError extends APIError {}
class NotFoundError extends APIError {}
function fakeSdk(behaviour) {
  const calls = [];
  function Fake() {
    const create = (endpoint) => async (req) => { calls.push({ endpoint, req }); return behaviour(endpoint, req, calls.length); };
    this.beta = { messages: { create: create("beta") } };
    this.messages = { create: create("plain") };
  }
  Object.assign(Fake, { APIError, BadRequestError, AuthenticationError, NotFoundError, PermissionDeniedError: class extends APIError {}, RateLimitError: class extends APIError {}, APIConnectionError: class extends APIError {} });
  return { Fake, calls };
}
const reply = (text) => ({ stop_reason: "end_turn", content: [{ type: "text", text }] });

beforeEach(() => setApiKey("sk-ant-test"));

test("first request uses fallbacks and the JSON schema", async () => {
  const { Fake, calls } = fakeSdk(() => reply('{"ok":1}'));
  _setSdkForTests(Fake);
  assert.deepEqual(await claudeJson("p", { type: "object" }, "low"), { ok: 1 });
  assert.equal(calls[0].endpoint, "beta"); assert.equal(calls[0].req.fallbacks, "default");
  assert.equal(calls[0].req.output_config.format.type, "json_schema"); assert.equal(calls[0].req.output_config.effort, "low");
});

test("steps down when an extra is rejected, and remembers it", async () => {
  const { Fake, calls } = fakeSdk((endpoint, req) => {
    if (req.fallbacks) throw new BadRequestError(400, "fallbacks: Extra inputs are not permitted");
    if (req.output_config.format) throw new BadRequestError(400, "output_config.format: schema too complex");
    return reply('Here you go: ```json\n{"items":["Scarf"]}\n```');
  });
  _setSdkForTests(Fake);
  assert.deepEqual(await claudeJson("p", {}, "low"), { items: ["Scarf"] });
  assert.deepEqual(calls.map((c) => c.endpoint + (c.req.output_config.format ? "+schema" : "")), ["beta+schema", "plain+schema", "plain"]);
  assert.match(calls[2].req.messages[0].content, /Reply with only the JSON object/);
  await claudeJson("again", {}, "low");
  assert.equal(calls.length, 4, "the next request starts at the level that worked");
});

test("a bad key is not retried and the message says why", async () => {
  const { Fake, calls } = fakeSdk(() => { throw new AuthenticationError(401, "invalid x-api-key"); });
  _setSdkForTests(Fake);
  await assert.rejects(claudeJson("p", {}), /did not accept that API key.*invalid x-api-key/);
  assert.equal(calls.length, 1);
});

test("no credits is not retried", async () => {
  const { Fake, calls } = fakeSdk(() => { throw new BadRequestError(400, "Your credit balance is too low to access the Anthropic API."); });
  _setSdkForTests(Fake);
  await assert.rejects(claudeJson("p", {}), /out of credits/);
  assert.equal(calls.length, 1);
});

test("an unknown model names the model", async () => {
  const { Fake } = fakeSdk(() => { throw new NotFoundError(404, "model: claude-opus-5-5"); });
  _setSdkForTests(Fake);
  await assert.rejects(claudeJson("p", {}), /could not find the model claude-opus-5-5/);
});

test("other errors show the API's own words", async () => {
  const { Fake } = fakeSdk(() => { throw new BadRequestError(400, "messages.0.content: something odd"); });
  _setSdkForTests(Fake);
  await assert.rejects(claudeJson("p", {}), /Claude returned an error \(400\): messages\.0\.content: something odd/);
});

test("parseJsonReply and apiMessage", () => {
  assert.deepEqual(parseJsonReply('{"a":1}'), { a: 1 });
  assert.deepEqual(parseJsonReply('Sure!\n{"a":{"b":2}}\nDone.'), { a: { b: 2 } });
  assert.throws(() => parseJsonReply("no json"), /could not be read/);
  assert.equal(apiMessage(new APIError(400, "bad thing")), "bad thing");
  assert.equal(apiMessage(new Error("400 plain")), "plain");
});

test("no key gives a clear message", async () => {
  setApiKey("");
  await assert.rejects(claudeJson("p", {}), /Add your Claude API key in Settings/);
});
