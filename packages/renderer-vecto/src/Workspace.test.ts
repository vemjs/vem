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
});
