import { describe, expect, it } from 'bun:test';
import { VemEditorState } from './editor';

describe('VemEditorState', () => {
  it('should start in NORMAL mode with default cursor', () => {
    const editor = new VemEditorState('line1\nline2');
    expect(editor.getMode()).toBe('NORMAL');
    expect(editor.getCursor()).toEqual({ line: 0, character: 0 });
    expect(editor.getBuffer().getText()).toBe('line1\nline2');
  });

  it('should transition to INSERT mode and accept character insertions', () => {
    const editor = new VemEditorState('hello');
    editor.handleKey('i');
    expect(editor.getMode()).toBe('INSERT');

    editor.handleKey(' ');
    editor.handleKey('w');
    editor.handleKey('o');
    editor.handleKey('r');
    editor.handleKey('l');
    editor.handleKey('d');

    expect(editor.getBuffer().getText()).toBe(' worldhello');
    expect(editor.getCursor()).toEqual({ line: 0, character: 6 });

    // Exit insert mode
    editor.handleKey('Escape');
    expect(editor.getMode()).toBe('NORMAL');
    // Cursor moves back one in Normal mode
    expect(editor.getCursor()).toEqual({ line: 0, character: 5 });
  });

  it('should support Backspace and Enter in INSERT mode', () => {
    const editor = new VemEditorState('hello');
    editor.handleKey('i');
    editor.handleKey('Backspace'); // At character 0, should do nothing as line 0 has no preceding line
    expect(editor.getBuffer().getText()).toBe('hello');

    editor.handleKey('l'); // character 1
    editor.handleKey('Enter'); // should split line
    expect(editor.getBuffer().getText()).toBe('l\nhello');
    expect(editor.getCursor()).toEqual({ line: 1, character: 0 });

    editor.handleKey('Backspace'); // should merge lines back
    expect(editor.getBuffer().getText()).toBe('lhello');
    expect(editor.getCursor()).toEqual({ line: 0, character: 1 });
  });

  it('should handle simple motions in NORMAL mode', () => {
    const editor = new VemEditorState('hello beautiful world');
    // move right 6 times to reach 'b'
    for (let i = 0; i < 6; i++) {
      editor.handleKey('l');
    }
    expect(editor.getCursor()).toEqual({ line: 0, character: 6 });

    // move left 2 times
    editor.handleKey('h');
    editor.handleKey('h');
    expect(editor.getCursor()).toEqual({ line: 0, character: 4 });

    // Move to end of line
    editor.handleKey('$');
    expect(editor.getCursor()).toEqual({ line: 0, character: 20 });
  });

  it('should support dw, x, and delete operators', () => {
    const editor = new VemEditorState('hello beautiful world');
    // dw at start of line should delete 'hello '
    editor.handleKey('d');
    editor.handleKey('w');
    expect(editor.getBuffer().getText()).toBe('beautiful world');
    expect(editor.getCursor()).toEqual({ line: 0, character: 0 });

    // x should delete 'b'
    editor.handleKey('x');
    expect(editor.getBuffer().getText()).toBe('eautiful world');

    // diw should delete word 'eautiful'
    editor.handleKey('d');
    editor.handleKey('i');
    editor.handleKey('w');
    expect(editor.getBuffer().getText()).toBe(' world');
  });

  it('should support undo and redo', () => {
    const editor = new VemEditorState('hello');
    editor.handleKey('i');
    editor.handleKey('!');
    editor.handleKey('Escape');
    expect(editor.getBuffer().getText()).toBe('!hello');

    editor.handleKey('u');
    expect(editor.getBuffer().getText()).toBe('hello');

    editor.handleKey('<C-r>');
    expect(editor.getBuffer().getText()).toBe('!hello');
  });

  it('should support VISUAL mode selection and operations', () => {
    const editor = new VemEditorState('hello world');
    editor.handleKey('v');
    expect(editor.getMode()).toBe('VISUAL');

    // Move cursor right 4 times to select 'hello'
    for (let i = 0; i < 4; i++) {
      editor.handleKey('l');
    }

    const selection = editor.getVisualSelection();
    expect(selection).not.toBeNull();
    expect(selection!.anchor).toEqual({ line: 0, character: 0 });
    expect(selection!.active).toEqual({ line: 0, character: 4 });

    // Yank selection
    editor.handleKey('y');
    expect(editor.getMode()).toBe('NORMAL');
    expect(editor.getRegister()).toEqual({
      text: 'hello',
      type: 'char',
    });

    // Move cursor to end, and paste
    editor.handleKey('$');
    editor.handleKey('p');
    expect(editor.getBuffer().getText()).toBe('hello worldhello');
  });

  describe('COMMAND mode', () => {
    it('should transition to COMMAND mode and buffer input keys', () => {
      const editor = new VemEditorState('test');
      editor.handleKey(':');
      expect(editor.getMode()).toBe('COMMAND');
      expect(editor.getCommandText()).toBe('');

      editor.handleKey('w');
      editor.handleKey('q');
      expect(editor.getCommandText()).toBe('wq');

      editor.handleKey('Backspace');
      expect(editor.getCommandText()).toBe('w');

      editor.handleKey('Escape');
      expect(editor.getMode()).toBe('NORMAL');
      expect(editor.getCommandText()).toBe('');
    });

    it('should expose a command text setter for renderer-backed inputs', () => {
      const editor = new VemEditorState('test');
      let changes = 0;
      editor.onChange(() => {
        changes++;
      });

      editor.handleKey(':');
      editor.setCommandText('vsp');

      expect(editor.getCommandText()).toBe('vsp');
      expect(changes).toBe(3);
    });

    it('should trigger events on Enter', () => {
      const editor = new VemEditorState('test');

      let saved = false;
      editor.onSave(() => {
        saved = true;
      });

      let splitDir: string | null = null;
      editor.onSplit((dir) => {
        splitDir = dir;
      });

      // Test :w
      editor.handleKey(':');
      editor.handleKey('w');
      editor.handleKey('Enter');
      expect(editor.getMode()).toBe('NORMAL');
      expect(saved).toBe(true);

      // Test :vsp
      editor.handleKey(':');
      editor.handleKey('v');
      editor.handleKey('s');
      editor.handleKey('p');
      editor.handleKey('Enter');
      expect(editor.getMode()).toBe('NORMAL');
      expect(splitDir).toBe('vertical');
    });
  });
});
