import { afterEach, describe, expect, it } from 'bun:test';
import { VemEditorState } from './editor';
import { ConfigLoader } from './ConfigLoader';

describe('ConfigLoader.loadConfigFromObject', () => {
  afterEach(() => {
    VemEditorState.resetDefaults();
  });

  it('applies theme/layout to the passed state immediately', async () => {
    const state = new VemEditorState('x');
    const loader = new ConfigLoader(state);
    await loader.loadConfigFromObject(
      { layout: { lineNumbers: 'absolute' } },
      { register: () => {} },
    );
    expect(state.layoutConfig.lineNumbers).toBe('absolute');
  });

  it('a vemrc-loaded layout/theme also becomes the default for buffers opened afterwards', async () => {
    const state = new VemEditorState('x');
    const loader = new ConfigLoader(state);
    await loader.loadConfigFromObject(
      { layout: { lineNumbers: 'absolute' }, theme: { accent: '#ff00ff' } },
      { register: () => {} },
    );

    // A brand-new buffer (fresh tab, split, or CLI-opened file) never saw
    // `state` — it must still inherit the global config, not vem's built-in
    // defaults, or a vemrc silently stops applying the moment you open a
    // second file.
    const laterBuffer = new VemEditorState('later, unrelated buffer');
    expect(laterBuffer.layoutConfig.lineNumbers).toBe('absolute');
    expect(laterBuffer.theme.accent).toBe('#ff00ff');
  });
});
