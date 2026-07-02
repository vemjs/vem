import type { EditorMode } from './index';

export interface ParsedCommand {
  count: number;
  operator?: 'd' | 'c' | 'y';
  motion?: string;
  textObject?: string;
  command?: string;
  isComplete: boolean;
  isValid: boolean;
}

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
    const visualCommands = ['d', 'c', 'y', 'x', 'Escape', 'v', 'V', '<C-v>'];
    if (visualCommands.includes(remStr)) {
      result.count = count1;
      result.command = remStr;
      result.isComplete = true;
      result.isValid = true;
      return result;
    }

    // Motions in Visual mode
    if (remStr === 'g') {
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

    const singleKeyMotions = ['h', 'j', 'k', 'l', 'w', 'b', 'e', '0', '$', 'G'];
    if (singleKeyMotions.includes(remStr)) {
      result.count = count1;
      result.motion = remStr;
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
      result.command = op + op; // e.g. "dd"
      result.isComplete = true;
      result.isValid = true;
      return result;
    }

    // Text objects: iw, aw
    if (remOpStr === 'i' || remOpStr === 'a') {
      result.isComplete = false;
      result.isValid = true;
      return result;
    }
    if (remOpStr === 'iw' || remOpStr === 'aw') {
      result.textObject = remOpStr;
      result.isComplete = true;
      result.isValid = true;
      return result;
    }

    // Motions: h, j, k, l, w, b, e, 0, $, G, gg
    if (remOpStr === 'g') {
      result.isComplete = false;
      result.isValid = true;
      return result;
    }
    if (remOpStr === 'gg') {
      result.motion = 'gg';
      result.isComplete = true;
      result.isValid = true;
      return result;
    }

    const singleKeyMotions = ['h', 'j', 'k', 'l', 'w', 'b', 'e', '0', '$', 'G'];
    if (singleKeyMotions.includes(remOpStr)) {
      result.motion = remOpStr;
      result.isComplete = true;
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

    if (remNormalStr === 'g') {
      result.isComplete = false;
      result.isValid = true;
      return result;
    }
    if (remNormalStr === 'gg') {
      result.motion = 'gg';
      result.isComplete = true;
      result.isValid = true;
      return result;
    }

    const singleKeyMotions = ['h', 'j', 'k', 'l', 'w', 'b', 'e', '0', '$', 'G'];
    if (singleKeyMotions.includes(remNormalStr)) {
      result.motion = remNormalStr;
      result.isComplete = true;
      result.isValid = true;
      return result;
    }

    const commands = [
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
      'p',
      'P',
      ':',
      'Escape',
    ];
    if (commands.includes(remNormalStr)) {
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
