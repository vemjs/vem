import { describe, it, expect } from 'bun:test';
import { VemEditorState } from '@vemjs/core';
import { PluginRegistry, type PluginContext, type VemPlugin } from './index';

describe('Plugin System', () => {
  it('should register and activate a plugin', () => {
    const editor = new VemEditorState('test content');
    const registry = new PluginRegistry(editor);

    let activated = false;
    const testPlugin: VemPlugin = {
      name: 'test-plugin',
      version: '1.0.0',
      activate(_context) {
        activated = true;
      },
    };

    registry.register(testPlugin);
    expect(activated).toBe(true);
  });

  it('should execute registered custom commands and intercept custom keybindings', () => {
    const editor = new VemEditorState('hello');
    const registry = new PluginRegistry(editor);

    let executed = false;
    const testPlugin: VemPlugin = {
      name: 'chord-plugin',
      version: '1.0.0',
      activate(context) {
        context.registerCommand('testCmd', () => {
          executed = true;
        });
        context.registerKeybinding('NORMAL', ' gw', 'testCmd');
      },
    };

    registry.register(testPlugin);

    editor.onExecutePluginCommand((name) => {
      registry.executeCommand(name);
    });

    // Type chord: Space, g, w
    editor.handleKey(' ');
    editor.handleKey('g');
    editor.handleKey('w');

    expect(executed).toBe(true);
  });

  it('should support buffer change event listeners', () => {
    const editor = new VemEditorState('line1');
    const registry = new PluginRegistry(editor);

    let changeCount = 0;
    const testPlugin: VemPlugin = {
      name: 'buffer-listener',
      version: '1.0.0',
      activate(context) {
        context.onDidChangeBuffer(() => {
          changeCount++;
        });
      },
    };

    registry.register(testPlugin);

    // Modify the buffer
    editor.handleKey('i');
    editor.handleKey('a');
    editor.handleKey('Escape');

    expect(changeCount).toBe(1);
  });

  it('should support mode change event listeners', () => {
    const editor = new VemEditorState('line1');
    const registry = new PluginRegistry(editor);

    let lastMode = 'NORMAL';
    const testPlugin: VemPlugin = {
      name: 'mode-listener',
      version: '1.0.0',
      activate(context) {
        context.onDidChangeMode((mode) => {
          lastMode = mode;
        });
      },
    };

    registry.register(testPlugin);

    // Change mode
    editor.handleKey('i');
    expect(lastMode).toBe('INSERT');

    editor.handleKey('Escape');
    expect(lastMode).toBe('NORMAL');
  });

  it('should support save event listeners', () => {
    const editor = new VemEditorState('line1');
    const registry = new PluginRegistry(editor);

    let saved = false;
    const testPlugin: VemPlugin = {
      name: 'save-listener',
      version: '1.0.0',
      activate(context) {
        context.onSave(() => {
          saved = true;
        });
      },
    };

    registry.register(testPlugin);

    // Trigger save (simulate :w)
    editor.handleKey(':');
    editor.handleKey('w');
    editor.handleKey('Enter');

    expect(saved).toBe(true);
  });
});

describe('PluginRegistry idempotence & capabilities', () => {
  it('skips re-registration so repeated activation cannot stack listeners', () => {
    const editor = new VemEditorState('line1');
    const registry = new PluginRegistry(editor);

    let activations = 0;
    let changes = 0;
    const plugin: VemPlugin = {
      name: 'once',
      version: '1.0.0',
      activate(context) {
        activations++;
        context.onDidChangeBuffer(() => changes++);
      },
    };

    registry.register(plugin);
    registry.register(plugin);
    expect(activations).toBe(1);
    expect(registry.has('once')).toBe(true);

    editor.setMode('INSERT');
    editor.handleKey('x');
    expect(changes).toBe(1);
  });

  it('passes host capabilities through to the plugin context', async () => {
    const editor = new VemEditorState('line1');
    const opened: string[] = [];
    const registry = new PluginRegistry(editor, {
      openFile: (path) => {
        opened.push(path);
      },
      gitDiff: async () => '@@ -1 +1 @@',
    });

    let context: PluginContext | null = null;
    registry.register({
      name: 'capable',
      version: '1.0.0',
      activate(ctx) {
        context = ctx;
      },
    });

    await context!.openFile!('src/a.ts');
    expect(opened).toEqual(['src/a.ts']);
    expect(await context!.gitDiff!('src/a.ts')).toBe('@@ -1 +1 @@');
  });

  it('leaves capabilities undefined on a bare registry (plugins must degrade)', () => {
    const editor = new VemEditorState('line1');
    const registry = new PluginRegistry(editor);
    let context: PluginContext | null = null;
    registry.register({
      name: 'bare',
      version: '1.0.0',
      activate(ctx) {
        context = ctx;
      },
    });
    expect(context!.openFile).toBeUndefined();
    expect(context!.gitDiff).toBeUndefined();
  });
});
