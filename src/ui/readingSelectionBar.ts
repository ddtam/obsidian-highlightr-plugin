import { Platform } from "obsidian";

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
export class ReadingSelectionBar {
  private el: HTMLElement | null = null;
  private onPick: (colour: string) => void;
  private colours: () => { name: string; hex: string }[];

  constructor(
    colours: () => { name: string; hex: string }[],
    onPick: (colour: string) => void
  ) {
    this.colours = colours;
    this.onPick = onPick;
  }

  /** Place the bar against the current selection, creating it if needed. */
  show(selection: ReadingSelection, rect: DOMRect): void {
    this.hide();
    const swatches = this.colours();
    if (swatches.length === 0) return;

    const bar = document.body.createDiv({ cls: "highlightr-reading-bar" });
    for (const { name, hex } of swatches) {
      const swatch = bar.createEl("button", { cls: "highlightr-reading-swatch" });
      swatch.style.background = hex;
      swatch.setAttribute("aria-label", name);
      // pointerdown, not click: on a phone the tap that collapses the
      // selection can also move focus, and click sometimes never lands.
      swatch.addEventListener("pointerdown", (evt) => {
        evt.preventDefault();
        evt.stopPropagation();
        this.hide();
        this.onPick(name);
      });
    }

    this.el = bar;
    this.position(bar, rect);
  }

  /**
   * Below the selection by default, because iOS puts its own menu above it.
   * Flips above only when there is no room below, and is clamped so a
   * selection near an edge cannot push the bar off screen.
   */
  private position(bar: HTMLElement, rect: DOMRect): void {
    const gap = 8;
    const { width, height } = bar.getBoundingClientRect();
    const room = window.innerHeight - rect.bottom;
    const top =
      room > height + gap * 2 ? rect.bottom + gap : rect.top - height - gap;

    bar.style.top = `${Math.max(gap, Math.min(top, window.innerHeight - height - gap))}px`;
    bar.style.left = `${Math.max(
      gap,
      Math.min(rect.left, window.innerWidth - width - gap)
    )}px`;
  }

  hide(): void {
    this.el?.remove();
    this.el = null;
  }

  get visible(): boolean {
    return this.el !== null;
  }
}

/** Whether the bar should be offered at all on this device. */
export function barSuitsPlatform(setting: "always" | "mobile" | "never"): boolean {
  if (setting === "never") return false;
  if (setting === "always") return true;
  return Platform.isMobile;
}
