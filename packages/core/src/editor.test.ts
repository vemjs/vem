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

describe('ex-command extensions', () => {
  it('dispatches registered ex commands with their argument', () => {
    const editor = new VemEditorState('test');
    const calls: string[] = [];
    editor.registerExCommand('docs', (arg) => calls.push(`docs:${arg}`));

    editor.handleKey(':');
    editor.setCommandText('docs plugins');
    editor.handleKey('Enter');

    expect(calls).toEqual(['docs:plugins']);
    expect(editor.getMode()).toBe('NORMAL');
  });

  it('reports unknown commands via statusMessage and clears it on the next key', () => {
    const editor = new VemEditorState('test');
    editor.handleKey(':');
    editor.setCommandText('nosuchcmd');
    editor.handleKey('Enter');

    expect(editor.statusMessage).toBe('E492: Not an editor command: nosuchcmd');

    editor.handleKey('j');
    expect(editor.statusMessage).toBe('');
  });

  it('toggles relative line numbers via :set rnu / :set nornu', () => {
    const editor = new VemEditorState('test');
    expect(editor.layoutConfig.lineNumbers).toBe('absolute');

    editor.handleKey(':');
    editor.setCommandText('set rnu');
    editor.handleKey('Enter');
    expect(editor.layoutConfig.lineNumbers).toBe('relative');

    editor.handleKey(':');
    editor.setCommandText('set norelativenumber');
    editor.handleKey('Enter');
    expect(editor.layoutConfig.lineNumbers).toBe('absolute');
  });
});

describe('global ex commands', () => {
  it('are visible from every state, including ones created later', () => {
    const calls: string[] = [];
    VemEditorState.registerGlobalExCommand('helptest', (arg, state) =>
      calls.push(`${arg}|${state.getBuffer().getLine(0)}`),
    );

    const a = new VemEditorState('first');
    const b = new VemEditorState('second');
    for (const ed of [a, b]) {
      ed.handleKey(':');
      ed.setCommandText('helptest topic');
      ed.handleKey('Enter');
    }

    expect(calls).toEqual(['topic|first', 'topic|second']);
    expect(a.statusMessage).toBe('');
  });
});

describe('command mode editing', () => {
  it('leaves COMMAND mode when backspacing over the empty : prompt', () => {
    const editor = new VemEditorState('x');
    editor.handleKey(':');
    expect(editor.getMode()).toBe('COMMAND');
    editor.handleKey('Backspace');
    expect(editor.getMode()).toBe('NORMAL');
  });

  it('deletes command characters before exiting on the final backspace', () => {
    const editor = new VemEditorState('x');
    editor.handleKey(':');
    editor.setCommandText('wq');
    editor.handleKey('Backspace');
    expect(editor.getCommandText()).toBe('w');
    expect(editor.getMode()).toBe('COMMAND');
  });

  it('force-quits on :q! and passes force to the quit handler', () => {
    const editor = new VemEditorState('x');
    const forces: boolean[] = [];
    editor.onQuit((force) => forces.push(force));

    editor.handleKey(':');
    editor.setCommandText('q');
    editor.handleKey('Enter');
    editor.handleKey(':');
    editor.setCommandText('q!');
    editor.handleKey('Enter');

    expect(forces).toEqual([false, true]);
  });

  it('saves then quits on :wq and :x', () => {
    const editor = new VemEditorState('x');
    let saves = 0;
    let quits = 0;
    editor.onSave(() => saves++);
    editor.onQuit(() => quits++);

    for (const cmd of ['wq', 'x']) {
      editor.handleKey(':');
      editor.setCommandText(cmd);
      editor.handleKey('Enter');
    }
    expect(saves).toBe(2);
    expect(quits).toBe(2);
  });
});

describe('macro recording and replay', () => {
  it('records q{reg} … q and replays with @{reg}', () => {
    const editor = new VemEditorState('abcdef');
    // Record into register a: delete two chars (x x)
    editor.handleKey('q');
    editor.handleKey('a');
    expect(editor.isRecording()).toBe(true);
    expect(editor.getRecordingRegister()).toBe('a');
    editor.handleKey('x');
    editor.handleKey('x');
    editor.handleKey('q');
    expect(editor.isRecording()).toBe(false);
    expect(editor.getBuffer().getLine(0)).toBe('cdef');

    // Replay deletes two more
    editor.handleKey('@');
    editor.handleKey('a');
    expect(editor.getBuffer().getLine(0)).toBe('ef');

    // @@ repeats the last macro
    editor.setCursor(0, 0);
    editor.getBuffer().setLine(0, 'ghijkl');
    editor.handleKey('@');
    editor.handleKey('@');
    expect(editor.getBuffer().getLine(0)).toBe('ijkl');
  });

  it('does not treat q typed in INSERT mode as a macro control key', () => {
    const editor = new VemEditorState('');
    editor.handleKey('q'); // start recording prompt
    editor.handleKey('a'); // register a
    editor.handleKey('i'); // INSERT
    editor.handleKey('q'); // literal q, recorded
    editor.handleKey('Escape');
    editor.handleKey('q'); // stop recording
    expect(editor.isRecording()).toBe(false);
    expect(editor.getBuffer().getLine(0)).toBe('q');
  });
});
