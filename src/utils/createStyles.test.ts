import { describe, expect, it } from "vitest";

import { contrastText } from "./createStyles";

describe("contrastText", () => {
  it("puts dark ink on a pale highlight", () => {
    expect(contrastText("#FFD400A6")).toBe("#000000"); // Zotero yellow
    expect(contrastText("#FFFFFF")).toBe("#000000");
  });

  it("puts light ink on a dark highlight", () => {
    expect(contrastText("#000000")).toBe("#ffffff");
    expect(contrastText("#253B80")).toBe("#ffffff");
  });

  // A lightness threshold gets these two wrong in opposite directions, which
  // is why the choice is made by contrast ratio instead.
  it("handles mid-tones by ratio", () => {
    expect(contrastText("#5FB236A6")).toBe("#000000"); // Zotero green
    expect(contrastText("#A28AE5A6")).toBe("#000000"); // Zotero purple
  });

  it("expands shorthand hex", () => {
    expect(contrastText("#fff")).toBe("#000000");
    expect(contrastText("#000")).toBe("#ffffff");
  });

  it("declines anything that is not a hex", () => {
    expect(contrastText("rebeccapurple")).toBeNull();
    expect(contrastText("rgb(1,2,3)")).toBeNull();
  });
});
