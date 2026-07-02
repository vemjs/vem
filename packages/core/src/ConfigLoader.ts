import type { VemEditorState } from './editor';

export interface VemConfig {
  plugins?: any[];
  keybindings?: Array<{
    mode: any;
    keys: string;
    command: string;
  }>;
}

export class ConfigLoader {
  private editorState: VemEditorState;

  constructor(editorState: VemEditorState) {
    this.editorState = editorState;
  }

  public async loadConfigFromObject(config: VemConfig, registry: any): Promise<void> {
    if (config.keybindings) {
      for (const kb of config.keybindings) {
        this.editorState.registerKeybinding(kb.mode, kb.keys, kb.command);
      }
    }

    if (config.plugins) {
      for (const plugin of config.plugins) {
        registry.register(plugin);
      }
    }
  }

  public async loadConfigFromFile(configPath: string, registry: any): Promise<void> {
    try {
      const configModule = await import(configPath);
      const config: VemConfig = configModule.default || configModule;
      await this.loadConfigFromObject(config, registry);
      console.log(`Config loaded from [${configPath}].`);
    } catch (err) {
      console.error(`Failed to load config from [${configPath}]:`, err);
    }
  }
}
