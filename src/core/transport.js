const DEFAULT_ENDPOINT = "http://127.0.0.1:17842/events";
const DEFAULT_QUEUE_KEY = "readChatGuiQueuedEventsV1";
const DEFAULT_MAX_QUEUE = 500;

function createMemoryQueueStore(seedQueue) {
  let queue = Array.isArray(seedQueue) ? seedQueue.slice() : [];

  return {
    async read() {
      return queue.slice();
    },
    async write(nextQueue) {
      queue = Array.isArray(nextQueue) ? nextQueue.slice() : [];
    },
  };
}

function getDefaultStorageArea() {
  if (
    typeof globalThis === "undefined" ||
    !globalThis.chrome ||
    !globalThis.chrome.storage ||
    !globalThis.chrome.storage.local
  ) {
    return null;
  }

  return globalThis.chrome.storage.local;
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function createBrowserQueueStore(queueKey, storageArea) {
  const key = String(queueKey || DEFAULT_QUEUE_KEY);
  const area = storageArea || getDefaultStorageArea();

  if (
    !area ||
    typeof area.get !== "function" ||
    typeof area.set !== "function"
  ) {
    return createMemoryQueueStore();
  }

  async function read() {
    return new Promise((resolve, reject) => {
      area.get([key], (result) => {
        const maybeError =
          globalThis.chrome &&
          globalThis.chrome.runtime &&
          globalThis.chrome.runtime.lastError;

        if (maybeError) {
          reject(new Error(maybeError.message || "chrome.storage.get failed"));
          return;
        }

        resolve(asArray(result && result[key]));
      });
    });
  }

  async function write(nextQueue) {
    const safeQueue = asArray(nextQueue);

    return new Promise((resolve, reject) => {
      area.set({ [key]: safeQueue }, () => {
        const maybeError =
          globalThis.chrome &&
          globalThis.chrome.runtime &&
          globalThis.chrome.runtime.lastError;

        if (maybeError) {
          reject(new Error(maybeError.message || "chrome.storage.set failed"));
          return;
        }

        resolve();
      });
    });
  }

  return { read, write };
}

function keepLatest(queue, maxQueue) {
  if (!Number.isFinite(maxQueue) || maxQueue <= 0) {
    return queue.slice();
  }
  if (queue.length <= maxQueue) {
    return queue.slice();
  }
  return queue.slice(queue.length - maxQueue);
}

async function postEvent(fetchFn, endpoint, event) {
  const response = await fetchFn(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(event),
  });

  if (!response || !response.ok) {
    const code =
      response && typeof response.status === "number"
        ? response.status
        : "unknown";
    throw new Error(`POST ${endpoint} failed with status ${code}`);
  }
}

function createTransport(config) {
  const options = config && typeof config === "object" ? config : {};
  const fetchFn =
    options.fetchFn || (typeof globalThis !== "undefined" && globalThis.fetch);

  if (typeof fetchFn !== "function") {
    throw new Error("fetch is required for transport");
  }

  const endpoint = String(options.endpoint || DEFAULT_ENDPOINT);
  const maxQueue =
    Number.isFinite(options.maxQueue) && options.maxQueue > 0
      ? Number(options.maxQueue)
      : DEFAULT_MAX_QUEUE;

  const queueStore =
    options.queueStore ||
    createBrowserQueueStore(
      options.queueKey || DEFAULT_QUEUE_KEY,
      options.storageArea,
    );

  let flushInFlight = false;

  async function enqueue(event) {
    const current = asArray(await queueStore.read());
    current.push(event);
    await queueStore.write(keepLatest(current, maxQueue));
  }

  async function flushQueue() {
    if (flushInFlight) {
      return {
        flushed: 0,
        remaining: (await queueStore.read()).length,
        skipped: true,
      };
    }

    flushInFlight = true;
    try {
      const queue = asArray(await queueStore.read());
      if (queue.length === 0) {
        return { flushed: 0, remaining: 0, skipped: false };
      }

      let flushed = 0;
      let remaining = [];

      for (let i = 0; i < queue.length; i += 1) {
        const item = queue[i];
        try {
          await postEvent(fetchFn, endpoint, item);
          flushed += 1;
        } catch (_err) {
          remaining = queue.slice(i);
          break;
        }
      }

      await queueStore.write(remaining);
      return { flushed, remaining: remaining.length, skipped: false };
    } finally {
      flushInFlight = false;
    }
  }

  async function sendEvent(event) {
    await flushQueue();

    try {
      await postEvent(fetchFn, endpoint, event);
      return { delivered: true, queued: false };
    } catch (_err) {
      await enqueue(event);
      return { delivered: false, queued: true };
    }
  }

  async function queuedCount() {
    return asArray(await queueStore.read()).length;
  }

  return {
    sendEvent,
    flushQueue,
    queuedCount,
  };
}

const transportApi = {
  DEFAULT_ENDPOINT,
  createMemoryQueueStore,
  createBrowserQueueStore,
  createTransport,
};

if (typeof module !== "undefined" && module.exports) {
  module.exports = transportApi;
}

if (typeof globalThis !== "undefined") {
  globalThis.ReadChatGuiTransport = transportApi;
}
