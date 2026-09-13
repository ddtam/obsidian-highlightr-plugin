import { describe, expect, it } from "vitest";

import { contrastText, paintMarkInk } from "./createStyles";

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

describe("paintMarkInk", () => {
  const settings = {
    contrastText: true,
    highlighters: { Yellow: "#FFD400", Purple: "#A28AE5A6" },
  } as never;

  const render = (html: string) => {
    const el = document.createElement("div");
    el.innerHTML = html;
    paintMarkInk(el, settings);
    return el;
  };

  it("inks a highlight with no alpha, which the old selector rule missed", () => {
    const el = render('<mark style="background: #FFD400;">x</mark>');
    expect(el.querySelector("mark")?.style.color).toBe("rgb(0, 0, 0)");
  });

  it("inks a colour the palette no longer contains", () => {
    const el = render('<mark style="background: #101020A6;">x</mark>');
    expect(el.querySelector("mark")?.style.color).toBe("rgb(255, 255, 255)");
  });

  it("wins against a theme rule by using important", () => {
    const el = render('<mark style="background: #FFD400;">x</mark>');
    expect(
      el.querySelector("mark")?.style.getPropertyPriority("color")
    ).toBe("important");
  });

  it("looks a class-based highlight up in the palette", () => {
    const el = render('<mark class="hltr-purple">x</mark>');
    expect(el.querySelector("mark")?.style.color).toBe("rgb(0, 0, 0)");
  });

  it("leaves a highlight it cannot resolve alone", () => {
    const el = render('<mark class="hltr-unknown">x</mark>');
    expect(el.querySelector("mark")?.style.color).toBe("");
  });

  it("does nothing when the setting is off", () => {
    const el = document.createElement("div");
    el.innerHTML = '<mark style="background: #FFD400;">x</mark>';
    paintMarkInk(el, { contrastText: false, highlighters: {} } as never);
    expect(el.querySelector("mark")?.style.color).toBe("");
  });
});
