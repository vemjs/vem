import { describe, expect, it } from 'bun:test';
import { VimBuffer, UndoManager } from './buffer';

describe('VimBuffer', () => {
  it('should initialize with empty line or given text', () => {
    const buf1 = new VimBuffer();
    expect(buf1.getLines()).toEqual(['']);

    const buf2 = new VimBuffer('hello\nworld');
    expect(buf2.getLines()).toEqual(['hello', 'world']);
  });

  it('should support line insertion, set, and delete', () => {
    const buf = new VimBuffer('line1\nline2');
    buf.insertLine(1, 'inserted');
    expect(buf.getLines()).toEqual(['line1', 'inserted', 'line2']);

    buf.setLine(2, 'modified');
    expect(buf.getLines()).toEqual(['line1', 'inserted', 'modified']);

    const deleted = buf.deleteLines(1, 1);
    expect(deleted).toEqual(['inserted']);
    expect(buf.getLines()).toEqual(['line1', 'modified']);
  });

  it('should support text insertion at a position', () => {
    const buf = new VimBuffer('hello world');
    const endPos = buf.insertText({ line: 0, character: 6 }, 'beautiful ');
    expect(buf.getText()).toBe('hello beautiful world');
    expect(endPos).toEqual({ line: 0, character: 16 });

    const buf2 = new VimBuffer('line1\nline2');
    const endPos2 = buf2.insertText({ line: 0, character: 5 }, '\nmiddle\nline');
    expect(buf2.getText()).toBe('line1\nmiddle\nline\nline2');
    expect(endPos2).toEqual({ line: 2, character: 4 });
  });

  it('should support deleting ranges of text', () => {
    const buf = new VimBuffer('hello beautiful world');
    buf.deleteRange({ line: 0, character: 5 }, { line: 0, character: 15 });
    expect(buf.getText()).toBe('hello world');

    const buf2 = new VimBuffer('line1\nmiddle\nline\nline2');
    // Delete from middle of line1 to middle of line
    buf2.deleteRange({ line: 0, character: 4 }, { line: 2, character: 4 });
    expect(buf2.getText()).toBe('line\nline2');
  });
});

describe('UndoManager', () => {
  it('should handle push, undo, and redo correctly', () => {
    const history = new UndoManager();
    let current = ['hello'];

    history.push(current);
    current = ['hello', 'world'];

    const undone = history.undo(current);
    expect(undone?.lines).toEqual(['hello']);

    const redone = history.redo(undone!.lines);
    expect(redone?.lines).toEqual(['hello', 'world']);
  });

  it('reports Vim-style seq numbers and a change count on undo/redo', () => {
    const history = new UndoManager();
    history.push(['a']);
    const undone = history.undo(['a', 'b']);
    expect(undone?.seq).toBe(0);
    expect(undone?.changes).toBe(1);
    expect(typeof undone?.timestamp).toBe('number');

    const redone = history.redo(undone!.lines);
    expect(redone?.seq).toBe(1);
    expect(redone?.changes).toBe(1);
  });

  it('returns null when there is nothing left to undo/redo', () => {
    const history = new UndoManager();
    expect(history.undo(['x'])).toBeNull();
    expect(history.redo(['x'])).toBeNull();
  });
});
