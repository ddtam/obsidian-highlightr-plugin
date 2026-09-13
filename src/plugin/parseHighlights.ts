/**
 * Pull the highlights out of a note's source.
 *
 * The reason this is a parser rather than a search is one rule: a `<mark>`
 * inside a code span or a fenced block is documentation, not a highlight. Every
 * false positive measured across both vaults was of that kind, 16 of 17 matches
 * in `ai_brain`, and no text search can express the rule. Skipping code gets it
 * for free.
 */

export interface ParsedHighlight {
  /** 0-based source line, for scrolling the note to it. */
  line: number;
  /** The highlighted text, as written. */
  text: string;
  /** Inline hex if the mark carries one, else null. */
  hex: string | null;
  /** Class suffix if it is a `hltr-` mark, else null. */
  name: string | null;
}

const MARK = /<mark\b([^>]*)>([\s\S]*?)<\/mark>/g;
// The first hex anywhere in the attributes, not one anchored to `background:`.
// A half highlight writes `background: linear-gradient(transparent 55%,
// #A28AE5 55%)`, whose colour is not adjacent to the property name, and an
// in-progress flag showing as colourless in the panel would be wrong in
// exactly the view used to find outstanding flags.
const HEX = /(#[0-9a-fA-F]{3,8})\b/;
const CLS = /class="hltr-([a-z0-9-]+)"/i;

/**
 * Blank out code while preserving every character position.
 *
 * Positions have to survive because the line number is derived from the offset
 * afterwards. Replacing a fence with nothing would shift every highlight below
 * it onto the wrong line, which is the kind of error that looks like a scroll
 * bug rather than a parse bug.
 */
function blankCode(text: string): string {
  const keepShape = (s: string) => s.replace(/[^\n]/g, " ");
  return text
    .replace(/```[\s\S]*?(?:```|$)/g, keepShape)
    .replace(/~~~[\s\S]*?(?:~~~|$)/g, keepShape)
    .replace(/`[^`\n]*`/g, keepShape);
}

export function parseHighlights(text: string): ParsedHighlight[] {
  const scannable = blankCode(text);
  const out: ParsedHighlight[] = [];

  for (const m of scannable.matchAll(MARK)) {
    const attrs = m[1] ?? "";
    // Taken from the original rather than the blanked copy: the blanking
    // preserves offsets, so the same span holds the real text.
    const body = text.slice(m.index + m[0].indexOf(">") + 1, m.index + m[0].length - 7);
    const inner = body.trim();
    if (inner.length === 0) continue;

    out.push({
      line: (text.slice(0, m.index).match(/\n/g) ?? []).length,
      text: inner,
      hex: HEX.exec(attrs)?.[1] ?? null,
      name: CLS.exec(attrs)?.[1] ?? null,
    });
  }
  return out;
}

/** The swatch colour for a parsed highlight, given the palette. */
export function highlightColour(
  h: ParsedHighlight,
  palette: Record<string, string>
): string | null {
  if (h.hex !== null) return h.hex;
  if (h.name === null) return null;
  const key = Object.keys(palette).find((k) => k.toLowerCase() === h.name);
  return key ? palette[key] : null;
}
