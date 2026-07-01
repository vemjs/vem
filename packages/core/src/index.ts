/**
 * @vemjs/core - Pure Vim State Machine Engine
 */

export type EditorMode = 'NORMAL' | 'INSERT' | 'VISUAL' | 'COMMAND';

export interface Position {
  line: number;
  character: number;
}

export class VemEditorState {
  private mode: EditorMode = 'NORMAL';
  private cursor: Position = { line: 0, character: 0 };

  constructor() {
    console.log('VemEditorState initialized in core.');
  }

  public getMode(): EditorMode {
    return this.mode;
  }

  public setMode(mode: EditorMode): void {
    this.mode = mode;
  }

  public getCursor(): Position {
    return this.cursor;
  }

  public moveCursor(lineOffset: number, charOffset: number): void {
    this.cursor.line = Math.max(0, this.cursor.line + lineOffset);
    this.cursor.character = Math.max(0, this.cursor.character + charOffset);
  }
}
