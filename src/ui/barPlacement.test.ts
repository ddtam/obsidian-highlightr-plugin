import { describe, expect, it } from "vitest";
import { GAP, gutterFits, place } from "src/ui/barPlacement";

/**
 * The two panes measured in the live vault on 2026-09-15, which is where the
 * threshold comes from rather than from a guess.
 *
 *   wide    pane 1531, text starts 440 in
 *   narrow  pane  630, text starts  37 in   (two documents side by side)
 *
 * A rotated bar is one 34px swatch plus 6px padding each side and a border:
 * 48px, so it needs 64px with the gaps. The wide pane clears that seven times
 * over and the narrow one cannot, which is the behaviour asked for.
 */
const WIDE = { left: 440, columnLeft: 1176 };
const NARROW = { left: 37, columnLeft: 774 };

const VERTICAL = { width: 48, height: 160 };
const HORIZONTAL = { width: 170, height: 48 };
const VIEWPORT = { width: 2268, height: 1200 };

const at = (top: number, bottom: number, left = 1176) => ({
  top,
  bottom,
  left,
  right: left + 400,
});

const base = {
  bar: VERTICAL,
  anchor: at(300, 320),
  selection: at(300, 900),
  gutter: WIDE,
  viewport: VIEWPORT,
  forward: true,
};

describe("gutterFits", () => {
  it("accepts a gap that holds the bar and both gaps", () => {
    expect(gutterFits(WIDE, VERTICAL)).toBe(true);
  });

  it("rejects the side-by-side pane", () => {
    expect(gutterFits(NARROW, VERTICAL)).toBe(false);
  });

  // The reason the bar is rotated at all: the same gap that holds a column
  // does not hold a row, so measuring the unrotated bar would reject a pane
  // that works.
  it("rejects a gap that holds a column but not a row", () => {
    expect(gutterFits({ left: 80, columnLeft: 500 }, VERTICAL)).toBe(true);
    expect(gutterFits({ left: 80, columnLeft: 500 }, HORIZONTAL)).toBe(false);
  });

  it("treats an unmeasurable pane as no gap", () => {
    expect(gutterFits(null, VERTICAL)).toBe(false);
  });
});

describe("place, beside the text", () => {
  it("sits against the text's left edge, outside it", () => {
    const spot = place(base);
    expect(spot.mode).toBe("gutter");
    expect(spot.left).toBe(WIDE.columnLeft - GAP - VERTICAL.width);
    expect(spot.left + VERTICAL.width).toBeLessThan(WIDE.columnLeft);
  });

  // The whole point: the anchor does not move while the selection grows, so
  // neither does the bar.
  it("does not move as the selection grows", () => {
    const start = place({ ...base, selection: at(300, 320) });
    const dragged = place({ ...base, selection: at(300, 2000) });
    expect(dragged).toEqual(start);
  });

  it("stays on screen for a selection near the bottom", () => {
    const spot = place({ ...base, anchor: at(1190, 1195) });
    expect(spot.top).toBeLessThanOrEqual(VIEWPORT.height - VERTICAL.height);
  });
});

describe("place, falling back to the anchor", () => {
  const narrow = { ...base, bar: HORIZONTAL, gutter: NARROW };

  it("goes above the anchor when dragging forwards", () => {
    const spot = place(narrow);
    expect(spot.mode).toBe("anchor");
    expect(spot.top).toBe(300 - HORIZONTAL.height - GAP);
  });

  it("goes below the anchor when dragging backwards", () => {
    const spot = place({ ...narrow, forward: false, anchor: at(880, 900) });
    expect(spot.top).toBe(900 + GAP);
  });

  // Both directions put the bar behind the cursor, over text already read.
  it("never sits between the anchor and the moving end", () => {
    const down = place(narrow);
    expect(down.top + HORIZONTAL.height).toBeLessThanOrEqual(300);
    const up = place({ ...narrow, forward: false, anchor: at(880, 900) });
    expect(up.top).toBeGreaterThanOrEqual(900);
  });

  it("lines up with the text's left edge", () => {
    expect(place(narrow).left).toBe(1176);
  });

  it("is clamped rather than pushed off the top", () => {
    const spot = place({ ...narrow, anchor: at(4, 20) });
    expect(spot.top).toBe(GAP);
  });

  it("falls back when the pane cannot be measured", () => {
    expect(place({ ...base, gutter: null }).mode).toBe("anchor");
  });

  // Reported after plus.20: narrowing the pane turned the bar horizontal
  // and widening it again left it that way. The decision is pure and has
  // no memory, so it returns to the gutter as soon as it is asked again;
  // what was missing was anything asking on a resize.
  it("returns to the gutter when the space comes back", () => {
    const squeezed = place({ ...base, bar: HORIZONTAL, gutter: NARROW });
    expect(squeezed.mode).toBe("anchor");
    const restored = place(base);
    expect(restored.mode).toBe("gutter");
    expect(restored).toEqual(place(base));
  });
});
