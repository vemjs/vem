import { describe, expect, it } from 'bun:test';
import { WorkspaceLayout } from './WorkspaceLayout';

describe('WorkspaceLayout active-pane cursor ownership', () => {
  it('marks exactly one pane active after a split, with no click needed', () => {
    const layout = new WorkspaceLayout(800, 600, 'one');
    const firstPaneId = layout.getActivePaneId();

    layout.splitPane(firstPaneId, 'horizontal', 'help text');
    const secondPaneId = layout.getActivePaneId();
    expect(secondPaneId).not.toBe(firstPaneId);

    const inner = layout as unknown as {
      paneEntityMap: Map<string, { editorEntity: { isActivePane: boolean } }>;
    };
    const activeFlags = [...inner.paneEntityMap.entries()].map(
      ([id, pane]) => [id, pane.editorEntity.isActivePane] as const,
    );
    // The new split (Vim's ":help"/":sp") becomes current immediately.
    expect(activeFlags).toContainEqual([secondPaneId, true]);
    expect(activeFlags).toContainEqual([firstPaneId, false]);
    expect(activeFlags.filter(([, active]) => active)).toHaveLength(1);
  });

  it('clicking a pane makes it the current window (keyboard routing follows)', () => {
    const layout = new WorkspaceLayout(800, 600, 'one');
    const firstPaneId = layout.getActivePaneId();
    layout.splitPane(firstPaneId, 'horizontal', 'two');
    const secondPaneId = layout.getActivePaneId();
    expect(layout.getActiveState()).toBe((layout as any).paneMap.get(secondPaneId).state);

    const inner = layout as unknown as {
      paneEntityMap: Map<string, { editorEntity: { isActivePane: boolean } }>;
    };
    const firstEntity = inner.paneEntityMap.get(firstPaneId)!.editorEntity as any;
    firstEntity.onActivate();

    expect(layout.getActivePaneId()).toBe(firstPaneId);
    expect(layout.getActiveState()).toBe((layout as any).paneMap.get(firstPaneId).state);
    expect(firstEntity.isActivePane).toBe(true);
    expect(inner.paneEntityMap.get(secondPaneId)!.editorEntity.isActivePane).toBe(false);
  });
});

describe('WorkspaceLayout re-layout on box changes', () => {
  it('redistributes split panes when the layout box shrinks (sidebar toggle / window resize)', () => {
    const layout = new WorkspaceLayout(800, 600, 'one');
    // `:vsp` — side-by-side panes (PaneNode 'vertical' divider).
    layout.splitPane(layout.getActivePaneId(), 'vertical', 'two');
    layout.update(16, 16);

    // The Explorer opening (or a window resize) shrinks the layout box. The
    // root PanelGroup must redistribute — a bare width/height write leaves
    // both panes at their stale sizes, overflowing the box off-screen.
    layout.width = 500;
    layout.height = 400;
    layout.update(16, 32);

    const panes = [
      ...(
        layout as unknown as {
          paneEntityMap: Map<string, { width: number; height: number }>;
        }
      ).paneEntityMap.values(),
    ];
    expect(panes.length).toBe(2);
    const totalWidth = panes.reduce((sum, p) => sum + p.width, 0);
    expect(totalWidth).toBeLessThanOrEqual(500);
    for (const pane of panes) expect(pane.height).toBe(400);
  });
});
