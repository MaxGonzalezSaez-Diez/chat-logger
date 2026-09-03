const test = require("node:test");
const assert = require("node:assert/strict");

const {
  createMemoryQueueStore,
  createTransport,
} = require("../src/core/transport.js");

function createFetchSequence(steps) {
  const queue = Array.isArray(steps) ? steps.slice() : [];
  const calls = [];

  async function fetchFn(url, options) {
    calls.push({ url, options });
    const step = queue.length > 0 ? queue.shift() : { ok: true, status: 200 };

    if (step instanceof Error) {
      throw step;
    }

    return {
      ok: step.ok !== false,
      status: Number.isFinite(step.status) ? step.status : 200,
    };
  }

  return { fetchFn, calls };
}

function makeEvent(id) {
  return {
    eventId: id,
    tsIso: "2026-04-21T12:00:00.000Z",
    site: "chatgpt",
    conversationId: "conv-1",
    turnId: null,
    role: "user",
    text: `event-${id}`,
    extractionMode: "plain",
    dedupeKey: "deadbeef",
  };
}

test("transport sends immediately when endpoint is reachable", async () => {
  const { fetchFn, calls } = createFetchSequence([{ ok: true, status: 200 }]);
  const transport = createTransport({
    fetchFn,
    queueStore: createMemoryQueueStore(),
  });

  const result = await transport.sendEvent(makeEvent("e1"));

  assert.equal(result.delivered, true);
  assert.equal(result.queued, false);
  assert.equal(await transport.queuedCount(), 0);
  assert.equal(calls.length, 1);
});

test("transport queues when endpoint is down and flushes later", async () => {
  const { fetchFn } = createFetchSequence([
    new Error("offline"),
    { ok: true, status: 200 },
    { ok: true, status: 200 },
  ]);

  const transport = createTransport({
    fetchFn,
    queueStore: createMemoryQueueStore(),
  });

  const first = await transport.sendEvent(makeEvent("e1"));
  assert.equal(first.delivered, false);
  assert.equal(first.queued, true);
  assert.equal(await transport.queuedCount(), 1);

  const second = await transport.sendEvent(makeEvent("e2"));
  assert.equal(second.delivered, true);
  assert.equal(second.queued, false);
  assert.equal(await transport.queuedCount(), 0);
});

test("transport caps queue size and keeps latest items", async () => {
  const fetchFn = async () => {
    throw new Error("offline");
  };

  const queueStore = createMemoryQueueStore();
  const transport = createTransport({
    fetchFn,
    queueStore,
    maxQueue: 2,
  });

  await transport.sendEvent(makeEvent("e1"));
  await transport.sendEvent(makeEvent("e2"));
  await transport.sendEvent(makeEvent("e3"));

  const queue = await queueStore.read();
  assert.equal(queue.length, 2);
  assert.equal(queue[0].eventId, "e2");
  assert.equal(queue[1].eventId, "e3");
});
