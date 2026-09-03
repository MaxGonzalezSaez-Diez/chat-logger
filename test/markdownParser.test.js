const test = require("node:test");
const assert = require("node:assert/strict");

const parser = require("../src/core/markdownParser.js");

function parseHtml(html) {
  return parser.toMarkdown({
    cloneNode() {
      return String(html || "");
    },
  });
}

test("gemini data-math inline and block become markdown math", () => {
  const inline = parseHtml(
    '<div>Value: <span class="math-inline" data-math="x^2 + y^2">rendered</span></div>',
  );
  assert.match(inline, /\$x\^2 \+ y\^2\$/);

  const block = parseHtml(
    '<div class="math-block" data-math="\\int_{0}^{1} x\\,dx">rendered</div>',
  );
  assert.match(block, /\$\$/);
  assert.match(block, /\\int_\{0\}\^\{1\} x\\,dx/);
});

test("latex commands normalize to single backslash", () => {
  const markdown = parseHtml(
    '<span class="math-inline" data-math="\\\\sum_{i=1}^{n} i">rendered</span>',
  );

  assert.match(markdown, /^\$\\sum_\{i=1\}\^\{n\} i\$$/);
});

test("code[data-test-id=code-content] becomes fenced code block", () => {
  const markdown = parseHtml(
    '<div><code data-test-id="code-content" class="language-python">print("hi")</code></div>',
  );

  assert.match(markdown, /```python/);
  assert.match(markdown, /print\("hi"\)/);
});

test("#code-block-viewer becomes fenced code block", () => {
  const markdown = parseHtml(
    '<div id="code-block-viewer"><code class="language-javascript">console.log(1);</code></div>',
  );

  assert.match(markdown, /```javascript/);
  assert.match(markdown, /console\.log\(1\);/);
});

test("katex inline and display become markdown math", () => {
  const inline = parseHtml(
    '<p>Inline <span class="katex"><annotation>E=mc^2</annotation><span class="katex-html"></span></span></p>',
  );
  assert.match(inline, /\$E=mc\^2\$/);

  const display = parseHtml(
    '<div class="katex-display"><span class="katex"><annotation>\\int x\\,dx</annotation><span class="katex-html"></span></span></div>',
  );
  assert.match(display, /\$\$/);
  assert.match(display, /\\int x\\,dx/);
});

test("latex-html class uses block math for div nodes", () => {
  const markdown = parseHtml(
    '<div class="latex-html" data-latex="\\sqrt{\\pi}">rendered</div>',
  );

  assert.match(markdown, /\$\$/);
  assert.match(markdown, /\\sqrt\{\\pi\}/);
});

test("li elements are preserved as markdown bullets", () => {
  const markdown = parseHtml("<ul><li>first</li><li>second</li></ul>");

  assert.match(markdown, /-\s+first/);
  assert.match(markdown, /-\s+second/);
});

test("flattened flashcard bullets are reflowed onto separate lines", () => {
  const markdown = parseHtml(
    "<div>AAA1: - First bullet sentence. - Second bullet sentence.</div>",
  );

  assert.match(markdown, /AAA1:\n\n- First bullet sentence\./);
  assert.match(markdown, /\n- Second bullet sentence\./);
});

test("raw markdown math text normalizes doubled slashes and escaped underscores", () => {
  const markdown = parseHtml("<div>$$\\\\sum\\_{i=1}^{n} i$$</div>");

  assert.match(markdown, /\$\$\n\\sum_\{i=1\}\^\{n\} i\n\$\$/);
});
