import { VemEditorState } from '@vemjs/core';

export interface VemPlugin {
  name: string;
  version: string;
  activate(context: PluginContext): void;
  deactivate?(): void;
}

export interface PluginContext {
  editorState: VemEditorState;
  registerCommand(commandName: string, callback: () => void): void;
}

export class PluginRegistry {
  private plugins: Map<string, VemPlugin> = new Map();
  private commands: Map<string, () => void> = new Map();
  private editorState: VemEditorState;

  constructor(editorState: VemEditorState) {
    this.editorState = editorState;
  }

  public register(plugin: VemPlugin): void {
    const context: PluginContext = {
      editorState: this.editorState,
      registerCommand: (name, cb) => this.commands.set(name, cb),
    };

    plugin.activate(context);
    this.plugins.set(plugin.name, plugin);
    console.log(`Plugin [${plugin.name}] activated.`);
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
