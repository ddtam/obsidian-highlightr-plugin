import { describe, expect, it } from "vitest";

import {
  canonicalHex,
  describeSelection,
  HIGHLIGHT_SUFFIX,
  highlightPrefix,
  type ReadingSelection,
  rewriteSource,
  rewriteSourceRemoving,
} from "./readingModeHighlight";

const MARK = '<mark style="background: #A28AE5A6;">';
const END = "</mark>";

const sel = (over: Partial<ReadingSelection> = {}): ReadingSelection => ({
  path: "note.md",
  lineStart: 1,
  lineEnd: 1,
  text: "clonal",
  occurrence: 0,
  renderedCount: 1,
  ...over,
});

describe("rewriteSource", () => {
  it("wraps the selection and leaves every other line alone", () => {
    const doc = "# Title\nA clonal expansion.\nAnother line.";
    const out = rewriteSource(doc, sel(), MARK, END);
    expect(out.error).toBeUndefined();
    expect(out.text).toBe(`# Title\nA ${MARK}clonal${END} expansion.\nAnother line.`);
  });

  it("wraps the occurrence that was selected, not the first", () => {
    const doc = "clonal here and clonal there";
    const out = rewriteSource(
      doc,
      sel({ lineStart: 0, lineEnd: 0, occurrence: 1, renderedCount: 2 }),
      MARK,
      END
    );
    expect(out.text).toBe(`clonal here and ${MARK}clonal${END} there`);
  });

  // The safety property. Rendered text and source text differ wherever markup
  // was consumed, and that is exactly when an offset cannot be trusted.
  it("refuses when the source does not match what was rendered", () => {
    // Rendered as one "clonal", but the source hides it inside a wikilink
    // alias, so the counts disagree.
    const doc = "See [[clonal haematopoiesis|clonal]] and clonal.";
    const out = rewriteSource(
      doc,
      sel({ lineStart: 0, lineEnd: 0, renderedCount: 1 }),
      MARK,
      END
    );
    expect(out.text).toBeUndefined();
    expect(out.error).toMatch(/does not appear in the source/);
  });

  it("refuses when the note has shrunk since the selection", () => {
    const out = rewriteSource("only one line", sel({ lineStart: 4, lineEnd: 4 }), MARK, END);
    expect(out.error).toMatch(/changed since/);
  });

  it("handles the first line without losing content", () => {
    const doc = "clonal start\nsecond";
    const out = rewriteSource(doc, sel({ lineStart: 0, lineEnd: 0 }), MARK, END);
    expect(out.text).toBe(`${MARK}clonal${END} start\nsecond`);
  });

  it("handles the last line without losing content", () => {
    const doc = "first\nclonal end";
    const out = rewriteSource(doc, sel({ lineStart: 1, lineEnd: 1 }), MARK, END);
    expect(out.text).toBe(`first\n${MARK}clonal${END} end`);
  });

  it("preserves a trailing newline", () => {
    const doc = "clonal\n";
    const out = rewriteSource(doc, sel({ lineStart: 0, lineEnd: 0 }), MARK, END);
    expect(out.text).toBe(`${MARK}clonal${END}\n`);
  });

  it("spans a multi-line block", () => {
    const doc = "intro\n- a clonal item\n  continued here\noutro";
    const out = rewriteSource(doc, sel({ lineStart: 1, lineEnd: 2 }), MARK, END);
    expect(out.text).toBe(
      `intro\n- a ${MARK}clonal${END} item\n  continued here\noutro`
    );
  });
});

describe("describeSelection", () => {
  const block = (html: string) => {
    const el = document.createElement("div");
    el.dataset.hlLineStart = "3";
    el.dataset.hlLineEnd = "3";
    el.dataset.hlPath = "note.md";
    el.innerHTML = html;
    document.body.replaceChildren(el);
    return el;
  };

  const select = (node: Node, from: number, to: number) => {
    const range = document.createRange();
    range.setStart(node, from);
    range.setEnd(node, to);
    const s = window.getSelection();
    s?.removeAllRanges();
    s?.addRange(range);
    return s;
  };

  it("reads the line range and occurrence off the block", () => {
    const el = block("one clonal two clonal three");
    const text = el.firstChild as Text;
    const found = describeSelection(select(text, 15, 21));
    expect(found).toMatchObject({
      path: "note.md",
      lineStart: 3,
      lineEnd: 3,
      text: "clonal",
      occurrence: 1,
      renderedCount: 2,
    });
  });

  it("counts across element boundaries, so markup does not shift the index", () => {
    const el = block("clonal <em>and</em> clonal");
    const tail = el.lastChild as Text;
    const found = describeSelection(select(tail, 1, 7));
    expect(found).toMatchObject({ occurrence: 1, renderedCount: 2 });
  });

  it("ignores a selection outside any stamped block", () => {
    const el = document.createElement("div");
    el.textContent = "clonal";
    document.body.replaceChildren(el);
    expect(describeSelection(select(el.firstChild as Text, 0, 6))).toBeNull();
  });

  it("ignores a collapsed selection", () => {
    const el = block("clonal");
    expect(describeSelection(select(el.firstChild as Text, 2, 2))).toBeNull();
  });

  it("ignores whitespace", () => {
    const el = block("a   b");
    expect(describeSelection(select(el.firstChild as Text, 1, 4))).toBeNull();
  });
});

describe("highlightPrefix", () => {
  // The exact bytes automation greps for. If either of these changes, a flag
  // pipeline stops seeing highlights and nothing errors anywhere.
  it("emits the inline-styles template exactly", () => {
    expect(highlightPrefix("inline-styles", "Purple", "#A28AE5A6")).toBe(
      '<mark style="background: #A28AE5A6;">'
    );
  });

  it("emits the css-classes template exactly", () => {
    expect(highlightPrefix("css-classes", "Purple", "#A28AE5A6")).toBe(
      '<mark class="hltr-purple">'
    );
  });

  it("closes with a plain mark tag", () => {
    expect(HIGHLIGHT_SUFFIX).toBe("</mark>");
  });
});

describe("canonicalHex", () => {
  // Pickr builds the RGB bytes with toString(16) and uppercases only the
  // alpha, so a colour set through the picker arrives as #a28ae5A6. A reader
  // matching the literal string would never see it.
  it("uppercases what the picker produces", () => {
    expect(canonicalHex("#a28ae5A6")).toBe("#A28AE5A6");
  });

  it("leaves a non-hex value alone", () => {
    expect(canonicalHex("rgba(1, 2, 3, 0.5)")).toBe("rgba(1, 2, 3, 0.5)");
  });

  it("survives the round trip into the emitted markup", () => {
    expect(highlightPrefix("inline-styles", "Purple", "#a28ae5a6")).toBe(
      '<mark style="background: #A28AE5A6;">'
    );
  });
});

describe("rewriteSourceRemoving", () => {
  const inMark = (over = {}) =>
    sel({
      lineStart: 0,
      lineEnd: 0,
      mark: { text: "clonal", occurrence: 0, count: 1 },
      ...over,
    });

  it("strips the tags and leaves the words", () => {
    const doc = `A ${MARK}clonal${END} expansion.`;
    expect(rewriteSourceRemoving(doc, inMark()).text).toBe("A clonal expansion.");
  });

  it("removes the highlight that was selected, not the first", () => {
    const doc = `${MARK}clonal${END} and ${MARK}clonal${END}`;
    const out = rewriteSourceRemoving(
      doc,
      inMark({ mark: { text: "clonal", occurrence: 1, count: 2 } })
    );
    expect(out.text).toBe(`${MARK}clonal${END} and clonal`);
  });

  it("removes a css-classes highlight too", () => {
    const doc = '<mark class="hltr-yellow">clonal</mark> here';
    expect(rewriteSourceRemoving(doc, inMark()).text).toBe("clonal here");
  });

  it("refuses when the source and the render disagree", () => {
    const doc = `${MARK}clonal${END} only one here`;
    const out = rewriteSourceRemoving(
      doc,
      inMark({ mark: { text: "clonal", occurrence: 1, count: 2 } })
    );
    expect(out.text).toBeUndefined();
    expect(out.error).toMatch(/do not match what is rendered/);
  });

  it("refuses when the selection is not in a highlight at all", () => {
    const out = rewriteSourceRemoving("plain text", sel({ mark: undefined }));
    expect(out.error).toMatch(/not inside a highlight/);
  });

  it("leaves text containing regex metacharacters alone", () => {
    const doc = `${MARK}a.b(c)${END} tail`;
    const out = rewriteSourceRemoving(
      doc,
      inMark({ mark: { text: "a.b(c)", occurrence: 0, count: 1 } })
    );
    expect(out.text).toBe("a.b(c) tail");
  });
});
