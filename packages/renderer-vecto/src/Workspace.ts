import { UIComponent, Tabs } from '@vectojs/ui';
import type { IRenderer } from '@vectojs/core';
import { WorkspaceLayout } from './WorkspaceLayout';

export class VemWorkspace extends UIComponent {
  private tabsComponent: Tabs | null = null;
  private layouts: WorkspaceLayout[] = [];

  constructor(width: number, height: number, initialText?: string) {
    super();
    this.width = width;
    this.height = height;

    const initialLayout = new WorkspaceLayout(width, height - 30, initialText || '');
    this.layouts.push(initialLayout);

    this.tabsComponent = new Tabs({
      width: this.width,
      height: this.height,
      tabHeight: 30,
      tabs: [{ id: 'tab-1', label: 'Tab 1', content: initialLayout }],
      value: 'tab-1',
    });

    this.add(this.tabsComponent);
  }

  public addTab(initialText?: string): void {
    const nextIndex = this.layouts.length + 1;
    const newLayout = new WorkspaceLayout(this.width, this.height - 30, initialText || '');
    this.layouts.push(newLayout);

    const updatedTabs = this.layouts.map((layout, idx) => ({
      id: `tab-${idx + 1}`,
      label: `Tab ${idx + 1}`,
      content: layout,
    }));

    this.tabsComponent!.tabs = updatedTabs;
    this.tabsComponent!.value = `tab-${nextIndex}`;
  }

  public update(dt: number, time: number): void {
    super.update(dt, time);
    if (this.tabsComponent) {
      this.tabsComponent.width = this.width;
      this.tabsComponent.height = this.height;
    }
  }

  public getActiveLayout(): WorkspaceLayout | null {
    if (!this.tabsComponent) return null;
    const activeId = this.tabsComponent.value;
    const match = activeId.match(/tab-(\d+)/);
    if (match) {
      const idx = parseInt(match[1], 10) - 1;
      return this.layouts[idx] || null;
    }
    return null;
  }

  public render(_r: IRenderer): void {
    // Handled by tabsComponent
  }
}
