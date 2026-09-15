import { Platform } from "obsidian";
import { GAP, gutterOf, place } from "src/ui/barPlacement";

import type { ReadingSelection } from "src/plugin/readingModeHighlight";

/**
 * A swatch bar that appears beside a selection in reading mode.
 *
 * The command palette works, but on a phone it costs three moves: select,
 * pull down the palette, then find the colour by name. This is one tap.
 *
 * It is only safe because the selection is already cached by
 * ReadingSelectionTracker. Touching this bar collapses the selection, exactly
 * as opening the palette does, and the cached descriptor is what both paths
 * act on, so the bar does not have to fight the browser to keep a selection
 * alive while it is being tapped.
 *
 * Nothing here can add to the iOS selection menu. That bar belongs to the
 * WKWebView, and only the host app could extend it.
 */
/** Why the bar is up, which decides what is allowed to take it down. */
export type BarSource = "selection" | "tap";


/**
 * The rect of the end the drag STARTED from, collapsed, which is the one
 * point in a growing selection that does not move.
 *
 * A collapsed range has no width, and some engines return an empty rect for
 * one, so the client rects are tried first and the bounding box is the
 * fallback. Null when there is no live selection, which happens for a tapped
 * highlight rather than a drag.
 */
export function anchorRect(live: Selection | null): DOMRect | null {
  if (live === null || live.anchorNode === null) return null;
  const r = document.createRange();
  try {
    r.setStart(live.anchorNode, live.anchorOffset);
    r.collapse(true);
  } catch {
    return null;
  }
  const rects = r.getClientRects();
  if (rects.length > 0) return rects[0];
  const box = r.getBoundingClientRect();
  return box.height > 0 ? box : null;
}

/**
 * Whether the focus end is after the anchor: a normal start-to-end drag.
 *
 * Asked of the Selection rather than inferred from which way the rects moved,
 * because the answer is already there and an inference would need history the
 * bar does not keep. Defaults to forward, which is the 99% case, when there
 * is nothing to compare.
 */
export function isForward(live: Selection | null): boolean {
  if (live === null || live.anchorNode === null || live.focusNode === null) {
    return true;
  }
  const rel = live.anchorNode.compareDocumentPosition(live.focusNode);
  if (rel & Node.DOCUMENT_POSITION_FOLLOWING) return true;
  if (rel & Node.DOCUMENT_POSITION_PRECEDING) return false;
  return live.focusOffset >= live.anchorOffset;
}

export class ReadingSelectionBar {
  private el: HTMLElement | null = null;
  private source: BarSource = "selection";
  private tracking = 0;
  private dockedAt = -1;
  private anchorNode: Node | null = null;
  /** Set only for a tapped highlight, which has no live Selection. */
  private tapRect: DOMRect | null = null;
  private repositioning = 0;
  private navbar: HTMLElement | null = null;
  private settled = 0;
  private wake: (() => void) | null = null;
  private onPick: (colour: string) => void;
  private onErase: () => void;
  private colours: () => { name: string; hex: string }[];

  constructor(
    colours: () => { name: string; hex: string }[],
    onPick: (colour: string) => void,
    onErase: () => void
  ) {
    this.colours = colours;
    this.onPick = onPick;
    this.onErase = onErase;
  }

  /** Place the bar for a selection or a tapped highlight. */
  show(
    selection: ReadingSelection,
    rect: DOMRect,
    source: BarSource = "selection",
    live: Selection | null = null,
    /**
     * Where the bar is about to sit, for measuring the space beside the
     * text. A drag supplies it from the selection's anchor; a tapped
     * highlight supplies the mark, which has no Selection behind it and
     * would otherwise never get the placement beside the text.
     */
    node: Node | null = null
  ): void {
    this.hide();
    this.source = source;
    const swatches = this.colours();
    if (swatches.length === 0) return;

    const bar = document.body.createDiv({ cls: "highlightr-reading-bar" });

    // pointerdown, not click: on a phone the tap that collapses the selection
    // can also move focus, and the click sometimes never lands.
    const on = (el: HTMLElement, run: () => void) =>
      el.addEventListener("pointerdown", (evt) => {
        evt.preventDefault();
        evt.stopPropagation();
        this.hide();
        run();
      });

    for (const { name, hex } of swatches) {
      const swatch = bar.createEl("button", { cls: "highlightr-reading-swatch" });
      swatch.style.background = hex;
      swatch.setAttribute("aria-label", name);
      on(swatch, () => this.onPick(name));
    }

    // Only when there is something to remove. Offering an eraser over plain
    // text would be a control that cannot do anything, and on a bar this
    // small every slot should be worth its width.
    if (selection.mark !== undefined) {
      const eraser = bar.createEl("button", {
        cls: "highlightr-reading-swatch highlightr-reading-eraser",
        text: "\u00d7",
      });
      eraser.setAttribute("aria-label", "Remove highlight");
      on(eraser, () => this.onErase());
    }

    this.el = bar;
    this.anchorNode = node ?? live?.anchorNode ?? null;
    this.tapRect = live === null ? rect : null;
    // Docked on a phone rather than floated against the selection. iOS places
    // its own selection menu above or below depending on the room available,
    // so any position next to the selection is one it may also choose, and
    // the two overlap. The bottom of the screen is somewhere iOS never puts
    // it, and is where a thumb already is. It also survives scrolling, which
    // an anchored bar cannot.
    if (Platform.isMobile) {
      bar.addClass("is-docked");
      this.trackDock();
    } else {
      this.position(bar, rect, live, node);
    }
  }


  /**
   * Put the bar back where it belongs after the page has moved.
   *
   * Scrolling used to take the bar away on desktop, because a bar sitting
   * under the selection points at nothing the moment the page moves. Now
   * that it sits beside the text rather than over it, the mobile reasoning
   * applies here too: losing the bar because you scrolled to see what you
   * are about to highlight is worse than the bar being briefly stale. The
   * selection survives a scroll, so there is always somewhere to put it.
   *
   * Coalesced to one frame. A scroll fires many events and each placement
   * reads rects, so without this it would be several forced layouts per
   * frame for a bar that only needs to land once.
   */
  reposition(): void {
    if (this.el === null || this.el.hasClass("is-docked")) return;
    if (this.repositioning !== 0) return;
    this.repositioning = requestAnimationFrame(() => {
      this.repositioning = 0;
      const bar = this.el;
      if (bar === null) return;

      // A tapped highlight has no Selection to re-measure, so it is placed
      // against the mark it was opened on, which moves with the page.
      if (this.tapRect !== null) {
        const node = this.anchorNode;
        const el = node instanceof Element ? node : node?.parentElement;
        if (el === undefined || el === null) return;
        this.position(bar, el.getBoundingClientRect(), null, node);
        return;
      }

      const live = window.getSelection();
      if (live === null || live.isCollapsed || live.rangeCount === 0) {
        if (this.dismissedBySelection) this.hide();
        return;
      }
      this.position(
        bar,
        live.getRangeAt(0).getBoundingClientRect(),
        live,
        this.anchorNode
      );
    });
  }

  /** Whether a collapsing selection should take this bar down. */
  get dismissedBySelection(): boolean {
    return this.source === "selection";
  }

  /**
   * Beside the text where there is room for it, and otherwise at the end the
   * drag started from. See src/ui/barPlacement.ts for why those are the two
   * options and why neither is "under the selection", which is what this did
   * and what made the bar follow the cursor across the text being read.
   *
   * The vertical class goes on BEFORE measuring, because the gap only has to
   * hold a column of swatches and measuring the horizontal bar would reject
   * a gap that fits. If it does not fit, the class comes off and the bar is
   * measured again as a row.
   */
  private position(
    bar: HTMLElement,
    rect: DOMRect,
    live: Selection | null,
    node: Node | null
  ): void {
    const gutter = gutterOf(node ?? live?.anchorNode ?? null);

    bar.addClass("is-gutter");
    let box = bar.getBoundingClientRect();
    let spot = place({
      bar: box,
      anchor: anchorRect(live) ?? rect,
      selection: rect,
      gutter,
      viewport: { width: window.innerWidth, height: window.innerHeight },
      forward: isForward(live),
    });

    if (spot.mode !== "gutter") {
      bar.removeClass("is-gutter");
      box = bar.getBoundingClientRect();
      spot = place({
        bar: box,
        anchor: anchorRect(live) ?? rect,
        selection: rect,
        gutter,
        viewport: { width: window.innerWidth, height: window.innerHeight },
        forward: isForward(live),
      });
    }

    bar.style.top = `${spot.top}px`;
    bar.style.left = `${spot.left}px`;
  }

  /**
   * Keep the docked bar sitting on the navbar as the navbar moves.
   *
   * Obsidian hides its mobile navbar when you scroll down and brings it back
   * when you scroll up, animating in and out, so a clearance measured once
   * when the bar appeared is stale the moment the reader moves the page.
   * Scroll events alone would miss the animation's own frames, and a
   * transition listener alone would miss a scroll that never animates, so
   * this follows it per frame while the bar is up. That is one rect read and
   * at most one style write per frame, for the few seconds a bar is on
   * screen, and it stops the instant it goes.
   */
  private trackDock(): void {
    this.dockedAt = -1;
    // Resolved once. A querySelector per frame was the genuinely wasteful
    // part of the first version; the rect read is the cheap part.
    this.navbar = document.querySelector<HTMLElement>(".mobile-navbar");

    // Wake on anything that could move the navbar, and sleep again once it
    // has stopped. Scroll is the trigger Obsidian uses to show and hide it,
    // and transitionend catches the tail of the animation if the last scroll
    // event lands before the movement finishes.
    this.wake = () => this.runFrames();
    document.addEventListener("scroll", this.wake, { capture: true, passive: true });
    document.addEventListener("transitionend", this.wake, { capture: true });
    this.runFrames();
  }

  /**
   * Follow the navbar for as long as it is moving, then stop.
   *
   * A frame loop is the only thing that tracks an animation smoothly, but
   * running one for the whole life of the bar means reading a rect at the
   * display's refresh rate, 120Hz on this hardware, while nothing is
   * happening. This runs only while the position is actually changing and
   * parks itself a fifth of a second after it settles, so a bar sitting on a
   * still page costs nothing at all.
   */
  private runFrames(): void {
    if (this.tracking !== 0) {
      this.settled = 0;
      return;
    }
    const step = () => {
      if (this.el === null) {
        this.tracking = 0;
        return;
      }
      const clearance = dockClearance(this.navbar);
      if (clearance !== this.dockedAt) {
        this.dockedAt = clearance;
        this.el.style.bottom = `${clearance}px`;
        this.settled = 0;
      } else {
        this.settled++;
      }
      // Roughly 0.2s of no movement at 60Hz, half that at 120Hz. Short
      // enough to be idle almost always, long enough to ride out the gap
      // between a scroll ending and the navbar's animation finishing.
      if (this.settled > 12) {
        this.tracking = 0;
        return;
      }
      this.tracking = requestAnimationFrame(step);
    };
    this.tracking = requestAnimationFrame(step);
  }

  hide(): void {
    if (this.tracking !== 0) {
      cancelAnimationFrame(this.tracking);
      this.tracking = 0;
    }
    if (this.repositioning !== 0) {
      cancelAnimationFrame(this.repositioning);
      this.repositioning = 0;
    }
    // Dropped with the bar. Holding the node a highlight was tapped on
    // keeps a detached element alive once the note re-renders, and the
    // next bar brings its own.
    this.anchorNode = null;
    this.tapRect = null;
    if (this.wake !== null) {
      document.removeEventListener("scroll", this.wake, { capture: true });
      document.removeEventListener("transitionend", this.wake, { capture: true });
      this.wake = null;
    }
    this.navbar = null;
    this.el?.remove();
    this.el = null;
  }

  get visible(): boolean {
    return this.el !== null;
  }
}

/**
 * How far off the bottom the docked bar has to sit to clear what is there.
 *
 * Obsidian's mobile navbar floats above the content and can be shown or
 * hidden, so a fixed offset is either too small when it is up or a gap when
 * it is down. Measuring it answers both, and it is measured at the moment the
 * bar is shown rather than cached, because the navbar's visibility is the
 * reader's to change between one highlight and the next.
 */
function dockClearance(navbar: HTMLElement | null): number {
  const gap = 12;
  const safe = 0; // env(safe-area-inset-bottom) is applied in CSS on top.
  if (navbar === null) return gap + safe;

  const rect = navbar.getBoundingClientRect();
  // Zero height, or sitting off the bottom of the window, means hidden.
  if (rect.height === 0 || rect.top >= window.innerHeight) return gap + safe;

  return window.innerHeight - rect.top + gap;
}

/** Whether the bar should be offered at all on this device. */
export function barSuitsPlatform(setting: "always" | "mobile" | "never"): boolean {
  if (setting === "never") return false;
  if (setting === "always") return true;
  return Platform.isMobile;
}
