import { UIComponent, PanelGroup, Panel } from '@vectojs/ui';
import type { Entity, IRenderer } from '@vectojs/core';
import { VemEditorState } from '@vemjs/core';
import { VemEditorEntity } from './VemEditorEntity';

export type PaneNode =
  | { type: 'leaf'; id: string; state: VemEditorState }
  | { type: 'split'; id: string; direction: 'horizontal' | 'vertical'; children: PaneNode[] };

export class EditorPane extends Panel {
  public editorState: VemEditorState;
  public editorEntity: VemEditorEntity;

  constructor(state: VemEditorState) {
    super();
    this.editorState = state;
    this.editorEntity = new VemEditorEntity(state);
    this.add(this.editorEntity);
  }

  public update(dt: number, time: number): void {
    super.update(dt, time);
    if (this.editorEntity.width !== this.width || this.editorEntity.height !== this.height) {
      this.editorEntity.width = this.width;
      this.editorEntity.height = this.height;
      this.editorEntity.updateFromState();
    }
  }
}

export class WorkspaceLayout extends UIComponent {
  private rootNode: PaneNode;
  private activePaneId: string;
  private layoutRoot: Entity | null = null;
  private paneMap = new Map<string, PaneNode>();
  private paneEntityMap = new Map<string, EditorPane>();

  constructor(width: number, height: number, initialText?: string) {
    super();
    this.width = width;
    this.height = height;

    const initialId = 'pane-1';
    const initialState = new VemEditorState(initialText);

    this.rootNode = {
      type: 'leaf',
      id: initialId,
      state: initialState,
    };

    this.activePaneId = initialId;
    this.paneMap.set(initialId, this.rootNode);

    this.bindStateEvents(initialId, initialState);
    this.rebuildLayout();
  }

  private bindStateEvents(id: string, state: VemEditorState): void {
    state.onSplit((dir) => {
      this.splitPane(id, dir);
    });
    state.onQuit(() => {
      this.closePane(id);
    });
  }

  public getActiveState(): VemEditorState | null {
    const pane = this.paneMap.get(this.activePaneId);
    if (pane && pane.type === 'leaf') {
      return pane.state;
    }
    return null;
  }

  public getActivePaneId(): string {
    return this.activePaneId;
  }

  /** Split the active pane — Vim's `:sp`/`:vsp`, or `:help`-style when `initialText` is given. */
  public splitActivePane(direction: 'horizontal' | 'vertical', initialText?: string): void {
    this.splitPane(this.activePaneId, direction, initialText);
  }

  public splitPane(
    paneId: string,
    direction: 'horizontal' | 'vertical',
    initialText?: string,
  ): void {
    const targetNode = this.paneMap.get(paneId);
    if (!targetNode || targetNode.type !== 'leaf') return;

    const newId = `pane-${Date.now()}`;
    const newState = new VemEditorState(initialText ?? targetNode.state.getBuffer().getText());

    // Inherit old state's custom keybindings
    const oldBindings = targetNode.state.getCustomKeybindings();
    for (const [mode, bindings] of oldBindings.entries()) {
      for (const [keys, cmd] of bindings.entries()) {
        newState.registerKeybinding(mode, keys, cmd);
      }
    }

    const newLeaf: PaneNode = {
      type: 'leaf',
      id: newId,
      state: newState,
    };

    this.paneMap.set(newId, newLeaf);
    this.bindStateEvents(newId, newState);

    const oldLeafCopy: PaneNode = { ...targetNode };
    this.paneMap.set(paneId, oldLeafCopy);

    // The wrapper needs an id distinct from paneId: paneId now identifies the
    // surviving leaf (oldLeafCopy), and reusing it here would leave a parent
    // and child sharing an id, corrupting findParentNode's tree lookups.
    const splitNode = targetNode as any;
    splitNode.id = `split-${Date.now()}`;
    splitNode.type = 'split';
    splitNode.direction = direction;
    splitNode.children = [oldLeafCopy, newLeaf];

    this.activePaneId = newId;
    this.rebuildLayout();
  }

  public closePane(paneId: string): void {
    if (this.rootNode.type === 'leaf') return;

    const parentNode = this.findParentNode(this.rootNode, paneId);
    if (!parentNode || parentNode.type !== 'split') return;

    const sibling = parentNode.children.find((c) => c.id !== paneId);
    if (!sibling) return;

    const grandparent = this.findParentNode(this.rootNode, parentNode.id);
    if (grandparent && grandparent.type === 'split') {
      const idx = grandparent.children.findIndex((c) => c.id === parentNode.id);
      grandparent.children[idx] = sibling;
    } else {
      this.rootNode = sibling;
    }

    this.paneMap.delete(paneId);

    const remainingLeaf = this.findFirstLeaf(this.rootNode);
    if (remainingLeaf) {
      this.activePaneId = remainingLeaf.id;
    }

    this.rebuildLayout();
  }

  private findParentNode(current: PaneNode, childId: string): PaneNode | null {
    if (current.type === 'leaf') return null;
    for (const child of current.children) {
      if (child.id === childId) {
        return current;
      }
      const parent = this.findParentNode(child, childId);
      if (parent) return parent;
    }
    return null;
  }

  private findFirstLeaf(current: PaneNode): PaneNode | null {
    if (current.type === 'leaf') return current;
    return this.findFirstLeaf(current.children[0]);
  }

  public rebuildLayout(): void {
    if (this.layoutRoot) {
      this.scene?.detachA11y(this.layoutRoot);
      this.remove(this.layoutRoot);
    }

    this.paneEntityMap.clear();
    this.layoutRoot = this.buildNode(this.rootNode);
    this.add(this.layoutRoot);
  }

  // Code paths that mutate a VemEditorState directly (e.g. the app-level
  // keydown handler, which looks up state via getActiveState() rather than
  // going through an entity's own event listeners) don't trigger a repaint
  // on their own: VemEditorEntity only recomputes its rendered spans when
  // explicitly told to. Call this after any such external mutation.
  public refreshActivePane(): void {
    const pane = this.paneEntityMap.get(this.activePaneId);
    pane?.editorEntity.updateFromState();
    this.scene?.markDirty();
  }

  private buildNode(node: PaneNode): Entity {
    if (node.type === 'leaf') {
      const pane = new EditorPane(node.state);
      pane.id = node.id;
      this.paneEntityMap.set(node.id, pane);
      return pane;
    } else {
      // Vim's split naming describes the divider, not the arrangement axis:
      // `:vsp` (vertical split -> a vertical divider) places panes side-by-side,
      // which is PanelGroup's 'horizontal' axis; `:sp` stacks panes top-to-bottom,
      // PanelGroup's 'vertical' axis. Invert to translate one naming into the other.
      const group = new PanelGroup({
        direction: node.direction === 'vertical' ? 'horizontal' : 'vertical',
        width: this.width,
        height: this.height,
      });

      for (const child of node.children) {
        const childEntity = this.buildNode(child);
        if (childEntity instanceof Panel) {
          group.addPanel(childEntity);
        } else {
          const p = new Panel();
          p.add(childEntity);
          group.addPanel(p);
        }
      }
      return group;
    }
  }

  public update(dt: number, time: number): void {
    super.update(dt, time);
    if (this.layoutRoot) {
      this.layoutRoot.width = this.width;
      this.layoutRoot.height = this.height;
    }
  }

  public render(_r: IRenderer): void {
    // Handled by children
  }
}
