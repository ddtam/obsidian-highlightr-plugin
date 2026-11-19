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
  /**
   * The same bar while editing. Separate from readingBar, and off by
   * default, because a selection means different things in the two
   * modes: in reading mode it is almost always intent to do something
   * with the text, while editing it is usually about to be typed over.
   */
  editorBar: ReadingBarMode;
  /**
   * Which colours the reading-mode bar offers, by name.
   *
   * Empty means all of them, so a palette that predates this setting behaves
   * as it did. The bar is a one-tap control on a phone, and eight swatches
   * across a narrow screen makes each one a smaller target than the two or
   * three anyone actually reaches for.
   */
  readingBarColors: string[];
  /**
   * Set highlight text to black or white for legibility in reading mode.
   *
   * A theme can force one colour on every rendered mark, which is fine until
   * the highlight behind it is pale. Minimal does exactly this, which is why
   * a highlight can read correctly while editing and be unreadable while
   * reading.
   */
  contrastText: boolean;
  /**
   * What each colour means, by colour name, shown on hovering its swatch.
   *
   * A palette is only useful if its colours mean something, and the meaning
   * lives in the reader's head unless it is written somewhere the bar can
   * show it. A missing or blank entry shows the name alone, as before. A map
   * rather than nested settings so the shallow merge in loadSettings still
   * holds: an absent key reads as the empty default.
   */
  colorDescriptions: Record<string, string>;
  /**
   * The swatch bar's opacity while the pointer is elsewhere, 0.1 to 1.
   *
   * A bar at full strength on every selection pulls the eye off the text
   * being read. It comes up to full opacity on hover. Applied only where the
   * device can hover: on a phone there is nothing to raise it before the
   * tap, so it stays opaque there.
   */
  barRestOpacity: number;
  highlighterMethods: string;
  highlighters: Highlighters;
  highlighterOrder: string[];
}

const DEFAULT_SETTINGS: HighlightrSettings = {
  highlighterStyle: "none",
  readingBar: "mobile",
  editorBar: "never",
  readingBarColors: [],
  contrastText: true,
  colorDescriptions: {},
  barRestOpacity: 0.4,
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

/**
 * The text a swatch is labelled with: its name, and its meaning if one is set.
 *
 * Blank or whitespace descriptions count as none, so clearing the field in
 * the settings tab returns a swatch to its plain name.
 */
export function swatchLabel(
  name: string,
  descriptions: Record<string, string> | undefined
): { label: string; description: string | null } {
  const raw = descriptions?.[name];
  const description =
    typeof raw === "string" && raw.trim() !== "" ? raw.trim() : null;
  return {
    label: description === null ? name : `${name}: ${description}`,
    description,
  };
}

/**
 * Carry a colour's description across a rename, or drop it on delete.
 *
 * Kept beside the schema because the settings tab has two places that change
 * a colour's name, and a description left under the old name would vanish
 * from the bar while still sitting in data.json.
 */
export function moveDescription(
  descriptions: Record<string, string>,
  from: string,
  to: string | null
): void {
  if (!(from in descriptions)) return;
  const text = descriptions[from];
  delete descriptions[from];
  if (to !== null && text.trim() !== "") descriptions[to] = text;
}

/** Clamp a stored opacity to the range the setting offers. */
export function restOpacity(value: unknown): number {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return 1;
  return Math.min(1, Math.max(0.1, n));
}
