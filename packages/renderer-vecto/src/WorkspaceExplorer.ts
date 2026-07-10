import { UIComponent, PanelGroup, Panel, TreeView, Button } from '@vectojs/ui';
import type { IRenderer } from '@vectojs/core';
import { VemWorkspace } from './Workspace';
import { FileSystemHandler } from './FileSystemHandler';

export class WorkspaceExplorer extends UIComponent {
  private panelGroup: PanelGroup;
  private leftPanel: Panel;
  private rightPanel: Panel;
  private workspace: VemWorkspace;
  private treeView: TreeView | null = null;
  private openBtn: Button;
  private openFileBtn: Button;
  private fsHandler: FileSystemHandler;
  /** When true the file-tree sidebar is force-hidden regardless of theme layout. */
  private sidebarHidden = false;
  private openDirectoryCallbacks: ((
    files: any[],
    fsHandler: FileSystemHandler,
  ) => void | Promise<void>)[] = [];

  constructor(width: number, height: number, initialText?: string) {
    super();
    this.width = width;
    this.height = height;
    this.fsHandler = new FileSystemHandler();

    this.panelGroup = new PanelGroup({
      direction: 'horizontal',
      width: width,
      height: height,
    });

    this.leftPanel = new Panel({ minSize: 150, defaultSize: 0.2 });
    this.rightPanel = new Panel({ minSize: 300 });

    this.workspace = new VemWorkspace(width * 0.8, height, initialText);

    this.openBtn = new Button('Open Folder', {
      onClick: () => this.handleOpenFolder(),
      bg: '#1e293b', // slate-800
      hoverBg: '#334155',
      font: '14px monospace',
      color: '#e2e8f0',
    });
    this.openBtn.width = 120;
    this.openBtn.height = 35;
    this.openBtn.setPosition(15, 15);

    this.openFileBtn = new Button('Open File', {
      onClick: () => this.handleOpenFile(),
      bg: '#1e293b',
      hoverBg: '#334155',
      font: '14px monospace',
      color: '#e2e8f0',
    });
    this.openFileBtn.width = 120;
    this.openFileBtn.height = 35;
    this.openFileBtn.setPosition(15, 58);

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
    cb: (files: any[], fsHandler: FileSystemHandler) => void | Promise<void>,
  ): void {
    this.openDirectoryCallbacks.push(cb);
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
    if (typeof window === 'undefined' || !(window as any).showDirectoryPicker) {
      console.warn('File System Access API is not supported in this environment.');
      return;
    }

    try {
      const rootHandle = await (window as any).showDirectoryPicker();
      const nodes = await this.fsHandler.readDirectory(rootHandle);

      // Cache all file paths for search plugins (like Telescope)
      const fileList = this.flattenFiles(nodes);
      const activeState = this.getActiveEditorState();
      if (activeState) {
        activeState.projectFiles = fileList;
      }

      this.treeView = new TreeView({
        nodes,
        width: this.leftPanel.width,
        height: this.height - 10,
        font: '13px monospace',
        color: '#cbd5e1',
        selectedColor: 'rgba(56, 189, 248, 0.2)',
        hoverColor: 'rgba(255, 255, 255, 0.05)',
        onSelect: async (node) => {
          const fileHandle = this.fsHandler.getFileHandle(node.id);
          if (fileHandle) {
            const content = await this.fsHandler.readFile(fileHandle);
            const label = node.label ?? node.id.split('/').pop() ?? 'file';
            this.openFileBuffer(content, label, fileHandle);
          }
        },
      });

      this.scene?.detachA11y(this.openBtn);
      this.leftPanel.remove(this.openBtn);
      this.leftPanel.add(this.treeView);

      // Trigger directory opened callbacks
      for (const cb of this.openDirectoryCallbacks) {
        try {
          cb(nodes, this.fsHandler);
        } catch (e) {
          console.error('Error executing openDirectory callback:', e);
        }
      }
    } catch (err) {
      console.error('Error selecting directory:', err);
    }
  }

  /**
   * Open file content in a new tab labeled with the file name, and wire `:w`
   * on that buffer to write back to disk through the File System Access API.
   */
  public openFileBuffer(content: string, label: string, fileHandle?: FileSystemFileHandle): string {
    const id = this.workspace.openBuffer(content, label);
    const state = this.workspace.getActiveLayout()?.getActiveState();
    if (state && fileHandle) {
      state.onSave(async () => {
        try {
          await this.fsHandler.saveFile(fileHandle, state.getText());
          state.statusMessage = `"${label}" written`;
        } catch (err) {
          state.statusMessage = `E212: Can't open file for writing`;
          console.error('Failed to save file:', err);
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
    if (typeof window === 'undefined' || !(window as any).showOpenFilePicker) {
      console.warn('File System Access API is not supported in this environment.');
      return;
    }
    try {
      const [handle] = await (window as any).showOpenFilePicker();
      if (!handle) return;
      const content = await this.fsHandler.readFile(handle);
      this.openFileBuffer(content, handle.name, handle);
    } catch (err) {
      // AbortError = user cancelled the picker; not an error worth logging.
      if ((err as { name?: string })?.name !== 'AbortError') {
        console.error('Error opening file:', err);
      }
    }
  }

  public getActiveEditorState(): any | null {
    return this.workspace.getActiveLayout()?.getActiveState() || null;
  }

  private lastSidebarPosition: 'left' | 'right' | 'hidden' = 'left';
  private lastSidebarWidth = 240;

  public syncLayout(activeState: any): void {
    const layout = activeState.layoutConfig;

    this.scene?.detachA11y(this.panelGroup);
    this.remove(this.panelGroup);

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
      this.panelGroup.width = this.width;
      this.panelGroup.height = this.height;
    }

    if (
      this.treeView &&
      (this.treeView.width !== this.leftPanel.width || this.treeView.height !== this.height)
    ) {
      this.treeView.width = this.leftPanel.width;
      this.treeView.height = this.height;
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

    // Apply button styling
    this.openBtn.bg = theme.statusBarBg;
    this.openBtn.hoverBg = theme.statusBarBg;
    this.openBtn.color = theme.fg;

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
