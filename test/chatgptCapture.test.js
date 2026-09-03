const test = require("node:test");
const assert = require("node:assert/strict");

const {
  isChatgptHost,
  getConversationIdFromPath,
  readPromptText,
  isSendButtonClickTarget,
  isBusy,
  readLastAssistantText,
} = require("../src/adapters/chatgpt.js");
const {
  createCaptureState,
  shouldRecordPrompt,
  consumeAssistantFinalEvent,
} = require("../src/core/chatgptState.js");
const { makeEvent } = require("../src/core/eventSchema.js");

function createMockDocument(input) {
  const options = input && typeof input === "object" ? input : {};
  const promptText = String(options.promptText || "");
  const busy = Boolean(options.busy);
  const assistantTexts = Array.isArray(options.assistantTexts)
    ? options.assistantTexts
    : [];

  const textarea = { value: promptText, textContent: promptText };
  const stopButton = { tagName: "BUTTON" };
  const assistantNodes = assistantTexts.map((text) => ({
    innerText: String(text),
    textContent: String(text),
    querySelector() {
      return null;
    },
  }));

  return {
    location: {
      pathname: String(options.pathname || "/c/conv-123"),
    },
    querySelector(selector) {
      if (selector === "#prompt-textarea") {
        return textarea;
      }

      if (
        selector.includes("stop-button") ||
        selector.toLowerCase().includes("stop")
      ) {
        return busy ? stopButton : null;
      }

      return null;
    },
    querySelectorAll(selector) {
      if (selector === '[data-message-author-role="assistant"]') {
        return assistantNodes;
      }
      return [];
    },
  };
}

test("adapter detects ChatGPT host and conversation id", () => {
  assert.equal(isChatgptHost("chatgpt.com"), true);
  assert.equal(isChatgptHost("www.chatgpt.com"), true);
  assert.equal(isChatgptHost("chat.openai.com"), true);
  assert.equal(isChatgptHost("gemini.google.com"), false);

  assert.equal(getConversationIdFromPath("/c/abc-123"), "abc-123");
  assert.equal(getConversationIdFromPath("/"), null);
});

test("adapter reads prompt text and busy state", () => {
  const doc = createMockDocument({ promptText: "  hello  ", busy: true });
  assert.equal(readPromptText(doc), "hello");
  assert.equal(isBusy(doc), true);

  const idleDoc = createMockDocument({ promptText: "x", busy: false });
  assert.equal(isBusy(idleDoc), false);
});

test("adapter extracts the last assistant message", () => {
  const doc = createMockDocument({
    assistantTexts: ["first response", "final response"],
  });

  assert.equal(readLastAssistantText(doc), "final response");
});

test("adapter detects send-button click targets", () => {
  const target = {
    closest(selector) {
      return selector.includes("send-button") ? { tagName: "BUTTON" } : null;
    },
  };

  assert.equal(isSendButtonClickTarget(target), true);
  assert.equal(isSendButtonClickTarget({ closest: () => null }), false);
});

test("state emits assistant event on busy to idle transition", () => {
  const state = createCaptureState();

  const acceptedPrompt = shouldRecordPrompt(state, "Explain this", 1000);
  assert.equal(acceptedPrompt, true);

  state.wasBusy = true;

  const assistantEvent = makeEvent({
    site: "chatgpt",
    role: "assistant",
    text: "Here is the final answer",
    extractionMode: "plain",
    conversationId: "conv-123",
    now: "2026-04-21T11:00:00.000Z",
  });

  const emitted = consumeAssistantFinalEvent(state, {
    isBusy: false,
    assistantEvent,
    nowMs: 2000,
  });

  assert.equal(emitted && emitted.text, "Here is the final answer");
  assert.equal(state.pendingPrompt, null);
});

test("state suppresses duplicate assistant dedupe keys", () => {
  const state = createCaptureState({ dedupeTtlMs: 10_000 });

  const assistantEvent = makeEvent({
    site: "chatgpt",
    role: "assistant",
    text: "Same answer",
    extractionMode: "plain",
    conversationId: "conv-123",
    now: "2026-04-21T11:00:00.000Z",
  });

  shouldRecordPrompt(state, "Prompt A", 1000);
  state.wasBusy = true;
  const first = consumeAssistantFinalEvent(state, {
    isBusy: false,
    assistantEvent,
    nowMs: 2000,
  });

  shouldRecordPrompt(state, "Prompt B", 3000);
  state.wasBusy = true;
  const second = consumeAssistantFinalEvent(state, {
    isBusy: false,
    assistantEvent,
    nowMs: 3500,
  });

  assert.ok(first);
  assert.equal(second, null);
});

test("state debounces repeated prompt captures", () => {
  const state = createCaptureState({ promptDebounceMs: 1500 });

  const first = shouldRecordPrompt(state, "same prompt", 1000);
  const second = shouldRecordPrompt(state, "same prompt", 1800);
  const third = shouldRecordPrompt(state, "same prompt", 3000);

  assert.equal(first, true);
  assert.equal(second, false);
  assert.equal(third, true);
});
