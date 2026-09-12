import { describe, expect, it } from "vitest";

import {
  describeSelection,
  type ReadingSelection,
  rewriteSource,
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
