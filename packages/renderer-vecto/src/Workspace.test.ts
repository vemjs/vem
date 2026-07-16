import { describe, expect, it } from 'bun:test';
import { VemWorkspace } from './Workspace';
import { WorkspaceLayout } from './WorkspaceLayout';

describe('VemWorkspace', () => {
  const stubScene = (workspace: VemWorkspace, detached?: unknown[]) => {
    Object.defineProperty(workspace, 'scene', {
      configurable: true,
      value: {
        a11yNeedsReorder: false,
        markDirty() {},
        detachA11y(child: unknown) {
          detached?.push(child);
        },
      },
    });
  };

  it('mounts the new active buffer content when opening a tab', () => {
    const workspace = new VemWorkspace(800, 600, 'one');
    const firstLayout = workspace.getActiveLayout();
    const detached: unknown[] = [];
    stubScene(workspace, detached);

    const id = workspace.openBuffer('two', 'two.ts');

    const secondLayout = workspace.getActiveLayout();
    const tabs = (workspace as unknown as { tabsComponent: { value: string; children: unknown[] } })
      .tabsComponent;

    expect(tabs.value).toBe(id);
    expect(secondLayout).not.toBe(firstLayout);
    expect(tabs.children).toContain(secondLayout);
    expect(tabs.children).not.toContain(firstLayout);
    expect(detached).toEqual([firstLayout]);
  });

  it('uses stable ids so closing a middle tab does not renumber survivors', () => {
    const workspace = new VemWorkspace(800, 600, 'one');
    stubScene(workspace);
    const a = workspace.getActiveBufferId();
    const b = workspace.openBuffer('two', 'b');
    const c = workspace.openBuffer('three', 'c');

    workspace.closeTab(b);

    const buffers = (workspace as unknown as { buffers: { id: string }[] }).buffers;
    expect(buffers.map((x) => x.id)).toEqual([a, c]);
    // c is still selectable and mounts its own layout
    expect(workspace.getActiveBufferId()).toBe(c);
  });

  it('never destroys the last tab — resets it to an empty untitled buffer', () => {
    const workspace = new VemWorkspace(800, 600, 'only');
    stubScene(workspace);
    const only = workspace.getActiveBufferId();

    workspace.closeTab(only);

    const buffers = (workspace as unknown as { buffers: { id: string }[] }).buffers;
    expect(buffers.length).toBe(1);
    expect(buffers[0].id).not.toBe(only);
    expect(workspace.getActiveLayout()?.getActiveState()?.getText()).toBe('');
  });

  it('hides the tab bar for a lone buffer and shows it from the second one (showtabline=1)', () => {
    const workspace = new VemWorkspace(800, 600, '');
    stubScene(workspace);
    const tabs = (
      workspace as unknown as {
        tabsComponent: { effectiveTabBarHeight: number; update(dt: number, t: number): void };
      }
    ).tabsComponent;

    // Fresh start = vim with no arguments: no tab bar, full-height buffer.
    workspace.update(16, 0);
    expect(tabs.effectiveTabBarHeight).toBe(0);
    expect(workspace.getActiveLayout()?.height).toBe(600);

    // A second buffer brings the bar back and shrinks the layouts under it.
    workspace.openBuffer('two', 'two.ts');
    workspace.update(16, 0);
    expect(tabs.effectiveTabBarHeight).toBe(30);
    expect(workspace.getActiveLayout()?.height).toBe(570);

    // Closing back down to one hides it again (last-tab reset included).
    workspace.closeActiveTab();
    workspace.update(16, 0);
    expect(tabs.effectiveTabBarHeight).toBe(0);
    expect(workspace.getActiveLayout()?.height).toBe(600);
  });

  it('resizes every layout on update so panes track the hosting panel width', () => {
    const workspace = new VemWorkspace(800, 600, 'one');
    stubScene(workspace);
    workspace.openBuffer('two', 'two');

    workspace.width = 788.8;
    workspace.height = 500;
    workspace.update(16, 0);

    const buffers = (workspace as unknown as { buffers: { layout: WorkspaceLayout }[] }).buffers;
    expect(buffers.length).toBe(2);
    for (const b of buffers) {
      expect(b.layout.width).toBe(788.8);
      expect(b.layout.height).toBe(470);
    }
  });

  it('closes the tab when :q is issued on an unsplit layout', () => {
    const workspace = new VemWorkspace(800, 600, 'one');
    stubScene(workspace);
    const a = workspace.getActiveBufferId();
    workspace.openBuffer('two', 'two');
    const state = workspace.getActiveLayout()!.getActiveState()!;

    // :q on the last (unsplit) pane bubbles up to close the tab.
    state.handleKey(':');
    state.setCommandText('q');
    state.handleKey('Enter');

    const buffers = (workspace as unknown as { buffers: { id: string }[] }).buffers;
    expect(buffers.length).toBe(1);
    expect(buffers[0].id).toBe(a);
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

describe('WorkspaceExplorer resize propagation', () => {
  it('redistributes panels and workspace when width/height change after construction', async () => {
    const { WorkspaceExplorer } = await import('./WorkspaceExplorer');
    const explorer = new WorkspaceExplorer(1600, 1000, 'hello');
    explorer.update(0, 0);

    const inner = explorer as unknown as {
      panelGroup: { width: number; height: number };
      rightPanel: { width: number };
      workspace: { width: number; height: number };
    };
    const staleRight = inner.rightPanel.width;

    explorer.width = 2000;
    explorer.height = 1150;
    explorer.update(0, 0);
    explorer.update(0, 0); // second pass: workspace syncs to the re-laid-out panel

    expect(inner.panelGroup.width).toBe(2000);
    expect(inner.panelGroup.height).toBe(1150);
    // The panel the workspace lives in must grow with the group — a bare
    // width write on PanelGroup never redistributed the panel sizes, so the
    // editor froze at its construction size (visible as an empty bottom-right
    // band whenever the real viewport was larger).
    expect(inner.rightPanel.width).toBeGreaterThan(staleRight);
    expect(inner.workspace.width).toBe(inner.rightPanel.width);
    expect(inner.workspace.height).toBe(1150);
  });
});

describe('VemWorkspace.switchToBuffer', () => {
  const stubScene = (workspace: VemWorkspace) => {
    Object.defineProperty(workspace, 'scene', {
      configurable: true,
      value: { a11yNeedsReorder: false, markDirty() {}, detachA11y() {} },
    });
  };

  it('focuses an earlier buffer after later ones were opened', () => {
    const workspace = new VemWorkspace(800, 600, 'one');
    stubScene(workspace);
    const first = workspace.getActiveBufferId();
    workspace.openBuffer('two', 'b');
    workspace.openBuffer('three', 'c');
    expect(workspace.getActiveBufferId()).not.toBe(first);

    workspace.switchToBuffer(first);
    expect(workspace.getActiveBufferId()).toBe(first);
    expect(workspace.getActiveLayout()).not.toBeNull();
  });

  it('ignores an unknown id rather than clearing the active tab', () => {
    const workspace = new VemWorkspace(800, 600, 'one');
    stubScene(workspace);
    const first = workspace.getActiveBufferId();
    workspace.switchToBuffer('not-a-real-id');
    expect(workspace.getActiveBufferId()).toBe(first);
  });
});

describe('VemWorkspace buffer snapshot/restore', () => {
  const stubScene = (workspace: VemWorkspace) => {
    Object.defineProperty(workspace, 'scene', {
      configurable: true,
      value: { a11yNeedsReorder: false, markDirty() {}, detachA11y() {} },
    });
  };

  it('snapshots every buffer with the active one flagged', () => {
    const workspace = new VemWorkspace(800, 600, 'one');
    stubScene(workspace);
    workspace.openBuffer('two', 'b.ts');

    const snapshot = workspace.getBuffersSnapshot();
    expect(snapshot).toEqual([
      { label: 'untitled', text: 'one', active: false },
      { label: 'b.ts', text: 'two', active: true },
    ]);
  });

  it('restores a snapshot, replacing the default empty buffer', () => {
    const workspace = new VemWorkspace(800, 600, '');
    stubScene(workspace);

    workspace.restoreBuffersSnapshot([
      { label: 'a.ts', text: 'alpha', active: false },
      { label: 'b.ts', text: 'beta', active: true },
    ]);

    const buffers = (workspace as unknown as { buffers: { label: string }[] }).buffers;
    expect(buffers.map((b) => b.label)).toEqual(['a.ts', 'b.ts']);
    expect(workspace.getActiveLayout()?.getActiveState()?.getText()).toBe('beta');
  });

  it('does nothing on an empty snapshot', () => {
    const workspace = new VemWorkspace(800, 600, 'one');
    stubScene(workspace);

    workspace.restoreBuffersSnapshot([]);

    expect(workspace.getActiveLayout()?.getActiveState()?.getText()).toBe('one');
  });
});

describe('VemWorkspace.isActiveBufferPristine', () => {
  const stubScene = (workspace: VemWorkspace) => {
    Object.defineProperty(workspace, 'scene', {
      configurable: true,
      value: { a11yNeedsReorder: false, markDirty() {}, detachA11y() {} },
    });
  };

  it('is true for a fresh empty buffer', () => {
    const workspace = new VemWorkspace(800, 600, '');
    stubScene(workspace);
    expect(workspace.isActiveBufferPristine()).toBe(true);
  });

  it('is false once the buffer has been typed into', () => {
    const workspace = new VemWorkspace(800, 600, '');
    stubScene(workspace);
    workspace.getActiveLayout()!.getActiveState()!.handleKey('i');
    workspace.getActiveLayout()!.getActiveState()!.handleKey('x');
    expect(workspace.isActiveBufferPristine()).toBe(false);
  });

  it('is false for a buffer opened with content', () => {
    const workspace = new VemWorkspace(800, 600, 'hello');
    stubScene(workspace);
    expect(workspace.isActiveBufferPristine()).toBe(false);
  });
});

describe('WorkspaceExplorer.openFileBuffer replacing a pristine tab', () => {
  it('replaces an untouched untitled buffer instead of stacking a new tab', async () => {
    const { WorkspaceExplorer } = await import('./WorkspaceExplorer');
    const explorer = new WorkspaceExplorer(800, 600, '');
    const workspace = explorer.getWorkspace();
    Object.defineProperty(workspace, 'scene', {
      configurable: true,
      value: { a11yNeedsReorder: false, markDirty() {}, detachA11y() {} },
    });

    const pristineId = workspace.getActiveBufferId();
    explorer.openFileBuffer('const x = 1;', 'a.ts');

    const buffers = (workspace as unknown as { buffers: { id: string; label: string }[] }).buffers;
    expect(buffers.length).toBe(1);
    expect(buffers.map((b) => b.label)).toEqual(['a.ts']);
    expect(buffers[0].id).not.toBe(pristineId);
  });

  it('opens a second file in a new tab once the first has real content', async () => {
    const { WorkspaceExplorer } = await import('./WorkspaceExplorer');
    const explorer = new WorkspaceExplorer(800, 600, '');
    const workspace = explorer.getWorkspace();
    Object.defineProperty(workspace, 'scene', {
      configurable: true,
      value: { a11yNeedsReorder: false, markDirty() {}, detachA11y() {} },
    });

    explorer.openFileBuffer('const x = 1;', 'a.ts');
    explorer.openFileBuffer('const y = 2;', 'b.ts');

    const buffers = (workspace as unknown as { buffers: { label: string }[] }).buffers;
    expect(buffers.map((b) => b.label)).toEqual(['a.ts', 'b.ts']);
  });
});

describe('WorkspaceExplorer.closeWorkspace', () => {
  it('is a no-op when no folder is open', async () => {
    const { WorkspaceExplorer } = await import('./WorkspaceExplorer');
    const explorer = new WorkspaceExplorer(800, 600, '');
    // Should not throw with no treeView to close.
    explorer.closeWorkspace();
  });

  it('restores the Dir/File buttons and drops the file-tree once a folder is open', async () => {
    const { WorkspaceExplorer } = await import('./WorkspaceExplorer');
    const explorer = new WorkspaceExplorer(800, 600, '');
    Object.defineProperty(explorer, 'scene', {
      configurable: true,
      value: { a11yNeedsReorder: false, markDirty() {}, detachA11y() {} },
    });

    const inner = explorer as unknown as {
      treeView: unknown;
      leftPanel: { children: unknown[] };
      openBtn: unknown;
      openFileBtn: unknown;
      closeWorkspaceBtn: unknown;
    };

    explorer.openDirectory({
      nodes: [{ id: 'a.ts', label: 'a.ts' }],
      readFile: async () => 'const x = 1;',
    });
    const tree = inner.treeView;
    expect(tree).not.toBeNull();
    expect(explorer.getOpenDirectory()).not.toBeNull();

    explorer.closeWorkspace();

    expect(inner.treeView).toBeNull();
    expect(inner.leftPanel.children).toContain(inner.openBtn);
    expect(inner.leftPanel.children).toContain(inner.openFileBtn);
    expect(inner.leftPanel.children).not.toContain(tree);
    expect(inner.leftPanel.children).not.toContain(inner.closeWorkspaceBtn);
    // The old folder's I/O must be released — a same-named file in a newly
    // opened folder must not resolve through the previous folder's handles.
    expect(explorer.getOpenDirectory()).toBeNull();
  });
});

describe('WorkspaceExplorer pluggable fs provider', () => {
  const stubScenes = (explorer: { getWorkspace(): VemWorkspace }) => {
    const sceneStub = { a11yNeedsReorder: false, markDirty() {}, detachA11y() {} };
    Object.defineProperty(explorer, 'scene', { configurable: true, value: sceneStub });
    Object.defineProperty(explorer.getWorkspace(), 'scene', {
      configurable: true,
      value: sceneStub,
    });
  };

  // `:w` through the command line, then a macrotask flush so the async
  // onSave callback (which awaits the provider's save) has completed.
  const runSaveCommand = async (state: {
    handleKey(k: string): void;
    setCommandText(t: string): void;
  }) => {
    state.handleKey(':');
    state.setCommandText('w');
    state.handleKey('Enter');
    await new Promise((resolve) => setTimeout(resolve, 0));
  };

  it('openDirectory routes tree file opens and :w through the provider I/O', async () => {
    const { WorkspaceExplorer } = await import('./WorkspaceExplorer');
    const explorer = new WorkspaceExplorer(800, 600, '');
    stubScenes(explorer);

    const saved: Record<string, string> = {};
    explorer.openDirectory({
      nodes: [{ id: '/abs/path/a.ts', label: 'a.ts' }],
      readFile: async (id) => (id === '/abs/path/a.ts' ? 'const x = 1;' : ''),
      saveFile: async (id, content) => {
        saved[id] = content;
      },
    });

    const tree = (explorer as unknown as { treeView: unknown }).treeView;
    expect(tree).not.toBeNull();

    // Drive the tree's onSelect the way a click would.
    /* eslint-disable-next-line no-underscore-dangle */
    const onSelect = (tree as { _onSelect?: (n: unknown) => void | Promise<void> })._onSelect;
    expect(onSelect).toBeDefined();
    await onSelect!({ id: '/abs/path/a.ts', label: 'a.ts' });

    const state = explorer.getActiveEditorState();
    expect(state.getText()).toBe('const x = 1;');
    await runSaveCommand(state);
    expect(saved['/abs/path/a.ts']).toBe('const x = 1;');
  });

  it('handleOpenFile opens the provider-picked file and wires its save', async () => {
    const { WorkspaceExplorer } = await import('./WorkspaceExplorer');
    const explorer = new WorkspaceExplorer(800, 600, '');
    stubScenes(explorer);

    let savedContent: string | null = null;
    explorer.setFileSystemProvider({
      pickDirectory: async () => null,
      pickFile: async () => ({
        name: 'picked.md',
        content: '# picked',
        save: async (text) => {
          savedContent = text;
        },
      }),
    });

    await explorer.handleOpenFile();

    const workspace = explorer.getWorkspace();
    const buffers = (workspace as unknown as { buffers: { label: string }[] }).buffers;
    expect(buffers.map((b) => b.label)).toEqual(['picked.md']);
    const state = explorer.getActiveEditorState();
    expect(state.getText()).toBe('# picked');
    await runSaveCommand(state);
    expect(savedContent).toBe('# picked');
  });

  it('a cancelled provider pick leaves the Explorer untouched', async () => {
    const { WorkspaceExplorer } = await import('./WorkspaceExplorer');
    const explorer = new WorkspaceExplorer(800, 600, '');
    stubScenes(explorer);

    explorer.setFileSystemProvider({
      pickDirectory: async () => null,
      pickFile: async () => null,
    });

    await explorer.handleOpenFile();
    const inner = explorer as unknown as {
      treeView: unknown;
      leftPanel: { children: unknown[] };
      openBtn: unknown;
    };
    expect(inner.treeView).toBeNull();
    expect(inner.leftPanel.children).toContain(inner.openBtn);
    expect(explorer.getOpenDirectory()).toBeNull();
  });

  it('surfaces a Vim-style error thrown by the save backend as the status message', async () => {
    const { WorkspaceExplorer } = await import('./WorkspaceExplorer');
    const explorer = new WorkspaceExplorer(800, 600, '');
    stubScenes(explorer);

    explorer.openFileBuffer('text', 'ro.txt', async () => {
      throw new Error("E45: 'readonly' option is set (add ! to override)");
    });
    const state = explorer.getActiveEditorState();
    await runSaveCommand(state);
    expect(state.statusMessage).toBe("E45: 'readonly' option is set (add ! to override)");
  });
});
