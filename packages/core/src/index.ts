/**
 * @vemjs/core - Pure Vim State Machine Engine
 */

export type EditorMode = 'NORMAL' | 'INSERT' | 'VISUAL' | 'COMMAND';

export interface Position {
  line: number;
  character: number;
}

export { VimBuffer, UndoManager } from './buffer';
export {
  getCharClass,
  nextPosition,
  prevPosition,
  getWordForward,
  getWordBackward,
  getWordEndForward,
  getTextObjectRange,
} from './motions';
export { parseKeys } from './parser';
export type { ParsedCommand } from './parser';
export { VemEditorState } from './editor';
export type {
  RegisterContent,
  VisualType,
  VisualSelection,
  Diagnostic,
  DiagnosticSeverity,
} from './editor';
export { ConfigLoader, type VemConfig } from './ConfigLoader';
