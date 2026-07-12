import { describe, expect, it } from 'bun:test';
import { CommandBar } from './CommandBar';
import { VemEditorState } from '@vemjs/core';

describe('CommandBar', () => {
  it('flushes the input against the prefix character (no visible gap)', () => {
    const state = new VemEditorState('hello');
    const bar = new CommandBar(state, 400);
    const inner = bar as unknown as {
      prefixText: { width: number };
      input: { x: number };
    };
    // Input starts right after the prefix glyph, not at a fixed 15px offset
    // that left a gap for narrow ':'/'/' characters.
    expect(inner.input.x).toBeLessThan(6 + inner.prefixText.width + 4);
    expect(inner.input.x).toBeGreaterThan(6 + inner.prefixText.width - 1);
  });

  it('aligns the prefix glyph and the input text on the same baseline', () => {
    const state = new VemEditorState('hello');
    const bar = new CommandBar(state, 400);
    const inner = bar as unknown as {
      prefixText: { y: number };
      input: { y: number; height: number };
    };
    // Text draws its baseline at 0.8 * (default lineHeight 20); Input draws
    // its baseline at 0.66 * its own height. Different conventions, so this
    // asserts the two absolute baselines actually coincide.
    const prefixBaseline = inner.prefixText.y + 0.8 * 20;
    const inputBaseline = inner.input.y + inner.input.height * 0.66;
    expect(prefixBaseline).toBeCloseTo(inputBaseline, 1);
  });

  it('switches the prefix glyph between : and / from editor state', () => {
    const state = new VemEditorState('hello');
    const bar = new CommandBar(state, 400);
    const inner = bar as unknown as { prefixText: { text: string } };
    expect(inner.prefixText.text).toBe(':');

    state.handleKey('/');
    bar.syncFromState();
    expect(inner.prefixText.text).toBe('/');

    state.handleKey('Escape');
    bar.syncFromState();
    expect(inner.prefixText.text).toBe(':');
  });

  it('paints the command line with the editor bg, not the StatusLine highlight', () => {
    const state = new VemEditorState('hello');
    const bar = new CommandBar(state, 400);
    const calls: string[] = [];
    const stubRenderer = {
      beginPath() {},
      moveTo() {},
      lineTo() {},
      closePath() {},
      fill: (color: string) => calls.push(color),
    } as any;
    bar.render(stubRenderer);
    expect(calls).toContain(state.theme.bg);
    expect(calls).not.toContain(state.theme.statusBarBg);
  });
});
