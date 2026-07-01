import { VemEditorState } from '@vemjs/core';

export class VectoRenderer {
  private editorState: VemEditorState;
  private canvas: HTMLCanvasElement | null = null;

  constructor(editorState: VemEditorState) {
    this.editorState = editorState;
    console.log('VectoRenderer initialized with editor state.');
  }

  public attach(canvas: HTMLCanvasElement): void {
    this.canvas = canvas;
    console.log('Attached VectoRenderer to Canvas element.');
    this.render();
  }

  public render(): void {
    if (!this.canvas) return;
    const mode = this.editorState.getMode();
    const cursor = this.editorState.getCursor();

    console.log(
      `[VectoUI Render] Mode: ${mode}, Cursor: Line ${cursor.line} Char ${cursor.character}`,
    );
    // Future VectoUI drawing code:
    // const ctx = this.canvas.getContext('2d');
    // ctx.fillText(mode, ...);
  }
}
