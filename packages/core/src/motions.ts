import type { Position } from './index';
import { VimBuffer } from './buffer';

export function getCharClass(char: string): number {
  if (!char) return 0; // EOF/EOL
  if (/\s/.test(char)) return 1; // Whitespace
  if (/^[a-zA-Z0-9_]$/.test(char)) return 2; // Word char
  return 3; // Punctuation/Special
}

export function nextPosition(buffer: VimBuffer, pos: Position): Position | null {
  const line = buffer.getLine(pos.line);
  if (pos.character < line.length - 1) {
    return { line: pos.line, character: pos.character + 1 };
  }
  if (pos.line < buffer.getLineCount() - 1) {
    return { line: pos.line + 1, character: 0 };
  }
  return null;
}

export function prevPosition(buffer: VimBuffer, pos: Position): Position | null {
  if (pos.character > 0) {
    return { line: pos.line, character: pos.character - 1 };
  }
  if (pos.line > 0) {
    const prevLine = buffer.getLine(pos.line - 1);
    return { line: pos.line - 1, character: Math.max(0, prevLine.length - 1) };
  }
  return null;
}

export function getWordForward(buffer: VimBuffer, start: Position): Position {
  let curr: Position | null = start;
  const startChar = buffer.getLine(start.line)[start.character];
  if (!startChar) {
    const next = nextPosition(buffer, start);
    if (!next) return start;
    return next;
  }

  let startClass = getCharClass(startChar);

  // 1. Move past characters of the same class (unless starting on whitespace)
  if (startClass !== 1) {
    while (curr) {
      const next = nextPosition(buffer, curr);
      if (!next) return curr;
      const nextChar = buffer.getLine(next.line)[next.character];
      const nextClass = getCharClass(nextChar);
      if (nextClass !== startClass) {
        curr = next;
        break;
      }
      curr = next;
    }
  }

  // 2. We are now at a different class. If it's whitespace, skip it
  if (curr) {
    let currChar = buffer.getLine(curr.line)[curr.character];
    let currClass = getCharClass(currChar);
    if (currClass === 1) {
      while (curr) {
        const next = nextPosition(buffer, curr);
        if (!next) return curr;
        const nextChar = buffer.getLine(next.line)[next.character];
        const nextClass = getCharClass(nextChar);
        if (nextClass !== 1) {
          curr = next;
          break;
        }
        curr = next;
      }
    }
  }

  return curr || start;
}

export function getWordBackward(buffer: VimBuffer, start: Position): Position {
  let curr: Position | null = prevPosition(buffer, start);
  if (!curr) return start;

  let currChar = buffer.getLine(curr.line)[curr.character];
  let currClass = getCharClass(currChar);

  // If starting on whitespace, skip all preceding whitespace
  if (currClass === 1) {
    while (curr) {
      const prev = prevPosition(buffer, curr);
      if (!prev) return curr;
      const prevChar = buffer.getLine(prev.line)[prev.character];
      const prevClass = getCharClass(prevChar);
      if (prevClass !== 1) {
        currClass = prevClass;
        curr = prev;
        break;
      }
      curr = prev;
    }
  }

  // Now scan backward through the same class
  while (curr) {
    const prev = prevPosition(buffer, curr);
    if (!prev) return curr;
    const prevChar = buffer.getLine(prev.line)[prev.character];
    const prevClass = getCharClass(prevChar);
    if (prevClass !== currClass) {
      return curr;
    }
    curr = prev;
  }

  return start;
}

export function getWordEndForward(buffer: VimBuffer, start: Position): Position {
  let curr: Position | null = nextPosition(buffer, start);
  if (!curr) return start;

  let currChar = buffer.getLine(curr.line)[curr.character];
  let currClass = getCharClass(currChar);

  // Skip whitespace
  if (currClass === 1) {
    while (curr) {
      const next = nextPosition(buffer, curr);
      if (!next) return curr;
      const nextChar = buffer.getLine(next.line)[next.character];
      const nextClass = getCharClass(nextChar);
      if (nextClass !== 1) {
        currClass = nextClass;
        curr = next;
        break;
      }
      curr = next;
    }
  }

  // Scan until the character class changes, but stop on the last character of that class
  while (curr) {
    const next = nextPosition(buffer, curr);
    if (!next) return curr;
    const nextChar = buffer.getLine(next.line)[next.character];
    const nextClass = getCharClass(nextChar);
    if (nextClass !== currClass) {
      return curr;
    }
    curr = next;
  }

  return start;
}

export function getTextObjectRange(
  buffer: VimBuffer,
  pos: Position,
  textObj: string,
): { start: Position; end: Position } | null {
  const line = buffer.getLine(pos.line);
  if (line.length === 0) {
    return { start: { ...pos }, end: { ...pos } };
  }

  const char = line[pos.character] || '';
  const initialClass = getCharClass(char);

  // Find start of current block
  let startCharIdx = pos.character;
  while (startCharIdx > 0) {
    if (getCharClass(line[startCharIdx - 1]) !== initialClass) {
      break;
    }
    startCharIdx--;
  }

  // Find end of current block
  let endCharIdx = pos.character;
  while (endCharIdx < line.length - 1) {
    if (getCharClass(line[endCharIdx + 1]) !== initialClass) {
      break;
    }
    endCharIdx++;
  }

  const start: Position = { line: pos.line, character: startCharIdx };
  const end: Position = { line: pos.line, character: endCharIdx };

  if (textObj === 'aw') {
    // Extend to include trailing whitespace (on the same line)
    let nextIdx = end.character + 1;
    let extendedTrailing = false;
    while (nextIdx < line.length && /\s/.test(line[nextIdx])) {
      extendedTrailing = true;
      nextIdx++;
    }
    if (extendedTrailing) {
      end.character = nextIdx - 1;
    } else {
      // If no trailing whitespace, extend to include leading whitespace
      let prevIdx = start.character - 1;
      let extendedLeading = false;
      while (prevIdx >= 0 && /\s/.test(line[prevIdx])) {
        extendedLeading = true;
        prevIdx--;
      }
      if (extendedLeading) {
        start.character = prevIdx + 1;
      }
    }
  }

  return { start, end };
}

/**
 * WORD variants (Vim's W/B/E): only whitespace separates WORDs, so
 * punctuation and word characters form one run. Class space: 1 = whitespace,
 * 2 = everything else.
 */
function getCharClassCoarse(char: string): number {
  if (!char) return 0;
  return /\s/.test(char) ? 1 : 2;
}

function scanForward(
  buffer: VimBuffer,
  start: Position,
  classOf: (char: string) => number,
): Position {
  let curr: Position | null = start;
  const startChar = buffer.getLine(start.line)[start.character];
  if (!startChar) {
    const next = nextPosition(buffer, start);
    return next ?? start;
  }
  const startClass = classOf(startChar);

  if (startClass !== 1) {
    while (curr) {
      const next = nextPosition(buffer, curr);
      if (!next) return curr;
      const nextClass = classOf(buffer.getLine(next.line)[next.character]);
      curr = next;
      if (nextClass !== startClass) break;
    }
  }

  if (curr && classOf(buffer.getLine(curr.line)[curr.character]) === 1) {
    while (curr) {
      const next = nextPosition(buffer, curr);
      if (!next) return curr;
      const nextClass = classOf(buffer.getLine(next.line)[next.character]);
      curr = next;
      if (nextClass !== 1) break;
    }
  }

  return curr || start;
}

function scanBackward(
  buffer: VimBuffer,
  start: Position,
  classOf: (char: string) => number,
): Position {
  let curr: Position | null = prevPosition(buffer, start);
  if (!curr) return start;

  let currClass = classOf(buffer.getLine(curr.line)[curr.character]);

  if (currClass === 1) {
    while (curr) {
      const prev = prevPosition(buffer, curr);
      if (!prev) return curr;
      const prevClass = classOf(buffer.getLine(prev.line)[prev.character]);
      curr = prev;
      if (prevClass !== 1) {
        currClass = prevClass;
        break;
      }
    }
  }

  while (curr) {
    const prev = prevPosition(buffer, curr);
    if (!prev) return curr;
    const prevClass = classOf(buffer.getLine(prev.line)[prev.character]);
    if (prevClass !== currClass) return curr;
    curr = prev;
  }

  return start;
}

function scanEndForward(
  buffer: VimBuffer,
  start: Position,
  classOf: (char: string) => number,
): Position {
  let curr: Position | null = nextPosition(buffer, start);
  if (!curr) return start;

  let currClass = classOf(buffer.getLine(curr.line)[curr.character]);

  if (currClass === 1) {
    while (curr) {
      const next = nextPosition(buffer, curr);
      if (!next) return curr;
      const nextClass = classOf(buffer.getLine(next.line)[next.character]);
      curr = next;
      if (nextClass !== 1) {
        currClass = nextClass;
        break;
      }
    }
  }

  while (curr) {
    const next = nextPosition(buffer, curr);
    if (!next) return curr;
    const nextClass = classOf(buffer.getLine(next.line)[next.character]);
    if (nextClass !== currClass) return curr;
    curr = next;
  }

  return start;
}

export function getWORDForward(buffer: VimBuffer, start: Position): Position {
  return scanForward(buffer, start, getCharClassCoarse);
}

export function getWORDBackward(buffer: VimBuffer, start: Position): Position {
  return scanBackward(buffer, start, getCharClassCoarse);
}

export function getWORDEndForward(buffer: VimBuffer, start: Position): Position {
  return scanEndForward(buffer, start, getCharClassCoarse);
}

/**
 * Vim's `%`: from the first bracket at or after `pos` on its line, jump to the
 * match with correct nesting across lines. Returns null when no bracket is on
 * the rest of the line or the match is unbalanced.
 */
export function getMatchingBracket(buffer: VimBuffer, pos: Position): Position | null {
  const pairs: Record<string, string> = { '(': ')', '[': ']', '{': '}' };
  const reverse: Record<string, string> = { ')': '(', ']': '[', '}': '{' };

  const line = buffer.getLine(pos.line);
  let startChar = -1;
  for (let i = pos.character; i < line.length; i++) {
    if (pairs[line[i]] || reverse[line[i]]) {
      startChar = i;
      break;
    }
  }
  if (startChar === -1) return null;

  const openChar = line[startChar];
  const forward = !!pairs[openChar];
  const match = forward ? pairs[openChar] : reverse[openChar];
  let depth = 0;

  let l = pos.line;
  let c = startChar;
  const lineCount = buffer.getLineCount();
  while (l >= 0 && l < lineCount) {
    const text = buffer.getLine(l);
    while (c >= 0 && c < text.length) {
      const ch = text[c];
      if (ch === openChar) depth++;
      else if (ch === match) {
        depth--;
        if (depth === 0) return { line: l, character: c };
      }
      c += forward ? 1 : -1;
    }
    l += forward ? 1 : -1;
    if (l >= 0 && l < lineCount) {
      c = forward ? 0 : buffer.getLine(l).length - 1;
    }
  }
  return null;
}
