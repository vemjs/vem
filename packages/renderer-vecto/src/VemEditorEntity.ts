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
    const theme = this.editorState.theme;
    const layout = this.editorState.layoutConfig;

    // 1. Calculate gutter width dynamically
    const maxLineDigits = Math.max(2, lineCount.toString().length);
    const gutterWidth = maxLineDigits * this.charWidth + 15;

    // 2. Sync theme colors
    this.gutterText.color = theme.gutterFg;
    this.bodyText.color = theme.fg;

    // 3. Set line numbers text
    const lineNums: string[] = [];
    for (let i = 1; i <= lineCount; i++) {
      lineNums.push(i.toString().padStart(maxLineDigits, ' '));
    }
    this.gutterText.setText(lineNums.join('\n'));

    // 4. Set editor body text
    const spans: any[] = [];
    const lines = buffer.getLines();
    lines.forEach((line, idx) => {
      const suffix = idx === lineCount - 1 ? '' : '\n';
      const highlight = (this.editorState as any).highlightLine;
      if (highlight) {
        const lineSpans = highlight(line, idx);
        if (lineSpans.length > 0) {
          const lastSpan = { ...lineSpans[lineSpans.length - 1] };
          lastSpan.text += suffix;
          spans.push(...lineSpans.slice(0, -1), lastSpan);
        } else {
          spans.push({ text: suffix });
        }
      } else {
        spans.push({ text: line + suffix });
      }
    });
    this.bodyText.setSpans(spans);

    // 5. Handle viewport scrolling to keep cursor visible
    const visibleLines = Math.floor((this.height - 35) / this.lineHeight); // reserve 35px for status bar
    if (cursor.line >= this.scrollY + visibleLines) {
      this.scrollY = cursor.line - visibleLines + 1;
    } else if (cursor.line < this.scrollY) {
      this.scrollY = cursor.line;
    }

    // 6. Position and layout based on statusBarPosition
    const hasCommandBar = this.editorState.getMode() === 'COMMAND';
    if (hasCommandBar) {
      if (!this.children.includes(this.commandBar)) {
        this.add(this.commandBar);
      }
      this.commandBar.clear();
    } else {
      if (this.children.includes(this.commandBar)) {
        this.remove(this.commandBar);
      }
    }

    const scrollOffsetY = -this.scrollY * this.lineHeight;
    if (layout.statusBarPosition === 'top') {
      this.commandBar.setPosition(0, 0);
      this.gutterText.setPosition(5, 5 + scrollOffsetY + 30);
      this.bodyText.setPosition(gutterWidth + 5, 5 + scrollOffsetY + 30);
    } else {
      this.commandBar.setPosition(0, this.height - 30);
      this.gutterText.setPosition(5, 5 + scrollOffsetY);
      this.bodyText.setPosition(gutterWidth + 5, 5 + scrollOffsetY);
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
    const theme = this.editorState.theme;
    const layout = this.editorState.layoutConfig;

    // 1. Draw editor background
    r.beginPath();
    r.moveTo(0, 0);
    r.lineTo(this.width, 0);
    r.lineTo(this.width, this.height);
    r.lineTo(0, this.height);
    r.closePath();
    r.fill(theme.bg);

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
    r.fill(theme.gutterBg);

    // Apply scrolling transformation (with offset if statusBar is top)
    const contentOffsetY = layout.statusBarPosition === 'top' ? 30 : 0;

    r.save();
    r.translate(0, -this.scrollY * this.lineHeight + contentOffsetY);

    // 2.5. Draw Gutter Decorations (Git diff signs)
    const decs = (this.editorState as any).gutterDecorations;
    if (decs && decs.size > 0) {
      for (let l = 0; l < lineCount; l++) {
        const dec = decs.get(l);
        if (dec) {
          const decY = 5 + l * this.lineHeight;
          r.beginPath();
          r.roundRect(1, decY + 2, 3, this.lineHeight - 4, 1.5);
          r.closePath();
          r.fill(dec.color);
        }
      }
    }

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
        r.fill(theme.accent + '44'); // Theme accent with 25% opacity
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
      r.fill(theme.accent);
    } else {
      r.moveTo(cursorX, cursorY);
      r.lineTo(cursorX + this.charWidth, cursorY);
      r.lineTo(cursorX + this.charWidth, cursorY + this.lineHeight);
      r.lineTo(cursorX, cursorY + this.lineHeight);
      r.closePath();
      r.fill(theme.accent + '88'); // 50% opacity accent
    }

    r.restore(); // Restore scroll transform

    // 5. Draw status bar
    const statusBarHeight = 30;
    const statusY = layout.statusBarPosition === 'top' ? 0 : this.height - statusBarHeight;
    r.beginPath();
    r.moveTo(0, statusY);
    r.lineTo(this.width, statusY);
    r.lineTo(this.width, statusY + statusBarHeight);
    r.lineTo(0, statusY + statusBarHeight);
    r.closePath();
    r.fill(theme.statusBarBg);

    const sl = this.editorState.statuslineLayout;
    if (
      mode !== 'COMMAND' &&
      ((sl.left && sl.left.length > 0) || (sl.right && sl.right.length > 0))
    ) {
      // Custom statusline layout (lualine-like)
      let startX = 0;
      if (sl.left) {
        for (const segment of sl.left) {
          const textWidth = (r as any).measureText
            ? (r as any).measureText(segment.text).width
            : segment.text.length * 8;
          const font = segment.bold ? 'bold 12px monospace' : '12px monospace';
          const color = segment.color || theme.statusBarFg;

          if (segment.bg) {
            const blockWidth = textWidth + 20;
            r.beginPath();
            r.moveTo(startX, statusY);
            r.lineTo(startX + blockWidth, statusY);
            r.lineTo(startX + blockWidth, statusY + statusBarHeight);
            r.lineTo(startX, statusY + statusBarHeight);
            r.closePath();
            r.fill(segment.bg);

            r.fillText(segment.text, startX + 10, statusY + 18, font, color);
            startX += blockWidth;
          } else {
            r.fillText(segment.text, startX + 10, statusY + 18, font, color);
            startX += textWidth + 15;
          }
        }
      }

      let endX = this.width;
      if (sl.right) {
        for (const segment of sl.right) {
          const textWidth = (r as any).measureText
            ? (r as any).measureText(segment.text).width
            : segment.text.length * 8;
          const font = segment.bold ? 'bold 12px monospace' : '12px monospace';
          const color = segment.color || theme.statusBarFg;

          if (segment.bg) {
            const blockWidth = textWidth + 20;
            endX -= blockWidth;
            r.beginPath();
            r.moveTo(endX, statusY);
            r.lineTo(endX + blockWidth, statusY);
            r.lineTo(endX + blockWidth, statusY + statusBarHeight);
            r.lineTo(endX, statusY + statusBarHeight);
            r.closePath();
            r.fill(segment.bg);

            r.fillText(segment.text, endX + 10, statusY + 18, font, color);
          } else {
            endX -= textWidth + 15;
            r.fillText(segment.text, endX + 10, statusY + 18, font, color);
          }
        }
      }
    } else if (mode !== 'COMMAND') {
      // Default fallback status bar
      const modeText = `-- ${mode} --`;
      const posText = `${cursor.line + 1}:${cursor.character + 1}`;
      const pendingKeys = this.editorState.getPendingKeys();
      const pendingText = pendingKeys.length > 0 ? pendingKeys.join('') : '';

      r.fillText(modeText, 10, statusY + 18, 'bold 12px monospace', theme.accent);
      if (pendingText) {
        r.fillText(pendingText, 120, statusY + 18, '12px monospace', theme.statusBarFg);
      }
      r.fillText(posText, this.width - 60, statusY + 18, '12px monospace', theme.statusBarFg);
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
      let popupY = cursorY + this.lineHeight - this.scrollY * this.lineHeight + contentOffsetY;

      // Adjust positioning if it overflows screen boundaries
      if (popupX + popupWidth > this.width) {
        popupX = Math.max(gutterWidth + 5, this.width - popupWidth - 5);
      }
      if (layout.statusBarPosition === 'bottom' && popupY + popupHeight > statusY) {
        popupY = cursorY - this.scrollY * this.lineHeight - popupHeight;
      } else if (layout.statusBarPosition === 'top' && popupY < 30) {
        popupY = cursorY + this.lineHeight - this.scrollY * this.lineHeight + 30;
      }

      // Draw background panel
      r.beginPath();
      r.roundRect(popupX, popupY, popupWidth, popupHeight, 4);
      r.closePath();
      r.fill(theme.statusBarBg);
      r.stroke(theme.accent + '88', 1.2);

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
          r.fill(theme.accent + '44');
        }

        const labelColor = i === this.selectedAutocompleteIndex ? theme.accent : theme.fg;
        r.fillText(item.label, popupX + 8, itemY + 13, '12px monospace', labelColor);
        if (item.detail) {
          r.fillText(
            `  ${item.detail}`,
            popupX + 8 + item.label.length * 7.5,
            itemY + 13,
            '10px monospace',
            theme.gutterFg,
          );
        }
      }
      r.restore();
    }

    // 7. Draw centered Floating Popup Picker Modal (Telescope-like)
    const popup = this.editorState.activePopup;
    if (popup) {
      const modalW = Math.min(550, this.width - 40);
      const modalH = Math.min(380, this.height - 80);
      const modalX = (this.width - modalW) / 2;
      const modalY = (this.height - modalH) / 2;

      // Draw modal backdrop shade
      r.beginPath();
      r.roundRect(0, 0, this.width, this.height, 0);
      r.closePath();
      r.fill('rgba(15, 23, 42, 0.6)'); // Translucent dark overlay

      // Draw main panel
      r.beginPath();
      r.roundRect(modalX, modalY, modalW, modalH, 6);
      r.closePath();
      r.fill(theme.bg);
      r.stroke(theme.accent, 1.5);

      // Title
      r.fillText(
        popup.title.toUpperCase(),
        modalX + 15,
        modalY + 28,
        'bold 13px Outfit, monospace',
        theme.accent,
      );

      // Input Search Bar
      r.beginPath();
      r.roundRect(modalX + 15, modalY + 42, modalW - 30, 28, 4);
      r.closePath();
      r.fill(theme.statusBarBg);
      r.stroke(theme.accent + '44', 1);

      const queryText = `> ${this.editorState.popupFilterText}`;
      r.fillText(queryText, modalX + 25, modalY + 60, '13px monospace', theme.fg);

      // Draw flashing block cursor in search bar
      const cursorOffset = (r as any).measureText
        ? (r as any).measureText(queryText).width
        : queryText.length * 8;
      r.beginPath();
      r.roundRect(modalX + 25 + cursorOffset + 2, modalY + 48, 8, 15, 0);
      r.closePath();
      r.fill(theme.accent);

      // Divider line
      r.beginPath();
      r.moveTo(modalX + 15, modalY + 82);
      r.lineTo(modalX + modalW - 15, modalY + 82);
      r.closePath();
      r.stroke(theme.gutterBg, 1.2);

      // Render filtered list items
      const items = this.editorState.getFilteredPopupItems();
      const listStartY = modalY + 95;
      const itemH = 22;
      const maxVisibleItems = 11;
      const startIndex = Math.max(
        0,
        Math.min(
          this.editorState.activePopupIndex - Math.floor(maxVisibleItems / 2),
          items.length - maxVisibleItems,
        ),
      );

      r.save();
      r.clip(modalX + 15, modalY + 85, modalW - 30, modalH - 100);

      for (let i = 0; i < Math.min(maxVisibleItems, items.length); i++) {
        const itemIdx = startIndex + i;
        const item = items[itemIdx];
        if (!item) break;

        const rowY = listStartY + i * itemH;

        if (itemIdx === this.editorState.activePopupIndex) {
          // Draw active row highlight background
          r.beginPath();
          r.roundRect(modalX + 15, rowY, modalW - 30, itemH, 4);
          r.closePath();
          r.fill(theme.accent + '33');
        }

        const labelColor = itemIdx === this.editorState.activePopupIndex ? theme.accent : theme.fg;
        r.fillText(
          item.label,
          modalX + 25,
          rowY + 15,
          itemIdx === this.editorState.activePopupIndex ? 'bold 12px monospace' : '12px monospace',
          labelColor,
        );

        if (item.detail) {
          const detailX = modalX + modalW - 35 - item.detail.length * 7.5;
          r.fillText(
            item.detail,
            Math.max(modalX + 250, detailX),
            rowY + 15,
            '10px monospace',
            theme.gutterFg,
          );
        }
      }
      r.restore();

      // Draw item counts indicator
      const countText = `${this.editorState.activePopupIndex + 1}/${items.length}`;
      r.fillText(
        countText,
        modalX + modalW - 20 - countText.length * 7.5,
        modalY + 28,
        '11px monospace',
        theme.gutterFg,
      );
    }
  }
}
