import { describe, expect, it } from "vitest";
import DEFAULT_SETTINGS, {
  moveDescription,
  restOpacity,
  swatchLabel,
} from "./settingsData";

describe("swatchLabel", () => {
  it("adds the meaning after the name", () => {
    const d = { Purple: "Flag: give this concept a home" };
    expect(swatchLabel("Purple", d)).toEqual({
      label: "Purple: Flag: give this concept a home",
      description: "Flag: give this concept a home",
    });
  });

  it("treats missing, blank and whitespace as no meaning", () => {
    for (const d of [undefined, {}, { Red: "" }, { Red: "   " }]) {
      expect(swatchLabel("Red", d)).toEqual({
        label: "Red",
        description: null,
      });
    }
  });

  it("trims the stored text", () => {
    expect(swatchLabel("Yellow", { Yellow: " mine " }).description).toBe(
      "mine"
    );
  });
});

describe("moveDescription", () => {
  it("carries a meaning across a rename", () => {
    const d: Record<string, string> = { Red: "clarify" };
    moveDescription(d, "Red", "Crimson");
    expect(d).toEqual({ Crimson: "clarify" });
  });

  it("drops a meaning when its colour is deleted", () => {
    const d: Record<string, string> = { Red: "clarify", Blue: "x" };
    moveDescription(d, "Red", null);
    expect(d).toEqual({ Blue: "x" });
  });

  it("leaves the map alone for a colour with no meaning", () => {
    const d: Record<string, string> = { Blue: "x" };
    moveDescription(d, "Red", "Crimson");
    expect(d).toEqual({ Blue: "x" });
  });
});

describe("restOpacity", () => {
  it("clamps to the slider's range", () => {
    expect(restOpacity(0)).toBe(0.1);
    expect(restOpacity(2)).toBe(1);
    expect(restOpacity(0.4)).toBe(0.4);
  });

  it("falls back to opaque for a value that is not a number", () => {
    expect(restOpacity(undefined)).toBe(1);
    expect(restOpacity("abc")).toBe(1);
  });

  it("accepts a number written into data.json as a string", () => {
    expect(restOpacity("0.5")).toBe(0.5);
  });
});

describe("defaults", () => {
  it("ship no meanings, so nothing is hardcoded", () => {
    expect(DEFAULT_SETTINGS.colorDescriptions).toEqual({});
  });
});
