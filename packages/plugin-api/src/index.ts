import { VemEditorState } from '@vemjs/core';
import type { EditorMode } from '@vemjs/core';

export interface VemPlugin {
  name: string;
  version: string;
  activate(context: PluginContext): void;
  deactivate?(): void;
}

/**
 * Optional services only the host application can provide (filesystem,
 * shell). Plugins must treat every member as possibly absent and degrade
 * gracefully — a browser host has no shell, a bare test registry has
 * neither.
 */
export interface PluginHostCapabilities {
  /** Open a file by path in the host (new tab, or replacing a pristine one). */
  openFile?: (path: string) => void | Promise<void>;
  /**
   * Unified diff (`git diff -U0 -- <fileUri>`) for a saved file, or `null`
   * when git/the file/shell access is unavailable.
   */
  gitDiff?: (fileUri: string) => Promise<string | null>;
}

export interface PluginContext extends PluginHostCapabilities {
  editorState: VemEditorState;
  registerCommand(commandName: string, callback: () => void): void;
  registerKeybinding(mode: EditorMode, keys: string, commandName: string): void;
  onDidOpenBuffer(cb: () => void): void;
  onDidChangeBuffer(cb: () => void): void;
  onDidChangeMode(cb: (mode: EditorMode) => void): void;
  onSave(cb: () => void): void;
}

export class PluginRegistry {
  private plugins: Map<string, VemPlugin> = new Map();
  private commands: Map<string, () => void> = new Map();
  private editorState: VemEditorState;
  private capabilities: PluginHostCapabilities;

  constructor(editorState: VemEditorState, capabilities: PluginHostCapabilities = {}) {
    this.editorState = editorState;
    this.capabilities = capabilities;
    this.editorState.onExecutePluginCommand((name) => this.executeCommand(name));
  }

  /**
   * Activate a plugin on this registry's editor state. Idempotent: a plugin
   * name that is already registered is skipped, so re-invocations (`:Lualine`
   * twice, a demo button re-click) can't stack duplicate buffer/mode/save
   * subscriptions on the same state.
   */
  public register(plugin: VemPlugin): void {
    if (this.plugins.has(plugin.name)) return;

    const context: PluginContext = {
      editorState: this.editorState,
      registerCommand: (name, cb) => this.commands.set(name, cb),
      registerKeybinding: (mode, keys, commandName) => {
        this.editorState.registerKeybinding(mode, keys, commandName);
      },
      onDidOpenBuffer: (cb) => this.editorState.onDidOpenBuffer(cb),
      onDidChangeBuffer: (cb) => this.editorState.onDidChangeBuffer(cb),
      onDidChangeMode: (cb) => this.editorState.onDidChangeMode(cb),
      onSave: (cb) => this.editorState.onSave(cb),
      openFile: this.capabilities.openFile,
      gitDiff: this.capabilities.gitDiff,
    };

    plugin.activate(context);
    this.plugins.set(plugin.name, plugin);
    console.log(`Plugin [${plugin.name}] activated.`);
  }

  /** Whether a plugin name has been activated on this registry. */
  public has(name: string): boolean {
    return this.plugins.has(name);
  }

  public executeCommand(name: string): void {
    const cmd = this.commands.get(name);
    if (cmd) {
      cmd();
    } else {
      console.warn(`Command [${name}] not found.`);
    }
  }
}
