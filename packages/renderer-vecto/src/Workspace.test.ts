import { describe, expect, it } from 'bun:test';
import { VemWorkspace } from './Workspace';
import { WorkspaceLayout } from './WorkspaceLayout';

describe('VemWorkspace', () => {
  it('should mount the new active tab content when adding a tab', () => {
    const workspace = new VemWorkspace(800, 600, 'one');
    const firstLayout = workspace.getActiveLayout();
    const detached: unknown[] = [];
    Object.defineProperty(workspace, 'scene', {
      configurable: true,
      value: {
        a11yNeedsReorder: false,
        markDirty() {},
        detachA11y(child: unknown) {
          detached.push(child);
        },
      },
    });

    workspace.addTab('two');

    const secondLayout = workspace.getActiveLayout();
    const tabs = (
      workspace as unknown as {
        tabsComponent: {
          value: string;
          children: unknown[];
        };
      }
    ).tabsComponent;

    expect(tabs.value).toBe('tab-2');
    expect(secondLayout).toBeDefined();
    expect(secondLayout).not.toBe(firstLayout);
    expect(tabs.children).toContain(secondLayout);
    expect(tabs.children).not.toContain(firstLayout);
    expect(detached).toEqual([firstLayout]);
  });

  it('should resize every layout on update so panes track the hosting panel width', () => {
    const workspace = new VemWorkspace(800, 600, 'one');
    workspace.addTab('two');

    // Simulate the hosting Panel handing down a narrower size (e.g. after
    // PanelGroup reserves divider space) — previously layouts kept their
    // construction width and escaped the panel's clip bounds.
    workspace.width = 788.8;
    workspace.height = 500;
    workspace.update(16, 0);

    const layouts = (workspace as unknown as { layouts: WorkspaceLayout[] }).layouts;
    expect(layouts.length).toBe(2);
    for (const layout of layouts) {
      expect(layout.width).toBe(788.8);
      expect(layout.height).toBe(470);
    }
  });
});

describe('WorkspaceLayout', () => {
  it('should detach old VectoJS a11y nodes when rebuilding split layout', () => {
    const layout = new WorkspaceLayout(800, 600, 'one');
    const oldRoot = layout.children[0];
    const detached: unknown[] = [];
    Object.defineProperty(layout, 'scene', {
      configurable: true,
      value: {
        a11yNeedsReorder: false,
        markDirty() {},
        detachA11y(child: unknown) {
          detached.push(child);
        },
      },
    });

    layout.splitPane('pane-1', 'vertical');

    expect(detached).toEqual([oldRoot]);
    expect(layout.children).not.toContain(oldRoot);
    expect(layout.children.length).toBe(1);
  });

  it('should keep the surviving pane responsive to input after closing a split', () => {
    const layout = new WorkspaceLayout(800, 600, 'one');
    Object.defineProperty(layout, 'scene', {
      configurable: true,
      value: { a11yNeedsReorder: false, markDirty() {}, detachA11y() {} },
    });

    const originalState = layout.getActiveState();
    expect(originalState).not.toBeNull();

    layout.splitPane('pane-1', 'vertical');
    const newState = layout.getActiveState();
    expect(newState).not.toBeNull();
    expect(newState).not.toBe(originalState);

    // Simulate ':q' on the newly created pane, closing it.
    newState!.setMode('COMMAND');
    newState!.setCommandText('q');
    newState!.handleKey('Enter');

    expect(layout.getActiveState()).toBe(originalState);
  });

  it('should lay out :vsp panes side-by-side (vim vertical split)', () => {
    const layout = new WorkspaceLayout(800, 600, 'one');
    Object.defineProperty(layout, 'scene', {
      configurable: true,
      value: { a11yNeedsReorder: false, markDirty() {}, detachA11y() {} },
    });

    layout.splitPane('pane-1', 'vertical');

    const group = layout.children[0] as unknown as { direction: 'horizontal' | 'vertical' };
    expect(group.direction).toBe('horizontal');
  });

  it('should lay out :sp panes stacked top-to-bottom (vim horizontal split)', () => {
    const layout = new WorkspaceLayout(800, 600, 'one');
    Object.defineProperty(layout, 'scene', {
      configurable: true,
      value: { a11yNeedsReorder: false, markDirty() {}, detachA11y() {} },
    });

    layout.splitPane('pane-1', 'horizontal');

    const group = layout.children[0] as unknown as { direction: 'horizontal' | 'vertical' };
    expect(group.direction).toBe('vertical');
  });

  it('should re-render the active pane after an externally driven state mutation', () => {
    const layout = new WorkspaceLayout(800, 600, 'one');
    let dirty = false;
    Object.defineProperty(layout, 'scene', {
      configurable: true,
      value: {
        a11yNeedsReorder: false,
        markDirty() {
          dirty = true;
        },
        detachA11y() {},
      },
    });

    const state = layout.getActiveState()!;
    let updateFromStateCalls = 0;
    const pane = layout.children[0] as unknown as {
      editorEntity: { updateFromState: () => void };
    };
    const originalUpdateFromState = pane.editorEntity.updateFromState.bind(pane.editorEntity);
    pane.editorEntity.updateFromState = () => {
      updateFromStateCalls++;
      originalUpdateFromState();
    };

    // Simulates the app-level keydown handler (main.ts), which mutates the
    // active state directly rather than going through the entity's own
    // 'keydown' listener (which calls updateFromState() itself).
    state.setMode('INSERT');
    state.handleKey('x');
    layout.refreshActivePane();

    expect(updateFromStateCalls).toBeGreaterThan(0);
    expect(dirty).toBe(true);
  });
});
