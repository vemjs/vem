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
      // Vim's showtabline=1: a lone buffer renders full-bleed (fresh start
      // shows only the intro splash, like `vim` with no arguments); the tab
      // bar appears once a second buffer opens.
      autoHideTabBar: true,
      tabs: this.buffers.map((b) => ({ id: b.id, label: b.label, content: b.layout })),
      value: first.id,
      onClose: (id: string) => this.closeTab(id),
    });

    this.add(this.tabsComponent);
  }

  private makeBuffer(text: string, label: string): BufferEntry {
    this.seq += 1;
    const id = `buf-${this.seq}`;
    // During construction the Tabs component doesn't exist yet — the first
    // buffer is alone, so its bar is hidden (height 0). update() re-syncs
    // every frame afterwards.
    const barH = this.tabsComponent?.effectiveTabBarHeight ?? 0;
    const layout = new WorkspaceLayout(this.width, this.height - barH, text);
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
    if (label !== 'untitled') {
      const existing = this.buffers.find((b) => b.label === label);
      if (existing) {
        this.syncTabs(existing.id);
        return existing.id;
      }
    }
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
      // Reset first so the workspace stays valid either way; a desktop host
      // that quits on last-close (Vim's own `:q` exit) never renders it.
      const fresh = this.makeBuffer('', 'untitled');
      this.syncTabs(fresh.id);
      this.lastTabCloseCallback?.();
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

  /**
   * Notify when the LAST tab was closed (the workspace has already reset
   * itself to a fresh untitled buffer). The web build ignores this — a
   * browser tab can't quit — while the desktop build exits the app,
   * matching Vim's `:q` on the final window.
   */
  public onLastTabClose(callback: () => void): void {
    this.lastTabCloseCallback = callback;
  }

  private lastTabCloseCallback: (() => void) | null = null;

  public getActiveLayout(): WorkspaceLayout | null {
    const active = this.buffers.find((b) => b.id === this.tabsComponent.value);
    return active?.layout ?? null;
  }

  /** The id of the active tab, for associating a file handle with it. */
  public getActiveBufferId(): string {
    return this.tabsComponent.value;
  }

  /**
   * True when the active buffer is untouched (Vim's own intro-splash
   * condition: unmodified, empty, single line) — safe for a caller like
   * "open file" to replace in place instead of stacking a new tab next to
   * an empty "untitled" one nobody asked to keep.
   */
  public isActiveBufferPristine(): boolean {
    return this.getActiveLayout()?.getActiveState()?.shouldShowIntro() ?? false;
  }

  /**
   * Snapshot every buffer's label, text, and whether it's the active tab —
   * for a caller to persist across reloads (e.g. `localStorage` on the web
   * build, which has no backing filesystem to reopen from). Only the active
   * pane's text is captured per buffer; a split layout collapses back to a
   * single pane on restore, since split state is ephemeral UI, not content.
   */
  public getBuffersSnapshot(): { label: string; text: string; active: boolean }[] {
    return this.buffers.map((b) => ({
      label: b.label,
      text: b.layout.getActiveState()?.getText() ?? '',
      active: b.id === this.tabsComponent.value,
    }));
  }

  /**
   * Replace all buffers with a previously captured snapshot. No-op on an
   * empty snapshot — callers should fall back to the default empty buffer
   * rather than leave the workspace with zero tabs.
   */
  public restoreBuffersSnapshot(
    snapshot: { label: string; text: string; active: boolean }[],
  ): void {
    if (snapshot.length === 0) return;
    const existing = [...this.buffers];
    let activeId: string | undefined;
    for (const entry of snapshot) {
      const id = this.openBuffer(entry.text, entry.label);
      if (entry.active) activeId = id;
    }
    for (const b of existing) {
      this.tabsComponent.remove(b.layout);
    }
    this.buffers = this.buffers.filter((b) => !existing.includes(b));
    this.syncTabs(activeId ?? this.buffers[0]?.id);
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
    // The bar height is dynamic (autoHideTabBar): 0 with a single buffer,
    // TAB_BAR_HEIGHT once a second one opens.
    const barH = this.tabsComponent.effectiveTabBarHeight;
    for (const b of this.buffers) {
      b.layout.width = this.width;
      b.layout.height = this.height - barH;
    }
  }

  public render(_r: IRenderer): void {
    // Handled by tabsComponent
  }
}
