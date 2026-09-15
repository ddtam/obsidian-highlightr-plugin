/**
 * Where the reading-mode bar goes on a desktop pane.
 *
 * THE PROBLEM THIS REPLACES. The bar was positioned from
 * `selection.getRangeAt(0).getBoundingClientRect()`, the bounding box of the
 * whole selection, and placed under its bottom edge. That box grows as you
 * drag, so the bar tracked the moving end of the selection and sat on top of
 * the text you were about to read. Mobile solved it by docking to the
 * navbar; a desktop pane has somewhere better to put it.
 *
 * THE GAP BESIDE THE TEXT. Something narrows the text column below the pane
 * width, leaving space between the pane's left edge and where the text
 * starts. A bar parked there, right-aligned against the text, is beside the
 * reading rather than over it and does not move at all while you drag, which
 * is the actual complaint. The space shrinks as the pane does, so two
 * documents side by side is the case that falls back.
 *
 * MEASURED FROM THE TEXT, NOT FROM A CONTAINER. The first attempt measured
 * `.markdown-preview-sizer` against its scroller and found zero, because in
 * this vault the sizer is full width and the BLOCKS INSIDE IT carry the
 * constraint: a plain block is `min(--line-width, --max-width)` under
 * Minimal. Whatever imposes it, readable line length or a theme variable or
 * a CSS snippet, the answer is the same if you ask where the text actually
 * is rather than which element theoretically bounds it.
 *
 * And measured from the SELECTION's own pane, not a document-wide selector:
 * `querySelector` finds the first preview in the DOM, which in a split or
 * with a background leaf is not the one being read.
 *
 * THE FALLBACK, AND WHY IT IS ONE RULE RATHER THAN TWO. With the gutter too
 * narrow, the bar goes at the END YOU STARTED FROM, which is the one end
 * that does not move while you drag. Dragging forwards that is the top of
 * the selection, so the bar sits above it; dragging backwards it is the
 * bottom, so the bar sits below. Both cases are "pin to the anchor and put
 * the bar on the side you are dragging away from", and the anchor is
 * available directly from the Selection rather than inferred from which
 * direction the rects moved.
 */

export interface Size {
  width: number;
  height: number;
}

export interface Rect {
  top: number;
  bottom: number;
  left: number;
  right: number;
}

export interface Gutter {
  /** Space between the pane's left edge and the text column. */
  left: number;
  /** Viewport x of the text column's left edge. */
  columnLeft: number;
}

export interface PlacementInput {
  bar: Size;
  /** The anchor end of the selection, collapsed: where the drag began. */
  anchor: Rect;
  /** The whole selection, for the left edge the fallback lines up with. */
  selection: Rect;
  gutter: Gutter | null;
  viewport: Size;
  /** True when the focus end is after the anchor: a normal forward drag. */
  forward: boolean;
}

export interface Placement {
  mode: "gutter" | "anchor";
  top: number;
  left: number;
}

/** Breathing room between the bar and whatever it sits beside. */
export const GAP = 8;

/** Blocks a selection can sit in whose left edge is the text column's. */
const BLOCK =
  "p, li, td, th, blockquote, pre, h1, h2, h3, h4, h5, h6, " +
  ".callout, .markdown-preview-sizer > div";

/** Panes a reading selection can be inside, innermost first. */
const PANE = ".markdown-preview-view, .markdown-reading-view, .view-content";

/**
 * The space left of the text, and where the text starts, for the pane the
 * selection is in. Null when either cannot be found, which a caller reads as
 * "no gap", falling back rather than guessing.
 *
 * The column edge comes from the anchor's BLOCK rather than from the
 * selection's own rect: a selection inside one line starts wherever the drag
 * did, so its left edge is not the column's. A block's is.
 */
export function gutterOf(node: Node | null): Gutter | null {
  const el =
    node === null
      ? null
      : node.nodeType === 3
      ? node.parentElement
      : (node as Element);
  if (el === null) return null;

  const block = el.closest(BLOCK);
  const pane = el.closest(PANE);
  if (block === null || pane === null) return null;

  const b = block.getBoundingClientRect();
  const p = pane.getBoundingClientRect();
  if (b.width === 0 || p.width === 0) return null;

  return { left: b.left - p.left, columnLeft: b.left };
}

const clamp = (v: number, lo: number, hi: number): number =>
  Math.max(lo, Math.min(v, hi));

/**
 * A gutter has to hold the bar AND the gaps either side of it, or the bar
 * overlaps either the text or the pane edge. Checked against the bar's
 * measured width, not a constant, because the gutter bar is rotated to a
 * column and a caller that forgot to rotate it would otherwise be told a
 * 170px horizontal bar fits a 60px gutter.
 */
export function gutterFits(gutter: Gutter | null, bar: Size): boolean {
  if (gutter === null) return false;
  return gutter.left >= bar.width + GAP * 2;
}

export function place(input: PlacementInput): Placement {
  const { bar, anchor, selection, gutter, viewport, forward } = input;
  const maxTop = Math.max(GAP, viewport.height - bar.height - GAP);
  const maxLeft = Math.max(GAP, viewport.width - bar.width - GAP);

  if (gutterFits(gutter, bar)) {
    // Level with where the drag began, so it does not move while dragging.
    return {
      mode: "gutter",
      top: clamp(anchor.top, GAP, maxTop),
      left: clamp((gutter as Gutter).columnLeft - GAP - bar.width, GAP, maxLeft),
    };
  }

  // Above the anchor when dragging down, below it when dragging up: the bar
  // ends up behind the cursor either way, over text already read.
  const top = forward
    ? anchor.top - bar.height - GAP
    : anchor.bottom + GAP;

  return {
    mode: "anchor",
    top: clamp(top, GAP, maxTop),
    left: clamp(selection.left, GAP, maxLeft),
  };
}
