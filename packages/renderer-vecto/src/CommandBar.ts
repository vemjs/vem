import { UIComponent, Text, Input } from '@vectojs/ui';
import type { IRenderer } from '@vectojs/core';
import type { VemEditorState } from '@vemjs/core';

const PREFIX_X = 6;
const PREFIX_Y = 7;
const INPUT_PADDING = 2;
const INPUT_GAP = 1;

export class CommandBar extends UIComponent {
  private editorState: VemEditorState;
  private prefixText: Text;
  private input: Input;
  private lastPrefix: ':' | '/' = ':';

  constructor(editorState: VemEditorState, width: number) {
    super();
    this.editorState = editorState;
    this.width = width;
    this.height = 30;

    // Vim's command line is plain Normal text on the bottom row — no boxed
    // highlight, no gap between the ':' and what you type — so the prefix and
    // the shadow <input> share one font/baseline and sit flush together.
    this.prefixText = new Text(':', {
      font: 'bold 14px monospace',
    });
    this.prefixText.setPosition(PREFIX_X, PREFIX_Y);

    this.input = new Input({
      width: width - 20,
      height: 25,
      font: '14px monospace',
      border: 'transparent',
      padding: INPUT_PADDING,
      onChange: (value) => {
        this.editorState.setCommandText(value);
      },
    });
    this.input.id = 'vem-command-input';
    this.repositionInput();

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

  private repositionInput(): void {
    const x = PREFIX_X + this.prefixText.width + INPUT_GAP;
    this.input.setPosition(x, 2);
    this.input.width = Math.max(1, this.width - x - 4);
  }

  public updateWidth(width: number): void {
    this.width = width;
    this.repositionInput();
  }

  public syncFromState(): void {
    this.input.value = this.editorState.getCommandText();
    const prefix = this.editorState.getCommandPrefix();
    if (prefix !== this.lastPrefix) {
      this.lastPrefix = prefix;
      this.prefixText.setText(prefix);
      this.repositionInput();
    }
  }

  public render(r: IRenderer): void {
    const theme = this.editorState.theme;

    // Sync theme colors dynamically. The command line is Normal-highlighted —
    // same bg/fg as the buffer — not the StatusLine's reverse-video bar.
    this.prefixText.color = theme.fg;
    this.input.color = theme.fg;
    this.input.bg = theme.bg;

    r.beginPath();
    r.moveTo(0, 0);
    r.lineTo(this.width, 0);
    r.lineTo(this.width, this.height);
    r.lineTo(0, this.height);
    r.closePath();
    r.fill(theme.bg);
  }
}
