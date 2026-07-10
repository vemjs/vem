import { afterEach, describe, expect, it } from 'bun:test';
import { VemEditorState } from '@vemjs/core';
import { VectoRenderer } from './index';

describe('VectoRenderer lifecycle', () => {
  afterEach(() => {
    delete (globalThis as unknown as { window?: unknown }).window;
    delete (globalThis as unknown as { HTMLInputElement?: unknown }).HTMLInputElement;
    delete (globalThis as unknown as { HTMLTextAreaElement?: unknown }).HTMLTextAreaElement;
  });

  it('should destroy the active VectoJS scene and clear renderer state on dispose', () => {
    const renderer = new VectoRenderer(new VemEditorState('hello'));
    let destroyed = false;

    Object.defineProperty(renderer, 'scene', {
      configurable: true,
      value: {
        destroy() {
          destroyed = true;
        },
      },
    });
    Object.defineProperty(renderer, 'editorEntity', {
      configurable: true,
      value: {},
    });

    renderer.dispose();

    expect(destroyed).toBe(true);
    expect((renderer as unknown as { scene: unknown }).scene).toBeNull();
    expect((renderer as unknown as { editorEntity: unknown }).editorEntity).toBeNull();
  });

  it('should size the VectoJS scene from the attached canvas instead of the viewport', () => {
    class HTMLInputElementStub {
      public readonly testTag = 'input';
    }
    class HTMLTextAreaElementStub {
      public readonly testTag = 'textarea';
    }
    (globalThis as unknown as { HTMLInputElement: unknown }).HTMLInputElement =
      HTMLInputElementStub;
    (globalThis as unknown as { HTMLTextAreaElement: unknown }).HTMLTextAreaElement =
      HTMLTextAreaElementStub;
    (globalThis as unknown as { window: unknown }).window = {
      innerWidth: 1920,
      innerHeight: 1080,
      addEventListener() {},
      removeEventListener() {},
      matchMedia: () => ({ matches: false }),
      devicePixelRatio: 1,
    };

    const canvas = {
      width: 320,
      height: 240,
      clientWidth: 320,
      clientHeight: 240,
      addEventListener() {},
      removeEventListener() {},
      getContext: () => ({
        canvas: { width: 320, height: 240, style: {} },
        scale() {},
      }),
    } as unknown as HTMLCanvasElement;

    const renderer = new VectoRenderer(new VemEditorState('hello'));
    renderer.attach(canvas);

    const scene = (renderer as unknown as { scene: { width: number; height: number } }).scene;
    expect(scene.width).toBe(320);
    expect(scene.height).toBe(240);

    renderer.dispose();
  });
});
