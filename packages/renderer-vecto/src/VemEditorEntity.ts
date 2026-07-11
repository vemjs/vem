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
  // Mouse selection (Vim mouse=a): the buffer cell the button went down on,
  // null when no button is held; dragSelected guards the trailing click.
  private dragOrigin: { line: number; character: number } | null = null;
  private dragSelected = false;

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

    // Pointer → buffer cell on the monospace grid (shared by click + drag).
    const cellAt = (localX: number, localY: number) => {
      const layout = this.editorState.layoutConfig;
      const contentOffsetY = layout.statusBarPosition === 'top' ? 30 : 0;
      const gutterWidth = this.gutterWidth();

      const relativeY = localY - contentOffsetY + this.scrollY * this.lineHeight - 5;
      const line = Math.floor(relativeY / this.lineHeight);

      const relativeX = localX - gutterWidth - 5;
      const character = Math.round(relativeX / this.charWidth);
      return { line, character };
    };

    const handlePointerClick = (e: any) => {
      const inputEl = this.scene?.getA11yElement(this.id);
      if (inputEl) {
        inputEl.focus();
      }

      const localX = e.localX;
      const localY = e.localY;
      if (localX === undefined || localY === undefined) return;

      const cell = cellAt(localX, localY);

      // Vim mouse=a: a plain left click in Visual mode leaves Visual and just
      // moves the cursor; only a drag (below) creates a selection.
      if (this.editorState.getMode() === 'VISUAL') {
        this.editorState.setMode('NORMAL');
      }
      this.editorState.setCursor(cell.line, cell.character);
      this.dragOrigin = cell;
      if (typeof window !== 'undefined') {
        (window as any).lastPointerCoords = {
          localX,
          localY,
          clickedLine: cell.line,
          clickedChar: cell.character,
          id: this.id,
        };
      }
      this.updateFromState();
      this.scene?.markDirty();
    };

    this.on('pointerdown', (e: any) => {
      // A fresh press always starts clean; any previous drag's trailing-click
      // guard is stale by now.
      this.dragSelected = false;
      handlePointerClick(e);
    });
    this.on('click', (e: any) => {
      // A drag that just selected text emits a trailing 'click' at the release
      // point — placing the cursor there would collapse the fresh selection.
      if (this.dragSelected) {
        this.dragSelected = false;
        return;
      }
      handlePointerClick(e);
    });

    // Vim mouse=a drag: leaving the press cell with the button held starts a
    // charwise Visual selection anchored at the press cell; the active end
    // follows the pointer and the selection survives release (stay in VISUAL).
    this.on('pointermove', (e: any) => {
      if (!this.dragOrigin) return;
      // The release can happen outside the entity (no pointerup for us) — a
      // move reporting no pressed buttons means the drag already ended.
      if (e.nativeEvent && e.nativeEvent.buttons === 0) {
        this.dragOrigin = null;
        return;
      }
      if (e.localX === undefined || e.localY === undefined) return;
      const cell = cellAt(e.localX, e.localY);

      const state = this.editorState;
      if (state.getMode() !== 'VISUAL') {
        if (cell.line === this.dragOrigin.line && cell.character === this.dragOrigin.character) {
          return; // still inside the press cell — not a drag yet
        }
        // Anchor at the press cell: pointerdown already put the cursor there,
        // and entering VISUAL snapshots the cursor as the anchor.
        state.setMode('VISUAL');
        this.dragSelected = true;
      }
      state.setCursor(cell.line, cell.character);
      this.updateFromState();
      this.scene?.markDirty();
    });

    // No pointerleave→end: aborting when the cursor briefly outruns the entity
    // edge mid-selection is the drag-lag bug @vectojs/ui's ResizablePanel fixed;
    // the buttons===0 check above catches releases that happen outside.
    this.on('pointerup', () => {
      this.dragOrigin = null;
    });

    this.updateFromState();
  }

  /**
   * Left gutter width. Zero when line numbers are off (Vim's `nonumber`
   * default) so text and the `~` markers sit at the left edge; otherwise wide
   * enough for the line-number digits.
   */
  private gutterWidth(): number {
    const ln = this.editorState.layoutConfig.lineNumbers;
    if (ln !== 'absolute' && ln !== 'relative') return 0;
    const lineCount = this.editorState.getBuffer().getLineCount();
    const maxLineDigits = Math.max(2, lineCount.toString().length);
    return maxLineDigits * this.charWidth + 15;
  }

  /**
   * The centered Vim-style intro splash. Vem-branded but faithful to Vim's
   * `:intro` format; `<Enter>`/`<F1>` tokens render in the accent (Directory)
   * color like Vim.
   */
  private drawIntro(r: IRenderer, theme: { fg: string; accent: string }): void {
    const lines: string[] = [
      'VEM - Vim, Enhanced & Modal',
      '',
      'a canvas-native modal editor',
      'Vem is free and open source',
      '',
      'type  :help<Enter>       for on-line help',
      'type  :q<Enter>          to close the buffer',
      'type  :Explorer<Enter>   to toggle the file tree',
      'type  :PluginLab<Enter>  to toggle the plugin panel',
    ];
    const lh = this.lineHeight;
    const blockH = lines.length * lh;
    // Vim places the intro slightly above vertical center.
    const startY = Math.max(lh, this.height * 0.38 - blockH / 2);
    // Center on the widest line for a stable left edge (Vim left-aligns the
    // block, centered as a whole).
    const widest = lines.reduce((m, l) => Math.max(m, l.length), 0);
    const blockX = Math.max(0, (this.width - widest * this.charWidth) / 2);

    for (let i = 0; i < lines.length; i++) {
      const text = lines[i];
      const y = startY + i * lh + lh * 0.72;
      // Color the <...> key tokens in the accent color, rest in fg.
      const parts = text.split(/(<[^>]+>)/);
      let col = 0;
      for (const part of parts) {
        if (part.length === 0) continue;
        const color = part.startsWith('<') && part.endsWith('>') ? theme.accent : theme.fg;
        r.fillText(part, blockX + col * this.charWidth, y, this.editorFont, color);
        col += part.length;
      }
    }
  }

  /** Vim's ruler scroll indicator: All / Top / Bot / NN%. */
  private scrollWord(): string {
    const lineCount = this.editorState.getBuffer().getLineCount();
    const visible = Math.floor((this.height - 35) / this.lineHeight);
    if (lineCount <= visible) return 'All';
    if (this.scrollY <= 0) return 'Top';
    if (this.scrollY + visible >= lineCount) return 'Bot';
    return `${Math.round((this.scrollY / (lineCount - visible)) * 100)}%`;
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
        this.remove(this.commandBar); // remove() detaches its a11y node itself
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
    const gutterWidth = this.gutterWidth();

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

    // 2.6. Draw line numbers on the same grid as the text and caret. Vim's
    // default is `nonumber`, so numbers only appear when :set number/relnu.
    const showNumbers = layout.lineNumbers === 'absolute' || layout.lineNumbers === 'relative';
    const relative = layout.lineNumbers === 'relative';
    if (showNumbers) {
      for (let l = firstVisible; l <= lastVisible; l++) {
        const isCursorLine = l === cursorPos.line;
        const num = relative && !isCursorLine ? Math.abs(l - cursorPos.line) : l + 1;
        const label = num.toString().padStart(maxLineDigits, ' ');
        const color = isCursorLine ? theme.fg : theme.gutterFg;
        r.fillText(label, 5, baselineOf(l), this.editorFont, color);
      }
    }

    // 2.65. Draw `~` markers for screen rows past the end of the buffer —
    // Vim's NonText empty-line column. Starts at the first row with no buffer
    // line, so a fresh single-empty-line buffer shows the cursor on row 0 and
    // tildes below.
    const nonText = (theme as { nonText?: string }).nonText ?? theme.gutterFg;
    const screenRows = Math.ceil(this.height / this.lineHeight) + 1;
    const tildeStart = Math.max(lineCount, firstVisible);
    const tildeEnd = this.scrollY + screenRows;
    for (let l = tildeStart; l <= tildeEnd; l++) {
      r.fillText('~', 5, baselineOf(l), this.editorFont, nonText);
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

    // 4.5. Vim intro splash — centered, shown only on a fresh empty buffer and
    // cleared the moment the buffer is edited (see VemEditorState.shouldShowIntro).
    if ((this.editorState as { shouldShowIntro?: () => boolean }).shouldShowIntro?.()) {
      this.drawIntro(r, theme);
    }

    // 5. Draw status bar
    const statusBarHeight = 30;
    const statusY = layout.statusBarPosition === 'top' ? 0 : this.height - statusBarHeight;
    const sl = this.editorState.statuslineLayout;
    const hasCustomStatusline =
      (sl.left && sl.left.length > 0) || (sl.right && sl.right.length > 0);
    // Only paint a statusline bar when a plugin (lualine) supplies one. Bare Vim
    // (`laststatus=1`, single window) shows no bar — just the ruler + mode
    // message on the last line over the editor background.
    if (hasCustomStatusline) {
      r.beginPath();
      r.moveTo(0, statusY);
      r.lineTo(this.width, statusY);
      r.lineTo(this.width, statusY + statusBarHeight);
      r.lineTo(0, statusY + statusBarHeight);
      r.closePath();
      r.fill(theme.statusBarBg);
    }

    const statusMessage = this.editorState.statusMessage;
    const statusFg = hasCustomStatusline ? theme.statusBarFg : theme.fg;
    if (mode !== 'COMMAND' && statusMessage) {
      // Transient feedback (unknown command, option errors) wins the bar
      r.fillText(statusMessage, 10, statusY + 18, 'bold 12px monospace', '#f87171');
    } else if (mode !== 'COMMAND' && hasCustomStatusline) {
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
      // Bare Vim last line: mode message on the left (only INSERT/VISUAL/REPLACE
      // — NORMAL shows nothing, matching `showmode`), pending keys + ruler on
      // the right.
      const recReg = this.editorState.getRecordingRegister?.();
      const y = statusY + 18;
      const modeLabel = mode === 'NORMAL' ? '' : `-- ${mode} --`;
      const leftText = recReg
        ? `${modeLabel}${modeLabel ? '  ' : ''}recording @${recReg}`
        : modeLabel;
      if (leftText) {
        r.fillText(leftText, 10, y, 'bold 12px monospace', statusFg);
      }

      // Ruler: `line,col-vcol` + scroll position (Top/Bot/All/NN%). An empty
      // buffer reads `0,0-1` like Vim.
      const isEmpty =
        this.editorState.getBuffer().getLineCount() === 1 &&
        this.editorState.getBuffer().getLine(0) === '';
      const rulerPos = isEmpty ? '0,0-1' : `${cursor.line + 1},${cursor.character + 1}`;
      const scrollWord = this.scrollWord();
      r.fillText(scrollWord, this.width - 60, y, '12px monospace', statusFg);
      r.fillText(rulerPos, this.width - 180, y, '12px monospace', statusFg);

      const pendingKeys = this.editorState.getPendingKeys();
      const pendingText = pendingKeys.length > 0 ? pendingKeys.join('') : '';
      if (pendingText) {
        r.fillText(pendingText, this.width - 260, y, '12px monospace', statusFg);
      }
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
