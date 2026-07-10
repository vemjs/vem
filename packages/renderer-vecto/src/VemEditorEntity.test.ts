import { describe, it, expect, beforeEach } from 'bun:test';
import { VemEditorState } from '@vemjs/core';
import { VemEditorEntity } from './VemEditorEntity';

describe('VemEditorEntity autocomplete API', () => {
  let editorState: VemEditorState;
  let entity: VemEditorEntity;

  beforeEach(() => {
    editorState = new VemEditorState('const x = 1;');
    entity = new VemEditorEntity(editorState);
  });

  it('should initialize with empty autocomplete items', () => {
    expect(entity.getAutocompleteItems()).toEqual([]);
    expect(entity.getSelectedAutocomplete()).toBeNull();
  });

  it('should correctly store autocomplete items', () => {
    const items = [
      { label: 'console', detail: 'builtin' },
      { label: 'const', detail: 'keyword' },
    ];
    entity.setAutocompleteItems(items);
    expect(entity.getAutocompleteItems()).toEqual(items);
    expect(entity.getSelectedAutocomplete()).toEqual({ label: 'console', detail: 'builtin' });
  });

  it('should cycle through items using next/prev methods', () => {
    const items = [
      { label: 'console', detail: 'builtin' },
      { label: 'const', detail: 'keyword' },
    ];
    entity.setAutocompleteItems(items);

    // Next goes to index 1
    entity.selectNextAutocomplete();
    expect(entity.getSelectedAutocomplete()).toEqual({ label: 'const', detail: 'keyword' });

    // Next wraps back to index 0
    entity.selectNextAutocomplete();
    expect(entity.getSelectedAutocomplete()).toEqual({ label: 'console', detail: 'builtin' });

    // Prev goes back to index 1 (wrapping backward)
    entity.selectPrevAutocomplete();
    expect(entity.getSelectedAutocomplete()).toEqual({ label: 'const', detail: 'keyword' });
  });

  it('should clear autocomplete items', () => {
    entity.setAutocompleteItems([{ label: 'console' }]);
    entity.clearAutocomplete();
    expect(entity.getAutocompleteItems()).toEqual([]);
    expect(entity.getSelectedAutocomplete()).toBeNull();
  });

  it('should size and detach the command bar when command mode toggles', () => {
    const detached: unknown[] = [];
    Object.defineProperty(entity, 'scene', {
      configurable: true,
      value: {
        a11yNeedsReorder: false,
        markDirty() {},
        detachA11y(child: unknown) {
          detached.push(child);
        },
      },
    });

    entity.width = 1024;
    editorState.handleKey(':');
    entity.updateFromState();

    const commandBar = entity.children.find((child) => child.constructor.name === 'CommandBar');
    expect(commandBar).toBeDefined();
    expect(commandBar!.width).toBe(1024);
    const commandInput = (commandBar as unknown as { input: { value: string } }).input;

    editorState.handleKey('w');
    entity.updateFromState();
    expect(commandInput.value).toBe('w');

    editorState.handleKey('Escape');
    entity.updateFromState();

    expect(entity.children).not.toContain(commandBar);
    expect(detached).toEqual([commandBar]);
  });

  it('should route Vim keys from the VectoJS a11y textarea path', () => {
    const press = (key: string) => {
      let prevented = false;
      entity.emit('keydown', {
        nativeEvent: {
          key,
          ctrlKey: false,
          preventDefault: () => {
            prevented = true;
          },
        },
      });
      return prevented;
    };

    press('i');
    press('X');
    expect(editorState.getMode()).toBe('INSERT');
    expect(editorState.getBuffer().getLine(0)).toBe('Xconst x = 1;');

    expect(press('Escape')).toBe(true);
    expect(editorState.getMode()).toBe('NORMAL');

    press(':');
    press('v');
    press('s');
    press('p');
    expect(editorState.getMode()).toBe('COMMAND');
    expect(editorState.getCommandText()).toBe('vsp');
  });

  it('should position the cursor from VectoJS local pointer coordinates', () => {
    Object.defineProperty(entity, 'scene', {
      configurable: true,
      value: {
        getA11yElement: () => ({ focus() {} }),
        markDirty() {},
      },
    });

    entity.emit('pointerdown', {
      localX: 70,
      localY: 12,
      nativeEvent: {
        offsetX: 999,
        offsetY: 999,
      },
    });

    expect(editorState.getCursor()).toEqual({ line: 0, character: 4 });
  });
});

describe('VemEditorEntity grid rendering', () => {
  const makeRecorder = () => {
    const texts: { text: string; x: number; y: number; color?: string }[] = [];
    const noop = () => {};
    const r: any = {
      beginPath: noop,
      moveTo: noop,
      lineTo: noop,
      closePath: noop,
      fill: noop,
      stroke: noop,
      roundRect: noop,
      save: noop,
      restore: noop,
      translate: noop,
      clip: noop,
      fillText: (text: string, x: number, y: number, _font?: string, color?: string) => {
        texts.push({ text, x, y, color });
      },
      measureText: (t: string) => ({ width: t.length * 8 }),
    };
    return { r, texts };
  };

  it('preserves leading whitespace columns when drawing buffer text', () => {
    const state = new VemEditorState('    indented\nplain');
    const entity = new VemEditorEntity(state) as any;
    const { r, texts } = makeRecorder();
    entity.render(r);

    const indented = texts.find((t) => t.text === '    indented');
    const plain = texts.find((t) => t.text === 'plain');
    expect(indented).toBeDefined();
    expect(plain).toBeDefined();
    // Same span-start column => same x; the four spaces live inside the
    // drawn string on the monospace grid, never collapsed by a layout pass.
    expect(indented!.x).toBe(plain!.x);
  });

  it('advances highlighted spans by their character count, including whitespace-only spans', () => {
    const state = new VemEditorState('ab  cd');
    state.highlightLine = (line: string) => [
      { text: 'ab', color: '#ff0000' },
      { text: '  ' },
      { text: 'cd', color: '#00ff00' },
    ];
    const entity = new VemEditorEntity(state) as any;
    const { r, texts } = makeRecorder();
    entity.render(r);

    const ab = texts.find((t) => t.text === 'ab');
    const cd = texts.find((t) => t.text === 'cd');
    expect(ab).toBeDefined();
    expect(cd).toBeDefined();
    // cd starts 4 columns after ab (2 letters + 2 preserved spaces)
    expect(cd!.x - ab!.x).toBeCloseTo(4 * entity.charWidth, 5);
    // whitespace-only span is advanced over but never drawn
    expect(texts.some((t) => t.text === '  ')).toBe(false);
  });

  it('renders relative line numbers around the cursor when enabled', () => {
    const state = new VemEditorState('one\ntwo\nthree\nfour');
    state.handleKey(':');
    state.setCommandText('set rnu');
    state.handleKey('Enter');
    state.setCursor(2, 0); // cursor on "three"

    const entity = new VemEditorEntity(state) as any;
    const { r, texts } = makeRecorder();
    entity.render(r);

    const gutterLabels = texts
      .filter((t) => /^\s*\d+$/.test(t.text))
      .sort((a, b) => a.y - b.y)
      .map((t) => t.text.trim());
    expect(gutterLabels).toEqual(['2', '1', '3', '1']);
  });

  it('shows the unknown-command message in the status bar', () => {
    const state = new VemEditorState('text');
    state.handleKey(':');
    state.setCommandText('bogus');
    state.handleKey('Enter');

    const entity = new VemEditorEntity(state) as any;
    const { r, texts } = makeRecorder();
    entity.render(r);

    expect(texts.some((t) => t.text.includes('E492: Not an editor command: bogus'))).toBe(true);
  });
});
