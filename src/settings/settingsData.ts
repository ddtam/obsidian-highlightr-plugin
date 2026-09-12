export const HIGHLIGHTER_STYLES = [
  "none",
  "lowlight",
  "floating",
  "rounded",
  "realistic",
];

export const HIGHLIGHTER_METHODS = ["css-classes", "inline-styles"];

export interface Highlighters {
  [color: string]: string;
}

export const READING_BAR_MODES = ["mobile", "always", "never"] as const;
export type ReadingBarMode = (typeof READING_BAR_MODES)[number];

export interface HighlightrSettings {
  highlighterStyle: string;
  /**
   * When to show the swatch bar beside a selection in reading mode.
   *
   * Defaults to mobile: on a phone it replaces a three-step trip through the
   * command palette, while on a desktop the palette and a hotkey are already
   * one step and a bar appearing on every selection is mostly in the way.
   */
  readingBar: ReadingBarMode;
  highlighterMethods: string;
  highlighters: Highlighters;
  highlighterOrder: string[];
}

const DEFAULT_SETTINGS: HighlightrSettings = {
  highlighterStyle: "none",
  readingBar: "mobile",
  highlighterMethods: "inline-styles",
  highlighters: {
    Pink: "#FFB8EBA6",
    Red: "#FF5582A6",
    Orange: "#FFB86CA6",
    Yellow: "#FFF3A3A6",
    Green: "#BBFABBA6",
    Cyan: "#ABF7F7A6",
    Blue: "#ADCCFFA6",
    Purple: "#D2B3FFA6",
    Grey: "#CACFD9A6",
  },
  highlighterOrder: [],
};

DEFAULT_SETTINGS.highlighterOrder = Object.keys(DEFAULT_SETTINGS.highlighters);

export default DEFAULT_SETTINGS;
