import { HighlightrSettings } from "src/settings/settingsData";
import { canonicalHex } from "src/plugin/readingModeHighlight";
import { setAttributes } from "./setAttributes";

function addNewStyle(selector: string, style: string, sheet: HTMLElement) {
  sheet.textContent += selector + `{\n ${style}\n}\n\n`;
}

/** One channel of a hex colour, 0-255, or null if it is not a hex. */
function channels(hex: string): [number, number, number] | null {
  const m = /^#([0-9a-fA-F]{3,8})$/.exec(hex.trim());
  if (m === null) return null;
  let body = m[1];
  if (body.length === 3 || body.length === 4) {
    body = body
      .slice(0, 3)
      .split("")
      .map((c) => c + c)
      .join("");
  }
  if (body.length < 6) return null;
  return [
    parseInt(body.slice(0, 2), 16),
    parseInt(body.slice(2, 4), 16),
    parseInt(body.slice(4, 6), 16),
  ];
}

/** WCAG relative luminance. */
function luminance([r, g, b]: [number, number, number]): number {
  const f = (v: number) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}

/**
 * Black or white, whichever contrasts better with the highlight.
 *
 * Chosen by WCAG contrast ratio rather than a lightness threshold, because a
 * threshold gets mid-tone greens and oranges wrong in opposite directions.
 * Alpha is ignored: the effective colour depends on what the highlight sits
 * on, which is not knowable when this stylesheet is generated, and a
 * translucent highlight is closer to its own hue than to the page anyway.
 */
export function contrastText(hex: string): string | null {
  const rgb = channels(hex);
  if (rgb === null) return null;
  const l = luminance(rgb);
  const onWhite = 1.05 / (l + 0.05);
  const onBlack = (l + 0.05) / 0.05;
  return onBlack >= onWhite ? "#000000" : "#ffffff";
}

/**
 * Set legible text on every rendered highlight, on the element itself.
 *
 * This was a generated stylesheet rule keyed on the colour, and that is a
 * specificity race against the theme it is correcting: Minimal's rule is
 * `.theme-dark.minimal-… .markdown-rendered mark`, three classes deep, so a
 * plugin rule scoped one class shallower silently loses. It also only matched
 * colours currently in the palette, so editing a colour left every highlight
 * already written with the old value unstyled, which is how removing an alpha
 * suffix sent the text back to the theme's grey.
 *
 * An inline style on the element beats any stylesheet, needs no selector to
 * match, and works for any colour a note happens to contain including ones
 * the palette no longer has. It sets `important` because the rule it is
 * correcting may carry it too.
 *
 * Only the rendered DOM is touched. The note's own markup is never altered,
 * which is what keeps anything matching on the literal string working.
 */
export function paintMarkInk(el: HTMLElement, settings: HighlightrSettings): void {
  if (!settings.contrastText) return;

  const marks =
    el instanceof HTMLElement && el.tagName === "MARK"
      ? [el]
      : Array.from(el.querySelectorAll("mark"));

  for (const mark of marks) {
    // The inline background is authoritative, since that is what the reader
    // sees; a class-based highlight is looked up in the palette instead.
    const inline = /#[0-9a-fA-F]{3,8}/.exec(mark.getAttribute("style") ?? "");
    let hex = inline?.[0] ?? null;
    if (hex === null) {
      const named = Array.from(mark.classList)
        .find((c) => c.startsWith("hltr-"))
        ?.slice(5);
      const match = named
        ? Object.keys(settings.highlighters).find(
            (k) => k.toLowerCase() === named
          )
        : undefined;
      hex = match ? settings.highlighters[match] : null;
    }
    if (hex === null) continue;

    const ink = contrastText(hex);
    if (ink !== null) mark.style.setProperty("color", ink, "important");
  }
}

export function createStyles(settings: HighlightrSettings) {
  let styleSheet = document.createElement("style");
  setAttributes(styleSheet, {
    type: "text/css",
    id: "highlightr-styles",
  });

  let header = document.getElementsByTagName("HEAD")[0];
  header.appendChild(styleSheet);

  Object.keys(settings.highlighters).forEach((highlighter) => {
    const colorLowercase = highlighter.toLowerCase();
    const value = settings.highlighters[highlighter];

    addNewStyle(
      `.hltr-${colorLowercase},\nmark.hltr-${colorLowercase},\n.markdown-preview-view mark.hltr-${colorLowercase}`,
      `background: ${value};`,
      styleSheet
    );

  });
}
