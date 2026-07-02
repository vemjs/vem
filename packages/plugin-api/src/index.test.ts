import { describe, it, expect } from 'bun:test';
import { VemEditorState } from '@vemjs/core';
import { PluginRegistry, type VemPlugin } from './index';

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
});
