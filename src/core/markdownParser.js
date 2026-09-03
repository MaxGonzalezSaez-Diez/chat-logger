const TurndownServiceCtor =
  typeof module !== "undefined" && module.exports
    ? require("turndown")
    : globalThis.TurndownService;

function normalizeText(value) {
  return String(value || "").replace(/\r/g, "");
}

function cleanMarkdown(value) {
  return normalizeLatexInMarkdown(reflowBullets(normalizeText(value)))
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function reflowBullets(value) {
  return String(value || "")
    .replace(/(AAA\d+:)\s*-\s+/g, "$1\n\n- ")
    .replace(/([.!?])\s+-\s+(?=[A-Z$\\`])/g, "$1\n- ");
}

function readNodeText(node) {
  if (!node) {
    return "";
  }

  const raw =
    typeof node.innerText === "string"
      ? node.innerText
      : typeof node.textContent === "string"
        ? node.textContent
        : "";

  return normalizeText(raw).trim();
}

function hasClass(node, className) {
  return Boolean(
    node &&
    node.classList &&
    typeof node.classList.contains === "function" &&
    node.classList.contains(className),
  );
}

function findAncestorWithClass(node, className) {
  let current = node;
  while (current) {
    if (hasClass(current, className)) {
      return current;
    }
    current = current.parentElement;
  }
  return null;
}

function normalizeLangAlias(value) {
  const token = String(value || "")
    .trim()
    .toLowerCase();

  if (token === "js") {
    return "javascript";
  }
  if (token === "ts") {
    return "typescript";
  }
  if (token === "py") {
    return "python";
  }

  return token;
}

function languageFromClassName(className) {
  const value = String(className || "");
  const match = value.match(
    /(?:^|\s)(?:language|hljs)-([a-z0-9_+-]+)(?:\s|$)/i,
  );
  if (!match) {
    return "";
  }

  return normalizeLangAlias(match[1]);
}

function detectCodeLanguage(preNode, codeNode) {
  const codeClass = codeNode && codeNode.className;
  const preClass = preNode && preNode.className;
  const fromClass =
    languageFromClassName(codeClass) || languageFromClassName(preClass);
  if (fromClass) {
    return fromClass;
  }

  if (codeNode && typeof codeNode.getAttribute === "function") {
    return normalizeLangAlias(codeNode.getAttribute("data-language"));
  }

  if (preNode && typeof preNode.getAttribute === "function") {
    return normalizeLangAlias(preNode.getAttribute("data-language"));
  }

  return "";
}

function normalizeLatex(value) {
  return normalizeText(value)
    .replace(/\\{2,}(?=[a-zA-Z])/g, "\\")
    .trim();
}

function normalizeMathSegment(value) {
  return normalizeLatex(value).replace(/\\+_/g, "_");
}

function normalizeLatexInMarkdown(value) {
  let text = String(value || "");
  const blockMath = [];

  text = text.replace(/\$\$([\s\S]*?)\$\$/g, (_whole, expr) => {
    const index = blockMath.length;
    const normalized = normalizeMathSegment(String(expr || "").trim());
    blockMath.push(`$$\n${normalized}\n$$`);
    return `@@READ_CHAT_GUI_BLOCK_MATH_${index}@@`;
  });

  text = text.replace(/\$([^$\n]+)\$/g, (_whole, expr) => {
    return `$${normalizeMathSegment(expr)}$`;
  });

  text = text.replace(/@@READ_CHAT_GUI_BLOCK_MATH_(\d+)@@/g, (_whole, idx) => {
    const i = Number(idx);
    return Number.isInteger(i) && i >= 0 && i < blockMath.length
      ? blockMath[i]
      : "";
  });

  return text;
}

function readLatexFromNode(node) {
  if (!node) {
    return "";
  }

  if (typeof node.getAttribute === "function") {
    const dataMath = node.getAttribute("data-math");
    if (dataMath) {
      return normalizeLatex(dataMath);
    }

    const dataLatex = node.getAttribute("data-latex");
    if (dataLatex) {
      return normalizeLatex(dataLatex);
    }

    const ariaLabel = node.getAttribute("aria-label");
    if (ariaLabel && /[\\{}_^]/.test(ariaLabel)) {
      return normalizeLatex(ariaLabel);
    }
  }

  if (typeof node.querySelector === "function") {
    const annotation = node.querySelector("annotation");
    if (annotation && typeof annotation.textContent === "string") {
      return normalizeLatex(annotation.textContent);
    }
  }

  const katexAncestor = findAncestorWithClass(node, "katex");
  if (katexAncestor && typeof katexAncestor.querySelector === "function") {
    const annotation = katexAncestor.querySelector("annotation");
    if (annotation && typeof annotation.textContent === "string") {
      return normalizeLatex(annotation.textContent);
    }
  }

  return normalizeLatex(readNodeText(node));
}

function isDisplayMathNode(node) {
  if (!node) {
    return false;
  }

  if (hasClass(node, "math-block") || hasClass(node, "katex-display")) {
    return true;
  }

  if (findAncestorWithClass(node, "katex-display")) {
    return true;
  }

  const tag = String(node.nodeName || "").toUpperCase();
  if (
    (hasClass(node, "katex-html") || hasClass(node, "latex-html")) &&
    tag === "DIV"
  ) {
    return true;
  }

  return false;
}

function createTurndownService() {
  if (typeof TurndownServiceCtor !== "function") {
    return null;
  }

  const turndown = new TurndownServiceCtor({
    headingStyle: "atx",
    codeBlockStyle: "fenced",
    bulletListMarker: "-",
    emDelimiter: "_",
    strongDelimiter: "**",
  });

  turndown.addRule("readChatGuiFencedCode", {
    filter(node) {
      if (!node) {
        return false;
      }

      if (node.nodeName === "PRE") {
        return true;
      }

      if (node.nodeName === "CODE") {
        if (node.parentElement && node.parentElement.nodeName === "PRE") {
          return false;
        }

        const dataTestId =
          typeof node.getAttribute === "function"
            ? node.getAttribute("data-test-id")
            : "";

        if (dataTestId === "code-content") {
          return true;
        }

        return /(?:^|\s)language-[a-z0-9_+-]+(?:\s|$)/i.test(
          String(node.className || ""),
        );
      }

      return node.id === "code-block-viewer";
    },
    replacement(_content, node) {
      let codeNode = null;
      let preNode = null;

      if (node.nodeName === "PRE") {
        preNode = node;
        codeNode =
          node && typeof node.querySelector === "function"
            ? node.querySelector("code")
            : null;
      } else if (node.nodeName === "CODE") {
        codeNode = node;
        preNode =
          node.parentElement && node.parentElement.nodeName === "PRE"
            ? node.parentElement
            : node.parentElement || null;
      } else if (node && node.id === "code-block-viewer") {
        preNode = node;
        codeNode =
          typeof node.querySelector === "function"
            ? node.querySelector('code[data-test-id="code-content"], code')
            : null;
      }

      const rawCode =
        (codeNode && readNodeText(codeNode)) ||
        (node && readNodeText(node)) ||
        "";

      const codeText = normalizeText(rawCode).replace(/\n+$/g, "");
      if (!codeText.trim()) {
        return "\n\n";
      }

      const language = detectCodeLanguage(preNode, codeNode);
      const fence = codeText.includes("```") ? "````" : "```";
      return `\n\n${fence}${language || ""}\n${codeText}\n${fence}\n\n`;
    },
  });

  turndown.addRule("readChatGuiDataMath", {
    filter(node) {
      if (
        !node ||
        typeof node.getAttribute !== "function" ||
        typeof node.className !== "string"
      ) {
        return false;
      }

      const dataMath = node.getAttribute("data-math");
      if (!dataMath) {
        return false;
      }

      const cls = node.className;
      if (!/\bmath-(inline|block)\b/.test(cls)) {
        return false;
      }

      return true;
    },
    replacement(_content, node) {
      const latex = readLatexFromNode(node);
      if (!latex) {
        return "";
      }

      const isDisplay = isDisplayMathNode(node);

      return isDisplay ? `\n\n$$\n${latex}\n$$\n\n` : `$${latex}$`;
    },
  });

  turndown.addRule("readChatGuiLatexClasses", {
    filter(node) {
      if (!node || !node.classList) {
        return false;
      }

      const isKatex = hasClass(node, "katex");
      const isKatexHtml = hasClass(node, "katex-html");
      const isLatexHtml = hasClass(node, "latex-html");

      if (!isKatex && !isKatexHtml && !isLatexHtml) {
        return false;
      }

      if (
        isKatexHtml &&
        node.parentElement &&
        findAncestorWithClass(node.parentElement, "katex")
      ) {
        return false;
      }

      return true;
    },
    replacement(_content, node) {
      const latex = readLatexFromNode(node);
      if (!latex) {
        return "";
      }

      const isDisplay = isDisplayMathNode(node);

      return isDisplay ? `\n\n$$\n${latex}\n$$\n\n` : `$${latex}$`;
    },
  });

  return turndown;
}

let cachedTurndownService = null;

function getTurndownService() {
  if (!cachedTurndownService) {
    cachedTurndownService = createTurndownService();
  }
  return cachedTurndownService;
}

function toMarkdown(node) {
  if (!node) {
    return "";
  }

  if (typeof node.cloneNode !== "function") {
    return readNodeText(node);
  }

  const turndown = getTurndownService();
  if (!turndown || typeof turndown.turndown !== "function") {
    return readNodeText(node);
  }

  try {
    const markdown = turndown.turndown(node.cloneNode(true));
    return cleanMarkdown(markdown);
  } catch (_err) {
    return readNodeText(node);
  }
}

const markdownParserApi = {
  readNodeText,
  toMarkdown,
};

if (typeof module !== "undefined" && module.exports) {
  module.exports = markdownParserApi;
}

if (typeof globalThis !== "undefined") {
  globalThis.ReadChatGuiMarkdownParser = markdownParserApi;
}
