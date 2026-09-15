import {
  Editor,
  MarkdownView,
  TFile,
  Menu,
  Notice,
  Platform,
  Plugin,
  PluginManifest,
} from "obsidian";
import { wait } from "src/utils/util";
import addIcons from "src/icons/customIcons";
import { HighlightrSettingTab } from "../settings/settingsTab";
import { HighlightrSettings } from "../settings/settingsData";
import DEFAULT_SETTINGS from "../settings/settingsData";
import contextMenu from "src/plugin/contextMenu";
import highlighterMenu from "src/ui/highlighterMenu";
import { createHighlighterIcons } from "src/icons/customIcons";

import { createStyles, paintMarkInk } from "src/utils/createStyles";
import {
  applyReadingHighlight,
  HIGHLIGHT_SUFFIX,
  highlightPrefix,
  describeMarkElement,
  notifyOutcome,
  recolourReadingHighlight,
  removeReadingHighlight,
  ReadingSelectionTracker,
  stampSourceLines,
} from "src/plugin/readingModeHighlight";
import {
  barSuitsPlatform,
  ReadingSelectionBar,
} from "src/ui/readingSelectionBar";
import { HIGHLIGHTS_VIEW, HighlightsView } from "src/ui/highlightsView";
import { EnhancedApp, EnhancedEditor } from "src/settings/types";

export default class HighlightrPlugin extends Plugin {
  app: EnhancedApp;
  editor: EnhancedEditor;
  manifest: PluginManifest;
  settings: HighlightrSettings;
  readingSelection = new ReadingSelectionTracker();
  readingBar: ReadingSelectionBar;

  async onload() {
    console.log(`Highlightr v${this.manifest.version} loaded`);
    addIcons();

    await this.loadSettings();

    this.app.workspace.onLayoutReady(() => {
      this.reloadStyles(this.settings);
      createHighlighterIcons(this.settings, this);
    });

    this.registerEvent(
      this.app.workspace.on("editor-menu", this.handleHighlighterInContextMenu)
    );

    // Reading mode has no editor, so highlighting there means editing the
    // file. Both halves of that are set up here: the post-processor records
    // which source lines each rendered block came from, and the tracker
    // remembers a selection past the point where it collapses, which is what
    // makes the feature usable on a phone.
    this.registerMarkdownPostProcessor((el, ctx) => {
      stampSourceLines(el, ctx);
      paintMarkInk(el, this.settings);
    });

    this.readingBar = new ReadingSelectionBar(
      () => {
        const enabled = this.settings.readingBarColors;
        return this.settings.highlighterOrder
          // An empty list means every colour, so a palette that predates the
          // setting keeps behaving as it did.
          .filter((name) => enabled.length === 0 || enabled.includes(name))
          .map((name) => ({ name, hex: this.settings.highlighters[name] }));
      },
      (name) => this.applyFromBar(name),
      () => this.eraseFromBar()
    );

    this.registerDomEvent(document, "selectionchange", () => {
      const selection = window.getSelection();
      this.readingSelection.record(selection);
      this.updateReadingBar(selection);
    });
    // Tapping a highlight opens the same bar. On a phone, selecting text
    // inside a highlight just to change it is fiddly, and the mark already
    // knows its own extent, so a tap is the natural gesture.
    this.registerDomEvent(document, "click", (evt: MouseEvent) => {
      if (!barSuitsPlatform(this.settings.readingBar)) return;
      const target = evt.target;
      if (!(target instanceof HTMLElement)) return;
      // Not the bar's own buttons, and not while a selection is up: that is
      // the selection flow, which has already placed the bar.
      if (target.closest(".highlightr-reading-bar")) return;
      if (window.getSelection()?.isCollapsed === false) return;

      const mark = target.closest("mark");
      const view = this.app.workspace.getActiveViewOfType(MarkdownView);
      if (mark === null || !view || view.getMode() !== "preview") {
        this.readingBar.hide();
        return;
      }

      const described = describeMarkElement(mark);
      if (described === null || described.path !== view.file?.path) return;
      this.readingSelection.adopt(described);
      this.readingBar.show(
        described.mark !== undefined,
        mark.getBoundingClientRect(),
        "tap",
        null,
        mark
      );
    });

    // The bar FOLLOWS a scroll rather than going away. It used to hide,
    // which was right while it sat under the selection and pointed at
    // nothing once the page moved. Beside the text it is still beside the
    // text, and the reason mobile was already exempt applies here too:
    // scrolling to see what you are about to highlight should not cost you
    // the selection. A docked bar needs nothing, being anchored to the
    // viewport rather than to the page.
    this.registerDomEvent(
      document,
      "scroll",
      () => {
        if (!Platform.isMobile) this.readingBar.reposition();
      },
      { capture: true, passive: true }
    );
    this.registerEvent(
      this.app.workspace.on("active-leaf-change", () => {
        this.readingBar.hide();
        this.readingSelection.forget();
      })
    );

    // The bar picks between sitting beside the text and sitting at the
    // anchor by measuring the space beside the text, and that space changes
    // when the pane does: a sidebar opening, a split dragged, the window
    // resized. Without this the bar keeps whichever shape it had when it
    // appeared, so widening a narrow pane left it horizontal at the anchor
    // with room beside the text going unused. Obsidian's resize event
    // covers sidebars and splits, which a window resize listener does not.
    this.registerEvent(
      this.app.workspace.on("resize", () => this.readingBar.reposition())
    );

    this.registerView(
      HIGHLIGHTS_VIEW,
      (leaf) => new HighlightsView(leaf, this)
    );
    this.addCommand({
      id: "open-highlights",
      name: "Open highlights panel",
      icon: "highlightr-pen",
      callback: () => void this.openHighlightsPanel(),
    });
    // The panel follows the active note, the way Outline does, so it refreshes
    // when the note changes and when the note it is showing is edited.
    this.registerEvent(
      this.app.workspace.on("active-leaf-change", () => this.refreshHighlightsPanel())
    );
    this.registerEvent(
      this.app.vault.on("modify", (file) => {
        for (const view of this.highlightsViews()) {
          if (file instanceof TFile && view.showing(file)) void view.refresh();
        }
      })
    );

    this.addSettingTab(new HighlightrSettingTab(this.app, this));

    this.addCommand({
      id: "highlighter-plugin-menu",
      name: "Open Highlightr",
      icon: "highlightr-pen",
      editorCallback: (editor: EnhancedEditor) => {
        !document.querySelector(".menu.highlighterContainer")
          ? highlighterMenu(this.app, this.settings, editor)
          : true;
      },
    });

    addEventListener("Highlightr-NewCommand", () => {
      this.reloadStyles(this.settings);
      this.generateCommands(this.editor);
      createHighlighterIcons(this.settings, this);
    });
    this.generateCommands(this.editor);
    this.refresh();
  }

  private highlightsViews(): HighlightsView[] {
    return this.app.workspace
      .getLeavesOfType(HIGHLIGHTS_VIEW)
      .map((leaf) => leaf.view)
      .filter((v): v is HighlightsView => v instanceof HighlightsView);
  }

  private refreshHighlightsPanel(): void {
    for (const view of this.highlightsViews()) void view.refresh();
  }

  /** Open the panel in the right sidebar, or reveal it if it is already there. */
  private async openHighlightsPanel(): Promise<void> {
    const existing = this.app.workspace.getLeavesOfType(HIGHLIGHTS_VIEW);
    const leaf = existing[0] ?? this.app.workspace.getRightLeaf(false);
    if (leaf === null) return;
    if (existing.length === 0) {
      await leaf.setViewState({ type: HIGHLIGHTS_VIEW, active: true });
    }
    await this.app.workspace.revealLeaf(leaf);
    this.refreshHighlightsPanel();
  }

  /** Show or hide the swatch bar for the selection that just changed. */
  private updateReadingBar(selection: Selection | null): void {
    const view = this.app.workspace.getActiveViewOfType(MarkdownView);
    const editing = view !== null && view.getMode() !== "preview";

    // EDIT MODE IS A SEPARATE SETTING, and off by default, because a
    // selection means different things in the two modes. Selecting in
    // reading mode is almost always intent to do something with the text;
    // selecting while editing is usually about to be typed over. A bar
    // that appears on every drag through a paragraph would be noise.
    if (editing) {
      if (!barSuitsPlatform(this.settings.editorBar)) return;
      const text = view.editor.getSelection();
      if (text.length === 0) {
        if (this.readingBar.dismissedBySelection) this.readingBar.hide();
        return;
      }
      if (selection === null || selection.rangeCount === 0) return;
      this.readingBar.show(
        text.includes("<mark"),
        selection.getRangeAt(0).getBoundingClientRect(),
        "selection",
        selection
      );
      return;
    }

    if (!barSuitsPlatform(this.settings.readingBar)) return;

    const described =
      view && view.getMode() === "preview"
        ? this.readingSelection.current(view.file?.path)
        : null;

    // Only while a selection is actually up. The cache deliberately outlives
    // a collapse so the palette still works, but a bar floating over nothing
    // would just be litter.
    //
    // A bar opened by tapping a highlight is exempt. On iOS a tap produces a
    // collapsed selectionchange that can arrive after the click, so hiding
    // unconditionally here undid the tap immediately: single taps appeared
    // to do nothing, and only a double tap worked, because that selects a
    // word and came back through the selection path instead. Double tap is
    // also iOS's own gesture, so it was never ours to use.
    if (
      described === null ||
      selection === null ||
      selection.isCollapsed ||
      selection.rangeCount === 0
    ) {
      if (this.readingBar.dismissedBySelection) this.readingBar.hide();
      return;
    }

    // The live Selection goes through as well as the rect: the bar needs the
    // anchor end and the drag direction, and both are on the Selection while
    // the rect is only the box around the whole thing.
    this.readingBar.show(
      described.mark !== undefined,
      selection.getRangeAt(0).getBoundingClientRect(),
      "selection",
      selection
    );
  }

  /** Apply a colour to the remembered reading-mode selection. */
  /**
   * Apply a colour from the bar, in whichever mode the view is in.
   *
   * Reading mode has to locate the selection in the source, which is what
   * readingModeHighlight exists for. Edit mode does not: the per-colour
   * commands already wrap the editor's own selection, so the bar runs the
   * same command the palette and the context menu run, and there is one
   * apply path rather than two.
   */
  private applyFromBar(name: string): void {
    const view = this.app.workspace.getActiveViewOfType(MarkdownView);
    if (view !== null && view.getMode() !== "preview") {
      this.app.commands.executeCommandById(`highlightr-plugin:${name}`);
      return;
    }
    this.highlightSelectionInReadingMode(name);
  }

  private eraseFromBar(): void {
    const view = this.app.workspace.getActiveViewOfType(MarkdownView);
    if (view !== null && view.getMode() !== "preview") {
      this.eraseHighlight(view.editor);
      return;
    }
    this.removeHighlightInReadingMode();
  }

  private highlightSelectionInReadingMode(name: string): void {
    const view = this.app.workspace.getActiveViewOfType(MarkdownView);
    const selection = this.readingSelection.current(view?.file?.path);
    if (selection === null) return;

    const prefix = highlightPrefix(
      this.settings.highlighterMethods,
      name,
      this.settings.highlighters[name]
    );
    // Already highlighted: swap the tag rather than wrapping a mark in a
    // mark, which is what upstream's insertion path would have produced.
    const done =
      selection.mark === undefined
        ? applyReadingHighlight(this.app, selection, prefix, HIGHLIGHT_SUFFIX)
        : recolourReadingHighlight(this.app, selection, prefix);
    void done.then((outcome) => notifyOutcome(outcome, name));
  }

  /** Remove the highlight the remembered reading-mode selection sits in. */
  private removeHighlightInReadingMode(): void {
    const view = this.app.workspace.getActiveViewOfType(MarkdownView);
    const selection = this.readingSelection.current(view?.file?.path);
    if (selection === null) return;
    void removeReadingHighlight(this.app, selection).then((outcome) =>
      notifyOutcome(outcome, "")
    );
  }

  reloadStyles(settings: HighlightrSettings) {
    let currentSheet = document.querySelector("style#highlightr-styles");
    if (currentSheet) {
      currentSheet.remove();
      createStyles(settings);
    } else {
      createStyles(settings);
    }
  }

  eraseHighlight = (editor: Editor) => {
    const currentStr = editor.getSelection();
    const newStr = currentStr
      .replace(/\<mark style.*?[^\>]\>/g, "")
      .replace(/\<mark class.*?[^\>]\>/g, "")
      .replace(/\<\/mark>/g, "");
    editor.replaceSelection(newStr);
    editor.focus();
  };

  generateCommands(editor: Editor) {
    this.settings.highlighterOrder.forEach((highlighterKey: string) => {
      const applyCommand = (command: CommandPlot, editor: Editor) => {
        const selectedText = editor.getSelection();
        const curserStart = editor.getCursor("from");
        const curserEnd = editor.getCursor("to");
        const prefix = command.prefix;
        const suffix = command.suffix || prefix;
        const setCursor = (mode: number) => {
          editor.setCursor(
            curserStart.line + command.line * mode,
            curserEnd.ch + cursorPos * mode
          );
        };
        const cursorPos =
          selectedText.length > 0
            ? prefix.length + suffix.length + 1
            : prefix.length;
        const preStart = {
          line: curserStart.line - command.line,
          ch: curserStart.ch - prefix.length,
        };
        const pre = editor.getRange(preStart, curserStart);

        const sufEnd = {
          line: curserStart.line + command.line,
          ch: curserEnd.ch + suffix.length,
        };

        const suf = editor.getRange(curserEnd, sufEnd);

        const preLast = pre.slice(-1);
        const prefixLast = prefix.trimStart().slice(-1);
        const sufFirst = suf[0];

        if (suf === suffix.trimEnd()) {
          if (preLast === prefixLast && selectedText) {
            editor.replaceRange(selectedText, preStart, sufEnd);
            const changeCursor = (mode: number) => {
              editor.setCursor(
                curserStart.line + command.line * mode,
                curserEnd.ch + (cursorPos * mode + 8)
              );
            };
            return changeCursor(-1);
          }
        }

        editor.replaceSelection(`${prefix}${selectedText}${suffix}`);

        return setCursor(1);
      };

      type CommandPlot = {
        char: number;
        line: number;
        prefix: string;
        suffix: string;
      };

      type commandsPlot = {
        [key: string]: CommandPlot;
      };

      const commandsMap: commandsPlot = {
        highlight: {
          char: 34,
          line: 0,
          prefix: highlightPrefix(
            this.settings.highlighterMethods,
            highlighterKey,
            this.settings.highlighters[highlighterKey]
          ),
          suffix: HIGHLIGHT_SUFFIX,
        },
      };

      Object.keys(commandsMap).forEach((type) => {
        let highlighterpen = `highlightr-pen-${highlighterKey}`.toLowerCase();
        const plot = commandsMap[type];
        this.addCommand({
          id: highlighterKey,
          name: highlighterKey,
          icon: highlighterpen,
          // checkCallback rather than editorCallback: the same command has to
          // reach both modes, and in reading mode there is no editor to hand
          // it. It also hides itself in reading mode with nothing selected,
          // rather than offering an action that cannot do anything.
          checkCallback: (checking: boolean) => {
            const view = this.app.workspace.getActiveViewOfType(MarkdownView);
            if (!view) return false;

            if (view.getMode() !== "preview") {
              if (checking) return true;
              void (async () => {
                applyCommand(plot, view.editor);
                await wait(10);
                view.editor.focus();
              })();
              return true;
            }

            const selection = this.readingSelection.current(view.file?.path);
            if (selection === null) return false;
            if (checking) return true;
            void applyReadingHighlight(
              this.app,
              selection,
              plot.prefix,
              plot.suffix
            ).then((outcome) => notifyOutcome(outcome, highlighterKey));
            return true;
          },
        });
      });

      this.addCommand({
        id: "unhighlight",
        name: "Remove highlight",
        icon: "highlightr-eraser",
        // Both modes, same as the colour commands. In reading mode it offers
        // itself only when the selection is actually inside a highlight.
        checkCallback: (checking: boolean) => {
          const view = this.app.workspace.getActiveViewOfType(MarkdownView);
          if (!view) return false;

          if (view.getMode() !== "preview") {
            if (checking) return true;
            this.eraseHighlight(view.editor);
            view.editor.focus();
            return true;
          }

          const selection = this.readingSelection.current(view.file?.path);
          if (selection === null || selection.mark === undefined) return false;
          if (checking) return true;
          this.removeHighlightInReadingMode();
          return true;
        },
      });
    });
  }

  refresh = () => {
    this.updateStyle();
  };

  updateStyle = () => {
    document.body.classList.toggle(
      "highlightr-lowlight",
      this.settings.highlighterStyle === "lowlight"
    );
    document.body.classList.toggle(
      "highlightr-floating",
      this.settings.highlighterStyle === "floating"
    );
    document.body.classList.toggle(
      "highlightr-rounded",
      this.settings.highlighterStyle === "rounded"
    );
    document.body.classList.toggle(
      "highlightr-realistic",
      this.settings.highlighterStyle === "realistic"
    );
  };

  onunload() {
    console.log("Highlightr unloaded");
  }

  handleHighlighterInContextMenu = (
    menu: Menu,
    editor: EnhancedEditor
  ): void => {
    contextMenu(this.app, menu, editor, this, this.settings);
  };

  async loadSettings() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }

  async saveSettings() {
    await this.saveData(this.settings);
  }
}
