import { UIComponent, PanelGroup, Panel, TreeView, Button } from '@vectojs/ui';
import type { TreeNode } from '@vectojs/ui';
import type { IRenderer } from '@vectojs/core';
import { VemWorkspace } from './Workspace';
import { createWebFsProvider, type PickedDirectory, type WorkspaceFsProvider } from './FsProvider';

/** Height reserved above the file tree for the "Close" workspace-switch button. */
const TREE_HEADER_HEIGHT = 44;

export class WorkspaceExplorer extends UIComponent {
  private panelGroup: PanelGroup;
  private leftPanel: Panel;
  private rightPanel: Panel;
  private workspace: VemWorkspace;
  private treeView: TreeView | null = null;
  private openBtn: Button;
  private openFileBtn: Button;
  private closeWorkspaceBtn: Button;
  private fsProvider: WorkspaceFsProvider;
  /** The directory currently backing the file tree, if any. */
  private openDir: PickedDirectory | null = null;
  /** When true the file-tree sidebar is force-hidden regardless of theme layout. */
  private sidebarHidden = false;
  private openDirectoryCallbacks: ((
    files: TreeNode[],
    dir: PickedDirectory,
  ) => void | Promise<void>)[] = [];

  constructor(width: number, height: number, initialText?: string) {
    super();
    this.width = width;
    this.height = height;
    this.fsProvider = createWebFsProvider();

    this.panelGroup = new PanelGroup({
      direction: 'horizontal',
      width: width,
      height: height,
    });

    this.leftPanel = new Panel({ minSize: 150, defaultSize: 0.2 });
    this.rightPanel = new Panel({ minSize: 300 });

    this.workspace = new VemWorkspace(width * 0.8, height, initialText);

    // Square icon buttons, side by side — not the old full-width "Open
    // Folder"/"Open File" pills. Labels stay short real words (not bare
    // letters or emoji) so the shadow <button aria-label> Button projects
    // (see getA11yAttributes) stays meaningful to screen readers, since
    // Button has no separate icon-vs-accessible-name concept.
    const SIDEBAR_BTN_SIZE = 44;

    this.openBtn = new Button('Dir', {
      onClick: () => this.handleOpenFolder(),
      bg: '#000000',
      hoverBg: '#1a1a1a',
      font: '11px monospace',
      color: '#5f87d7',
      radius: 2,
      width: SIDEBAR_BTN_SIZE,
      height: SIDEBAR_BTN_SIZE,
    });
    this.openBtn.setPosition(8, 8);

    this.openFileBtn = new Button('File', {
      onClick: () => this.handleOpenFile(),
      bg: '#000000',
      hoverBg: '#1a1a1a',
      font: '11px monospace',
      color: '#d0d0d0',
      radius: 2,
      width: SIDEBAR_BTN_SIZE,
      height: SIDEBAR_BTN_SIZE,
    });
    this.openFileBtn.setPosition(8 + SIDEBAR_BTN_SIZE + 4, 8);

    // "Close" the open folder — restores the Dir/File buttons so a different
    // folder can be opened. Otherwise handleOpenFolder() is unreachable once
    // a directory is open: opening a folder removes openBtn from the panel
    // and nothing ever puts it back, an issue that showed up as "how do you
    // switch workspaces?" with no path to answer it.
    this.closeWorkspaceBtn = new Button('Close', {
      onClick: () => this.closeWorkspace(),
      bg: '#000000',
      hoverBg: '#1a1a1a',
      font: '11px monospace',
      color: '#5f87d7',
      radius: 2,
      width: 60,
      height: 22,
    });
    this.closeWorkspaceBtn.setPosition(8, 6);

    this.leftPanel.add(this.openBtn);
    this.leftPanel.add(this.openFileBtn);
    this.rightPanel.add(this.workspace);

    this.panelGroup.addPanel(this.leftPanel);
    this.panelGroup.addPanel(this.rightPanel);

    this.add(this.panelGroup);
  }

  public getWorkspace(): VemWorkspace {
    return this.workspace;
  }

  public onDidOpenDirectory(
    cb: (files: TreeNode[], dir: PickedDirectory) => void | Promise<void>,
  ): void {
    this.openDirectoryCallbacks.push(cb);
  }

  /**
   * Replace the picker/IO backend behind the "Dir"/"File" buttons. The
   * default is the browser's File System Access API, which WebKitGTK (Tauri
   * on Linux) doesn't implement — desktop shells inject native dialogs here.
   */
  public setFileSystemProvider(provider: WorkspaceFsProvider): void {
    this.fsProvider = provider;
  }

  private flattenFiles(nodes: any[]): string[] {
    const list: string[] = [];
    const recurse = (nodeList: any[], prefix: string) => {
      for (const node of nodeList) {
        const path = prefix ? `${prefix}/${node.label}` : node.label;
        if (node.children && node.children.length > 0) {
          recurse(node.children, path);
        } else if (!node.children || node.children.length === 0) {
          list.push(path);
        }
      }
    };
    recurse(nodes, '');
    return list;
  }

  private addSidebarContent(panel: Panel): void {
    if (this.treeView) {
      panel.add(this.closeWorkspaceBtn);
      panel.add(this.treeView);
    } else {
      panel.add(this.openBtn);
      panel.add(this.openFileBtn);
    }
  }

  /** Whether the file-tree sidebar is currently visible. */
  public isSidebarVisible(): boolean {
    return !this.sidebarHidden;
  }

  /** Show/hide the file-tree sidebar (issue: panels should be closable). */
  public setSidebarVisible(visible: boolean): void {
    if (this.sidebarHidden === !visible) return;
    this.sidebarHidden = !visible;
    const state = this.getActiveEditorState();
    if (state) this.syncLayout(state);
    this.scene?.markDirty();
  }

  /** Toggle the file-tree sidebar. */
  public toggleSidebar(): void {
    this.setSidebarVisible(this.sidebarHidden);
  }

  private async handleOpenFolder(): Promise<void> {
    const picked = await this.fsProvider.pickDirectory();
    if (!picked) return; // cancelled or unsupported — leave the Explorer as is
    this.openDirectory(picked);
  }

  /**
   * Show `dir`'s tree in the sidebar and route file opens/saves through it.
   * Public so a host shell can open a directory it resolved itself (e.g. a
   * CLI argument) without going through the picker.
   */
  public openDirectory(dir: PickedDirectory): void {
    this.openDir = dir;
    const nodes = dir.nodes;

    // Cache all file paths for search plugins (like Telescope)
    const fileList = this.flattenFiles(nodes);
    const activeState = this.getActiveEditorState();
    if (activeState) {
      activeState.projectFiles = fileList;
    }

    if (this.treeView) this.leftPanel.remove(this.treeView);
    this.treeView = new TreeView({
      nodes,
      width: this.leftPanel.width,
      height: this.height - TREE_HEADER_HEIGHT - 10,
      font: '13px monospace',
      color: '#cbd5e1',
      selectedColor: 'rgba(56, 189, 248, 0.2)',
      hoverColor: 'rgba(255, 255, 255, 0.05)',
      onSelect: async (node) => {
        // Directory nodes expand in place; only leaf (file) nodes open.
        if ((node as { children?: unknown }).children) return;
        try {
          const content = await dir.readFile(node.id);
          const label = node.label ?? node.id.split('/').pop() ?? 'file';
          const save = dir.saveFile ? (text: string) => dir.saveFile!(node.id, text) : undefined;
          this.openFileBuffer(content, label, save);
        } catch (err) {
          console.error('Error opening file from tree:', err);
        }
      },
    });
    this.treeView.setPosition(0, TREE_HEADER_HEIGHT);

    this.leftPanel.remove(this.openBtn); // remove() detaches a11y itself
    this.leftPanel.remove(this.openFileBtn);
    this.leftPanel.add(this.closeWorkspaceBtn);
    this.leftPanel.add(this.treeView);
    this.scene?.markDirty();

    // Trigger directory opened callbacks
    for (const cb of this.openDirectoryCallbacks) {
      try {
        cb(nodes, dir);
      } catch (e) {
        console.error('Error executing openDirectory callback:', e);
      }
    }
  }

  /**
   * Close the open folder and restore the Dir/File buttons, so a different
   * workspace can be opened. Open buffers/tabs are left exactly as they are
   * — closing the tree is about the file-picker source, not the editor
   * state — but dropping the `PickedDirectory` releases the old folder's
   * file handles so a same-named file in a newly opened folder can't
   * resolve to the previous folder's handle.
   */
  public closeWorkspace(): void {
    if (!this.treeView) return;
    this.leftPanel.remove(this.treeView);
    this.leftPanel.remove(this.closeWorkspaceBtn);
    this.treeView = null;
    this.openDir = null;

    const activeState = this.getActiveEditorState();
    if (activeState) activeState.projectFiles = [];

    this.leftPanel.add(this.openBtn);
    this.leftPanel.add(this.openFileBtn);
    this.scene?.markDirty();
  }

  /**
   * Open file content in a tab labeled with the file name, and wire `:w` on
   * that buffer to `save` (whatever backend the provider gave us).
   * If the active tab is still untouched (Vim's intro-splash condition), the
   * file replaces it in place — matching `:e` in a fresh Vim session —
   * rather than stacking a new tab next to an empty "untitled" one.
   */
  public openFileBuffer(
    content: string,
    label: string,
    save?: (content: string) => Promise<void>,
  ): string {
    const pristineId = this.workspace.isActiveBufferPristine()
      ? this.workspace.getActiveBufferId()
      : null;
    const id = this.workspace.openBuffer(content, label);
    if (pristineId) this.workspace.closeTab(pristineId);
    const state = this.workspace.getActiveLayout()?.getActiveState();
    if (state && save) {
      state.onSave(async () => {
        try {
          await save(state.getText());
          state.statusMessage = `"${label}" written`;
        } catch (err) {
          // A thrown Vim-style error ("E45: ...") is a real status message
          // from the save backend (e.g. readonly mode) — surface it as is.
          const msg = err instanceof Error && /^E\d+:/.test(err.message) ? err.message : null;
          state.statusMessage = msg ?? `E212: Can't open file for writing`;
          if (!msg) console.error('Failed to save file:', err);
        }
        this.scene?.markDirty();
      });
    }
    return id;
  }

  /**
   * Prompt for a single file (not a folder) and open it. Complements
   * "Open Folder" so the sidebar can open individual files too.
   */
  public async handleOpenFile(): Promise<void> {
    const picked = await this.fsProvider.pickFile();
    if (!picked) return; // cancelled or unsupported
    this.openFileBuffer(picked.content, picked.name, picked.save);
  }

  /** The directory currently backing the file tree, or null if none open. */
  public getOpenDirectory(): PickedDirectory | null {
    return this.openDir;
  }

  public getActiveEditorState(): any | null {
    return this.workspace.getActiveLayout()?.getActiveState() || null;
  }

  private lastSidebarPosition: 'left' | 'right' | 'hidden' = 'left';
  private lastSidebarWidth = 240;

  public syncLayout(activeState: any): void {
    const layout = activeState.layoutConfig;

    this.remove(this.panelGroup); // remove() detaches the a11y subtree itself

    this.panelGroup = new PanelGroup({
      direction: 'horizontal',
      width: this.width,
      height: this.height,
    });

    this.leftPanel = new Panel({
      minSize: 150,
      defaultSize: layout.sidebarWidth / Math.max(1, this.width),
    });
    this.rightPanel = new Panel({ minSize: 300 });

    const effectivePosition = this.sidebarHidden ? 'hidden' : layout.sidebarPosition;

    if (effectivePosition === 'left') {
      this.addSidebarContent(this.leftPanel);
      this.rightPanel.add(this.workspace);

      this.panelGroup.addPanel(this.leftPanel);
      this.panelGroup.addPanel(this.rightPanel);
    } else if (effectivePosition === 'right') {
      this.addSidebarContent(this.leftPanel);
      this.rightPanel.add(this.workspace);

      this.panelGroup.addPanel(this.rightPanel);
      this.panelGroup.addPanel(this.leftPanel);
    } else {
      this.rightPanel.add(this.workspace);
      this.panelGroup.addPanel(this.rightPanel);
    }

    this.add(this.panelGroup);
  }

  public update(dt: number, time: number): void {
    super.update(dt, time);

    const activeState = this.getActiveEditorState();
    if (activeState) {
      const layout = activeState.layoutConfig;
      if (
        layout.sidebarPosition !== this.lastSidebarPosition ||
        layout.sidebarWidth !== this.lastSidebarWidth
      ) {
        this.lastSidebarPosition = layout.sidebarPosition;
        this.lastSidebarWidth = layout.sidebarWidth;
        this.syncLayout(activeState);
      }
    }

    if (this.panelGroup.width !== this.width || this.panelGroup.height !== this.height) {
      // resize() redistributes the panel sizes; a bare width/height write
      // leaves every Panel at its old absolute size, freezing the editor at
      // whatever the group measured when it was last (re)built.
      this.panelGroup.resize(this.width, this.height);
    }

    if (
      this.treeView &&
      (this.treeView.width !== this.leftPanel.width ||
        this.treeView.height !== this.height - TREE_HEADER_HEIGHT)
    ) {
      this.treeView.width = this.leftPanel.width;
      this.treeView.height = this.height - TREE_HEADER_HEIGHT;
    }

    if (
      this.workspace.width !== this.rightPanel.width ||
      this.workspace.height !== this.rightPanel.height
    ) {
      this.workspace.width = this.rightPanel.width;
      this.workspace.height = this.rightPanel.height;
    }
  }

  public render(r: IRenderer): void {
    const activeState = this.getActiveEditorState();
    if (!activeState) return;

    const theme = activeState.theme;
    const layout = activeState.layoutConfig;

    // Dir/File/Close buttons keep their fixed Vim-black styling (set once in
    // the constructor) regardless of the active theme — this used to
    // overwrite bg/hoverBg/color with theme.statusBarBg/theme.fg every
    // frame, which on the default Vim-black theme meant a light-gray
    // statusBarBg background behind the Dir button's blue label, an
    // unreadable low-contrast combo the theme sync never accounted for.
    // netrw's own chrome doesn't reflow with :colorscheme either.

    if (this.treeView) {
      /* eslint-disable-next-line no-underscore-dangle */
      (this.treeView as any)._color = theme.fg;
      /* eslint-disable-next-line no-underscore-dangle */
      (this.treeView as any)._selColor = theme.accent + '33';
    }

    if (layout.sidebarPosition !== 'hidden') {
      const startX = layout.sidebarPosition === 'left' ? 0 : this.width - this.leftPanel.width;
      r.beginPath();
      r.moveTo(startX, 0);
      r.lineTo(startX + this.leftPanel.width, 0);
      r.lineTo(startX + this.leftPanel.width, this.height);
      r.lineTo(startX, this.height);
      r.closePath();
      r.fill(theme.sidebarBg);
    }
  }
}
