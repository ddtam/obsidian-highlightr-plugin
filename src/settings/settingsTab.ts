import type HighlightrPlugin from "src/plugin/main";
import {
  App,
  Setting,
  PluginSettingTab,
  Notice,
  TextComponent,
} from "obsidian";
import Pickr from "@simonwep/pickr";
import Sortable from "sortablejs";
import { HIGHLIGHTER_METHODS, HIGHLIGHTER_STYLES } from "./settingsData";
import type { ReadingBarMode } from "./settingsData";
import { setAttributes } from "src/utils/setAttributes";

export class HighlightrSettingTab extends PluginSettingTab {
  plugin: HighlightrPlugin;
  appendMethod: string;

  constructor(app: App, plugin: HighlightrPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  /**
   * The colour currently being edited, or null when adding a new one.
   *
   * Upstream offered delete only, so correcting a name or a hex meant
   * removing the entry and retyping it, which also sent it to the bottom of
   * the order. Editing reuses the same two inputs and the same picker at the
   * top of the tab rather than growing an inline editor per row.
   */
  private editing: string | null = null;

  display(): void {
    const { containerEl } = this;
    containerEl.empty();
    containerEl.createEl("h1", { text: "Highlightr" });
    containerEl.createEl("p", { text: "Created by " }).createEl("a", {
      text: "Chetachi 👩🏽‍💻",
      href: "https://github.com/chetachiezikeuzor",
    });
    containerEl.createEl("h2", { text: "Plugin Settings" });

    new Setting(containerEl)
      .setName("Choose highlight method")
      .setDesc(
        `Choose between highlighting with inline CSS or CSS classes. Please note that there are pros and cons to both choices. Inline CSS will keep you from being reliant on external CSS files if you choose to export your notes. CSS classes are more flexible and easier to customize.`
      )
      .addDropdown((dropdown) => {
        let methods: Record<string, string> = {};
        HIGHLIGHTER_METHODS.map((method) => (methods[method] = method));
        dropdown.addOptions(methods);
        dropdown
          .setValue(this.plugin.settings.highlighterMethods)
          .onChange((highlightrMethod) => {
            this.plugin.settings.highlighterMethods = highlightrMethod;
            setTimeout(() => {
              dispatchEvent(new Event("Highlightr-NewCommand"));
            }, 100);
            // saveSettings already calls saveData with this object; the
            // second write was redundant and made any save-path bug
            // show up twice.
            this.plugin.saveSettings();
            this.display();
          });
      });

    const stylesSetting = new Setting(containerEl);

    stylesSetting
      .setName("Choose highlight style")
      .setDesc(
        `Depending on your design aesthetic, you may want to customize the style of your highlights. Choose from an assortment of different highlighter styles by using the dropdown. Depending on your theme, this plugin's CSS may be overriden.`
      )
      .addDropdown((dropdown) => {
        let styles: Record<string, string> = {};
        HIGHLIGHTER_STYLES.map((style) => (styles[style] = style));
        dropdown.addOptions(styles);
        dropdown
          .setValue(this.plugin.settings.highlighterStyle)
          .onChange((highlighterStyle) => {
            this.plugin.settings.highlighterStyle = highlighterStyle;
            // saveSettings already calls saveData with this object; the
            // second write was redundant and made any save-path bug
            // show up twice.
            this.plugin.saveSettings();
            this.plugin.refresh();
          });
      });

    const styleDemo = () => {
      const d = createEl("p");
      d.setAttribute("style", "font-size: .925em; margin-top: 12px;");
      d.innerHTML = `
      <span style="background:#FFB7EACC;padding: .125em .125em;--lowlight-background: var(--background-primary);border-radius: 0;background-image: linear-gradient(360deg,rgba(255, 255, 255, 0) 40%,var(--lowlight-background) 40%) !important;">Lowlight</span> 
      <span style="background:#93C0FFCC;--floating-background: var(--background-primary);border-radius: 0;padding-bottom: 5px;background-image: linear-gradient(360deg,rgba(255, 255, 255, 0) 28%,var(--floating-background) 28%) !important;">Floating</span> 
      <span style="background:#9CF09CCC;margin: 0 -0.05em;padding: 0.1em 0.4em;border-radius: 0.8em 0.3em;-webkit-box-decoration-break: clone;box-decoration-break: clone;text-shadow: 0 0 0.75em var(--background-primary-alt);">Realistic</span> 
      <span style="background:#CCA9FFCC;margin: 0 -0.05em;padding: 0.125em 0.15em;border-radius: 0.2em;-webkit-box-decoration-break: clone;box-decoration-break: clone;">Rounded</span>`;
      return d;
    };

    stylesSetting.infoEl.appendChild(styleDemo());

    new Setting(containerEl)
      .setName("Highlight bar in reading mode")
      .setDesc(
        "Reading mode can highlight without switching to editing mode. This " +
          "chooses when a row of colour swatches appears beside a selection. " +
          "On a phone it replaces select, open the command palette, find the " +
          "colour by name; on a desktop the palette already takes one step."
      )
      .addDropdown((dropdown) => {
        dropdown.addOptions({
          mobile: "On mobile only",
          always: "Always",
          never: "Never, use the command palette",
        });
        dropdown
          .setValue(this.plugin.settings.readingBar)
          .onChange((value: ReadingBarMode) => {
            this.plugin.settings.readingBar = value;
            this.plugin.saveSettings();
          });
      });

    new Setting(containerEl)
      .setName("Selection bar while editing")
      .setDesc(
        "Show the same bar when text is selected in edit mode. Off by " +
        "default: selecting while editing is usually about to be typed " +
        "over, so a bar on every drag would be noise."
      )
      .addDropdown((dropdown) => {
        dropdown.addOptions({
          mobile: "On mobile only",
          always: "Always",
          never: "Never",
        });
        dropdown
          .setValue(this.plugin.settings.editorBar)
          .onChange((value: ReadingBarMode) => {
            this.plugin.settings.editorBar = value;
            this.plugin.saveSettings();
          });
      });

    new Setting(containerEl)
      .setName("Readable text on highlights")
      .setDesc(
        "Sets highlighted text to black or white, whichever contrasts better " +
          "with the highlight, in reading mode. Some themes force one colour " +
          "on every rendered highlight, which is unreadable on a pale one. " +
          "Turn this off to leave the colour to your theme."
      )
      .addToggle((toggle) => {
        toggle
          .setValue(this.plugin.settings.contrastText)
          .onChange(async (value) => {
            this.plugin.settings.contrastText = value;
            await this.plugin.saveSettings();
            this.plugin.refresh();
          });
      });

    const highlighterSetting = new Setting(containerEl);

    highlighterSetting
      .setName("Choose highlight colors")
      .setClass("highlighterplugin-setting-item")
      .setDesc(
        `Create new highlight colors by providing a color name and using the color picker to set the hex code value. Don't forget to save the color before exiting the color picker. Drag and drop the highlight color to change the order for your highlighter component.`
      );

    const colorInput = new TextComponent(highlighterSetting.controlEl);
    colorInput.setPlaceholder("Color name");
    colorInput.inputEl.addClass("highlighter-settings-color");

    const valueInput = new TextComponent(highlighterSetting.controlEl);
    valueInput.setPlaceholder("Color hex code");
    valueInput.inputEl.addClass("highlighter-settings-value");

    if (this.editing !== null) {
      colorInput.setValue(this.editing);
      valueInput.setValue(this.plugin.settings.highlighters[this.editing]);
    }

    // Pickr replaces this element in place, so it needs the element itself.
    // Upstream passed the selector `.highlightr-color-picker` instead, and
    // Pickr resolves a selector against `document`. Obsidian builds a settings
    // tab before attaching it, so under `renderTab` the query found nothing and
    // Pickr threw on `null.parentNode` inside `_finalBuild`, taking out
    // everything display() had not yet rendered: the whole colour list and
    // every control below it. Holding the reference sidesteps the question of
    // whether the tree is attached, because a button has a parent either way.
    let pickerButtonEl: HTMLElement | null = null;

    highlighterSetting
      .addButton((button) => {
        button.setClass("highlightr-color-picker");
        pickerButtonEl = button.buttonEl;
      })
      .then(() => {
        if (pickerButtonEl === null) {
          // Nothing to attach to, and throwing here would cost the rest of the
          // settings tab, which is the failure being fixed.
          console.error(
            "Highlightr: colour picker button was never created; skipping the picker."
          );
          return;
        }

        let input = valueInput.inputEl;
        let currentColor = valueInput.inputEl.value || null;

        const colorMap = this.plugin.settings.highlighterOrder.map(
          (highlightKey) => this.plugin.settings.highlighters[highlightKey]
        );

        let colorHex;
        const editingColor =
          this.editing === null
            ? null
            : this.plugin.settings.highlighters[this.editing];
        let pickrCreate = new Pickr({
          el: pickerButtonEl,
          theme: "nano",
          swatches: colorMap,
          defaultRepresentation: "HEXA",
          default: editingColor ?? colorMap[colorMap.length - 1],
          comparison: false,
          components: {
            preview: true,
            opacity: true,
            hue: true,
            interaction: {
              hex: true,
              rgba: true,
              hsla: false,
              hsva: false,
              cmyk: false,
              input: true,
              clear: true,
              cancel: true,
              save: true,
            },
          },
        });

        pickrCreate
          .on("clear", function (instance: Pickr) {
            instance.hide();
            input.trigger("change");
          })
          .on("cancel", function (instance: Pickr) {
            currentColor = instance.getSelectedColor().toHEXA().toString();

            input.trigger("change");
            instance.hide();
          })
          .on("change", function (color: Pickr.HSVaColor) {
            colorHex = color.toHEXA().toString();
            let newColor;
            colorHex.length == 6
              ? (newColor = `${color.toHEXA().toString()}A6`)
              : (newColor = color.toHEXA().toString());
            colorInput.inputEl.setAttribute(
              "style",
              `background-color: ${newColor}; color: var(--text-normal);`
            );

            setAttributes(input, {
              value: newColor,
              style: `background-color: ${newColor}; color: var(--text-normal);`,
            });
            input.setText(newColor);
            input.textContent = newColor;
            input.value = newColor;
            input.trigger("change");
          })
          .on("save", function (color: Pickr.HSVaColor, instance: Pickr) {
            let newColorValue = color.toHEXA().toString();

            input.setText(newColorValue);
            input.textContent = newColorValue;
            input.value = newColorValue;
            input.trigger("change");

            instance.hide();
            instance.addSwatch(color.toHEXA().toString());
          });
      })
      .addButton((button) => {
        button
          .setClass("HighlightrSettingsButton")
          .setClass("HighlightrSettingsButtonAdd")
          .setIcon("highlightr-save")
          .setTooltip(this.editing === null ? "Save" : `Update ${this.editing}`)
          .onClick(async (buttonEl: any) => {
            const name = colorInput.inputEl.value.replace(" ", "-");
            const value = valueInput.inputEl.value;

            // Upstream ran this ternary unconditionally, so a successful save
            // still announced "Highlighter values missing".
            if (!name || !value) {
              new Notice(
                name
                  ? "Highlighter hex code missing"
                  : value
                  ? "Highlighter name missing"
                  : "Highlighter values missing"
              );
              return;
            }

            const order = this.plugin.settings.highlighterOrder;
            const previous = this.editing;

            if (previous === null) {
              if (order.includes(name)) {
                buttonEl.stopImmediatePropagation();
                new Notice("This color already exists");
                return;
              }
              order.push(name);
              this.plugin.settings.highlighters[name] = value;
            } else {
              if (name !== previous && order.includes(name)) {
                buttonEl.stopImmediatePropagation();
                new Notice("This color already exists");
                return;
              }
              // Replace in place: a rename keeps its position in the order,
              // which delete-and-retype could not do.
              const at = order.indexOf(previous);
              if (name !== previous) {
                (this.app as any).commands.removeCommand(
                  `highlightr-plugin:${previous}`
                );
                delete this.plugin.settings.highlighters[previous];
                order[at === -1 ? order.length : at] = name;
              }
              this.plugin.settings.highlighters[name] = value;
              this.editing = null;
            }

            setTimeout(() => {
              dispatchEvent(new Event("Highlightr-NewCommand"));
            }, 100);
            await this.plugin.saveSettings();
            this.display();
          });
      });

    const highlightersContainer = containerEl.createEl("div", {
      cls: "HighlightrSettingsTabsContainer",
    });

    Sortable.create(highlightersContainer, {
      // Drag from the swatch only. With no handle Sortable claims every touch
      // that lands on a row, which on a phone means the colour list swallows
      // the scroll gesture and cannot be scrolled back up.
      handle: ".highlighter-setting-icon",
      // A few pixels of slack before a drag begins, so a slightly imprecise
      // tap on the swatch still scrolls rather than picking the row up.
      touchStartThreshold: 4,
      animation: 500,
      ghostClass: "highlighter-sortable-ghost",
      chosenClass: "highlighter-sortable-chosen",
      dragClass: "highlighter-sortable-drag",
      dragoverBubble: true,
      forceFallback: true,
      fallbackClass: "highlighter-sortable-fallback",
      easing: "cubic-bezier(1, 0, 0, 1)",
      onSort: (command: { oldIndex: number; newIndex: number }) => {
        const arrayResult = this.plugin.settings.highlighterOrder;
        const [removed] = arrayResult.splice(command.oldIndex, 1);
        arrayResult.splice(command.newIndex, 0, removed);
        this.plugin.settings.highlighterOrder = arrayResult;
        this.plugin.saveSettings();
      },
    });

    this.plugin.settings.highlighterOrder.forEach((highlighter) => {
      const icon = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill=${this.plugin.settings.highlighters[highlighter]} stroke=${this.plugin.settings.highlighters[highlighter]} stroke-width="0" stroke-linecap="round" stroke-linejoin="round"><path d="M20.707 5.826l-3.535-3.533a.999.999 0 0 0-1.408-.006L7.096 10.82a1.01 1.01 0 0 0-.273.488l-1.024 4.437L4 18h2.828l1.142-1.129l3.588-.828c.18-.042.345-.133.477-.262l8.667-8.535a1 1 0 0 0 .005-1.42zm-9.369 7.833l-2.121-2.12l7.243-7.131l2.12 2.12l-7.242 7.131zM4 20h16v2H4z"/></svg>`;
      const settingItem = highlightersContainer.createEl("div");
      settingItem.addClass("highlighter-item-draggable");

      const row = new Setting(settingItem)
        .setClass("highlighter-setting-item")
        .setName(highlighter)
        .setDesc(this.plugin.settings.highlighters[highlighter])
        .addButton((button) => {
          const shown = (): boolean => {
            const list = this.plugin.settings.readingBarColors;
            return list.length === 0 || list.includes(highlighter);
          };
          const paint = () => {
            button.buttonEl.toggleClass("is-off", !shown());
            button.setTooltip(
              shown()
                ? "Shown in the reading-mode bar"
                : "Hidden from the reading-mode bar"
            );
          };

          button
            .setClass("HighlightrSettingsButton")
            .setClass("HighlightrSettingsButtonQuick")
            .setIcon("highlightr-book")
            .onClick(async () => {
              const current = this.plugin.settings.readingBarColors;
              // Empty means all, so the first exclusion has to write out the
              // full list before removing one from it.
              const list =
                current.length === 0
                  ? [...this.plugin.settings.highlighterOrder]
                  : [...current];
              const at = list.indexOf(highlighter);
              if (at === -1) list.push(highlighter);
              else list.splice(at, 1);
              this.plugin.settings.readingBarColors = list;
              await this.plugin.saveSettings();
              // Repaint this one button rather than calling display(). A
              // rebuild of the whole tab throws the reader back to the top,
              // which on a phone means scrolling down again for every colour
              // they want to toggle.
              paint();
            });
          paint();
        })
        .addButton((button) => {
          button
            .setClass("HighlightrSettingsButton")
            .setClass("HighlightrSettingsButtonEdit")
            .setIcon("highlightr-edit")
            .setTooltip("Edit")
            .onClick(() => {
              this.editing = highlighter;
              this.display();
              // The inputs are at the top of a tab that may be scrolled away.
              this.containerEl
                .querySelector(".highlighter-settings-color")
                ?.scrollIntoView({ block: "center" });
            });
        })
        .addButton((button) => {
          button
            .setClass("HighlightrSettingsButton")
            .setClass("HighlightrSettingsButtonDelete")
            .setIcon("highlightr-delete")
            .setTooltip("Remove")
            .onClick(async () => {
              new Notice(`${highlighter} highlight deleted`);
              (this.app as any).commands.removeCommand(
                `highlightr-plugin:${highlighter}`
              );
              delete this.plugin.settings.highlighters[highlighter];
              this.plugin.settings.highlighterOrder.remove(highlighter);
              setTimeout(() => {
                dispatchEvent(new Event("Highlightr-NewCommand"));
              }, 100);
              await this.plugin.saveSettings();
              this.display();
            });
        });

      const colorIcon = createEl("span", { cls: "highlighter-setting-icon" });
      colorIcon.innerHTML = icon;
      row.settingEl.prepend(colorIcon);
    });
  }
}
