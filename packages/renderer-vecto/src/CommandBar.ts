import { UIComponent, Text, Input } from '@vectojs/ui';
import type { IRenderer } from '@vectojs/core';
import type { VemEditorState } from '@vemjs/core';

export class CommandBar extends UIComponent {
  private editorState: VemEditorState;
  private prefixText: Text;
  private input: Input;

  constructor(editorState: VemEditorState, width: number) {
    super();
    this.editorState = editorState;
    this.width = width;
    this.height = 30;

    this.prefixText = new Text(':', {
      font: 'bold 14px monospace',
      color: '#38bdf8', // sky-400
    });
    this.prefixText.setPosition(5, 5);

    this.input = new Input({
      width: width - 20,
      height: 25,
      font: '14px monospace',
      color: '#e2e8f0',
      bg: '#1e293b', // slate-800
      border: 'transparent',
      onChange: (value) => {
        this.editorState.setCommandText(value);
      },
    });
    this.input.id = 'vem-command-input';
    this.input.setPosition(15, 2);

    // Watch for Escape and Enter on the input component to bridge to editorState
    this.input.on('keydown', (e: any) => {
      const key = e.nativeEvent?.key || e.key;
      if (key === 'Escape') {
        this.editorState.handleKey('Escape');
      } else if (key === 'Enter') {
        this.editorState.handleKey('Enter');
      }
    });

    this.add(this.prefixText);
    this.add(this.input);
  }

  public updateWidth(width: number): void {
    this.width = width;
    this.input.width = width - 20;
  }

  public syncFromState(): void {
    this.input.value = this.editorState.getCommandText();
  }

  public render(r: IRenderer): void {
    const theme = this.editorState.theme;

    // Sync theme colors dynamically
    this.prefixText.color = theme.accent;
    this.input.color = theme.statusBarFg;
    this.input.bg = theme.statusBarBg;

    r.beginPath();
    r.moveTo(0, 0);
    r.lineTo(this.width, 0);
    r.lineTo(this.width, this.height);
    r.lineTo(0, this.height);
    r.closePath();
    r.fill(theme.statusBarBg);
  }
}
