const parserApi =
  typeof module !== "undefined" && module.exports
    ? require("../core/markdownParser.js")
    : globalThis.ReadChatGuiMarkdownParser;

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function classNameFromNode(node) {
  if (!node) {
    return "";
  }

  if (typeof node.className === "string") {
    return node.className;
  }

  return String(
    typeof node.getAttribute === "function"
      ? node.getAttribute("class") || ""
      : "",
  );
}

/**
 * Append elements under `root` with a [class] attribute matching `pattern`.
 * Used for Tailwind-style tokens (e.g. `font-claude-response`) that are awkward in CSS.
 */
function appendMatchesForClassNameRegex(root, pattern, seen, out) {
  if (
    !root ||
    typeof root.querySelectorAll !== "function" ||
    !(pattern instanceof RegExp)
  ) {
    return;
  }

  let withClass;
  try {
    withClass = root.querySelectorAll("[class]");
  } catch (_err) {
    return;
  }

  Array.from(withClass).forEach((node) => {
    if (!node || seen.has(node)) {
      return;
    }
    if (!pattern.test(classNameFromNode(node))) {
      return;
    }
    seen.add(node);
    out.push(node);
  });
}

function readNodeText(node) {
  if (parserApi && typeof parserApi.readNodeText === "function") {
    return parserApi.readNodeText(node);
  }

  if (!node) {
    return "";
  }

  const raw =
    typeof node.innerText === "string"
      ? node.innerText
      : typeof node.textContent === "string"
        ? node.textContent
        : "";

  return String(raw || "")
    .replace(/\r/g, "")
    .trim();
}

function readEditableText(node) {
  if (!node) {
    return "";
  }

  if (typeof node.value === "string") {
    return String(node.value).replace(/\r/g, "").trim();
  }

  return readNodeText(node);
}

function firstSelectorMatch(doc, selectors) {
  if (!doc || typeof doc.querySelector !== "function") {
    return null;
  }

  const list = asArray(selectors);
  for (let i = 0; i < list.length; i += 1) {
    const selector = list[i];
    if (!selector) {
      continue;
    }

    const match = doc.querySelector(selector);
    if (match) {
      return match;
    }
  }

  return null;
}

/**
 * Union matches for message-root discovery.
 * - String entries: CSS selectors via `doc.querySelectorAll`.
 * - Object entries: `{ classNameRegex: RegExp }` — elements with `[class]` whose
 *   class string matches (for tokens embedded in long Tailwind class lists).
 */
function collectBySelectors(doc, selectors) {
  if (!doc || typeof doc.querySelectorAll !== "function") {
    return [];
  }

  const nodes = [];
  const seen = new Set();
  const list = asArray(selectors);

  list.forEach((entry) => {
    if (!entry) {
      return;
    }

    if (typeof entry === "string") {
      let matches;
      try {
        matches = doc.querySelectorAll(entry);
      } catch (_err) {
        return;
      }
      Array.from(matches).forEach((node) => {
        if (!node || seen.has(node)) {
          return;
        }
        seen.add(node);
        nodes.push(node);
      });
      return;
    }

    if (
      entry &&
      typeof entry === "object" &&
      entry.classNameRegex instanceof RegExp
    ) {
      appendMatchesForClassNameRegex(
        doc,
        entry.classNameRegex,
        seen,
        nodes,
      );
    }
  });

  const canSortByDom = nodes.every(
    (node) => node && typeof node.compareDocumentPosition === "function",
  );

  if (canSortByDom) {
    const DOCUMENT_POSITION_PRECEDING = 2;
    const DOCUMENT_POSITION_FOLLOWING = 4;

    nodes.sort((a, b) => {
      if (a === b) {
        return 0;
      }

      const position = a.compareDocumentPosition(b);
      if (position & DOCUMENT_POSITION_FOLLOWING) {
        return -1;
      }
      if (position & DOCUMENT_POSITION_PRECEDING) {
        return 1;
      }

      return 0;
    });
  }

  return nodes;
}

/**
 * When multiple selectors match nested nodes (e.g. `model-response` and inner
 * `[data-response-index]`), `collectBySelectors` returns them all; taking the
 * last node in document order can pick a deep fragment instead of the message
 * root. Drop any node that lies inside another matched node so we keep outer
 * message containers only.
 */
function filterToOutermostMatchedNodes(nodes) {
  const list = asArray(nodes).filter(Boolean);
  if (list.length <= 1) {
    return list;
  }

  return list.filter((node) => {
    for (let i = 0; i < list.length; i += 1) {
      const other = list[i];
      if (!other || other === node) {
        continue;
      }
      if (
        typeof other.contains === "function" &&
        other.contains(node)
      ) {
        return false;
      }
    }
    return true;
  });
}

function readPromptTextBySelectors(doc, selectors) {
  if (!doc || typeof doc.querySelectorAll !== "function") {
    return readEditableText(firstSelectorMatch(doc, selectors));
  }

  let best = "";
  const list = asArray(selectors);

  list.forEach((selector) => {
    if (!selector) {
      return;
    }

    const matches = doc.querySelectorAll(selector);
    Array.from(matches).forEach((node) => {
      const value = readEditableText(node);
      if (value.length > best.length) {
        best = value;
      }
    });
  });

  if (best) {
    return best;
  }

  return readEditableText(firstSelectorMatch(doc, selectors));
}

function isClickTarget(target, selectors) {
  if (!target || typeof target.closest !== "function") {
    return false;
  }

  return asArray(selectors).some((selector) =>
    Boolean(selector && target.closest(selector)),
  );
}

function hasAnySelector(doc, selectors) {
  return Boolean(firstSelectorMatch(doc, selectors));
}

function lowestCommonAncestor(nodes) {
  const list = asArray(nodes).filter(Boolean);
  if (list.length === 0) {
    return null;
  }
  if (list.length === 1) {
    return list[0];
  }

  function ancestorsChain(node) {
    const chain = [];
    let current = node;
    while (current) {
      chain.push(current);
      current = current.parentElement;
    }
    return chain;
  }

  function lcaPair(a, b) {
    const chainB = ancestorsChain(b);
    const setB = new Set(chainB);
    const chainA = ancestorsChain(a);
    for (let i = 0; i < chainA.length; i += 1) {
      if (setB.has(chainA[i])) {
        return chainA[i];
      }
    }
    return null;
  }

  return list.reduce((acc, node) => (acc ? lcaPair(acc, node) : node));
}

/**
 * Collect every node inside `root` matched by assistant content rules.
 * - String entries: CSS selectors (all matches via querySelectorAll).
 * - Object entries: `{ classNameRegex: RegExp }` — any element with [class]
 *   whose className matches the regex.
 * Union all entries, dedupe in document order (per entry order, then DOM order).
 */
function collectContentMatchNodes(root, contentEntries) {
  if (!root || typeof root.querySelectorAll !== "function") {
    return [];
  }

  const nodes = [];
  const seen = new Set();
  const list = asArray(contentEntries);

  for (let i = 0; i < list.length; i += 1) {
    const entry = list[i];
    if (!entry) {
      continue;
    }

    if (typeof entry === "string") {
      let matches;
      try {
        matches = root.querySelectorAll(entry);
      } catch (_err) {
        continue;
      }
      Array.from(matches).forEach((node) => {
        if (!node || seen.has(node)) {
          return;
        }
        seen.add(node);
        nodes.push(node);
      });
      continue;
    }

    if (
      entry &&
      typeof entry === "object" &&
      entry.classNameRegex instanceof RegExp
    ) {
      appendMatchesForClassNameRegex(root, entry.classNameRegex, seen, nodes);
    }
  }

  return nodes;
}

function resolveAssistantContentRoot(lastMessage, contentSelectors) {
  if (!lastMessage) {
    return null;
  }

  const matches = collectContentMatchNodes(lastMessage, contentSelectors);
  if (matches.length === 0) {
    return lastMessage;
  }

  const contentRoot =
    matches.length === 1 ? matches[0] : lowestCommonAncestor(matches);

  if (
    !contentRoot ||
    (lastMessage &&
      typeof lastMessage.contains === "function" &&
      !lastMessage.contains(contentRoot))
  ) {
    return lastMessage;
  }

  return contentRoot;
}

function readLastStructuredBySelectors(
  doc,
  messageSelectors,
  contentSelectors,
) {
  const rawMessages = collectBySelectors(doc, messageSelectors);
  const messages = filterToOutermostMatchedNodes(rawMessages);
  if (messages.length === 0) {
    return "";
  }

  const lastMessage = messages[messages.length - 1];
  if (!lastMessage) {
    return "";
  }

  const contentRoot = resolveAssistantContentRoot(
    lastMessage,
    contentSelectors,
  );

  if (parserApi && typeof parserApi.toMarkdown === "function") {
    return parserApi.toMarkdown(contentRoot);
  }

  return readNodeText(contentRoot);
}

const adapterCommonApi = {
  hasAnySelector,
  isClickTarget,
  readLastStructuredBySelectors,
  readPromptTextBySelectors,
  collectBySelectors,
  collectContentMatchNodes,
  filterToOutermostMatchedNodes,
  lowestCommonAncestor,
  resolveAssistantContentRoot,
};

if (typeof module !== "undefined" && module.exports) {
  module.exports = adapterCommonApi;
}

if (typeof globalThis !== "undefined") {
  globalThis.ReadChatGuiAdapterCommon = adapterCommonApi;
}
