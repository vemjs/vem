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
});
