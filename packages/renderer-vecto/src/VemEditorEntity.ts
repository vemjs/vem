import { UIComponent } from '@vectojs/ui';
import type { IRenderer } from '@vectojs/core';
import type { VemEditorState } from '@vemjs/core';
import { CommandBar } from './CommandBar';

export class VemEditorEntity extends UIComponent {
  private editorState: VemEditorState;
  private commandBar: CommandBar;

  private charWidth = 8.4;
  private lineHeight = 21; // Extended row height for a premium readable spacing
  private scrollY = 0; // scroll offset in lines
  private autocompleteItems: { label: string; detail?: string }[] = [];
  private selectedAutocompleteIndex = 0;
  private isFocused = false;

  // Monospace fonts stack supporting premium programming ligatures.
  // Editor text is drawn directly on a fixed character grid (charWidth ×
  // lineHeight) instead of through the rich-text flow layout: paragraph flow
  // collapses whitespace runs and manages its own line advance, both of which
  // desync glyphs from the caret/click/selection math a modal editor needs.
  private readonly editorFont =
    '14px "JetBrains Mono", "Fira Code", "Cascadia Code", Consolas, Monaco, monospace';

  constructor(editorState: VemEditorState) {
    super();
    this.editorState = editorState;
    this.width = 800;
    this.height = 600;
    this.clipChildren = true;
    this.interactive = true; // Expose as interactive for A11y focus projection

    this.commandBar = new CommandBar(editorState, this.width);
    this.commandBar.setPosition(0, this.height - 30);

    // Try to measure the exact monospace char width if running in browser
    if (typeof document !== 'undefined') {
      const measure = () => {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.font = this.editorFont;
          this.charWidth = ctx.measureText('A').width;
        }
      };
      measure();
      // The webfont usually is not loaded yet at construction time; the
      // fallback metrics differ from JetBrains Mono, so re-measure once the
      // real font arrives or every caret/click position drifts per column.
      document.fonts?.ready
        ?.then(() => {
          measure();
          this.updateFromState();
          this.scene?.markDirty();
        })
        .catch(() => {});
    }

    // Register accessibility input handlers
    this.on('keydown', (e: any) => {
      const keyboardEvent = e.nativeEvent as KeyboardEvent;
      if (!keyboardEvent) return;

      const key = keyboardEvent.key;
      const vimModeEnabled = (this.editorState as any).vimModeEnabled ?? true;

      // Handle Arrow key navigation manually in default (non-Vim) mode to avoid Vem core blocking
      if (!vimModeEnabled && ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(key)) {
        keyboardEvent.preventDefault();
        const cursor = this.editorState.getCursor();
        const buffer = this.editorState.getBuffer();
        const lineCount = buffer.getLineCount();

        let targetLine = cursor.line;
        let targetChar = cursor.character;

        if (key === 'ArrowLeft') {
          if (targetChar > 0) {
            targetChar--;
          } else if (targetLine > 0) {
            targetLine--;
            targetChar = buffer.getLine(targetLine).length;
          }
        } else if (key === 'ArrowRight') {
          const currentLineText = buffer.getLine(targetLine);
          if (targetChar < currentLineText.length) {
            targetChar++;
          } else if (targetLine < lineCount - 1) {
            targetLine++;
            targetChar = 0;
          }
        } else if (key === 'ArrowUp') {
          if (targetLine > 0) {
            targetLine--;
            const prevLineLen = buffer.getLine(targetLine).length;
            targetChar = Math.min(targetChar, prevLineLen);
          }
        } else if (key === 'ArrowDown') {
          if (targetLine < lineCount - 1) {
            targetLine++;
            const nextLineLen = buffer.getLine(targetLine).length;
            targetChar = Math.min(targetChar, nextLineLen);
          }
        }

        this.editorState.setCursor(targetLine, targetChar);
        this.updateFromState();
        this.scene?.markDirty();
        return;
      }

      let feedKey = key;
      if (keyboardEvent.ctrlKey) {
        if (key === 'r') feedKey = '<C-r>';
        else if (key === 'v') feedKey = '<C-v>';
      }

      const keysToPrevent = [
        'ArrowUp',
        'ArrowDown',
        'ArrowLeft',
        'ArrowRight',
        'Tab',
        'Backspace',
        'Escape',
        ' ',
      ];
      if (keysToPrevent.includes(key) || (keyboardEvent.ctrlKey && (key === 'r' || key === 'v'))) {
        keyboardEvent.preventDefault();
      }

      this.editorState.handleKey(feedKey);
      this.updateFromState();
    });

    this.on('focus', () => {
      this.isFocused = true;
      this.scene?.markDirty();
    });

    this.on('blur', () => {
      this.isFocused = false;
      this.scene?.markDirty();
    });

    const handlePointerClick = (e: any) => {
      const inputEl = this.scene?.getA11yElement(this.id);
      if (inputEl) {
        inputEl.focus();
      }

      const localX = e.localX;
      const localY = e.localY;
      if (localX === undefined || localY === undefined) return;

      const layout = this.editorState.layoutConfig;
      const contentOffsetY = layout.statusBarPosition === 'top' ? 30 : 0;

      const lineCount = this.editorState.getBuffer().getLineCount();
      const maxLineDigits = Math.max(2, lineCount.toString().length);
      const gutterWidth = maxLineDigits * this.charWidth + 15;

      const relativeY = localY - contentOffsetY + this.scrollY * this.lineHeight - 5;
      const clickedLine = Math.floor(relativeY / this.lineHeight);

      const relativeX = localX - gutterWidth - 5;
      const clickedChar = Math.round(relativeX / this.charWidth);

      this.editorState.setCursor(clickedLine, clickedChar);
      if (typeof window !== 'undefined') {
        (window as any).lastPointerCoords = {
          localX,
          localY,
          clickedLine,
          clickedChar,
          id: this.id,
        };
      }
      this.updateFromState();
      this.scene?.markDirty();
    };

    this.on('pointerdown', handlePointerClick);
    this.on('click', handlePointerClick);

    this.updateFromState();
  }

  public updateFromState(): void {
    const cursor = this.editorState.getCursor();

    // 1. Handle viewport scrolling to keep cursor visible
    const visibleLines = Math.floor((this.height - 35) / this.lineHeight); // reserve 35px for status bar
    if (cursor.line >= this.scrollY + visibleLines) {
      this.scrollY = cursor.line - visibleLines + 1;
    } else if (cursor.line < this.scrollY) {
      this.scrollY = cursor.line;
    }

    // 2. Mount/unmount the command bar based on mode
    const hasCommandBar = this.editorState.getMode() === 'COMMAND';
    this.commandBar.updateWidth(this.width);
    if (hasCommandBar) {
      if (!this.children.includes(this.commandBar)) {
        this.add(this.commandBar);
      }
      this.commandBar.syncFromState();
    } else {
      if (this.children.includes(this.commandBar)) {
        this.scene?.detachA11y(this.commandBar);
        this.remove(this.commandBar);
      }
    }

    const layout = this.editorState.layoutConfig;
    if (layout.statusBarPosition === 'top') {
      this.commandBar.setPosition(0, 0);
    } else {
      this.commandBar.setPosition(0, this.height - 30);
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

    // Only touch rows that can be on screen (grid rendering = free virtualization)
    const firstVisible = Math.max(0, this.scrollY);
    const lastVisible = Math.min(
      lineCount - 1,
      this.scrollY + Math.ceil(this.height / this.lineHeight),
    );
    const cursorPos = this.editorState.getCursor();
    const baselineOf = (lineIdx: number) => 5 + lineIdx * this.lineHeight + this.lineHeight * 0.72;

    // 2.5. Draw Gutter Decorations (Git diff signs)
    const decs = (this.editorState as any).gutterDecorations;
    if (decs && decs.size > 0) {
      for (let l = firstVisible; l <= lastVisible; l++) {
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

    // 2.6. Draw line numbers on the same grid as the text and caret
    const relative = layout.lineNumbers === 'relative';
    for (let l = firstVisible; l <= lastVisible; l++) {
      const isCursorLine = l === cursorPos.line;
      const num = relative && !isCursorLine ? Math.abs(l - cursorPos.line) : l + 1;
      const label = num.toString().padStart(maxLineDigits, ' ');
      const color = isCursorLine ? theme.fg : theme.gutterFg;
      r.fillText(label, 5, baselineOf(l), this.editorFont, color);
    }

    // 2.7. Draw buffer text directly on the character grid: every glyph run
    // advances by charWidth so caret, click, and selection math always match.
    const highlight = (this.editorState as any).highlightLine as
      | ((lineText: string, lineIndex: number) => { text: string; color?: string }[])
      | undefined;
    const buffer = this.editorState.getBuffer();
    for (let l = firstVisible; l <= lastVisible; l++) {
      const lineText = buffer.getLine(l);
      if (!lineText) continue;
      const baseY = baselineOf(l);
      const spans = highlight ? highlight(lineText, l) : [{ text: lineText }];
      let col = 0;
      for (const span of spans) {
        if (span.text.trim().length > 0) {
          r.fillText(
            span.text,
            gutterWidth + 5 + col * this.charWidth,
            baseY,
            this.editorFont,
            span.color || theme.fg,
          );
        }
        col += span.text.length;
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

    if (this.isFocused) {
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
    } else {
      r.beginPath();
      r.moveTo(cursorX, cursorY);
      r.lineTo(cursorX + this.charWidth, cursorY);
      r.lineTo(cursorX + this.charWidth, cursorY + this.lineHeight);
      r.lineTo(cursorX, cursorY + this.lineHeight);
      r.closePath();
      r.stroke('#475569', 1); // slate-600 border for unfocused pointer
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
    const statusMessage = this.editorState.statusMessage;
    if (mode !== 'COMMAND' && statusMessage) {
      // Transient feedback (unknown command, option errors) wins the bar
      r.fillText(statusMessage, 10, statusY + 18, 'bold 12px monospace', '#f87171');
    } else if (
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
      const recReg = this.editorState.getRecordingRegister?.();
      const modeText = recReg ? `-- ${mode} --  recording @${recReg}` : `-- ${mode} --`;
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

  public getA11yAttributes() {
    return {
      tag: 'textarea' as const,
      role: 'textbox',
      label: 'Vem Code Editor',
      value: this.editorState.getText(),
    };
  }
}
