import type { Position } from './index';

export class VimBuffer {
  private lines: string[] = [''];
  private changeCallbacks: (() => void)[] = [];

  constructor(initialText?: string) {
    if (initialText !== undefined) {
      this.lines = initialText.split(/\r?\n/);
      if (this.lines.length === 0) {
        this.lines = [''];
      }
    }
  }

  public onChange(callback: () => void): void {
    this.changeCallbacks.push(callback);
  }

  private triggerChange(): void {
    for (const cb of this.changeCallbacks) {
      cb();
    }
  }

  public getLines(): string[] {
    return [...this.lines];
  }

  public setLines(lines: string[]): void {
    this.lines = [...lines];
    if (this.lines.length === 0) {
      this.lines = [''];
    }
    this.triggerChange();
  }

  public getLine(lineIdx: number): string {
    if (lineIdx < 0 || lineIdx >= this.lines.length) {
      return '';
    }
    return this.lines[lineIdx];
  }

  public getLineCount(): number {
    return this.lines.length;
  }

  public insertText(pos: Position, text: string): Position {
    const line = this.getLine(pos.line);
    const before = line.substring(0, pos.character);
    const after = line.substring(pos.character);
    const insertedLines = text.split(/\r?\n/);

    if (insertedLines.length === 1) {
      this.lines[pos.line] = before + insertedLines[0] + after;
      this.triggerChange();
      return {
        line: pos.line,
        character: pos.character + insertedLines[0].length,
      };
    } else {
      this.lines[pos.line] = before + insertedLines[0];
      const middleLines = insertedLines.slice(1, insertedLines.length - 1);
      const lastLine = insertedLines[insertedLines.length - 1] + after;

      this.lines.splice(pos.line + 1, 0, ...middleLines, lastLine);
      this.triggerChange();
      return {
        line: pos.line + insertedLines.length - 1,
        character: insertedLines[insertedLines.length - 1].length,
      };
    }
  }

  public deleteRange(start: Position, end: Position): void {
    let s = { ...start };
    let e = { ...end };

    // Ensure start is before end
    if (s.line > e.line || (s.line === e.line && s.character > e.character)) {
      const temp = s;
      s = e;
      e = temp;
    }

    const startLine = this.getLine(s.line);
    const endLine = this.getLine(e.line);

    const before = startLine.substring(0, s.character);
    const after = endLine.substring(e.character);

    this.lines[s.line] = before + after;
    if (e.line > s.line) {
      this.lines.splice(s.line + 1, e.line - s.line);
    }
    if (this.lines.length === 0) {
      this.lines = [''];
    }
    this.triggerChange();
  }

  public deleteLines(startLineIdx: number, endLineIdx: number): string[] {
    const min = Math.max(0, Math.min(startLineIdx, endLineIdx));
    const max = Math.min(this.lines.length - 1, Math.max(startLineIdx, endLineIdx));
    const deleted = this.lines.splice(min, max - min + 1);
    if (this.lines.length === 0) {
      this.lines = [''];
    }
    this.triggerChange();
    return deleted;
  }

  public insertLine(lineIdx: number, text: string): void {
    this.lines.splice(lineIdx, 0, text);
    this.triggerChange();
  }

  public setLine(lineIdx: number, text: string): void {
    if (lineIdx >= 0 && lineIdx < this.lines.length) {
      this.lines[lineIdx] = text;
      this.triggerChange();
    }
  }

  public getText(): string {
    return this.lines.join('\n');
  }
}

export class UndoManager {
  private undoStack: string[][] = [];
  private redoStack: string[][] = [];

  public push(lines: string[]): void {
    this.undoStack.push([...lines]);
    this.redoStack = [];
  }

  public undo(currentLines: string[]): string[] | null {
    if (this.undoStack.length === 0) return null;
    this.redoStack.push([...currentLines]);
    return this.undoStack.pop() || null;
  }

  public redo(currentLines: string[]): string[] | null {
    if (this.redoStack.length === 0) return null;
    this.undoStack.push([...currentLines]);
    return this.redoStack.pop() || null;
  }
}
