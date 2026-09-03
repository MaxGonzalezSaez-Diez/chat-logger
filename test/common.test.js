const test = require("node:test");
const assert = require("node:assert/strict");

const common = require("../src/adapters/common.js");

test("lowestCommonAncestor for sibling nodes", () => {
  const root = { parentElement: null };
  const mid = { parentElement: root };
  const a = { parentElement: mid };
  const b = { parentElement: mid };
  assert.equal(common.lowestCommonAncestor([a, b]), mid);
});

test("lowestCommonAncestor single node", () => {
  const n = { parentElement: null };
  assert.equal(common.lowestCommonAncestor([n]), n);
});

test("collectContentMatchNodes unions CSS and classNameRegex", () => {
  const p1 = { className: "font-claude-response-body" };
  const p2 = { className: "unrelated" };
  const root = {
    querySelectorAll(sel) {
      if (sel === "p.hit") {
        return [p1];
      }
      if (sel === "[class]") {
        return [p1, p2];
      }
      return [];
    },
  };

  const nodes = common.collectContentMatchNodes(root, [
    "p.hit",
    { classNameRegex: /\bfont-claude-response-body\b/ },
  ]);

  assert.equal(nodes.length, 1);
  assert.equal(nodes[0], p1);
});

test("collectBySelectors includes classNameRegex matches on document", () => {
  const inner = {
    className: "x font-claude-response y",
    compareDocumentPosition() {
      return 4;
    },
  };
  const doc = {
    querySelectorAll(sel) {
      if (sel === "[class]") {
        return [inner];
      }
      return [];
    },
  };

  const nodes = common.collectBySelectors(doc, [
    { classNameRegex: /\bfont-claude-response\b/ },
  ]);

  assert.equal(nodes.length, 1);
  assert.equal(nodes[0], inner);
});

test("filterToOutermostMatchedNodes drops inner nodes when parent also matched", () => {
  const inner = { name: "inner" };
  const outer = {
    name: "outer",
    contains(node) {
      return node === inner;
    },
  };
  const aside = {
    name: "aside",
    contains() {
      return false;
    },
  };

  const filtered = common.filterToOutermostMatchedNodes([inner, outer, aside]);
  assert.equal(filtered.length, 2);
  assert.ok(filtered.includes(outer));
  assert.ok(filtered.includes(aside));
  assert.ok(!filtered.includes(inner));
});

test("resolveAssistantContentRoot uses LCA for multiple paragraphs", () => {
  const root = { parentElement: null };
  const wrap = { parentElement: root };
  const p1 = { parentElement: wrap };
  const p2 = { parentElement: wrap };

  const lastMessage = {
    contains(node) {
      return node === wrap || node === p1 || node === p2;
    },
    querySelectorAll(sel) {
      if (sel === "p") {
        return [p1, p2];
      }
      return [];
    },
  };

  const resolved = common.resolveAssistantContentRoot(lastMessage, ["p"]);
  assert.equal(resolved, wrap);
});
