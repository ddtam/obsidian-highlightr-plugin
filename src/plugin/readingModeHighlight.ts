import { App, MarkdownPostProcessorContext, Notice } from "obsidian";

/**
 * Highlighting from reading mode.
 *
 * There is no editor in reading mode, so a highlight means editing the source
 * file. The selection, though, lives in rendered HTML, and rendered text is
 * not source text: `[[note|alias]]` renders as "alias" and `**bold**` renders
 * without its asterisks. So the whole problem is locating the selection in the
 * source, and the rule throughout is **refuse rather than guess**: a wrong
 * write here corrupts a note silently, while a refusal costs one toggle into
 * edit mode, which is what the reader does today anyway.
 */

/**
 * The opening tag a highlight is wrapped in.
 *
 * One home for this, because two callers now need it, the editor commands and
 * the reading-mode path, and because automation elsewhere greps for the exact
 * string this produces. A copy in each caller is a second place for the
 * markup to drift, and a drift here is silent: highlights keep working and
 * stop being found.
 */
export function highlightPrefix(
  method: string,
  name: string,
  hex: string
): string {
  return method === "css-classes"
    ? `<mark class="hltr-${name.toLowerCase()}">`
    : `<mark style="background: ${canonicalHex(hex)};">`;
}

/**
 * Uppercase a hex colour, leaving anything else alone.
 *
 * CSS does not care, but a reader downstream might: this vault's flag
 * pipeline matches `<mark style="background: #A28AE5A6;">` literally, and a
 * lowercase hex is invisible to it while still rendering perfectly. Pickr
 * makes that easy to hit by accident, since `toHEXA()` builds the RGB bytes
 * with `toString(16)` and uppercases only the alpha byte, so a colour set
 * through the picker comes back as `#a28ae5A6`. Normalising here means the
 * emitted markup is canonical whatever is sitting in data.json.
 */
export function canonicalHex(value: string): string {
  const hex = value.trim();
  return /^#[0-9a-fA-F]{3,8}$/.test(hex) ? hex.toUpperCase() : hex;
}

export const HIGHLIGHT_SUFFIX = "</mark>";

/** Where a reading-mode selection came from, recorded when it is made. */
export interface ReadingSelection {
  path: string;
  /** Source line range of the block, from getSectionInfo. */
  lineStart: number;
  lineEnd: number;
  /** The selected text, exactly as rendered. */
  text: string;
  /** Which occurrence of `text` within the block was selected, 0-based. */
  occurrence: number;
  /** How many times `text` occurs in the block as rendered. */
  renderedCount: number;
  /**
   * Set when the selection sits inside an existing highlight.
   *
   * Removal is easier to place than insertion: the mark element states its
   * own text, so there is no need to work out where a selection begins. Any
   * selection touching a mark removes the whole mark, because a partial
   * unhighlight would mean splitting it, which is not what anyone means by
   * removing a highlight.
   */
  mark?: { text: string; occurrence: number; count: number };
}

/** Matches one highlight and captures its contents. */
function markPattern(text: string): RegExp {
  const escaped = text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`<mark\\b[^>]*>${escaped}</mark>`, "g");
}

export interface ApplyOutcome {
  ok: boolean;
  /** Why nothing was written. Present only when `ok` is false. */
  reason?: string;
}

const LINE_START = "hlLineStart";
const LINE_END = "hlLineEnd";
const PATH = "hlPath";

/** Count non-overlapping occurrences of `needle`, and index the one at `before`. */
function countOccurrences(haystack: string, needle: string): number {
  if (needle.length === 0) return 0;
  let n = 0;
  for (let i = haystack.indexOf(needle); i !== -1; i = haystack.indexOf(needle, i + needle.length)) {
    n++;
  }
  return n;
}

function nthIndexOf(haystack: string, needle: string, nth: number): number {
  let i = -1;
  for (let k = 0; k <= nth; k++) {
    i = haystack.indexOf(needle, i === -1 ? 0 : i + needle.length);
    if (i === -1) return -1;
  }
  return i;
}

/**
 * Stamp each rendered block with the source lines it came from.
 *
 * `getSectionInfo` is only available to a post-processor, and only while the
 * block is being rendered, so the line range has to be recorded now and read
 * back later when a selection lands inside it.
 */
export function stampSourceLines(
  el: HTMLElement,
  ctx: MarkdownPostProcessorContext
): void {
  const info = ctx.getSectionInfo(el);
  // Null for embeds, canvas and anything else without a source range. Those
  // blocks simply never offer the feature, which is the correct outcome.
  if (info === null) return;
  el.dataset[LINE_START] = String(info.lineStart);
  el.dataset[LINE_END] = String(info.lineEnd);
  el.dataset[PATH] = ctx.sourcePath;
}

/** The character offset of a node/offset pair within its block's text. */
function offsetWithin(block: HTMLElement, node: Node, offset: number): number {
  const walker = document.createTreeWalker(block, NodeFilter.SHOW_TEXT);
  let total = 0;
  for (let n = walker.nextNode(); n !== null; n = walker.nextNode()) {
    if (n === node) return total + offset;
    total += n.textContent?.length ?? 0;
  }
  return -1;
}

/**
 * Describe the current selection, or null if it is not one we can place.
 *
 * Exported for its tests: everything here is pure DOM reasoning, and it is the
 * half most likely to be wrong in a way that only shows up as a bad write.
 */
export function describeSelection(sel: Selection | null): ReadingSelection | null {
  if (sel === null || sel.isCollapsed || sel.rangeCount === 0) return null;
  const text = sel.toString();
  if (text.trim().length === 0) return null;

  const range = sel.getRangeAt(0);
  const start =
    range.startContainer instanceof HTMLElement
      ? range.startContainer
      : range.startContainer.parentElement;
  if (start === null) return null;

  const block = start.closest<HTMLElement>("[data-hl-line-start]");
  if (block === null) return null;
  // A selection running past the block cannot be placed from one line range.
  if (!block.contains(range.endContainer)) return null;

  const path = block.dataset[PATH];
  const lineStart = Number(block.dataset[LINE_START]);
  const lineEnd = Number(block.dataset[LINE_END]);
  if (path === undefined || !Number.isFinite(lineStart) || !Number.isFinite(lineEnd)) {
    return null;
  }

  const blockText = block.textContent ?? "";
  const at = offsetWithin(block, range.startContainer, range.startOffset);
  if (at < 0) return null;

  const occurrence = countOccurrences(blockText.slice(0, at), text);
  const renderedCount = countOccurrences(blockText, text);
  if (renderedCount === 0) return null;

  return {
    path,
    lineStart,
    lineEnd,
    text,
    occurrence,
    renderedCount,
    mark: describeMark(block, start),
  };
}

/** Describe the highlight the selection sits in, if it sits in one. */
function describeMark(
  block: HTMLElement,
  start: HTMLElement
): ReadingSelection["mark"] {
  const mark = start.closest("mark");
  if (mark === null || !block.contains(mark)) return undefined;

  const text = mark.textContent ?? "";
  if (text.length === 0) return undefined;

  // Which of the identically-worded highlights in this block is this one.
  const siblings = Array.from(block.querySelectorAll("mark")).filter(
    (m) => m.textContent === text
  );
  const occurrence = siblings.indexOf(mark);
  if (occurrence === -1) return undefined;

  return { text, occurrence, count: siblings.length };
}

/**
 * Remove the highlight the selection sits in.
 *
 * Same safety property as writing one: the source slice must contain exactly
 * as many highlights of this text as the rendered block showed, or the two
 * are not describing the same thing and nothing is touched.
 */
export function rewriteSourceRemoving(
  data: string,
  sel: ReadingSelection
): { text?: string; error?: string } {
  const mark = sel.mark;
  if (mark === undefined) {
    return { error: "that selection is not inside a highlight" };
  }

  const lines = data.split("\n");
  if (sel.lineEnd >= lines.length) {
    return { error: "the note changed since that selection was made" };
  }

  const slice = lines.slice(sel.lineStart, sel.lineEnd + 1).join("\n");
  const found = slice.match(markPattern(mark.text));
  if (found === null || found.length !== mark.count) {
    return {
      error:
        "the highlights in the source do not match what is rendered, so the " +
        "right one cannot be identified",
    };
  }

  let seen = -1;
  const patched = slice.replace(markPattern(mark.text), (whole) => {
    seen++;
    return seen === mark.occurrence ? mark.text : whole;
  });

  const before = lines.slice(0, sel.lineStart).join("\n");
  const after = lines.slice(sel.lineEnd + 1).join("\n");
  return {
    text: [
      ...(sel.lineStart > 0 ? [before] : []),
      patched,
      ...(sel.lineEnd + 1 < lines.length ? [after] : []),
    ].join("\n"),
  };
}

/**
 * Wrap the described selection in the source file.
 *
 * The safety property lives in one comparison: the source slice must contain
 * the selected string exactly as many times as the rendered block did. When
 * the two disagree, the rendered text and the source text are not the same
 * text, which is precisely the case where an offset cannot be trusted, so
 * nothing is written.
 */
export function rewriteSource(
  data: string,
  sel: ReadingSelection,
  prefix: string,
  suffix: string
): { text?: string; error?: string } {
  const lines = data.split("\n");
  if (sel.lineEnd >= lines.length) {
    return { error: "the note changed since that selection was made" };
  }

  const before = lines.slice(0, sel.lineStart).join("\n");
  const slice = lines.slice(sel.lineStart, sel.lineEnd + 1).join("\n");
  const after = lines.slice(sel.lineEnd + 1).join("\n");

  const sourceCount = countOccurrences(slice, sel.text);
  if (sourceCount !== sel.renderedCount) {
    return {
      error:
        "that selection does not appear in the source the same way it is " +
        "rendered, so its position cannot be located safely",
    };
  }

  const at = nthIndexOf(slice, sel.text, sel.occurrence);
  if (at === -1) {
    return { error: "could not find that text in the source" };
  }

  const patched =
    slice.slice(0, at) +
    prefix +
    sel.text +
    suffix +
    slice.slice(at + sel.text.length);

  return {
    text: [
      ...(sel.lineStart > 0 ? [before] : []),
      patched,
      ...(sel.lineEnd + 1 < lines.length ? [after] : []),
    ].join("\n"),
  };
}

/** Apply a described selection to its file, reporting what happened. */
export async function applyReadingHighlight(
  app: App,
  sel: ReadingSelection,
  prefix: string,
  suffix: string
): Promise<ApplyOutcome> {
  return editFile(app, sel, (data) => rewriteSource(data, sel, prefix, suffix));
}

/** Remove the highlight the described selection sits in. */
export async function removeReadingHighlight(
  app: App,
  sel: ReadingSelection
): Promise<ApplyOutcome> {
  return editFile(app, sel, (data) => rewriteSourceRemoving(data, sel));
}

async function editFile(
  app: App,
  sel: ReadingSelection,
  rewrite: (data: string) => { text?: string; error?: string }
): Promise<ApplyOutcome> {
  const file = app.vault.getFileByPath(sel.path);
  if (file === null) return { ok: false, reason: "that note is no longer open" };

  let failure: string | null = null;
  // process() is an atomic read-modify-write, so a concurrent sync cannot
  // interleave between our read and our write.
  await app.vault.process(file, (data: string) => {
    const result = rewrite(data);
    if (result.error !== undefined || result.text === undefined) {
      failure = result.error ?? "could not place that selection";
      return data;
    }
    return result.text;
  });

  return failure === null ? { ok: true } : { ok: false, reason: failure };
}

/**
 * Remembers the last placeable selection in reading mode.
 *
 * Deliberately keeps the selection after it collapses. On a phone, opening the
 * command palette drops the selection before the command can read it, which
 * would make the feature unusable in the half of the cases that need it most.
 * The cache is stamped with a path, and the command refuses when that path is
 * not the note in front of you.
 */
export class ReadingSelectionTracker {
  private last: ReadingSelection | null = null;

  record(sel: Selection | null): void {
    const described = describeSelection(sel);
    // A collapsed or unplaceable selection leaves the previous one standing,
    // which is the whole point on mobile.
    if (described !== null) this.last = described;
  }

  /** The remembered selection, if it belongs to `path`. */
  current(path: string | undefined): ReadingSelection | null {
    if (path === undefined || this.last === null) return null;
    return this.last.path === path ? this.last : null;
  }

  forget(): void {
    this.last = null;
  }
}

export function notifyOutcome(outcome: ApplyOutcome, colour: string): void {
  if (outcome.ok) {
    new Notice(colour === "" ? "Highlight removed" : `Highlighted with ${colour}`);
    return;
  }
  const reason = outcome.reason ?? "could not place that selection";
  new Notice(
    `Highlightr: ${reason}. Switch to editing mode to highlight this one.`
  );
}
