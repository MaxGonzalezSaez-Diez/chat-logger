const DEFAULT_ASSISTANT_DEDUPE_TTL_MS = 15_000;
const DEFAULT_ASSISTANT_DEDUPE_MAX_ENTRIES = 100;
const DEFAULT_PROMPT_DEBOUNCE_MS = 1_200;

function normalizeText(value) {
  return String(value || "")
    .replace(/\r/g, "")
    .trim();
}

function createCaptureState(config) {
  const options = config && typeof config === "object" ? config : {};

  return {
    pendingPrompt: null,
    wasBusy: false,
    assistantDedupeByKey: new Map(),
    dedupeTtlMs:
      Number.isFinite(options.dedupeTtlMs) && options.dedupeTtlMs > 0
        ? Number(options.dedupeTtlMs)
        : DEFAULT_ASSISTANT_DEDUPE_TTL_MS,
    dedupeMaxEntries:
      Number.isFinite(options.dedupeMaxEntries) && options.dedupeMaxEntries > 0
        ? Number(options.dedupeMaxEntries)
        : DEFAULT_ASSISTANT_DEDUPE_MAX_ENTRIES,
    promptDebounceMs:
      Number.isFinite(options.promptDebounceMs) && options.promptDebounceMs > 0
        ? Number(options.promptDebounceMs)
        : DEFAULT_PROMPT_DEBOUNCE_MS,
    lastPromptText: null,
    lastPromptAtMs: 0,
  };
}

function shouldRecordPrompt(state, promptText, nowMs) {
  const text = normalizeText(promptText);
  if (!text) {
    return false;
  }

  const timestamp = Number.isFinite(nowMs) ? nowMs : Date.now();
  const isSamePrompt = state.lastPromptText === text;
  const withinDebounce =
    timestamp - state.lastPromptAtMs < state.promptDebounceMs;

  if (isSamePrompt && withinDebounce) {
    return false;
  }

  state.lastPromptText = text;
  state.lastPromptAtMs = timestamp;
  state.pendingPrompt = text;
  return true;
}

function pruneAssistantDedupe(state, nowMs) {
  for (const [key, ts] of state.assistantDedupeByKey.entries()) {
    if (nowMs - ts > state.dedupeTtlMs) {
      state.assistantDedupeByKey.delete(key);
    }
  }

  while (state.assistantDedupeByKey.size > state.dedupeMaxEntries) {
    const oldestKey = state.assistantDedupeByKey.keys().next().value;
    if (oldestKey === undefined) {
      break;
    }
    state.assistantDedupeByKey.delete(oldestKey);
  }
}

function isAssistantDuplicate(state, dedupeKey, nowMs) {
  const key = normalizeText(dedupeKey);
  if (!key) {
    return false;
  }

  pruneAssistantDedupe(state, nowMs);

  if (state.assistantDedupeByKey.has(key)) {
    state.assistantDedupeByKey.set(key, nowMs);
    return true;
  }

  state.assistantDedupeByKey.set(key, nowMs);
  pruneAssistantDedupe(state, nowMs);
  return false;
}

function consumeAssistantFinalEvent(state, snapshot) {
  const data = snapshot && typeof snapshot === "object" ? snapshot : {};
  const isBusy = Boolean(data.isBusy);
  const transitionedToIdle = state.wasBusy && !isBusy;
  state.wasBusy = isBusy;

  if (!transitionedToIdle || !state.pendingPrompt) {
    return null;
  }

  const assistantEvent = data.assistantEvent;
  if (!assistantEvent || typeof assistantEvent.text !== "string") {
    return null;
  }
  if (!assistantEvent.text.trim()) {
    return null;
  }

  const nowMs = Number.isFinite(data.nowMs) ? data.nowMs : Date.now();
  if (isAssistantDuplicate(state, assistantEvent.dedupeKey, nowMs)) {
    return null;
  }

  state.pendingPrompt = null;
  return assistantEvent;
}

const chatgptStateApi = {
  createCaptureState,
  shouldRecordPrompt,
  consumeAssistantFinalEvent,
};

if (typeof module !== "undefined" && module.exports) {
  module.exports = chatgptStateApi;
}

if (typeof globalThis !== "undefined") {
  globalThis.ReadChatGuiChatgptState = chatgptStateApi;
}
