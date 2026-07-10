import { Scene } from '@vectojs/core';
import type { VemEditorState } from '@vemjs/core';
import { VemEditorEntity } from './VemEditorEntity';

export { VemEditorEntity } from './VemEditorEntity';
export { CommandBar } from './CommandBar';
export { WorkspaceLayout, EditorPane, type PaneNode } from './WorkspaceLayout';
export { VemWorkspace } from './Workspace';
export { WorkspaceExplorer } from './WorkspaceExplorer';

export class VectoRenderer {
  private editorState: VemEditorState;
  private scene: Scene | null = null;
  private editorEntity: VemEditorEntity | null = null;

  constructor(editorState: VemEditorState) {
    this.editorState = editorState;
  }

  public attach(canvas: HTMLCanvasElement): void {
    this.dispose();

    this.scene = new Scene(canvas, { disableWindowResize: true });
    this.editorEntity = new VemEditorEntity(this.editorState);
    this.scene.add(this.editorEntity);
    this.scene.start();

    // Listen to changes in the editor state to update rendering properties
    this.editorState.onChange(() => {
      if (this.editorEntity) {
        this.editorEntity.updateFromState();
      }

      if (this.editorState.getMode() === 'COMMAND') {
        setTimeout(() => {
          const inputEl = this.scene?.getA11yElement('vem-command-input');
          if (inputEl) {
            (inputEl as HTMLElement).focus();
          }
        }, 10);
      }
    });
  }

  public render(): void {
    if (this.editorEntity) {
      this.editorEntity.updateFromState();
    }
  }

  public dispose(): void {
    this.scene?.destroy();
    this.scene = null;
    this.editorEntity = null;
  }
}
