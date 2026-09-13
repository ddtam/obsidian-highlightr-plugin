import { describe, expect, it } from "vitest";

import { highlightColour, parseHighlights } from "./parseHighlights";

const MARK = (t: string) => `<mark style="background: #A28AE5;">${t}</mark>`;

describe("parseHighlights", () => {
  it("finds a highlight and its colour", () => {
    const out = parseHighlights(`intro ${MARK("clonal")} tail`);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ line: 0, text: "clonal", hex: "#A28AE5" });
  });

  it("reports the source line, so the panel can scroll to it", () => {
    const out = parseHighlights(`a\nb\nc ${MARK("here")}\nd`);
    expect(out[0].line).toBe(2);
  });

  // The rule the whole parser exists for.
  it("ignores a mark inside a fenced block", () => {
    expect(parseHighlights("```\n" + MARK("doc") + "\n```")).toHaveLength(0);
  });

  it("ignores a mark inside an inline code span", () => {
    expect(parseHighlights("see `" + MARK("doc") + "` above")).toHaveLength(0);
  });

  it("keeps line numbers correct after a fenced block", () => {
    const doc = "```\nfoo\nbar\n```\n" + MARK("real");
    expect(parseHighlights(doc)[0].line).toBe(4);
  });

  it("finds a class-based highlight", () => {
    const out = parseHighlights('<mark class="hltr-yellow">x</mark>');
    expect(out[0]).toMatchObject({ name: "yellow", hex: null });
  });

  it("finds several on one line, in order", () => {
    const out = parseHighlights(`${MARK("one")} and ${MARK("two")}`);
    expect(out.map((h) => h.text)).toEqual(["one", "two"]);
  });

  it("skips an empty mark", () => {
    expect(parseHighlights("<mark></mark>")).toHaveLength(0);
  });

  it("survives an unterminated fence rather than swallowing the note", () => {
    // Everything after an unclosed fence is code as far as any renderer is
    // concerned, so nothing below it should be reported.
    expect(parseHighlights("```\n" + MARK("x"))).toHaveLength(0);
  });
});

describe("highlightColour", () => {
  const palette = { Purple: "#A28AE5", Yellow: "#FFD400" };

  it("prefers the inline hex", () => {
    expect(highlightColour(
      { line: 0, text: "x", hex: "#123456", name: null }, palette
    )).toBe("#123456");
  });

  it("looks a class up in the palette, case-insensitively", () => {
    expect(highlightColour(
      { line: 0, text: "x", hex: null, name: "yellow" }, palette
    )).toBe("#FFD400");
  });

  it("returns null for a class the palette does not hold", () => {
    expect(highlightColour(
      { line: 0, text: "x", hex: null, name: "chartreuse" }, palette
    )).toBeNull();
  });
});
