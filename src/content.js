(function initReadChatGuiContentScript() {
  const schema = globalThis.ReadChatGuiEventSchema;
  const stateApi = globalThis.ReadChatGuiChatgptState;
  const transportApi = globalThis.ReadChatGuiTransport;

  if (!schema || !stateApi || !transportApi) {
    console.error(
      "[read_chat_gui] Required APIs missing. Check script load order.",
    );
    return;
  }

  const adapters = [
    globalThis.ReadChatGuiChatgptAdapter,
    globalThis.ReadChatGuiGeminiAdapter,
    globalThis.ReadChatGuiClaudeAdapter,
  ].filter(Boolean);

  const hostname = globalThis.location && globalThis.location.hostname;
  const adapter = adapters.find(
    (candidate) =>
      candidate &&
      typeof candidate.isHost === "function" &&
      candidate.isHost(hostname),
  );

  if (!adapter) {
    console.info("[read_chat_gui] Host is not supported by any adapter");
    return;
  }

  const requiredMethods = [
    "getConversationId",
    "readPromptText",
    "isSendButtonClickTarget",
    "isBusy",
    "readLastAssistantText",
  ];

  const missing = requiredMethods.filter(
    (method) => typeof adapter[method] !== "function",
  );

  if (missing.length > 0) {
    console.error("[read_chat_gui] Adapter missing required methods:", missing);
    return;
  }

  const state = stateApi.createCaptureState();
  const transport = transportApi.createTransport();
  state.wasBusy = adapter.isBusy(document);

  const ASSISTANT_SETTLE_INTERVAL_MS = 150;
  const ASSISTANT_SETTLE_MAX_POLLS = 12;
  let assistantSettleTimer = null;
  let assistantSettleInFlight = false;
  let pendingAssistantBaseline = "";

  function clearAssistantSettleTimer() {
    if (assistantSettleTimer) {
      clearTimeout(assistantSettleTimer);
      assistantSettleTimer = null;
    }
  }

  function emitCapturedEvent(event) {
    console.info("[read_chat_gui] captured", event.role, event);

    try {
      globalThis.dispatchEvent(
        new CustomEvent("read-chat-gui:event", {
          detail: event,
        }),
      );
    } catch (_err) {
      // no-op: keep capture flow running even in restrictive contexts
    }

    void transport
      .sendEvent(event)
      .then((result) => {
        if (result.queued) {
          console.warn("[read_chat_gui] endpoint unavailable, event queued");
        }
      })
      .catch((err) => {
        console.error("[read_chat_gui] failed to stream event", err);
      });
  }

  function buildEvent(role, text, extractionMode) {
    return schema.makeEvent({
      site: adapter.site,
      role,
      text,
      extractionMode: extractionMode || "plain",
      conversationId: adapter.getConversationId(
        globalThis.location && globalThis.location.pathname,
      ),
      turnId: null,
    });
  }

  function capturePromptFromDom() {
    const promptText = adapter.readPromptText(document);
    const accepted = stateApi.shouldRecordPrompt(state, promptText, Date.now());

    if (!accepted) {
      return;
    }

    pendingAssistantBaseline = adapter.readLastAssistantText(document);

    const event = buildEvent("user", promptText, "plain");
    emitCapturedEvent(event);
  }

  function startAssistantSettleCapture() {
    if (assistantSettleInFlight) {
      return;
    }

    assistantSettleInFlight = true;
    let pollCount = 0;
    let bestText = "";
    let stableTicks = 0;

    const poll = () => {
      pollCount += 1;

      if (adapter.isBusy(document)) {
        assistantSettleInFlight = false;
        clearAssistantSettleTimer();
        return;
      }

      const currentText = adapter.readLastAssistantText(document);
      if (currentText.length > bestText.length) {
        bestText = currentText;
        stableTicks = 0;
      } else if (currentText === bestText) {
        stableTicks += 1;
      }

      const done = stableTicks >= 2 || pollCount >= ASSISTANT_SETTLE_MAX_POLLS;
      if (!done) {
        assistantSettleTimer = setTimeout(poll, ASSISTANT_SETTLE_INTERVAL_MS);
        return;
      }

      assistantSettleInFlight = false;
      clearAssistantSettleTimer();

      if (!bestText.trim()) {
        return;
      }

      const assistantEvent = buildEvent("assistant", bestText, "structured");

      // Force one final busy->idle consume pass after settle completes.
      state.wasBusy = true;
      const emitted = stateApi.consumeAssistantFinalEvent(state, {
        isBusy: false,
        assistantEvent,
        nowMs: Date.now(),
      });

      if (emitted) {
        pendingAssistantBaseline = "";
        emitCapturedEvent(emitted);
      }
    };

    poll();
  }

  function maybeCaptureAssistantFinal() {
    const busyNow = adapter.isBusy(document);

    if (busyNow) {
      state.wasBusy = true;
      clearAssistantSettleTimer();
      assistantSettleInFlight = false;
      return;
    }

    if (state.pendingPrompt && state.wasBusy) {
      startAssistantSettleCapture();
      return;
    }

    if (!state.pendingPrompt || assistantSettleInFlight) {
      return;
    }

    // Some hosts do not expose a reliable stop button; fall back to
    // detecting that the last assistant message changed after prompt send.
    const latestAssistantText = adapter.readLastAssistantText(document);
    if (!latestAssistantText.trim()) {
      return;
    }

    if (latestAssistantText === pendingAssistantBaseline) {
      return;
    }

    startAssistantSettleCapture();
  }

  globalThis.addEventListener(
    "keydown",
    (event) => {
      if (event.defaultPrevented || event.isComposing) {
        return;
      }
      if (event.key !== "Enter" || event.shiftKey) {
        return;
      }
      capturePromptFromDom();
    },
    true,
  );

  globalThis.addEventListener(
    "click",
    (event) => {
      if (!adapter.isSendButtonClickTarget(event.target)) {
        return;
      }
      capturePromptFromDom();
    },
    true,
  );

  const observer = new MutationObserver(() => {
    maybeCaptureAssistantFinal();
  });

  const root = document.body || document.documentElement;
  if (!root) {
    console.error("[read_chat_gui] No DOM root to observe");
    return;
  }

  observer.observe(root, {
    childList: true,
    subtree: true,
    characterData: true,
  });

  void transport.flushQueue().catch((err) => {
    console.warn("[read_chat_gui] initial queue flush failed", err);
  });

  console.info(
    `[read_chat_gui] capture + streaming active for ${adapter.site}`,
  );
})();
