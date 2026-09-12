import {
  Editor,
  MarkdownView,
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

import { createStyles } from "src/utils/createStyles";
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
    this.registerMarkdownPostProcessor(stampSourceLines);

    this.readingBar = new ReadingSelectionBar(
      () => {
        const enabled = this.settings.readingBarColors;
        return this.settings.highlighterOrder
          // An empty list means every colour, so a palette that predates the
          // setting keeps behaving as it did.
          .filter((name) => enabled.length === 0 || enabled.includes(name))
          .map((name) => ({ name, hex: this.settings.highlighters[name] }));
      },
      (name) => this.highlightSelectionInReadingMode(name),
      () => this.removeHighlightInReadingMode()
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
      this.readingBar.show(described, mark.getBoundingClientRect(), "tap");
    });

    // An anchored bar is wrong the moment the page moves, so it goes. A
    // docked one is not anchored to anything that scrolls, and taking it away
    // mid-scroll would mean losing a selection just for moving the page to
    // see what is being highlighted.
    this.registerDomEvent(
      document,
      "scroll",
      () => {
        if (!Platform.isMobile) this.readingBar.hide();
      },
      { capture: true }
    );
    this.registerEvent(
      this.app.workspace.on("active-leaf-change", () => {
        this.readingBar.hide();
        this.readingSelection.forget();
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

  /** Show or hide the swatch bar for the selection that just changed. */
  private updateReadingBar(selection: Selection | null): void {
    if (!barSuitsPlatform(this.settings.readingBar)) return;

    const view = this.app.workspace.getActiveViewOfType(MarkdownView);
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

    this.readingBar.show(
      described,
      selection.getRangeAt(0).getBoundingClientRect()
    );
  }

  /** Apply a colour to the remembered reading-mode selection. */
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
