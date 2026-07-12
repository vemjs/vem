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
    // Turn on absolute line numbers so the gutter has its digit width (the
    // nonumber default has a zero-width gutter and different click math).
    editorState.setLayoutConfig({ lineNumbers: 'absolute' });
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
    state.highlightLine = (_line: string) => [
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

  it('draws ~ markers for empty lines and the intro on a fresh empty buffer', () => {
    const state = new VemEditorState('');
    const entity = new VemEditorEntity(state) as any;
    entity.width = 800;
    entity.height = 600;
    const { r, texts } = makeRecorder();
    entity.render(r);

    // Tildes fill the empty area (many, one per screen row below line 0).
    const tildes = texts.filter((t) => t.text === '~');
    expect(tildes.length).toBeGreaterThan(5);
    // All tildes sit at the left edge (x = 5), the NonText column.
    expect(tildes.every((t) => t.x === 5)).toBe(true);
    // The intro splash is present.
    expect(texts.some((t) => t.text.includes('VEM'))).toBe(true);
    expect(texts.some((t) => t.text === '<Enter>')).toBe(true);
  });

  it('hides the intro and shows a ruler once the buffer has content', () => {
    const state = new VemEditorState('hello world');
    const entity = new VemEditorEntity(state) as any;
    entity.width = 800;
    entity.height = 600;
    const { r, texts } = makeRecorder();
    entity.render(r);

    expect(texts.some((t) => t.text.includes('VEM'))).toBe(false);
    // Ruler shows line,col for a non-empty buffer.
    expect(texts.some((t) => t.text === '1,1')).toBe(true);
    expect(texts.some((t) => t.text === 'All')).toBe(true);
  });

  it('shows the Vim empty-buffer ruler 0,0-1', () => {
    const state = new VemEditorState('');
    const entity = new VemEditorEntity(state) as any;
    entity.width = 800;
    entity.height = 600;
    const { r, texts } = makeRecorder();
    entity.render(r);
    expect(texts.some((t) => t.text === '0,0-1')).toBe(true);
  });
});

describe('VemEditorEntity mouse selection (Vim mouse=a)', () => {
  const makeEntity = () => {
    const state = new VemEditorState('alpha\nbravo');
    const entity = new VemEditorEntity(state);
    Object.defineProperty(entity, 'scene', {
      configurable: true,
      value: {
        getA11yElement: () => ({ focus() {} }),
        markDirty() {},
      },
    });
    return { state, entity };
  };

  // nonumber default => zero-width gutter: x = 5 + char*8.4, y = 5 + line*21.
  const at = (line: number, char: number) => ({
    localX: 5 + char * 8.4,
    localY: 12 + line * 21,
  });

  it('drag starts a charwise VISUAL selection anchored at the press cell', () => {
    const { state, entity } = makeEntity();

    entity.emit('pointerdown', at(0, 0));
    expect(state.getCursor()).toEqual({ line: 0, character: 0 });
    expect(state.getMode()).toBe('NORMAL');

    entity.emit('pointermove', { ...at(1, 2), nativeEvent: { buttons: 1 } });
    expect(state.getMode()).toBe('VISUAL');
    const sel = state.getVisualSelection();
    expect(sel!.type).toBe('char');
    expect(sel!.anchor).toEqual({ line: 0, character: 0 });
    expect(sel!.active).toEqual({ line: 1, character: 2 });

    // Selection survives release AND the trailing click at the release point.
    entity.emit('pointerup', {});
    entity.emit('click', at(1, 2));
    expect(state.getMode()).toBe('VISUAL');
    expect(state.getVisualSelection()!.anchor).toEqual({ line: 0, character: 0 });
  });

  it('a plain click in VISUAL mode leaves Visual and moves the cursor', () => {
    const { state, entity } = makeEntity();
    entity.emit('pointerdown', at(0, 0));
    entity.emit('pointermove', { ...at(1, 2), nativeEvent: { buttons: 1 } });
    entity.emit('pointerup', {});
    entity.emit('click', at(1, 2)); // trailing click, swallowed
    expect(state.getMode()).toBe('VISUAL');

    entity.emit('pointerdown', at(0, 3));
    expect(state.getMode()).toBe('NORMAL');
    expect(state.getVisualSelection()).toBeNull();
    expect(state.getCursor()).toEqual({ line: 0, character: 3 });
  });

  it('a move without pressed buttons ends a stale drag instead of selecting', () => {
    const { state, entity } = makeEntity();
    entity.emit('pointerdown', at(0, 0));
    // Button was released outside the entity: buttons reports 0.
    entity.emit('pointermove', { ...at(1, 2), nativeEvent: { buttons: 0 } });
    expect(state.getMode()).toBe('NORMAL');
    expect(state.getVisualSelection()).toBeNull();
    // And later hover-moves never extend anything either.
    entity.emit('pointermove', { ...at(1, 4), nativeEvent: { buttons: 0 } });
    expect(state.getMode()).toBe('NORMAL');
  });

  it('wiggling inside the press cell does not enter VISUAL', () => {
    const { state, entity } = makeEntity();
    entity.emit('pointerdown', at(0, 2));
    entity.emit('pointermove', { ...at(0, 2), nativeEvent: { buttons: 1 } });
    expect(state.getMode()).toBe('NORMAL');
    expect(state.getVisualSelection()).toBeNull();
  });
});

describe('VemEditorEntity cursor rendering', () => {
  const makeRecorder = () => {
    const draws: { kind: 'fill' | 'stroke'; color: string; width?: number }[] = [];
    const noop = () => {};
    const r: any = {
      beginPath: noop,
      moveTo: noop,
      lineTo: noop,
      closePath: noop,
      fill: (color: string) => draws.push({ kind: 'fill', color }),
      stroke: (color: string, width?: number) => draws.push({ kind: 'stroke', color, width }),
      roundRect: noop,
      save: noop,
      restore: noop,
      translate: noop,
      clip: noop,
      fillText: noop,
      measureText: (t: string) => ({ width: t.length * 8 }),
    };
    return { r, draws };
  };
  // The cursor is the LAST fill/stroke call before restore() in render();
  // grid text uses fillText (not fill/stroke), so the final draw call is it.
  const lastDraw = (draws: { kind: 'fill' | 'stroke'; color: string }[]) => draws.at(-1);

  it('draws a hollow cursor when the pane is neither focused nor active', () => {
    const state = new VemEditorState('hello');
    const entity = new VemEditorEntity(state) as any;
    const { r, draws } = makeRecorder();
    entity.render(r);
    expect(lastDraw(draws)?.kind).toBe('stroke');
  });

  it('draws a solid cursor when isActivePane is true, even without DOM focus', () => {
    const state = new VemEditorState('hello');
    const entity = new VemEditorEntity(state) as any;
    entity.isActivePane = true;
    const { r, draws } = makeRecorder();
    entity.render(r);
    expect(lastDraw(draws)?.kind).toBe('fill');
  });

  it('renders a thin bar in INSERT mode regardless of active-pane state', () => {
    const state = new VemEditorState('hello');
    state.handleKey('i');
    const inactiveEntity = new VemEditorEntity(state) as any;
    const { r: r1, draws: d1 } = makeRecorder();
    inactiveEntity.render(r1);
    expect(lastDraw(d1)?.kind).toBe('stroke'); // shape still a bar, just hollow

    const activeEntity = new VemEditorEntity(state) as any;
    activeEntity.isActivePane = true;
    const { r: r2, draws: d2 } = makeRecorder();
    activeEntity.render(r2);
    expect(lastDraw(d2)).toEqual({ kind: 'fill', color: state.theme.accent });
  });

  it('calls onActivate when the pane is clicked (pointerdown)', () => {
    const state = new VemEditorState('hello');
    let activated = false;
    const entity = new VemEditorEntity(state, () => {
      activated = true;
    }) as any;
    entity.emit('pointerdown', { localX: 5, localY: 5 });
    expect(activated).toBe(true);
  });
});

describe('VemEditorEntity Ctrl-key routing (own a11y textarea path)', () => {
  const pressCtrl = (entity: any, key: string) => {
    let prevented = false;
    entity.emit('keydown', {
      nativeEvent: {
        key,
        ctrlKey: true,
        preventDefault: () => {
          prevented = true;
        },
      },
    });
    return prevented;
  };

  it('translates Ctrl-D/U/F/B/E/Y to Vim scroll motions and prevents the browser default', () => {
    const state = new VemEditorState(Array.from({ length: 60 }, (_, i) => `line ${i}`).join('\n'));
    const entity = new VemEditorEntity(state) as any;
    state.setCursor(0, 0);

    const prevented = pressCtrl(entity, 'd');
    expect(prevented).toBe(true);
    // A raw 'd' would start a delete-operator; the translated <C-d> instead
    // scrolls the cursor down and leaves no pending operator.
    expect(state.getCursor().line).toBeGreaterThan(0);
    expect(state.getPendingKeys()).toEqual([]);
  });

  it('does not let Ctrl-D leak through as a literal "d" keypress', () => {
    const state = new VemEditorState('hello world');
    const entity = new VemEditorEntity(state) as any;
    pressCtrl(entity, 'd');
    // If 'd' had been fed raw, this would now be a pending delete-operator.
    expect(state.getPendingKeys()).toEqual([]);
    expect(state.getBuffer().getLine(0)).toBe('hello world');
  });

  it('prevents the browser default for suppress-only combos like Ctrl-S', () => {
    const state = new VemEditorState('hello');
    const entity = new VemEditorEntity(state) as any;
    expect(pressCtrl(entity, 's')).toBe(true);
  });

  it('lets unmapped Ctrl combos (Ctrl-C) pass through to the browser', () => {
    const state = new VemEditorState('hello');
    const entity = new VemEditorEntity(state) as any;
    expect(pressCtrl(entity, 'c')).toBe(false);
  });
});

describe('VemEditorEntity mouse wheel scrolling (Vim mouse=a)', () => {
  const wheel = (entity: any, deltaY: number) => {
    let prevented = false;
    entity.emit('wheel', { nativeEvent: { deltaY, preventDefault: () => (prevented = true) } });
    return prevented;
  };

  it('scrolls the viewport down 3 lines per notch without moving the cursor', () => {
    const state = new VemEditorState(Array.from({ length: 60 }, (_, i) => `line ${i}`).join('\n'));
    const entity = new VemEditorEntity(state) as any;
    state.setCursor(0, 0);

    const prevented = wheel(entity, 100);
    expect(prevented).toBe(true);
    expect(entity.scrollY).toBe(3);
    expect(state.getCursor()).toEqual({ line: 0, character: 0 });
  });

  it('scrolls up and clamps at 0', () => {
    const state = new VemEditorState(Array.from({ length: 60 }, (_, i) => `line ${i}`).join('\n'));
    const entity = new VemEditorEntity(state) as any;
    wheel(entity, -100);
    expect(entity.scrollY).toBe(0);
  });

  it('clamps at the last line so the buffer cannot scroll fully out of view', () => {
    const state = new VemEditorState('one\ntwo\nthree');
    const entity = new VemEditorEntity(state) as any;
    wheel(entity, 100);
    wheel(entity, 100);
    wheel(entity, 100);
    wheel(entity, 100);
    expect(entity.scrollY).toBe(2); // lineCount - 1
  });

  it('ignores zero-delta wheel events', () => {
    const state = new VemEditorState('one\ntwo');
    const entity = new VemEditorEntity(state) as any;
    const prevented = wheel(entity, 0);
    expect(prevented).toBe(false);
    expect(entity.scrollY).toBe(0);
  });
});

describe('VemEditorEntity horizontal scroll (long lines keep the cursor visible)', () => {
  it('does not scroll when the cursor is within the viewport', () => {
    const state = new VemEditorState('short line');
    const entity = new VemEditorEntity(state) as any;
    state.setCursor(0, 5);
    entity.updateFromState();
    expect(entity.scrollX).toBe(0);
  });

  it('scrolls right to keep the cursor visible on a line longer than the viewport', () => {
    const longLine = 'x'.repeat(200);
    const state = new VemEditorState(longLine);
    const entity = new VemEditorEntity(state) as any;
    state.setCursor(0, 150);
    entity.updateFromState();

    // Cursor must land inside [0, width) once scrollX is applied — this is
    // the actual bug: before scrollX existed, the cursor rendered far past
    // the right edge and was simply never visible.
    const cursorX = entity.gutterWidth() + 5 + (150 - entity.scrollX) * entity.charWidth;
    expect(entity.scrollX).toBeGreaterThan(0);
    expect(cursorX).toBeGreaterThanOrEqual(0);
    expect(cursorX).toBeLessThan(entity.width);
  });

  it('scrolls back left once the cursor returns to an earlier column', () => {
    const longLine = 'x'.repeat(200);
    const state = new VemEditorState(longLine);
    const entity = new VemEditorEntity(state) as any;
    state.setCursor(0, 150);
    entity.updateFromState();
    expect(entity.scrollX).toBeGreaterThan(0);

    state.setCursor(0, 2);
    entity.updateFromState();
    expect(entity.scrollX).toBe(2);
  });

  it('keeps the click-to-cursor hit test correct while horizontally scrolled', () => {
    const longLine = 'x'.repeat(200);
    const state = new VemEditorState(longLine);
    const entity = new VemEditorEntity(state) as any;
    state.setCursor(0, 150);
    entity.updateFromState();
    const scrollX = entity.scrollX;

    // Clicking at the on-screen X for column 150 (post-scroll) must resolve
    // back to buffer column 150, not the unscrolled raw pixel column.
    const localX = entity.gutterWidth() + 5 + (150 - scrollX) * entity.charWidth;
    entity.emit('pointerdown', { localX, localY: 10 });
    expect(state.getCursor().character).toBe(150);
  });
});
