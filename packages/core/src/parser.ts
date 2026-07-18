import type { EditorMode } from './index';

export interface ParsedCommand {
  count: number;
  operator?: 'd' | 'c' | 'y';
  motion?: string;
  textObject?: string;
  command?: string;
  /** The target character for f/F/t/T motions or the r{char} command. */
  findChar?: string;
  /** Set mark letter ({a-zA-Z}). */
  mark?: string;
  isComplete: boolean;
  isValid: boolean;
}

// One shared motion vocabulary: word/WORD, line bounds, file bounds, bracket
// match. Everything here is valid bare, after an operator, and in Visual mode.
const motionKeys = [
  'h',
  'j',
  'k',
  'l',
  'w',
  'b',
  'e',
  'ge',
  'W',
  'B',
  'E',
  '0',
  '^',
  '$',
  'G',
  '%',
];

// f/F/t/T take a trailing target character, so — unlike the rest of
// motionKeys — they're only "complete" once a second key arrives.
const charMotionKeys = ['f', 'F', 't', 'T'];

/** `f`/`F`/`t`/`T` awaiting or holding their target char, e.g. "f" or "fx". */
function matchCharMotion(str: string): { motion: string; findChar?: string } | null {
  if (charMotionKeys.includes(str)) return { motion: str };
  if (str.length === 2 && charMotionKeys.includes(str[0])) {
    return { motion: str[0], findChar: str[1] };
  }
  return null;
}

// Two-key prefixes that wait for a second key (like 'g', 'z', 'Z', '[', ']')
const prefixKeys = ['g', 'z', 'Z', '[', ']', '<C-w>'];

// Commands that standalone (single key or already-known pair)
const normalCommands = [
  'i',
  'I',
  'a',
  'A',
  'o',
  'O',
  'v',
  'V',
  '<C-v>',
  'u',
  '<C-r>',
  'x',
  'X',
  'D',
  'C',
  'Y',
  's',
  'S',
  'p',
  'P',
  ':',
  '/',
  'n',
  'N',
  '*',
  '#',
  'J',
  '~',
  'H',
  'M',
  'L',
  '{',
  '}',
  '<C-d>',
  '<C-u>',
  '<C-f>',
  '<C-b>',
  '<C-e>',
  '<C-y>',
  '<C-a>',
  '<C-x>',
  '<C-o>',
  '<C-i>',
  '<C-g>',
  '<C-^>',
  'Escape',
];

// Keys that, in NORMAL mode, begin a motion prefix or command pair
const gPrefixCommands: Record<string, string> = {
  g: 'gg', // go to top
  f: 'gf', // go to file under cursor
  v: 'gv', // reselect visual selection
  i: 'gi', // go to last insert position
  ';': 'g;', // go to previous change
  ',': 'g,', // go to next change
  u: 'gu', // make lowercase
  U: 'gU', // make uppercase
  q: 'gq', // format text
  J: 'gJ', // join without space
  a: 'ga', // show char code
  '8': 'g8', // show UTF-8 bytes
};

const zPrefixCommands: Record<string, string> = {
  z: 'zz', // center cursor in window
  t: 'zt', // scroll cursor to top of window
  b: 'zb', // scroll cursor to bottom of window
};

const ZPrefixCommands: Record<string, string> = {
  Z: 'ZZ', // write and quit
  Q: 'ZQ', // quit without saving
};

// Keyed by [first char][second char] pair, resolved separately below since
// both `[` and `]` are valid firsts AND seconds (unlike g/z/Z, which only
// ever repeat or combine with a small fixed alphabet).
const bracketPrefixCommands: Record<string, string> = {
  '[[': '[[', // section backward
  '[]': '[]', // section backward to end
  ']]': ']]', // section forward
  '][': '][', // section forward to end
};

export function parseKeys(keys: string[], mode: EditorMode = 'NORMAL'): ParsedCommand {
  const result: ParsedCommand = {
    count: 1,
    isComplete: false,
    isValid: true,
  };

  if (keys.length === 0) {
    return result;
  }

  let idx = 0;

  // 1. Parse first count
  let count1Str = '';
  while (idx < keys.length && /^\d$/.test(keys[idx])) {
    if (keys[idx] === '0' && count1Str === '') {
      break;
    }
    count1Str += keys[idx];
    idx++;
  }
  const count1 = count1Str ? parseInt(count1Str, 10) : 1;

  if (idx >= keys.length) {
    result.count = count1;
    result.isComplete = false;
    result.isValid = true;
    return result;
  }

  const remaining = keys.slice(idx);
  const remStr = remaining.join('');

  if (mode === 'VISUAL') {
    // In Visual mode, d, c, y, x are immediate commands
    const visualCommands = ['d', 'c', 'y', 'x', 'Escape', 'v', 'V', '<C-v>', 'gu', 'gU'];
    if (visualCommands.includes(remStr)) {
      result.count = count1;
      result.command = remStr;
      result.isComplete = true;
      result.isValid = true;
      return result;
    }

    // Prefixes in Visual mode
    if (prefixKeys.includes(remStr)) {
      result.isComplete = false;
      result.isValid = true;
      return result;
    }
    if (remStr === 'gg') {
      result.count = count1;
      result.motion = 'gg';
      result.isComplete = true;
      result.isValid = true;
      return result;
    }
    // gv, gi, gu, gU, etc. in Visual mode — keyed by the second character,
    // same fix as the NORMAL-mode g-prefix lookup below.
    if (remStr.length === 2 && remStr[0] === 'g' && gPrefixCommands[remStr[1]]) {
      result.count = count1;
      result.command = gPrefixCommands[remStr[1]];
      result.isComplete = true;
      result.isValid = true;
      return result;
    }

    const singleKeyMotions = motionKeys;
    if (singleKeyMotions.includes(remStr)) {
      result.count = count1;
      result.motion = remStr;
      result.isComplete = true;
      result.isValid = true;
      return result;
    }

    const visualCharMotion = matchCharMotion(remStr);
    if (visualCharMotion) {
      result.count = count1;
      result.motion = visualCharMotion.motion;
      result.findChar = visualCharMotion.findChar;
      result.isComplete = !!visualCharMotion.findChar;
      result.isValid = true;
      return result;
    }

    if (normalCommands.includes(remStr)) {
      result.count = count1;
      result.command = remStr;
      result.isComplete = true;
      result.isValid = true;
      return result;
    }

    result.isValid = false;
    result.isComplete = true;
    return result;
  }

  // NORMAL mode parsing
  // 2. Parse operator (d, c, y)
  let op: 'd' | 'c' | 'y' | undefined;
  const firstNonDigit = keys[idx];
  if (firstNonDigit === 'd' || firstNonDigit === 'c' || firstNonDigit === 'y') {
    op = firstNonDigit;
    idx++;
  }

  if (op) {
    // We have an operator
    // 3. Parse optional second count
    let count2Str = '';
    while (idx < keys.length && /^\d$/.test(keys[idx])) {
      if (keys[idx] === '0' && count2Str === '') {
        break;
      }
      count2Str += keys[idx];
      idx++;
    }
    const count2 = count2Str ? parseInt(count2Str, 10) : 1;
    result.count = count1 * count2;
    result.operator = op;

    if (idx >= keys.length) {
      result.isComplete = false;
      result.isValid = true;
      return result;
    }

    const remainingOp = keys.slice(idx);
    const remOpStr = remainingOp.join('');

    // Double operator check (dd, cc, yy)
    if (remOpStr === op) {
      result.command = op + op;
      result.isComplete = true;
      result.isValid = true;
      return result;
    }

    // Text objects: iw, aw, iW, aW, ip, ap, is, as, it, at,
    //              i(, a(, i), a), i[, a[, i], a], i{, a{, i}, a}, i<, a<, i>, a>,
    //              i", a", i', a', i`, a`
    if (remOpStr === 'i' || remOpStr === 'a') {
      result.isComplete = false;
      result.isValid = true;
      return result;
    }
    const knownTextObjects = new Set([
      'iw',
      'aw',
      'iW',
      'aW',
      'ip',
      'ap',
      'is',
      'as',
      'it',
      'at',
      'i(',
      'a(',
      'i)',
      'a)',
      'i[',
      'a[',
      'i]',
      'a]',
      'i{',
      'a{',
      'i}',
      'a}',
      'i<',
      'a<',
      'i>',
      'a>',
      'i"',
      'a"',
      "i'",
      "a'",
      'i`',
      'a`',
    ]);
    if (knownTextObjects.has(remOpStr)) {
      result.textObject = remOpStr;
      result.isComplete = true;
      result.isValid = true;
      return result;
    }

    // Prefixes after operator
    if (prefixKeys.includes(remOpStr)) {
      result.isComplete = false;
      result.isValid = true;
      return result;
    }

    // g-resolved motions after operator (only when preceded by g) — keyed
    // by the second character, same fix as the other g-prefix lookups.
    // 'gg' excluded: dgg must use the dedicated motion check below, not
    // this command lookup (gPrefixCommands.g happens to equal 'gg').
    if (
      remOpStr.length === 2 &&
      remOpStr[0] === 'g' &&
      remOpStr !== 'gg' &&
      gPrefixCommands[remOpStr[1]]
    ) {
      result.command = gPrefixCommands[remOpStr[1]];
      result.isComplete = true;
      result.isValid = true;
      return result;
    }

    if (remOpStr === 'gg') {
      result.motion = 'gg';
      result.isComplete = true;
      result.isValid = true;
      return result;
    }

    const singleKeyMotions = motionKeys;
    if (singleKeyMotions.includes(remOpStr)) {
      result.motion = remOpStr;
      result.isComplete = true;
      result.isValid = true;
      return result;
    }

    const opCharMotion = matchCharMotion(remOpStr);
    if (opCharMotion) {
      result.motion = opCharMotion.motion;
      result.findChar = opCharMotion.findChar;
      result.isComplete = !!opCharMotion.findChar;
      result.isValid = true;
      return result;
    }

    result.isValid = false;
    result.isComplete = true;
    return result;
  } else {
    // No operator
    result.count = count1;
    const remainingNormal = keys.slice(idx);
    const remNormalStr = remainingNormal.join('');

    // Prefixes (g, z, Z, [, ]) — await second key
    if (prefixKeys.includes(remNormalStr)) {
      result.isComplete = false;
      result.isValid = true;
      return result;
    }

    // <C-w> prefix (handled separately because remNormalStr = '<C-w>h')
    if (remNormalStr === '<C-w>') {
      result.isComplete = false;
      result.isValid = true;
      return result;
    }
    if (remNormalStr.startsWith('<C-w>') && remNormalStr.length > '<C-w>'.length) {
      result.command = 'C-w-' + remNormalStr.substring('<C-w>'.length);
      result.isComplete = true;
      result.isValid = true;
      return result;
    }

    // g-prefix resolved commands (only when preceded by g). The lookup
    // tables are keyed by the SECOND character only (e.g. gPrefixCommands.u
    // === 'gu'), not by the full two-char sequence — remNormalStr.slice(1)
    // is the correct key. (Previously indexed by the full 'gu'/'zz'/'ZZ'/
    // '[[' string, which is never a key in any of these tables — silently
    // always undefined, so every g/z/Z/bracket command except the
    // separately hardcoded 'gg' was unreachable and fell through to
    // isValid: false.)
    // 'gg' is excluded: it's a motion (result.motion, handled by
    // moveCursorByMotion), not a standalone command, despite
    // gPrefixCommands.g happening to equal the string 'gg' — the dedicated
    // `remNormalStr === 'gg'` motion check further below must win for it.
    if (
      remNormalStr.length === 2 &&
      remNormalStr[0] === 'g' &&
      remNormalStr !== 'gg' &&
      gPrefixCommands[remNormalStr[1]]
    ) {
      result.command = gPrefixCommands[remNormalStr[1]];
      result.isComplete = true;
      result.isValid = true;
      return result;
    }

    // z-prefix resolved commands (only when preceded by z)
    if (remNormalStr.length === 2 && remNormalStr[0] === 'z' && zPrefixCommands[remNormalStr[1]]) {
      result.command = zPrefixCommands[remNormalStr[1]];
      result.isComplete = true;
      result.isValid = true;
      return result;
    }

    // Z-prefix resolved commands (only when preceded by Z)
    if (remNormalStr.length === 2 && remNormalStr[0] === 'Z' && ZPrefixCommands[remNormalStr[1]]) {
      result.command = ZPrefixCommands[remNormalStr[1]];
      result.isComplete = true;
      result.isValid = true;
      return result;
    }

    // bracket-prefix resolved commands (only when preceded by [ or ]) —
    // this table is keyed by the full two-char sequence, unlike g/z/Z above,
    // since both characters vary (`[[`, `[]`, `]]`, `][`).
    if (
      remNormalStr.length === 2 &&
      (remNormalStr[0] === '[' || remNormalStr[0] === ']') &&
      bracketPrefixCommands[remNormalStr]
    ) {
      result.command = bracketPrefixCommands[remNormalStr];
      result.isComplete = true;
      result.isValid = true;
      return result;
    }

    if (remNormalStr === 'gg') {
      result.motion = 'gg';
      result.isComplete = true;
      result.isValid = true;
      return result;
    }

    // m{a-zA-Z}: set mark
    if (remNormalStr.length === 2 && remNormalStr[0] === 'm') {
      const markLetter = remNormalStr[1];
      if (/^[a-zA-Z]$/.test(markLetter)) {
        result.command = 'm';
        result.mark = markLetter;
        result.isComplete = true;
        result.isValid = true;
        return result;
      }
    }

    // `{a-zA-Z}: jump to mark column-wise
    if (remNormalStr.length === 2 && (remNormalStr[0] === '`' || remNormalStr[0] === "'")) {
      const markLetter = remNormalStr[1];
      if (/^[a-zA-Z]$/.test(markLetter)) {
        result.command = remNormalStr[0] === '`' ? '`' : "'";
        result.mark = markLetter;
        result.isComplete = true;
        result.isValid = true;
        return result;
      }
    }

    const singleKeyMotions = motionKeys;
    if (singleKeyMotions.includes(remNormalStr)) {
      result.motion = remNormalStr;
      result.isComplete = true;
      result.isValid = true;
      return result;
    }

    const normalCharMotion = matchCharMotion(remNormalStr);
    if (normalCharMotion) {
      result.motion = normalCharMotion.motion;
      result.findChar = normalCharMotion.findChar;
      result.isComplete = !!normalCharMotion.findChar;
      result.isValid = true;
      return result;
    }

    // r{char}: replace the char(s) under the cursor — awaits its target too.
    if (remNormalStr === 'r') {
      result.isComplete = false;
      result.isValid = true;
      return result;
    }
    if (remNormalStr.length === 2 && remNormalStr[0] === 'r') {
      result.command = 'r';
      result.findChar = remNormalStr[1];
      result.isComplete = true;
      result.isValid = true;
      return result;
    }

    if (normalCommands.includes(remNormalStr)) {
      result.command = remNormalStr;
      result.isComplete = true;
      result.isValid = true;
      return result;
    }

    result.isValid = false;
    result.isComplete = true;
    return result;
  }
}
