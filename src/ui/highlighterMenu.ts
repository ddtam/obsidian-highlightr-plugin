import { Menu, Notice, setTooltip } from "obsidian";
import {
  HighlightrSettings,
  swatchLabel,
} from "src/settings/settingsData";
import {
  Coords,
  EnhancedApp,
  EnhancedEditor,
  EnhancedMenu,
} from "src/settings/types";

const highlighterMenu = (
  app: EnhancedApp,
  settings: HighlightrSettings,
  editor: EnhancedEditor
): void => {
  if (editor && editor.hasFocus()) {
    const cursor = editor.getCursor("from");
    let coords: Coords;

    const menu = new Menu() as unknown as EnhancedMenu;

    // menu.setUseNativeMenu(false);

    const menuDom = menu.dom;
    menuDom.addClass("highlighterContainer");

    settings.highlighterOrder.forEach((highlighter) => {
      menu.addItem((highlighterItem) => {
        highlighterItem.setTitle(highlighter);
        highlighterItem.setIcon(`highlightr-pen-${highlighter}`.toLowerCase());
        highlighterItem.onClick(() => {
          app.commands.executeCommandById(`highlightr-plugin:${highlighter}`);
        });
        // The same meaning the bar shows on hover. `dom` is not in the
        // public MenuItem type, so it is reached for rather than assumed.
        const { description } = swatchLabel(
          highlighter,
          settings.colorDescriptions
        );
        const dom = (highlighterItem as unknown as { dom?: HTMLElement }).dom;
        if (description !== null && dom instanceof HTMLElement) {
          setTooltip(dom, description, { placement: "right" });
        }
      });
    });

    if (editor.cursorCoords) {
      coords = editor.cursorCoords(true, "window");
    } else if (editor.coordsAtPos) {
      const offset = editor.posToOffset(cursor);
      coords = editor.cm.coordsAtPos?.(offset) ?? editor.coordsAtPos(offset);
    } else {
      return;
    }

    menu.showAtPosition({
      x: coords.right + 25,
      y: coords.top + 20,
    });
  } else {
    new Notice("Focus must be in editor");
  }
};

export default highlighterMenu;
