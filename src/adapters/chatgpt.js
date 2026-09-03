(function initReadChatGuiChatgptAdapter() {
  const chatgptCommon =
    typeof module !== "undefined" && module.exports
      ? require("./common.js")
      : globalThis.ReadChatGuiAdapterCommon;

  const PROMPT_SELECTORS = ["#prompt-textarea"];

  const SEND_BUTTON_SELECTORS = [
    '[data-testid="send-button"]',
    'button[aria-label*="Send"]',
    'button[aria-label*="send"]',
  ];

  const STOP_BUTTON_SELECTORS = [
    '[data-testid="stop-button"]',
    'button[aria-label*="Stop"]',
    'button[aria-label*="stop"]',
  ];

  const ASSISTANT_MESSAGE_SELECTORS = [
    '[data-message-author-role="assistant"]',
  ];
  const ASSISTANT_CONTENT_SELECTORS = [
    ".markdown",
    ".prose",
    ".latex-html",
    "#code-block-viewer",
    "li",
  ];

  function isChatgptHost(hostname) {
    const host = String(hostname || "").toLowerCase();
    return (
      host === "chatgpt.com" ||
      host.endsWith(".chatgpt.com") ||
      host === "chat.openai.com" ||
      host.endsWith(".chat.openai.com")
    );
  }

  function getConversationIdFromPath(pathname) {
    const path = String(pathname || "");
    const match = path.match(/\/c\/([^/?#]+)/);
    return match ? match[1] : null;
  }

  function readPromptText(doc) {
    return chatgptCommon.readPromptTextBySelectors(doc, PROMPT_SELECTORS);
  }

  function isSendButtonClickTarget(target) {
    return chatgptCommon.isClickTarget(target, SEND_BUTTON_SELECTORS);
  }

  function isBusy(doc) {
    return chatgptCommon.hasAnySelector(doc, STOP_BUTTON_SELECTORS);
  }

  function readLastAssistantText(doc) {
    return chatgptCommon.readLastStructuredBySelectors(
      doc,
      ASSISTANT_MESSAGE_SELECTORS,
      ASSISTANT_CONTENT_SELECTORS,
    );
  }

  const chatgptAdapterApi = {
    site: "chatgpt",
    isHost: isChatgptHost,
    getConversationId: getConversationIdFromPath,
    isChatgptHost,
    getConversationIdFromPath,
    readPromptText,
    isSendButtonClickTarget,
    isBusy,
    readLastAssistantText,
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = chatgptAdapterApi;
  }

  if (typeof globalThis !== "undefined") {
    globalThis.ReadChatGuiChatgptAdapter = chatgptAdapterApi;
  }
})();
