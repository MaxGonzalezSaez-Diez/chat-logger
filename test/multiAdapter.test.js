const test = require("node:test");
const assert = require("node:assert/strict");

const gemini = require("../src/adapters/gemini.js");
const claude = require("../src/adapters/claude.js");

test("gemini adapter host and conversation id detection", () => {
  assert.equal(gemini.isGeminiHost("gemini.google.com"), true);
  assert.equal(gemini.isGeminiHost("chatgpt.com"), false);
  assert.equal(gemini.getConversationIdFromPath("/app/conv-123"), "conv-123");
  assert.equal(gemini.getConversationIdFromPath("/"), null);
});

test("claude adapter host and conversation id detection", () => {
  assert.equal(claude.isClaudeHost("claude.ai"), true);
  assert.equal(claude.isClaudeHost("gemini.google.com"), false);
  assert.equal(claude.getConversationIdFromPath("/chat/abc-1"), "abc-1");
  assert.equal(claude.getConversationIdFromPath("/"), null);
});

test("gemini adapter reads prompt text and send click", () => {
  const doc = {
    querySelector(selector) {
      if (selector === "rich-textarea textarea") {
        return { value: "  hello gemini  " };
      }
      return null;
    },
  };

  const clickTarget = {
    closest(selector) {
      return selector.includes("Send") ? { tagName: "BUTTON" } : null;
    },
  };

  assert.equal(gemini.readPromptText(doc), "hello gemini");
  assert.equal(gemini.isSendButtonClickTarget(clickTarget), true);
});

test("claude adapter reads prompt text and send click", () => {
  const doc = {
    querySelectorAll(selector) {
      if (selector === 'div[contenteditable="true"][role="textbox"]') {
        return [{ textContent: "" }, { textContent: "  hello claude  " }];
      }
      return [];
    },
    querySelector(selector) {
      if (selector === 'div[contenteditable="true"][role="textbox"]') {
        return { textContent: "" };
      }
      return null;
    },
  };

  const clickTarget = {
    closest(selector) {
      return selector.includes("Send") ? { tagName: "BUTTON" } : null;
    },
  };

  assert.equal(claude.readPromptText(doc), "hello claude");
  assert.equal(claude.isSendButtonClickTarget(clickTarget), true);
});
