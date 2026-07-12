import { afterEach, describe, expect, it } from 'bun:test';
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

  it('toggles line numbers via :set number / rnu / nonumber', () => {
    const editor = new VemEditorState('test');
    // Vim default is nonumber.
    expect(editor.layoutConfig.lineNumbers).toBe('none');

    editor.handleKey(':');
    editor.setCommandText('set number');
    editor.handleKey('Enter');
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

  it('supports the Vim `!` toggle suffix (:set nu!, :set rnu!)', () => {
    const editor = new VemEditorState('test');
    const set = (opt: string) => {
      editor.handleKey(':');
      editor.setCommandText(`set ${opt}`);
      editor.handleKey('Enter');
    };

    expect(editor.layoutConfig.lineNumbers).toBe('none');
    set('number!');
    expect(editor.layoutConfig.lineNumbers).toBe('absolute');
    set('number!');
    expect(editor.layoutConfig.lineNumbers).toBe('none');

    set('rnu!');
    expect(editor.layoutConfig.lineNumbers).toBe('relative');
    set('rnu!');
    expect(editor.layoutConfig.lineNumbers).toBe('absolute');

    set('bogus!');
    expect(editor.statusMessage).toBe('E518: Unknown option: bogus!');
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

  it('accepts :quit and :exit as friendlier aliases for :q (not real Vim commands, but expected)', () => {
    const editor = new VemEditorState('x');
    const forces: boolean[] = [];
    editor.onQuit((force) => forces.push(force));

    for (const cmd of ['quit', 'exit', 'quit!', 'exit!']) {
      editor.handleKey(':');
      editor.setCommandText(cmd);
      editor.handleKey('Enter');
    }

    expect(forces).toEqual([false, false, true, true]);
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

describe('dot-repeat (.)', () => {
  it('repeats a simple mutating command (x)', () => {
    const editor = new VemEditorState('abcdef');
    editor.handleKey('x');
    editor.handleKey('.');
    editor.handleKey('.');
    expect(editor.getBuffer().getLine(0)).toBe('def');
  });

  it('repeats an operator+motion command (dw) from the new cursor position', () => {
    const editor = new VemEditorState('one two three four');
    editor.handleKey('d');
    editor.handleKey('w');
    editor.handleKey('.');
    expect(editor.getBuffer().getLine(0)).toBe('three four');
  });

  it('repeats a whole insert-mode change (i...Escape)', () => {
    const editor = new VemEditorState('hello');
    editor.handleKey('i');
    editor.handleKey('X');
    editor.handleKey('Escape');
    expect(editor.getBuffer().getLine(0)).toBe('Xhello');

    editor.handleKey('l');
    editor.handleKey('.');
    expect(editor.getBuffer().getLine(0)).toBe('XXhello');
  });

  it('does not repeat pure motions (dot stays empty until a real change happens)', () => {
    const editor = new VemEditorState('l1\nl2\nl3');
    editor.handleKey('j');
    editor.handleKey('.');
    expect(editor.getBuffer().getText()).toBe('l1\nl2\nl3');
  });

  it('yanking does not count as a repeatable change, but a later paste does', () => {
    const editor = new VemEditorState('a\nb\nc');
    editor.handleKey('y');
    editor.handleKey('y');
    editor.handleKey('j');
    editor.handleKey('p');
    expect(editor.getBuffer().getText()).toBe('a\nb\na\nc');

    editor.handleKey('.');
    expect(editor.getBuffer().getText()).toBe('a\nb\na\na\nc');
  });
});

describe('system clipboard integration (:set clipboard=unnamed)', () => {
  const type = (editor: VemEditorState, keys: string) => {
    for (const k of keys) editor.handleKey(k);
  };
  const setClipboard = (editor: VemEditorState, value: string) => {
    type(editor, `:set clipboard=${value}`);
    editor.handleKey('Enter');
  };

  it('defaults to internal — no clipboard writes without opting in', () => {
    const writes: string[] = [];
    const editor = new VemEditorState('hello');
    editor.setClipboardProvider({ write: (t) => writes.push(t) });
    expect(editor.getClipboardMode()).toBe('internal');

    editor.handleKey('y');
    editor.handleKey('y');
    expect(writes).toEqual([]);
  });

  it('mirrors yanks and deletes to the system clipboard once enabled', () => {
    const writes: string[] = [];
    const editor = new VemEditorState('hello world');
    editor.setClipboardProvider({ write: (t) => writes.push(t) });
    setClipboard(editor, 'unnamed');
    expect(editor.getClipboardMode()).toBe('system');

    editor.handleKey('y');
    editor.handleKey('y');
    expect(writes).toEqual(['hello world\n']);

    type(editor, 'dw');
    expect(writes).toEqual(['hello world\n', 'hello ']);
  });

  it('unnamedplus is accepted too; a bare `clipboard=` reverts to internal', () => {
    const editor = new VemEditorState('x');
    setClipboard(editor, 'unnamedplus');
    expect(editor.getClipboardMode()).toBe('system');
    setClipboard(editor, '');
    expect(editor.getClipboardMode()).toBe('internal');
  });

  it('rejects an unrecognized clipboard value', () => {
    const editor = new VemEditorState('x');
    setClipboard(editor, 'bogus');
    expect(editor.statusMessage).toBe('E474: Invalid argument: clipboard=bogus');
    expect(editor.getClipboardMode()).toBe('internal');
  });

  it('p/P paste host-pushed system clipboard text once enabled', () => {
    const editor = new VemEditorState('hello');
    setClipboard(editor, 'unnamed');
    editor.setSystemClipboardText('XYZ');
    editor.handleKey('p');
    expect(editor.getBuffer().getLine(0)).toBe('hXYZello');
  });

  it('setSystemClipboardText is a no-op while clipboard mode is internal', () => {
    const editor = new VemEditorState('hello');
    editor.setSystemClipboardText('XYZ');
    editor.handleKey('p');
    // No register content at all yet, so paste does nothing.
    expect(editor.getBuffer().getLine(0)).toBe('hello');
  });
});

describe('Ctrl scroll motions', () => {
  it('moves the cursor by half and full pages with Ctrl-D/U/F/B', () => {
    const editor = new VemEditorState(
      Array.from({ length: 100 }, (_, i) => `line ${i}`).join('\n'),
    );
    expect(editor.getCursor().line).toBe(0);

    editor.handleKey('<C-d>');
    expect(editor.getCursor().line).toBe(15);
    editor.handleKey('<C-f>');
    expect(editor.getCursor().line).toBe(45);
    editor.handleKey('<C-u>');
    expect(editor.getCursor().line).toBe(30);
    editor.handleKey('<C-b>');
    expect(editor.getCursor().line).toBe(0);
  });

  it('clamps at the buffer edges', () => {
    const editor = new VemEditorState('a\nb\nc');
    editor.handleKey('<C-d>');
    expect(editor.getCursor().line).toBe(2);
    editor.handleKey('<C-u>');
    expect(editor.getCursor().line).toBe(0);
  });
});

describe('Vim intro screen gating', () => {
  it('shows the intro for a fresh empty buffer and hides it after any edit', () => {
    const editor = new VemEditorState('');
    expect(editor.shouldShowIntro()).toBe(true);

    // Cursor motion in an empty buffer keeps the intro (buffer still pristine).
    editor.handleKey('j');
    expect(editor.shouldShowIntro()).toBe(true);

    // Typing dismisses it.
    editor.handleKey('i');
    editor.handleKey('x');
    expect(editor.modified).toBe(true);
    expect(editor.shouldShowIntro()).toBe(false);
  });

  it('does not show the intro when the buffer starts with content', () => {
    const editor = new VemEditorState('hello');
    expect(editor.shouldShowIntro()).toBe(false);
  });
});

describe('pointer-driven visual selection', () => {
  it('setCursor extends the active end while in VISUAL mode', () => {
    const editor = new VemEditorState('alpha\nbravo\ncharlie');
    editor.setCursor(0, 1);
    editor.handleKey('v');

    editor.setCursor(2, 3);
    const sel = editor.getVisualSelection();
    expect(sel).not.toBeNull();
    expect(sel!.anchor).toEqual({ line: 0, character: 1 });
    expect(sel!.active).toEqual({ line: 2, character: 3 });
    expect(editor.getCursor()).toEqual({ line: 2, character: 3 });
  });

  it('setCursor outside VISUAL mode does not create a selection', () => {
    const editor = new VemEditorState('alpha\nbravo');
    editor.setCursor(1, 2);
    expect(editor.getVisualSelection()).toBeNull();
  });
});

describe('uppercase operators and WORD motions (Vim basics)', () => {
  const type = (editor: VemEditorState, keys: string) => {
    for (const k of keys) editor.handleKey(k);
  };

  it('D deletes from cursor to end of line', () => {
    const editor = new VemEditorState('hello world');
    editor.setCursor(0, 5);
    editor.handleKey('D');
    expect(editor.getBuffer().getLine(0)).toBe('hello');
    expect(editor.getCursor()).toEqual({ line: 0, character: 4 });
    expect(editor.getRegister()?.text).toBe(' world');
  });

  it('C deletes to end of line and enters INSERT', () => {
    const editor = new VemEditorState('hello world');
    editor.setCursor(0, 6);
    editor.handleKey('C');
    expect(editor.getBuffer().getLine(0)).toBe('hello ');
    expect(editor.getMode()).toBe('INSERT');
    expect(editor.getCursor()).toEqual({ line: 0, character: 6 });
  });

  it('Y yanks the current line linewise without moving', () => {
    const editor = new VemEditorState('alpha\nbravo');
    editor.setCursor(1, 3);
    editor.handleKey('Y');
    expect(editor.getRegister()).toEqual({ text: 'bravo\n', type: 'line' });
    expect(editor.getBuffer().getLine(1)).toBe('bravo');
    expect(editor.getCursor()).toEqual({ line: 1, character: 3 });
  });

  it('X deletes the character before the cursor', () => {
    const editor = new VemEditorState('abcd');
    editor.setCursor(0, 2);
    editor.handleKey('X');
    expect(editor.getBuffer().getLine(0)).toBe('acd');
    expect(editor.getCursor()).toEqual({ line: 0, character: 1 });
  });

  it('s substitutes the char under the cursor and enters INSERT', () => {
    const editor = new VemEditorState('abc');
    editor.setCursor(0, 1);
    editor.handleKey('s');
    expect(editor.getBuffer().getLine(0)).toBe('ac');
    expect(editor.getMode()).toBe('INSERT');
    expect(editor.getCursor()).toEqual({ line: 0, character: 1 });
  });

  it('S changes the whole line (like cc)', () => {
    const editor = new VemEditorState('alpha\nbravo');
    editor.setCursor(0, 3);
    editor.handleKey('S');
    expect(editor.getBuffer().getLine(0)).toBe('');
    expect(editor.getBuffer().getLine(1)).toBe('bravo');
    expect(editor.getMode()).toBe('INSERT');
    expect(editor.getCursor()).toEqual({ line: 0, character: 0 });
  });

  it('W/B/E treat punctuation as part of a WORD', () => {
    const editor = new VemEditorState('foo.bar baz-qux end');
    editor.setCursor(0, 0);
    editor.handleKey('W'); // to 'baz-qux'
    expect(editor.getCursor()).toEqual({ line: 0, character: 8 });
    editor.handleKey('E'); // end of 'baz-qux'
    expect(editor.getCursor()).toEqual({ line: 0, character: 14 });
    editor.handleKey('B'); // back to start of 'baz-qux'
    expect(editor.getCursor()).toEqual({ line: 0, character: 8 });
  });

  it('dW deletes a whole WORD including punctuation', () => {
    const editor = new VemEditorState('foo.bar baz');
    editor.setCursor(0, 0);
    type(editor, 'dW');
    expect(editor.getBuffer().getLine(0)).toBe('baz');
  });

  it('^ moves to the first non-blank character', () => {
    const editor = new VemEditorState('    indented');
    editor.setCursor(0, 9);
    editor.handleKey('^');
    expect(editor.getCursor()).toEqual({ line: 0, character: 4 });
  });

  it('% jumps between matching brackets (nested, multiline)', () => {
    const editor = new VemEditorState('fn(a, (b))\n{\n  body\n}');
    editor.setCursor(0, 2);
    editor.handleKey('%');
    expect(editor.getCursor()).toEqual({ line: 0, character: 9 });
    editor.handleKey('%');
    expect(editor.getCursor()).toEqual({ line: 0, character: 2 });
    // From a non-bracket char, % uses the first bracket on the line after the cursor.
    editor.setCursor(1, 0);
    editor.handleKey('%');
    expect(editor.getCursor()).toEqual({ line: 3, character: 0 });
  });
});

describe('search: / prompt, n/N repeat', () => {
  const type = (editor: VemEditorState, keys: string) => {
    for (const k of keys) editor.handleKey(k);
  };

  it('/ opens the command line with a / prefix', () => {
    const editor = new VemEditorState('hello');
    editor.handleKey('/');
    expect(editor.getMode()).toBe('COMMAND');
    expect(editor.getCommandPrefix()).toBe('/');
    editor.handleKey('Escape');
    expect(editor.getMode()).toBe('NORMAL');
    editor.handleKey(':');
    expect(editor.getCommandPrefix()).toBe(':');
  });

  it('searches forward, wraps, and repeats with n/N', () => {
    const editor = new VemEditorState('alpha\nneedle one\nplain\nneedle two');
    editor.setCursor(0, 0);
    type(editor, '/needle');
    editor.handleKey('Enter');
    expect(editor.getMode()).toBe('NORMAL');
    expect(editor.getCursor()).toEqual({ line: 1, character: 0 });
    editor.handleKey('n');
    expect(editor.getCursor()).toEqual({ line: 3, character: 0 });
    editor.handleKey('n'); // wraps to the first match
    expect(editor.getCursor()).toEqual({ line: 1, character: 0 });
    editor.handleKey('N'); // reverse wraps back
    expect(editor.getCursor()).toEqual({ line: 3, character: 0 });
  });

  it('finds later matches on the same line', () => {
    const editor = new VemEditorState('ab ab ab');
    editor.setCursor(0, 0);
    type(editor, '/ab');
    editor.handleKey('Enter');
    expect(editor.getCursor()).toEqual({ line: 0, character: 3 });
    editor.handleKey('n');
    expect(editor.getCursor()).toEqual({ line: 0, character: 6 });
  });

  it('reports E486 when the pattern is missing', () => {
    const editor = new VemEditorState('hello');
    type(editor, '/nope');
    editor.handleKey('Enter');
    expect(editor.statusMessage).toContain('E486');
    expect(editor.getCursor()).toEqual({ line: 0, character: 0 });
  });
});

describe('find-char motions (f/F/t/T), r, and */#', () => {
  const type = (editor: VemEditorState, keys: string) => {
    for (const k of keys) editor.handleKey(k);
  };

  it('f/F land on the target char, t/T land just before/after it', () => {
    const editor = new VemEditorState('hello world');
    type(editor, 'fo');
    expect(editor.getCursor().character).toBe(4); // first 'o' in "hello"

    editor.setCursor(0, 10);
    type(editor, 'Fo');
    expect(editor.getCursor().character).toBe(7); // 'o' in "world"

    editor.setCursor(0, 0);
    type(editor, 'to');
    expect(editor.getCursor().character).toBe(3); // just before the 'o'

    editor.setCursor(0, 10);
    type(editor, 'To');
    expect(editor.getCursor().character).toBe(8); // just after the 'o'
  });

  it('a target that is not on the line leaves the cursor untouched', () => {
    const editor = new VemEditorState('hello');
    type(editor, 'fz');
    expect(editor.getCursor()).toEqual({ line: 0, character: 0 });
  });

  it('df{char}/dt{char} delete inclusive/exclusive of the target', () => {
    const dfx = new VemEditorState('hello world');
    type(dfx, 'dfo');
    expect(dfx.getBuffer().getLine(0)).toBe(' world');

    const dtx = new VemEditorState('hello world');
    type(dtx, 'dto');
    expect(dtx.getBuffer().getLine(0)).toBe('o world');
  });

  it('a failed f/t search aborts the operator with no deletion', () => {
    const editor = new VemEditorState('hello');
    type(editor, 'dfz');
    expect(editor.getBuffer().getLine(0)).toBe('hello');
  });

  it('dF{char} (backward, inclusive) deletes correctly across the sort boundary', () => {
    const editor = new VemEditorState('hello world');
    editor.setCursor(0, 10);
    type(editor, 'dFo');
    expect(editor.getBuffer().getLine(0)).toBe('hello w');
  });

  it('r{char} replaces the char under the cursor without entering INSERT', () => {
    const editor = new VemEditorState('hello');
    type(editor, 'rX');
    expect(editor.getBuffer().getLine(0)).toBe('Xello');
    expect(editor.getMode()).toBe('NORMAL');
  });

  it('{count}r{char} replaces that many chars, cursor on the last one', () => {
    const editor = new VemEditorState('abcdef');
    type(editor, '3rx');
    expect(editor.getBuffer().getLine(0)).toBe('xxxdef');
    expect(editor.getCursor().character).toBe(2);
  });

  it('r{char} is a no-op when there are not enough characters left', () => {
    const editor = new VemEditorState('ab');
    editor.setCursor(0, 0);
    type(editor, '5rx');
    expect(editor.getBuffer().getLine(0)).toBe('ab');
  });

  it('* jumps to the next whole-word match of the word under the cursor', () => {
    const editor = new VemEditorState('foo bar foo baz');
    editor.handleKey('*');
    expect(editor.getCursor()).toEqual({ line: 0, character: 8 });
  });

  it('* only matches whole words, not substrings', () => {
    const editor = new VemEditorState('foo foobar foo');
    editor.handleKey('*');
    // Should skip "foobar" (not a whole-word match) and land on the last "foo".
    expect(editor.getCursor()).toEqual({ line: 0, character: 11 });
  });

  it('# jumps backward to the previous whole-word match', () => {
    const editor = new VemEditorState('foo bar foo baz');
    editor.setCursor(0, 8); // on the second "foo"
    editor.handleKey('#');
    expect(editor.getCursor()).toEqual({ line: 0, character: 0 });
  });
});

describe('global defaults (vemrc-style config applying to future buffers)', () => {
  afterEach(() => {
    // Every test here mutates process-wide static defaults — reset so other
    // test files (and later tests in this file) see vem's real defaults.
    VemEditorState.resetDefaults();
  });

  it('setDefaultLayoutConfig affects states constructed afterwards, not existing ones', () => {
    const before = new VemEditorState('before');
    expect(before.layoutConfig.lineNumbers).toBe('none');

    VemEditorState.setDefaultLayoutConfig({ lineNumbers: 'absolute' });

    expect(before.layoutConfig.lineNumbers).toBe('none'); // unaffected retroactively
    const after = new VemEditorState('after');
    expect(after.layoutConfig.lineNumbers).toBe('absolute');
  });

  it('setDefaultTheme affects states constructed afterwards', () => {
    VemEditorState.setDefaultTheme({ accent: '#ff00ff' });
    const state = new VemEditorState('x');
    expect(state.theme.accent).toBe('#ff00ff');
    // Untouched theme fields still come from the real Vim-default palette.
    expect(state.theme.bg).toBe('#000000');
  });

  it('resetDefaults restores the built-in Vim defaults for new states', () => {
    VemEditorState.setDefaultLayoutConfig({ lineNumbers: 'relative' });
    VemEditorState.resetDefaults();
    const state = new VemEditorState('x');
    expect(state.layoutConfig.lineNumbers).toBe('none');
  });
});

describe('navigation keys (Arrow/Home/End/PageUp/PageDown)', () => {
  it('move the cursor in INSERT mode without leaving it', () => {
    const editor = new VemEditorState('hello\nworld');
    editor.handleKey('i');
    editor.handleKey('ArrowRight');
    editor.handleKey('ArrowRight');
    expect(editor.getCursor()).toEqual({ line: 0, character: 2 });
    expect(editor.getMode()).toBe('INSERT');

    editor.handleKey('ArrowDown');
    expect(editor.getCursor()).toEqual({ line: 1, character: 2 });

    editor.handleKey('ArrowLeft');
    expect(editor.getCursor()).toEqual({ line: 1, character: 1 });

    editor.handleKey('ArrowUp');
    expect(editor.getCursor()).toEqual({ line: 0, character: 1 });
    expect(editor.getMode()).toBe('INSERT');
  });

  it('Home/End move to column 0 / past the last character in INSERT mode', () => {
    const editor = new VemEditorState('hello');
    editor.handleKey('i');
    editor.handleKey('ArrowRight');
    editor.handleKey('ArrowRight');

    editor.handleKey('End');
    expect(editor.getCursor()).toEqual({ line: 0, character: 5 });

    editor.handleKey('Home');
    expect(editor.getCursor()).toEqual({ line: 0, character: 0 });
  });

  it('typing still works immediately after an arrow-key move in INSERT mode', () => {
    const editor = new VemEditorState('ac');
    editor.handleKey('i');
    editor.handleKey('ArrowRight');
    editor.handleKey('b');
    expect(editor.getBuffer().getText()).toBe('abc');
  });

  it('Arrow keys move the cursor in NORMAL mode like hjkl', () => {
    const editor = new VemEditorState('hello\nworld');
    editor.handleKey('ArrowRight');
    editor.handleKey('ArrowRight');
    expect(editor.getCursor()).toEqual({ line: 0, character: 2 });

    editor.handleKey('ArrowDown');
    expect(editor.getCursor()).toEqual({ line: 1, character: 2 });

    editor.handleKey('End');
    expect(editor.getCursor()).toEqual({ line: 1, character: 4 });
  });

  it('Arrow keys extend the selection in VISUAL mode', () => {
    const editor = new VemEditorState('hello world');
    editor.handleKey('v');
    editor.handleKey('ArrowRight');
    editor.handleKey('ArrowRight');
    const sel = editor.getVisualSelection();
    expect(sel?.anchor).toEqual({ line: 0, character: 0 });
    expect(sel?.active).toEqual({ line: 0, character: 2 });
  });

  it('PageDown/PageUp move a full screen and stay clamped to the buffer', () => {
    const lines = Array.from({ length: 40 }, (_, i) => `line${i}`).join('\n');
    const editor = new VemEditorState(lines);
    editor.handleKey('PageDown');
    expect(editor.getCursor().line).toBeGreaterThan(0);

    editor.handleKey('PageUp');
    expect(editor.getCursor().line).toBe(0);
  });
});
