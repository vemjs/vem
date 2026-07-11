import { UIComponent, Tabs } from '@vectojs/ui';
import type { IRenderer } from '@vectojs/core';
import { WorkspaceLayout } from './WorkspaceLayout';

interface BufferEntry {
  id: string;
  label: string;
  layout: WorkspaceLayout;
}

const TAB_BAR_HEIGHT = 30;

/**
 * A tabbed set of editor buffers. Each tab owns a {@link WorkspaceLayout}
 * (which may itself be split into panes). Tabs carry stable ids — not
 * array indices — so closing a middle tab never renumbers the survivors.
 */
export class VemWorkspace extends UIComponent {
  private tabsComponent: Tabs;
  private buffers: BufferEntry[] = [];
  private seq = 0;

  constructor(width: number, height: number, initialText?: string) {
    super();
    this.width = width;
    this.height = height;

    const first = this.makeBuffer(initialText || '', 'untitled');

    this.tabsComponent = new Tabs({
      width: this.width,
      height: this.height,
      tabHeight: TAB_BAR_HEIGHT,
      tabWidth: 150,
      minTabWidth: 92,
      closable: true,
      tabs: this.buffers.map((b) => ({ id: b.id, label: b.label, content: b.layout })),
      value: first.id,
      onClose: (id: string) => this.closeTab(id),
    });

    this.add(this.tabsComponent);
  }

  private makeBuffer(text: string, label: string): BufferEntry {
    this.seq += 1;
    const id = `buf-${this.seq}`;
    const layout = new WorkspaceLayout(this.width, this.height - TAB_BAR_HEIGHT, text);
    // `:q` on this layout's last pane closes the whole tab.
    layout.onLastPaneClose(() => this.closeTab(id));
    const entry: BufferEntry = { id, label, layout };
    this.buffers.push(entry);
    return entry;
  }

  private syncTabs(activeId?: string): void {
    this.tabsComponent.tabs = this.buffers.map((b) => ({
      id: b.id,
      label: b.label,
      content: b.layout,
    }));
    if (activeId) this.tabsComponent.emit('change', { value: activeId });
    this.scene?.markDirty();
  }

  /**
   * Open a new buffer in its own tab and focus it. Returns the stable tab id
   * so the caller can associate it with a file handle for save-back.
   */
  public openBuffer(text: string, label = 'untitled'): string {
    const entry = this.makeBuffer(text, label);
    this.syncTabs(entry.id);
    return entry.id;
  }

  /** Back-compat alias for {@link openBuffer}. */
  public addTab(initialText?: string): void {
    this.openBuffer(initialText || '', 'untitled');
  }

  /**
   * Close a tab by id. The last remaining tab is never destroyed — it is
   * reset to an empty untitled buffer instead, so the editor always has a
   * live pane (matching how Vim keeps one window open).
   */
  public closeTab(id: string): void {
    const idx = this.buffers.findIndex((b) => b.id === id);
    if (idx === -1) return;
    const [removed] = this.buffers.splice(idx, 1);
    // Tabs only manages content for tabs still in its list — a closed tab's
    // layout would linger as a hidden child. remove() also detaches its a11y
    // subtree (@vectojs/core >= 1.2 does that automatically on removal).
    this.tabsComponent.remove(removed.layout);

    if (this.buffers.length === 0) {
      const fresh = this.makeBuffer('', 'untitled');
      this.syncTabs(fresh.id);
      return;
    }

    const wasActive = this.tabsComponent.value === id;
    if (wasActive) {
      const neighbor = this.buffers[Math.min(idx, this.buffers.length - 1)];
      this.syncTabs(neighbor.id);
    } else {
      this.syncTabs();
    }
  }

  /** Close the currently active tab (e.g. from `:q` when a pane is not split). */
  public closeActiveTab(): void {
    this.closeTab(this.tabsComponent.value);
  }

  public getActiveLayout(): WorkspaceLayout | null {
    const active = this.buffers.find((b) => b.id === this.tabsComponent.value);
    return active?.layout ?? null;
  }

  /** The id of the active tab, for associating a file handle with it. */
  public getActiveBufferId(): string {
    return this.tabsComponent.value;
  }

  /**
   * Focus a tab by its stable id (e.g. a caller that opened several buffers
   * in sequence — each open leaves the newest one active — needs to return
   * to an earlier one, such as Vim's `+<lnum>` applying to the first file
   * argument regardless of how many were opened after it).
   */
  public switchToBuffer(id: string): void {
    if (!this.buffers.some((b) => b.id === id)) return;
    this.syncTabs(id);
  }

  /** Rename a tab (e.g. after saving an untitled buffer to a path). */
  public setTabLabel(id: string, label: string): void {
    const entry = this.buffers.find((b) => b.id === id);
    if (entry && entry.label !== label) {
      entry.label = label;
      this.syncTabs();
    }
  }

  public update(dt: number, time: number): void {
    super.update(dt, time);
    this.tabsComponent.width = this.width;
    this.tabsComponent.height = this.height;
    // Tabs does not size its content entities; without this sync every layout
    // keeps its construction width and escapes the surrounding Panel clip
    // whenever PanelGroup reserves divider space (observed as a 3.2px bleed).
    for (const b of this.buffers) {
      b.layout.width = this.width;
      b.layout.height = this.height - TAB_BAR_HEIGHT;
    }
  }

  public render(_r: IRenderer): void {
    // Handled by tabsComponent
  }
}
