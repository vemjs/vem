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
  private fsHandler: FileSystemHandler;

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

    this.leftPanel.add(this.openBtn);
    this.rightPanel.add(this.workspace);

    this.panelGroup.addPanel(this.leftPanel);
    this.panelGroup.addPanel(this.rightPanel);

    this.add(this.panelGroup);
  }

  private async handleOpenFolder(): Promise<void> {
    if (typeof window === 'undefined' || !(window as any).showDirectoryPicker) {
      console.warn('File System Access API is not supported in this environment.');
      return;
    }

    try {
      const rootHandle = await (window as any).showDirectoryPicker();
      const nodes = await this.fsHandler.readDirectory(rootHandle);

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
            this.workspace.addTab(content);
          }
        },
      });

      this.leftPanel.remove(this.openBtn);
      this.leftPanel.add(this.treeView);
    } catch (err) {
      console.error('Error selecting directory:', err);
    }
  }

  public update(dt: number, time: number): void {
    super.update(dt, time);

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

  public render(_r: IRenderer): void {
    _r.beginPath();
    _r.moveTo(0, 0);
    _r.lineTo(this.leftPanel.width, 0);
    _r.lineTo(this.leftPanel.width, this.height);
    _r.lineTo(0, this.height);
    _r.closePath();
    _r.fill('#090d16'); // deep slate sidebar background
  }
}
