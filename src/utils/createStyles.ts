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

    if (!settings.contrastText) return;
    const ink = contrastText(value);
    if (ink === null) return;

    // Reading mode only. In Live Preview a mark inside a CodeMirror line is
    // not inside .markdown-rendered, so it already inherits the normal text
    // colour and needs no help; it is the rendered view where a theme can
    // force one colour on every highlight. Minimal sets
    // `.markdown-rendered mark { color: var(--bg1) }`, which is why the same
    // highlight is legible while editing and not while reading.
    //
    // Scoped under .markdown-rendered so it out-specifies that rule rather
    // than relying on which stylesheet the app happened to load last. The
    // hex is matched in both cases because notes written before hex
    // canonicalisation may carry a lowercase one.
    const canonical = canonicalHex(value);
    addNewStyle(
      [
        `.markdown-rendered mark.hltr-${colorLowercase}`,
        `.markdown-rendered mark[style*="${canonical}"]`,
        `.markdown-rendered mark[style*="${canonical.toLowerCase()}"]`,
      ].join(",\n"),
      `color: ${ink};`,
      styleSheet
    );
  });
}
