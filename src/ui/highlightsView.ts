import { ItemView, MarkdownView, TFile, WorkspaceLeaf } from "obsidian";

import type HighlightrPlugin from "src/plugin/main";
import {
  highlightColour,
  parseHighlights,
  type ParsedHighlight,
} from "src/plugin/parseHighlights";

export const HIGHLIGHTS_VIEW = "highlightr-highlights";

/**
 * A sidebar list of the highlights in the note you are reading.
 *
 * Modelled on the Outline panel, and per-note for the same reason Outline is:
 * it parses what is in front of you rather than indexing the vault. That is
 * what makes it free. One read per note activation, no index to hold, nothing
 * to keep in sync, and no scan to be careful about on a phone.
 *
 * Vault-wide review is a different feature and needs a scan; this view exists
 * partly to get the parser and the row rendering written before that cost has
 * to be judged.
 */
export class HighlightsView extends ItemView {
  private readonly plugin: HighlightrPlugin;
  private file: TFile | null = null;

  constructor(leaf: WorkspaceLeaf, plugin: HighlightrPlugin) {
    super(leaf);
    this.plugin = plugin;
  }

  getViewType(): string {
    return HIGHLIGHTS_VIEW;
  }

  getDisplayText(): string {
    return "Highlights";
  }

  getIcon(): string {
    return "highlightr-pen";
  }

  async onOpen(): Promise<void> {
    await this.refresh();
  }

  /** Rebuild from the active note, or say why there is nothing to show. */
  async refresh(): Promise<void> {
    const view = this.app.workspace.getActiveViewOfType(MarkdownView);
    const file = view?.file ?? null;
    this.file = file;

    const body = this.containerEl.children[1];
    body.empty();
    body.addClass("highlightr-view");

    if (file === null) {
      body.createDiv({ cls: "highlightr-view-empty", text: "No note open." });
      return;
    }

    // cachedRead rather than read: this is display, and the cache is what
    // every other reader in Obsidian sees.
    const found = parseHighlights(await this.app.vault.cachedRead(file));
    if (found.length === 0) {
      body.createDiv({
        cls: "highlightr-view-empty",
        text: "No highlights in this note.",
      });
      return;
    }

    body.createDiv({
      cls: "highlightr-view-count",
      text: `${found.length} highlight${found.length === 1 ? "" : "s"}`,
    });

    const list = body.createDiv({ cls: "highlightr-view-list" });
    for (const h of found) this.renderRow(list, h, file);
  }

  private renderRow(list: HTMLElement, h: ParsedHighlight, file: TFile): void {
    const row = list.createDiv({ cls: "highlightr-view-row" });

    const swatch = row.createDiv({ cls: "highlightr-view-swatch" });
    const colour = highlightColour(h, this.plugin.settings.highlighters);
    // A highlight in a colour the palette no longer holds still gets a
    // swatch, in its own colour: it is still a highlight, and hiding it
    // would make the panel disagree with the note.
    if (colour !== null) swatch.style.background = colour;
    else swatch.addClass("is-unknown");

    row.createDiv({ cls: "highlightr-view-text", text: h.text });

    row.addEventListener("click", () => {
      // eState carries the scroll target, which works in reading mode and in
      // editing mode without this having to know which is showing.
      void this.app.workspace.getLeaf(false).openFile(file, {
        eState: { line: h.line },
      });
    });
  }

  /** Whether this view is showing the file that just changed. */
  showing(file: TFile): boolean {
    return this.file !== null && this.file.path === file.path;
  }

  async onClose(): Promise<void> {
    this.containerEl.children[1].empty();
  }
}
