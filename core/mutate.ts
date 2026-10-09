import type { BracketRange } from './types';

/**
 * Non-destructively replaces the character inside a task's checklist brackets.
 *
 * The file may have changed since it was parsed, so the bracket is checked
 * first: the write only goes ahead when `[`, the expected character and `]`
 * still sit at the parsed columns of the parsed line.
 *
 * @param content Current text of the markdown file.
 * @param bracketRange Where the parse found the brackets.
 * @param expectedChar Character the parse found between them.
 * @param nextChar Character to write in its place.
 * @param expectedLine The whole line as parsed (`TaskNode.rawText`). When
 *   given, the line must still read the same: a line inserted above would
 *   otherwise put a different task's bracket at the same columns.
 * @returns The new content, every other byte and line ending untouched, or
 *   `null` when the bracket has moved or holds something else.
 */
export function replaceStateChar(
  content: string,
  bracketRange: BracketRange,
  expectedChar: string,
  nextChar: string,
  expectedLine?: string
): string | null {
  // A toggle swaps one character for one: `[]` and `[xx]` have no single slot to write.
  if (expectedChar.length !== 1 || nextChar.length !== 1) return null;
  if (bracketRange.closeBracketCol !== bracketRange.charCol + 1) return null;

  const lineStart = lineStartOffset(content, bracketRange.line);
  if (lineStart === -1) return null;

  const newline = content.indexOf('\n', lineStart);
  const lineEnd = newline === -1 ? content.length : newline;
  const openAt = lineStart + bracketRange.openBracketCol;
  const charAt = lineStart + bracketRange.charCol;
  const closeAt = lineStart + bracketRange.closeBracketCol;

  if (bracketRange.openBracketCol < 0 || closeAt >= lineEnd) return null;
  if (content[openAt] !== '[' || content[charAt] !== expectedChar || content[closeAt] !== ']') return null;

  if (expectedLine !== undefined) {
    // The parser splits on \r?\n, so a CRLF line's text stops before the \r.
    const textEnd = content[lineEnd - 1] === '\r' ? lineEnd - 1 : lineEnd;
    if (content.slice(lineStart, textEnd) !== expectedLine) return null;
  }

  return content.slice(0, charAt) + nextChar + content.slice(charAt + 1);
}

/** Offset of the first character of a zero-indexed line, or -1 when the content has fewer lines. */
function lineStartOffset(content: string, line: number): number {
  let offset = 0;
  for (let current = 0; current < line; current++) {
    const newline = content.indexOf('\n', offset);
    if (newline === -1) return -1;
    offset = newline + 1;
  }
  return offset;
}
