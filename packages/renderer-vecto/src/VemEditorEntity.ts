import { UIComponent, Text, RichText } from '@vectojs/ui';
import type { IRenderer } from '@vectojs/core';
import type { VemEditorState } from '@vemjs/core';
import { CommandBar } from './CommandBar';

export class VemEditorEntity extends UIComponent {
  private editorState: VemEditorState;
  private gutterText: Text;
  private bodyText: RichText;
  private commandBar: CommandBar;

  private charWidth = 8.4;
  private lineHeight = 20;
  private scrollY = 0; // scroll offset in lines
  private autocompleteItems: { label: string; detail?: string }[] = [];
  private selectedAutocompleteIndex = 0;

  constructor(editorState: VemEditorState) {
    super();
    this.editorState = editorState;
    this.width = 800;
    this.height = 600;
    this.clipChildren = true;

    this.gutterText = new Text('', {
      font: '14px monospace',
      color: '#64748b', // slate-500
      lineHeight: this.lineHeight,
    });

    // Editor body text
    this.bodyText = new RichText([], {
      font: '14px monospace',
      color: '#e2e8f0', // slate-200
    });

    this.commandBar = new CommandBar(editorState, this.width);
    this.commandBar.setPosition(0, this.height - 30);

    this.add(this.gutterText);
    this.add(this.bodyText);

    // Try to measure the exact monospace char width if running in browser
    if (typeof document !== 'undefined') {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.font = '14px monospace';
        this.charWidth = ctx.measureText('A').width;
      }
    }

    this.updateFromState();
  }

  public updateFromState(): void {
    const buffer = this.editorState.getBuffer();
    const cursor = this.editorState.getCursor();
    const lineCount = buffer.getLineCount();

    // 1. Calculate gutter width dynamically
    const maxLineDigits = Math.max(2, lineCount.toString().length);
    const gutterWidth = maxLineDigits * this.charWidth + 15;

    // 2. Set line numbers text
    const lineNums: string[] = [];
    for (let i = 1; i <= lineCount; i++) {
      lineNums.push(i.toString().padStart(maxLineDigits, ' '));
    }
    this.gutterText.setText(lineNums.join('\n'));
    this.gutterText.setPosition(5, 5);

    // 3. Set editor body text
    const spans = buffer.getLines().map((line, idx) => {
      const suffix = idx === lineCount - 1 ? '' : '\n';
      return { text: line + suffix };
    });
    this.bodyText.setSpans(spans);
    this.bodyText.setPosition(gutterWidth + 5, 5);

    // 4. Handle viewport scrolling to keep cursor visible
    const visibleLines = Math.floor((this.height - 35) / this.lineHeight); // reserve 35px for status bar
    if (cursor.line >= this.scrollY + visibleLines) {
      this.scrollY = cursor.line - visibleLines + 1;
    } else if (cursor.line < this.scrollY) {
      this.scrollY = cursor.line;
    }

    // Update children scroll positions
    const scrollOffsetY = -this.scrollY * this.lineHeight;
    this.gutterText.setPosition(5, 5 + scrollOffsetY);
    this.bodyText.setPosition(gutterWidth + 5, 5 + scrollOffsetY);

    // 5. Handle CommandBar visibility
    if (this.editorState.getMode() === 'COMMAND') {
      if (!this.children.includes(this.commandBar)) {
        this.add(this.commandBar);
      }
      this.commandBar.clear();
    } else {
      if (this.children.includes(this.commandBar)) {
        this.remove(this.commandBar);
      }
    }
  }

  public setAutocompleteItems(items: { label: string; detail?: string }[]): void {
    this.autocompleteItems = items;
    this.selectedAutocompleteIndex = 0;
  }

  public getAutocompleteItems(): { label: string; detail?: string }[] {
    return this.autocompleteItems;
  }

  public selectNextAutocomplete(): void {
    if (this.autocompleteItems.length > 0) {
      this.selectedAutocompleteIndex =
        (this.selectedAutocompleteIndex + 1) % this.autocompleteItems.length;
    }
  }

  public selectPrevAutocomplete(): void {
    if (this.autocompleteItems.length > 0) {
      this.selectedAutocompleteIndex =
        (this.selectedAutocompleteIndex - 1 + this.autocompleteItems.length) %
        this.autocompleteItems.length;
    }
  }

  public getSelectedAutocomplete(): { label: string; detail?: string } | null {
    if (this.autocompleteItems.length > 0) {
      return this.autocompleteItems[this.selectedAutocompleteIndex];
    }
    return null;
  }

  public clearAutocomplete(): void {
    this.autocompleteItems = [];
  }

  public render(r: IRenderer): void {
    // 1. Draw editor background
    r.beginPath();
    r.moveTo(0, 0);
    r.lineTo(this.width, 0);
    r.lineTo(this.width, this.height);
    r.lineTo(0, this.height);
    r.closePath();
    r.fill('#0f172a'); // slate-900

    const lineCount = this.editorState.getBuffer().getLineCount();
    const maxLineDigits = Math.max(2, lineCount.toString().length);
    const gutterWidth = maxLineDigits * this.charWidth + 15;

    // 2. Draw gutter background
    r.beginPath();
    r.moveTo(0, 0);
    r.lineTo(gutterWidth, 0);
    r.lineTo(gutterWidth, this.height);
    r.lineTo(0, this.height);
    r.closePath();
    r.fill('#1e293b'); // slate-800

    // Apply scrolling transformation for cursor and selections
    r.save();
    r.translate(0, -this.scrollY * this.lineHeight);

    // 3. Draw Visual Mode selections
    const selection = this.editorState.getVisualSelection();
    if (selection) {
      const type = selection.type;
      let s = { ...selection.anchor };
      let e = { ...selection.active };

      if (s.line > e.line || (s.line === e.line && s.character > e.character)) {
        const temp = s;
        s = e;
        e = temp;
      }

      const drawSelRect = (lineIdx: number, startChar: number, endChar: number) => {
        const x = gutterWidth + 5 + startChar * this.charWidth;
        const y = 5 + lineIdx * this.lineHeight;
        const w = (endChar - startChar) * this.charWidth;
        const h = this.lineHeight;

        r.beginPath();
        r.moveTo(x, y);
        r.lineTo(x + w, y);
        r.lineTo(x + w, y + h);
        r.lineTo(x, y + h);
        r.closePath();
        r.fill('rgba(56, 189, 248, 0.3)'); // sky-400 opacity
      };

      if (type === 'line') {
        for (let l = s.line; l <= e.line; l++) {
          const lineText = this.editorState.getBuffer().getLine(l);
          drawSelRect(l, 0, Math.max(1, lineText.length));
        }
      } else if (type === 'char') {
        if (s.line === e.line) {
          drawSelRect(s.line, s.character, e.character + 1);
        } else {
          const sLineText = this.editorState.getBuffer().getLine(s.line);
          drawSelRect(s.line, s.character, Math.max(s.character + 1, sLineText.length + 1));
          for (let l = s.line + 1; l < e.line; l++) {
            const lText = this.editorState.getBuffer().getLine(l);
            drawSelRect(l, 0, lText.length + 1);
          }
          drawSelRect(e.line, 0, e.character + 1);
        }
      } else if (type === 'block') {
        const minCol = Math.min(selection.anchor.character, selection.active.character);
        const maxCol = Math.max(selection.anchor.character, selection.active.character);
        for (let l = s.line; l <= e.line; l++) {
          drawSelRect(l, minCol, maxCol + 1);
        }
      }
    }

    // 3.5. Draw LSP Diagnostics (wavy underline)
    const diagnostics = this.editorState.getDiagnostics();
    for (const diag of diagnostics) {
      const lineText = this.editorState.getBuffer().getLine(diag.line);
      const startChar = diag.startCharacter;
      // If endCharacter is same or not specified, underline at least 1 character width
      const endChar = Math.max(startChar + 1, Math.min(diag.endCharacter, lineText.length));

      const startX = gutterWidth + 5 + startChar * this.charWidth;
      const y = 5 + diag.line * this.lineHeight + this.lineHeight - 2;
      const length = (endChar - startChar) * this.charWidth;

      let color = '#ef4444'; // default error red
      if (diag.severity === 'warning') color = '#f97316'; // orange
      else if (diag.severity === 'info') color = '#3b82f6'; // blue
      else if (diag.severity === 'hint') color = '#10b981'; // emerald green

      r.beginPath();
      r.moveTo(startX, y);
      for (let offset = 0; offset <= length; offset += 2) {
        const waveY = y + (offset % 4 === 0 ? 1 : -1);
        r.lineTo(startX + offset, waveY);
      }
      r.stroke(color, 1.2);
    }

    // 4. Draw Vim cursor
    const cursor = this.editorState.getCursor();
    const cursorX = gutterWidth + 5 + cursor.character * this.charWidth;
    const cursorY = 5 + cursor.line * this.lineHeight;
    const mode = this.editorState.getMode();

    r.beginPath();
    if (mode === 'INSERT') {
      r.moveTo(cursorX, cursorY);
      r.lineTo(cursorX + 2, cursorY);
      r.lineTo(cursorX + 2, cursorY + this.lineHeight);
      r.lineTo(cursorX, cursorY + this.lineHeight);
      r.closePath();
      r.fill('#f43f5e'); // rose-500
    } else {
      r.moveTo(cursorX, cursorY);
      r.lineTo(cursorX + this.charWidth, cursorY);
      r.lineTo(cursorX + this.charWidth, cursorY + this.lineHeight);
      r.lineTo(cursorX, cursorY + this.lineHeight);
      r.closePath();
      r.fill('rgba(56, 189, 248, 0.7)'); // sky-400 opacity
    }

    r.restore(); // Restore scroll transform

    // 5. Draw status bar at the bottom
    const statusBarHeight = 30;
    const statusY = this.height - statusBarHeight;
    r.beginPath();
    r.moveTo(0, statusY);
    r.lineTo(this.width, statusY);
    r.lineTo(this.width, this.height);
    r.lineTo(0, this.height);
    r.closePath();
    r.fill('#1e293b'); // slate-800

    if (mode !== 'COMMAND') {
      const modeText = `-- ${mode} --`;
      const posText = `${cursor.line + 1}:${cursor.character + 1}`;
      const pendingKeys = this.editorState.getPendingKeys();
      const pendingText = pendingKeys.length > 0 ? pendingKeys.join('') : '';

      r.fillText(modeText, 10, statusY + 18, 'bold 12px monospace', '#38bdf8');
      if (pendingText) {
        r.fillText(pendingText, 120, statusY + 18, '12px monospace', '#e2e8f0');
      }
      r.fillText(posText, this.width - 60, statusY + 18, '12px monospace', '#94a3b8');
    }

    // 6. Draw autocomplete popup menu
    if (this.autocompleteItems.length > 0) {
      // Calculate popup dimensions
      const maxLabelLen = Math.max(
        ...this.autocompleteItems.map(
          (item) => item.label.length + (item.detail ? item.detail.length + 3 : 0),
        ),
      );
      const popupWidth = Math.max(160, maxLabelLen * 7.5 + 20);
      const popupHeight = Math.min(200, this.autocompleteItems.length * 18 + 6);

      // Translate coordinates from buffer space to screen space
      let popupX = cursorX;
      let popupY = cursorY + this.lineHeight - this.scrollY * this.lineHeight;

      // Adjust positioning if it overflows screen boundaries
      if (popupX + popupWidth > this.width) {
        popupX = Math.max(gutterWidth + 5, this.width - popupWidth - 5);
      }
      if (popupY + popupHeight > statusY) {
        // Render above the cursor if it would overlay/go past the status bar
        popupY = cursorY - this.scrollY * this.lineHeight - popupHeight;
      }

      // Draw background panel
      r.beginPath();
      r.roundRect(popupX, popupY, popupWidth, popupHeight, 4);
      r.closePath();
      r.fill('#1e293b'); // slate-800
      r.stroke('#475569', 1.2); // slate-600 border

      // Draw menu items
      r.save();
      r.clip(popupX, popupY, popupWidth, popupHeight);
      for (let i = 0; i < this.autocompleteItems.length; i++) {
        const item = this.autocompleteItems[i];
        const itemY = popupY + 3 + i * 18;
        if (itemY + 18 < popupY || itemY > popupY + popupHeight) continue;

        // Draw active row selection background
        if (i === this.selectedAutocompleteIndex) {
          r.beginPath();
          r.moveTo(popupX + 2, itemY);
          r.lineTo(popupX + popupWidth - 2, itemY);
          r.lineTo(popupX + popupWidth - 2, itemY + 18);
          r.lineTo(popupX + 2, itemY + 18);
          r.closePath();
          r.fill('#334155'); // slate-700
        }

        const labelColor = i === this.selectedAutocompleteIndex ? '#38bdf8' : '#f8fafc'; // sky-400 or slate-50
        r.fillText(item.label, popupX + 8, itemY + 13, '12px monospace', labelColor);
        if (item.detail) {
          r.fillText(
            `  ${item.detail}`,
            popupX + 8 + item.label.length * 7.5,
            itemY + 13,
            '10px monospace',
            '#64748b',
          );
        }
      }
      r.restore();
    }
  }
}
