(function initReadChatGuiGeminiAdapter() {
  const geminiCommon =
    typeof module !== "undefined" && module.exports
      ? require("./common.js")
      : globalThis.ReadChatGuiAdapterCommon;

  const PROMPT_SELECTORS = [
    "rich-textarea textarea",
    'textarea[aria-label*="Enter a prompt"]',
    'textarea[aria-label*="Message Gemini"]',
    'textarea[aria-label*="Submit"]',
    'textarea[aria-label*="submit"]',
    '[contenteditable="true"]',
  ];

  const SEND_BUTTON_SELECTORS = [
    'button[aria-label*="Send message"]',
    'button[aria-label*="Send"]',
    'button[data-test-id*="send"]',
  ];

  const STOP_BUTTON_SELECTORS = [
    'button[aria-label*="Stop"]',
    'button[aria-label*="Generating"]',
    'button[data-test-id*="stop"]',
  ];

  // Root should be the full assistant turn only. Broad selectors like
  // `[data-response-index]` match many sibling chunks; the last match in DOM
  // order is often a fragment from one reply, not the latest `model-response`.
  const ASSISTANT_MESSAGE_SELECTORS = [
    "model-response",
    '[data-test-id="model-response"]',
  ];

  const ASSISTANT_CONTENT_SELECTORS = [
    ".response-content",
    ".message-content",
    ".math-block[data-math]",
    ".math-inline[data-math]",
    'code[data-test-id="code-content"]',
    "li",
  ];

  function isGeminiHost(hostname) {
    const host = String(hostname || "").toLowerCase();
    return host === "gemini.google.com" || host.endsWith(".gemini.google.com");
  }

  function getConversationIdFromPath(pathname) {
    const path = String(pathname || "");
    const match = path.match(/\/app\/([^/?#]+)/);
    return match ? match[1] : null;
  }

  function readPromptText(doc) {
    return geminiCommon.readPromptTextBySelectors(doc, PROMPT_SELECTORS);
  }

  function isSendButtonClickTarget(target) {
    return geminiCommon.isClickTarget(target, SEND_BUTTON_SELECTORS);
  }

  function isBusy(doc) {
    return geminiCommon.hasAnySelector(doc, STOP_BUTTON_SELECTORS);
  }

  function readLastAssistantText(doc) {
    return geminiCommon.readLastStructuredBySelectors(
      doc,
      ASSISTANT_MESSAGE_SELECTORS,
      ASSISTANT_CONTENT_SELECTORS,
    );
  }

  const geminiAdapterApi = {
    site: "gemini",
    isHost: isGeminiHost,
    getConversationId: getConversationIdFromPath,
    isGeminiHost,
    getConversationIdFromPath,
    readPromptText,
    isSendButtonClickTarget,
    isBusy,
    readLastAssistantText,
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = geminiAdapterApi;
  }

  if (typeof globalThis !== "undefined") {
    globalThis.ReadChatGuiGeminiAdapter = geminiAdapterApi;
  }
})();
