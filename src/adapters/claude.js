(function initReadChatGuiClaudeAdapter() {
  const claudeCommon =
    typeof module !== "undefined" && module.exports
      ? require("./common.js")
      : globalThis.ReadChatGuiAdapterCommon;

  const PROMPT_SELECTORS = [
    'div[contenteditable="true"][role="textbox"]',
    'div[contenteditable="true"][data-placeholder]',
    'div[contenteditable="true"][aria-label*="Talk to Claude"]',
    'textarea[aria-label*="Talk to Claude"]',
    'textarea[aria-label*="Send a message"]',
    'textarea[placeholder*="Message Claude"]',
  ];

  const SEND_BUTTON_SELECTORS = [
    'button[data-testid="send-button"]',
    'button[aria-label*="Send"]',
    'button[data-testid*="send"]',
    'button[data-test-id*="send"]',
  ];

  const STOP_BUTTON_SELECTORS = [
    'button[aria-label*="Stop"]',
    'button[aria-label*="Stop generating"]',
    'button[aria-label*="Stop response"]',
    'button[data-testid*="stop"]',
    'button[data-test-id*="stop"]',
  ];

  // Assistant prose lives in `font-claude-response` (Tailwind token in a long class string).
  // Do not use `.font-claude-message` for roots — Claude uses it on user bubbles too.
  const ASSISTANT_MESSAGE_SELECTORS = [
    { classNameRegex: /\bfont-claude-response\b/ },
    '[data-testid="assistant-message"]',
    '[data-test-id="assistant-message"]',
    '[data-message-author-role="assistant"]',
    '[data-message-author="assistant"]',
    '[data-is-assistant="true"]',
    '[data-testid="assistant-turn"]',
    '[data-testid^="assistant-turn-"]',
  ];

  // Content rules: every string is a CSS selector (all matches are unioned).
  // Multiple sibling <p class="font-claude-response-body"> chunks share one answer;
  // common.js picks their lowest common ancestor so the full reply is captured.
  // Add `{ classNameRegex: /pattern/ }` entries for class-based matches CSS cannot express.
  const ASSISTANT_CONTENT_SELECTORS = [
    ".markdown",
    ".prose",
    ".message-content",
    ".katex",
    ".katex-html",
    'code[class*="language-"]',
    "li",
    "p.font-claude-response-body",
    { classNameRegex: /\bfont-claude-response\b/ },
  ];

  // Avoid generic `[data-testid*="message"]` / `article` — they match user rows.
  const ASSISTANT_FALLBACK_MESSAGE_SELECTORS = [
    { classNameRegex: /\bfont-claude-response\b/ },
    '[data-testid="assistant-message"]',
    '[data-test-id="assistant-message"]',
    '[data-message-author-role="assistant"]',
    '[data-message-author="assistant"]',
    '[data-is-assistant="true"]',
  ];

  function isClaudeHost(hostname) {
    const host = String(hostname || "").toLowerCase();
    return host === "claude.ai" || host.endsWith(".claude.ai");
  }

  function getConversationIdFromPath(pathname) {
    const path = String(pathname || "");
    const match = path.match(/\/chat\/([^/?#]+)/);
    return match ? match[1] : null;
  }

  function readPromptText(doc) {
    return claudeCommon.readPromptTextBySelectors(doc, PROMPT_SELECTORS);
  }

  function isSendButtonClickTarget(target) {
    return claudeCommon.isClickTarget(target, SEND_BUTTON_SELECTORS);
  }

  function isBusy(doc) {
    return claudeCommon.hasAnySelector(doc, STOP_BUTTON_SELECTORS);
  }

  function readLastAssistantText(doc) {
    const structured = claudeCommon.readLastStructuredBySelectors(
      doc,
      ASSISTANT_MESSAGE_SELECTORS,
      ASSISTANT_CONTENT_SELECTORS,
    );

    if (structured) {
      return structured;
    }

    return claudeCommon.readLastStructuredBySelectors(
      doc,
      ASSISTANT_FALLBACK_MESSAGE_SELECTORS,
      ASSISTANT_CONTENT_SELECTORS,
    );
  }

  const claudeAdapterApi = {
    site: "claude",
    isHost: isClaudeHost,
    getConversationId: getConversationIdFromPath,
    isClaudeHost,
    getConversationIdFromPath,
    readPromptText,
    isSendButtonClickTarget,
    isBusy,
    readLastAssistantText,
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = claudeAdapterApi;
  }

  if (typeof globalThis !== "undefined") {
    globalThis.ReadChatGuiClaudeAdapter = claudeAdapterApi;
  }
})();
