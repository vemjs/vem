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

/** `ge`: go backwards to the end of the previous word. */
export function getWordEndBackward(buffer: VimBuffer, start: Position): Position {
  // Vim's ge: find the end of the previous word.
  // First skip back past any whitespace and the current word-like run.
  let curr: Position | null = start;
  const startChar = buffer.getLine(start.line)[start.character];
  if (!startChar) {
    const prev = prevPosition(buffer, start);
    if (!prev) return start;
    curr = prev;
  }

  let hadWordChar = false;
  // Skip back past the current word (so we go to the END of the PREVIOUS word)
  while (curr) {
    const c = buffer.getLine(curr.line)[curr.character];
    if (!c || c === '') break;
    if (getCharClass(c) !== 1) hadWordChar = true;
    if (hadWordChar && getCharClass(c) === 1) {
      // We just passed through the end of the word into whitespace.
      // Now continue back to find the END of the previous word.
      // Actually, we're now IN whitespace before the previous word. Jump to end of word.
      // But first we need to skip the whitespace.
      break;
    }
    const prev = prevPosition(buffer, curr);
    if (!prev) return curr;
    curr = prev;
  }

  // Skip any whitespace before the previous word
  while (curr) {
    const c = buffer.getLine(curr.line)[curr.character];
    if (!c || getCharClass(c) !== 1) break;
    const prev = prevPosition(buffer, curr);
    if (!prev) return curr;
    curr = prev;
  }

  // Now curr is at the first non-whitespace char of the previous word (or its start).
  // We need the END of this word. Scan forward through the same class.
  if (curr) {
    const targetClass = getCharClass(buffer.getLine(curr.line)[curr.character]);
    if (targetClass !== 0) {
      // Another version: find the END of this word and put cursor there
      while (curr) {
        const next = nextPosition(buffer, curr);
        if (!next) return curr;
        const nextClass = getCharClass(buffer.getLine(next.line)[next.character]);
        if (nextClass !== targetClass || nextClass === 0) return curr;
        curr = next;
      }
    }
  }

  return curr || start;
}

export function getTextObjectRange(
  buffer: VimBuffer,
  pos: Position,
  textObj: string,
): { start: Position; end: Position } | null {
  const line = buffer.getLine(pos.line);
  if (textObj.startsWith('i') || textObj.startsWith('a')) {
    const isAround = textObj.startsWith('a');
    const inner = textObj[1];

    // WORD text objects
    if (inner === 'W') {
      return getTextObjectWordRange(buffer, pos, true);
    }

    // Paragraph text objects (blank-line separated blocks)
    if (inner === 'p') {
      return getTextObjectParagraphRange(buffer, pos, isAround);
    }

    // Sentence text objects
    if (inner === 's') {
      return getTextObjectSentenceRange(buffer, pos, isAround);
    }

    // Tag block (e.g. <div>...</div>)
    if (inner === 't') {
      return getTextObjectTagRange(buffer, pos, isAround);
    }

    // Matching bracket/quote pairs
    const pairs: Record<string, [string, string]> = {
      '(': ['(', ')'],
      ')': ['(', ')'],
      '[': ['[', ']'],
      ']': ['[', ']'],
      '{': ['{', '}'],
      '}': ['{', '}'],
      '<': ['<', '>'],
      '>': ['<', '>'],
    };
    const quoteChars = new Set(['"', "'", '`']);

    if (pairs[inner]) {
      return getTextObjectBracketRange(buffer, pos, pairs[inner][0], pairs[inner][1], isAround);
    }
    if (quoteChars.has(inner)) {
      return getTextObjectQuoteRange(buffer, pos, inner, isAround);
    }

    // Fall through to standard word-based iw/aw
  }

  // Fallback: standard word-based iw/aw (original logic)
  if (line.length === 0) {
    return { start: { ...pos }, end: { ...pos } };
  }

  const char = line[pos.character] || '';
  const initialClass = getCharClass(char);

  let startCharIdx = pos.character;
  while (startCharIdx > 0) {
    if (getCharClass(line[startCharIdx - 1]) !== initialClass) break;
    startCharIdx--;
  }
  let endCharIdx = pos.character;
  while (endCharIdx < line.length - 1) {
    if (getCharClass(line[endCharIdx + 1]) !== initialClass) break;
    endCharIdx++;
  }

  const start: Position = { line: pos.line, character: startCharIdx };
  const end: Position = { line: pos.line, character: endCharIdx };

  if (textObj === 'aw' || textObj === 'aW') {
    let nextIdx = end.character + 1;
    let extendedTrailing = false;
    while (nextIdx < line.length && /\s/.test(line[nextIdx])) {
      extendedTrailing = true;
      nextIdx++;
    }
    if (extendedTrailing) {
      end.character = nextIdx - 1;
    } else {
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

/** WORD text object (W): word boundaries = whitespace only. */
function getTextObjectWordRange(
  buffer: VimBuffer,
  pos: Position,
  isAround: boolean,
): { start: Position; end: Position } | null {
  const line = buffer.getLine(pos.line);
  if (line.length === 0) return { start: { ...pos }, end: { ...pos } };
  const isWord = (c: string) => !/\s/.test(c);
  let startIdx = pos.character;
  while (startIdx > 0 && isWord(line[startIdx - 1])) startIdx--;
  let endIdx = pos.character;
  while (endIdx < line.length - 1 && isWord(line[endIdx + 1])) endIdx++;
  if (startIdx === pos.character || endIdx === pos.character) {
    // On whitespace: find next/prev word boundaries
    while (startIdx > 0 && !isWord(line[startIdx - 1])) startIdx--;
    while (endIdx < line.length - 1 && !isWord(line[endIdx + 1])) endIdx++;
  }
  const start: Position = { line: pos.line, character: startIdx };
  const end: Position = { line: pos.line, character: endIdx };
  if (isAround) {
    // Extend to include trailing whitespace
    let nextIdx = end.character + 1;
    while (nextIdx < line.length && /\s/.test(line[nextIdx])) nextIdx++;
    if (nextIdx > end.character + 1) {
      end.character = nextIdx - 1;
    } else {
      let prevIdx = start.character - 1;
      while (prevIdx >= 0 && /\s/.test(line[prevIdx])) prevIdx--;
      if (prevIdx < start.character - 1) start.character = prevIdx + 1;
    }
  }
  return { start, end };
}

/** Paragraph text object: blank-line-separated block. */
function getTextObjectParagraphRange(
  buffer: VimBuffer,
  pos: Position,
  _isAround: boolean,
): { start: Position; end: Position } | null {
  let startLine = pos.line;
  let endLine = pos.line;
  const total = buffer.getLineCount();
  // Expand upward
  while (startLine > 0 && buffer.getLine(startLine - 1).trim() !== '') startLine--;
  if (startLine > 0 && buffer.getLine(startLine - 1).trim() === '') startLine--;
  // Expand downward
  while (endLine < total - 1 && buffer.getLine(endLine + 1).trim() !== '') endLine++;
  if (endLine < total - 1 && buffer.getLine(endLine + 1).trim() === '') endLine++;
  const start: Position = { line: startLine, character: 0 };
  const lastLineLen = buffer.getLine(endLine).length;
  const end: Position = { line: endLine, character: Math.max(0, lastLineLen - 1) };
  return { start, end };
}

/** Sentence text object (simple: ends at .!? followed by space or EOL). */
function getTextObjectSentenceRange(
  buffer: VimBuffer,
  pos: Position,
  _isAround: boolean,
): { start: Position; end: Position } | null {
  let startLine = pos.line;
  let startChar = pos.character;
  let endLine = pos.line;
  let endChar = pos.character;
  const total = buffer.getLineCount();
  // Expand backward to start of sentence
  while (startLine > 0 || startChar > 0) {
    if (startChar <= 0) {
      startLine--;
      startChar = buffer.getLine(startLine).length;
    }
    startChar--;
    const c = buffer.getLine(startLine)[startChar];
    if (/[.!?]/.test(c) && startChar < buffer.getLine(startLine).length - 1) {
      startChar += 2; // Skip past the punctuation + space
      break;
    }
  }
  // Expand forward to end of sentence
  while (endLine < total) {
    const line = buffer.getLine(endLine);
    if (endChar >= line.length) {
      endLine++;
      endChar = 0;
      if (endLine >= total) break;
    }
    const c = buffer.getLine(endLine)[endChar];
    if (/[.!?]/.test(c)) {
      endChar++; // Include the punctuation
      break;
    }
    endChar++;
  }
  return {
    start: { line: Math.max(0, startLine), character: Math.max(0, startChar) },
    end: { line: Math.min(total - 1, endLine), character: endChar },
  };
}

/** Tag block text object: find matching XML/HTML tags. */
function getTextObjectTagRange(
  buffer: VimBuffer,
  pos: Position,
  isAround: boolean,
): { start: Position; end: Position } | null {
  // Simple implementation: find matching <tag>...</tag> on the same indentation level
  const line = buffer.getLine(pos.line);
  const tagMatch = line.match(/<(\w+)[^>]*>/);
  if (!tagMatch) return null;
  const tagName = tagMatch[1];
  const startIdx = tagMatch.index!;
  const closeTag = `</${tagName}>`;
  for (let l = pos.line; l < buffer.getLineCount(); l++) {
    const lText = buffer.getLine(l);
    const closeIdx = lText.indexOf(closeTag);
    if (closeIdx !== -1) {
      const endIdx = closeIdx + closeTag.length - 1;
      if (isAround) {
        return {
          start: { line: pos.line, character: startIdx },
          end: { line: l, character: endIdx },
        };
      }
      return {
        start: { line: pos.line, character: startIdx + tagMatch[0].length },
        end: { line: l, character: closeIdx - 1 },
      };
    }
  }
  return null;
}

/** Bracket pair text object: find matching brackets, handling nesting. */
function getTextObjectBracketRange(
  buffer: VimBuffer,
  pos: Position,
  openChar: string,
  closeChar: string,
  isAround: boolean,
): { start: Position; end: Position } | null {
  const line = buffer.getLine(pos.line);
  // Find the bracket at or nearest to cursor
  let bracketIdx = -1;
  for (let i = pos.character; i >= 0; i--) {
    if (line[i] === openChar || line[i] === closeChar) {
      bracketIdx = i;
      break;
    }
  }
  if (bracketIdx === -1) {
    for (let i = pos.character; i < line.length; i++) {
      if (line[i] === openChar || line[i] === closeChar) {
        bracketIdx = i;
        break;
      }
    }
  }
  if (bracketIdx === -1) return null;

  const isOpen = line[bracketIdx] === openChar;
  let depth = 0;
  let startPos: Position = { line: pos.line, character: 0 };
  let endPos: Position = { line: pos.line, character: 0 };
  let found = false;

  if (isOpen) {
    // Forward to close
    depth = 1;
    startPos = { line: pos.line, character: bracketIdx };
    for (let l = pos.line; l < buffer.getLineCount(); l++) {
      const lText = buffer.getLine(l);
      const startC = l === pos.line ? bracketIdx + 1 : 0;
      for (let c = startC; c < lText.length; c++) {
        if (lText[c] === openChar) depth++;
        else if (lText[c] === closeChar) {
          depth--;
          if (depth === 0) {
            endPos = { line: l, character: c };
            found = true;
            break;
          }
        }
      }
      if (found) break;
    }
  } else {
    // Backward to open
    depth = 1;
    endPos = { line: pos.line, character: bracketIdx };
    for (let l = pos.line; l >= 0; l--) {
      const lText = buffer.getLine(l);
      const startC = l === pos.line ? bracketIdx - 1 : lText.length - 1;
      for (let c = startC; c >= 0; c--) {
        if (lText[c] === closeChar) depth++;
        else if (lText[c] === openChar) {
          depth--;
          if (depth === 0) {
            startPos = { line: l, character: c };
            found = true;
            break;
          }
        }
      }
      if (found) break;
    }
  }

  if (!found) return null;

  if (isAround) {
    return { start: startPos, end: endPos };
  }
  // Inner: exclude the brackets themselves
  return {
    start: { line: startPos.line, character: startPos.character + 1 },
    end: { line: endPos.line, character: endPos.character - 1 },
  };
}

/** Quote text object: find matching quotes on the same line. */
function getTextObjectQuoteRange(
  buffer: VimBuffer,
  pos: Position,
  quote: string,
  isAround: boolean,
): { start: Position; end: Position } | null {
  const line = buffer.getLine(pos.line);
  // Find the closest quote at or after cursor
  let leftIdx = -1;
  let rightIdx = -1;
  for (let i = pos.character - 1; i >= 0; i--) {
    if (line[i] === quote) {
      leftIdx = i;
      break;
    }
  }
  for (let i = pos.character; i < line.length; i++) {
    if (line[i] === quote) {
      if (leftIdx !== -1 && rightIdx === -1) {
        rightIdx = i;
        break;
      }
      leftIdx = i;
    }
  }
  if (leftIdx === -1 || rightIdx === -1 || leftIdx === rightIdx) return null;

  if (isAround) {
    return {
      start: { line: pos.line, character: leftIdx },
      end: { line: pos.line, character: rightIdx },
    };
  }
  return {
    start: { line: pos.line, character: leftIdx + 1 },
    end: { line: pos.line, character: rightIdx - 1 },
  };
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
