const test = require("node:test");
const assert = require("node:assert/strict");

const { fnv1a32 } = require("../src/core/hash.js");
const {
  normalizeForHash,
  makeEvent,
  validateEvent,
} = require("../src/core/eventSchema.js");

test("fnv1a32 is deterministic and hex formatted", () => {
  const a = fnv1a32("hello-world");
  const b = fnv1a32("hello-world");
  const c = fnv1a32("hello-world-2");

  assert.equal(a, b);
  assert.notEqual(a, c);
  assert.match(a, /^[0-9a-f]{8}$/i);
});

test("normalizeForHash collapses whitespace and trims", () => {
  const input = "  line one\n\nline\t two   ";
  assert.equal(normalizeForHash(input), "line one line two");
});

test("makeEvent creates a valid event payload", () => {
  const event = makeEvent({
    site: "chatgpt",
    role: "assistant",
    text: "Result text",
    conversationId: "conv-123",
    turnId: "turn-9",
    extractionMode: "structured",
    now: "2026-04-21T10:00:00.000Z",
  });

  assert.equal(event.tsIso, "2026-04-21T10:00:00.000Z");
  assert.equal(event.site, "chatgpt");
  assert.equal(event.role, "assistant");
  assert.equal(event.text, "Result text");
  assert.equal(event.conversationId, "conv-123");
  assert.equal(event.turnId, "turn-9");
  assert.equal(event.extractionMode, "structured");
  assert.match(event.eventId, /^\d+-[0-9a-f]{8}$/i);

  const errors = validateEvent(event);
  assert.deepEqual(errors, []);
});

test("validateEvent reports schema violations", () => {
  const errors = validateEvent({
    eventId: "",
    tsIso: "not-a-date",
    site: "unknown",
    role: "model",
    text: "  ",
    extractionMode: "wrong",
    dedupeKey: "zzz",
  });

  assert.ok(errors.length >= 6);
  assert.ok(errors.some((e) => e.includes("eventId")));
  assert.ok(errors.some((e) => e.includes("tsIso")));
  assert.ok(errors.some((e) => e.includes("site")));
  assert.ok(errors.some((e) => e.includes("role")));
  assert.ok(errors.some((e) => e.includes("text")));
  assert.ok(errors.some((e) => e.includes("extractionMode")));
  assert.ok(errors.some((e) => e.includes("dedupeKey")));
});
