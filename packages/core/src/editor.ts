import type { Position, EditorMode } from './index';
import { VimBuffer, UndoManager } from './buffer';
import {
  getWordForward,
  getWordBackward,
  getWordEndForward,
  getWORDForward,
  getWORDBackward,
  getWORDEndForward,
  getMatchingBracket,
  getTextObjectRange,
} from './motions';
import { parseKeys } from './parser';
import type { ParsedCommand } from './parser';

export interface RegisterContent {
  text: string;
  type: 'char' | 'line' | 'block';
}

export type DiagnosticSeverity = 'error' | 'warning' | 'info' | 'hint';

export interface Diagnostic {
  /** Zero-based line number */
  line: number;
  /** Zero-based start character */
  startCharacter: number;
  /** Zero-based end character */
  endCharacter: number;
  severity: DiagnosticSeverity;
  message: string;
  /** Optional: source language server name, e.g. 'tsserver' */
  source?: string;
}

export type VisualType = 'char' | 'line' | 'block';

export interface VisualSelection {
  type: VisualType;
  anchor: Position;
  active: Position;
}

export interface VemTheme {
  bg: string;
  fg: string;
  sidebarBg: string;
  gutterBg: string;
  gutterFg: string;
  statusBarBg: string;
  statusBarFg: string;
  accent: string;
  /** Color of the `~` empty-line markers (Vim's NonText). Optional; falls back to gutterFg. */
  nonText?: string;
}

export interface VemLayoutConfig {
  sidebarPosition: 'left' | 'right' | 'hidden';
  statusBarPosition: 'bottom' | 'top';
  sidebarWidth: number;
  /** Gutter numbering: absolute (default) or Vim-style relative-to-cursor. */
  lineNumbers: 'none' | 'absolute' | 'relative';
}

export interface StatuslineSegment {
  text: string;
  color?: string;
  bg?: string;
  bold?: boolean;
}

export interface StatuslineLayout {
  left: StatuslineSegment[];
  right: StatuslineSegment[];
}

export interface FloatingPopupItem {
  label: string;
  detail?: string;
  value: any;
}

export interface FloatingPopupConfig {
  title: string;
  items: FloatingPopupItem[];
  onSelect: (item: FloatingPopupItem) => void;
  onCancel?: () => void;
}

export interface TextSpan {
  text: string;
  color?: string;
  bold?: boolean;
}

export interface GutterDecoration {
  type: 'add' | 'change' | 'delete';
  symbol: string;
  color: string;
}

// Faithful to Vim's default dark colorscheme: near-black background, light-grey
// Normal text, a blue `~` NonText column, and the classic dark-grey StatusLine.
const DEFAULT_THEME: VemTheme = {
  bg: '#000000',
  fg: '#d0d0d0',
  sidebarBg: '#080808',
  gutterBg: '#000000',
  gutterFg: '#767676', // LineNr (dark grey)
  statusBarBg: '#bcbcbc', // StatusLine: light bar with dark text (Vim default)
  statusBarFg: '#080808',
  accent: '#5f87d7', // Directory / SpecialKey blue used by :intro and the caret
  nonText: '#5f87d7', // the `~` empty-line marker (NonText)
};

const DEFAULT_LAYOUT_CONFIG: VemLayoutConfig = {
  sidebarPosition: 'left',
  statusBarPosition: 'bottom',
  sidebarWidth: 240,
  lineNumbers: 'none',
};

export class VemEditorState {
  public theme: VemTheme = { ...DEFAULT_THEME };
  public layoutConfig: VemLayoutConfig = { ...DEFAULT_LAYOUT_CONFIG };
  public statuslineLayout: StatuslineLayout = { left: [], right: [] };
  public fileUri: string = 'untitled';
  public activePopup: FloatingPopupConfig | null = null;
  public activePopupIndex = 0;
  public popupFilterText = '';
  public projectFiles: string[] = [];
  public highlightLine?: (lineText: string, lineIndex: number) => TextSpan[];
  public gutterDecorations: Map<number, GutterDecoration> = new Map();
  private mode: EditorMode = 'NORMAL';
  private cursor: Position = { line: 0, character: 0 };
  private desiredCol: number = 0;
  private buffer: VimBuffer;
  private undoManager: UndoManager;
  private register: RegisterContent | null = null;
  private pendingKeys: string[] = [];
  private visualSelection: VisualSelection | null = null;
  private isInsertMutated = false;
  private changeCallbacks: (() => void)[] = [];
  private commandText = '';
  private commandPrefix: ':' | '/' = ':';
  private lastSearch = '';
  private lastSearchDir: 1 | -1 = 1;
  /** Transient one-line status feedback (e.g. unknown ex-command). Cleared on the next key. */
  public statusMessage = '';
  private exCommands: Map<string, (arg: string) => void> = new Map();
  private saveCallbacks: (() => void)[] = [];
  private quitCallbacks: ((force: boolean) => void)[] = [];
  private splitCallbacks: ((direction: 'horizontal' | 'vertical') => void)[] = [];
  private customKeybindings: Map<EditorMode, Map<string, string>> = new Map();
  private didOpenBufferCallbacks: (() => void)[] = [];
  private changeBufferCallbacks: (() => void)[] = [];
  private changeModeCallbacks: ((mode: EditorMode) => void)[] = [];
  private pluginCommandCallbacks: ((commandName: string) => void)[] = [];
  private diagnostics: Diagnostic[] = [];
  private publishDiagnosticsCallbacks: ((diagnostics: Diagnostic[]) => void)[] = [];

  constructor(initialText?: string) {
    this.buffer = new VimBuffer(initialText);
    this.undoManager = new UndoManager();
    this.buffer.onChange(() => {
      this.triggerChangeBuffer();
    });
    setTimeout(() => {
      this.triggerDidOpenBuffer();
    }, 0);
  }

  // --- Callbacks & Events ---
  public onChange(callback: () => void): void {
    this.changeCallbacks.push(callback);
  }

  private triggerChange(): void {
    for (const cb of this.changeCallbacks) {
      cb();
    }
  }

  public onSave(callback: () => void): void {
    this.saveCallbacks.push(callback);
  }

  public onQuit(callback: (force: boolean) => void): void {
    this.quitCallbacks.push(callback);
  }

  public onSplit(callback: (direction: 'horizontal' | 'vertical') => void): void {
    this.splitCallbacks.push(callback);
  }

  private triggerSave(): void {
    for (const cb of this.saveCallbacks) {
      cb();
    }
  }

  private triggerQuit(force = false): void {
    for (const cb of this.quitCallbacks) {
      cb(force);
    }
  }

  private triggerSplit(direction: 'horizontal' | 'vertical'): void {
    for (const cb of this.splitCallbacks) {
      cb(direction);
    }
  }

  public registerKeybinding(mode: EditorMode, keys: string, commandName: string): void {
    if (!this.customKeybindings.has(mode)) {
      this.customKeybindings.set(mode, new Map());
    }
    this.customKeybindings.get(mode)!.set(keys, commandName);
  }

  public onDidOpenBuffer(callback: () => void): void {
    this.didOpenBufferCallbacks.push(callback);
  }

  public onDidChangeBuffer(callback: () => void): void {
    this.changeBufferCallbacks.push(callback);
  }

  public onDidChangeMode(callback: (mode: EditorMode) => void): void {
    this.changeModeCallbacks.push(callback);
  }

  public onExecutePluginCommand(callback: (commandName: string) => void): void {
    this.pluginCommandCallbacks.push(callback);
  }

  public onPublishDiagnostics(callback: (diagnostics: Diagnostic[]) => void): void {
    this.publishDiagnosticsCallbacks.push(callback);
  }

  public setDiagnostics(diagnostics: Diagnostic[]): void {
    this.diagnostics = diagnostics;
    for (const cb of this.publishDiagnosticsCallbacks) {
      cb(this.diagnostics);
    }
  }

  public setTheme(theme: Partial<VemTheme>): void {
    this.theme = { ...this.theme, ...theme };
    this.triggerChange();
  }

  public setLayoutConfig(config: Partial<VemLayoutConfig>): void {
    this.layoutConfig = { ...this.layoutConfig, ...config };
    this.triggerChange();
  }

  public setStatuslineLayout(layout: StatuslineLayout): void {
    this.statuslineLayout = layout;
    this.triggerChange();
  }

  public setFileUri(uri: string): void {
    this.fileUri = uri;
    this.triggerChange();
  }

  public setSyntaxHighlighter(
    highlighter: (lineText: string, lineIndex: number) => TextSpan[],
  ): void {
    this.highlightLine = highlighter;
    this.triggerChange();
  }

  public setGutterDecorations(decorations: Map<number, GutterDecoration>): void {
    this.gutterDecorations = decorations;
    this.triggerChange();
  }

  public showPopup(config: FloatingPopupConfig): void {
    this.activePopup = config;
    this.activePopupIndex = 0;
    this.popupFilterText = '';
    this.triggerChange();
  }

  public closePopup(): void {
    this.activePopup = null;
    this.activePopupIndex = 0;
    this.popupFilterText = '';
    this.triggerChange();
  }

  public getFilteredPopupItems(): FloatingPopupItem[] {
    if (!this.activePopup) return [];
    if (!this.popupFilterText) return this.activePopup.items;
    const query = this.popupFilterText.toLowerCase();
    return this.activePopup.items.filter(
      (item) =>
        item.label.toLowerCase().includes(query) ||
        (item.detail && item.detail.toLowerCase().includes(query)),
    );
  }

  private handlePopupKey(key: string): void {
    const items = this.getFilteredPopupItems();
    if (key === 'Escape') {
      const onCancel = this.activePopup?.onCancel;
      this.closePopup();
      if (onCancel) onCancel();
      return;
    }
    if (key === 'Enter') {
      if (items.length > 0) {
        const selected = items[this.activePopupIndex];
        const onSelect = this.activePopup!.onSelect;
        this.closePopup();
        onSelect(selected);
      } else {
        this.closePopup();
      }
      return;
    }
    if (key === 'ArrowDown' || key === 'j') {
      if (items.length > 0) {
        this.activePopupIndex = (this.activePopupIndex + 1) % items.length;
        this.triggerChange();
      }
      return;
    }
    if (key === 'ArrowUp' || key === 'k') {
      if (items.length > 0) {
        this.activePopupIndex = (this.activePopupIndex - 1 + items.length) % items.length;
        this.triggerChange();
      }
      return;
    }
    if (key === 'Backspace') {
      this.popupFilterText = this.popupFilterText.substring(0, this.popupFilterText.length - 1);
      this.activePopupIndex = 0;
      this.triggerChange();
      return;
    }
    if (key.length === 1) {
      this.popupFilterText += key;
      this.activePopupIndex = 0;
      this.triggerChange();
      return;
    }
  }

  public getDiagnostics(): Diagnostic[] {
    return this.diagnostics;
  }

  private triggerDidOpenBuffer(): void {
    for (const cb of this.didOpenBufferCallbacks) {
      cb();
    }
  }

  private triggerChangeBuffer(): void {
    for (const cb of this.changeBufferCallbacks) {
      cb();
    }
  }

  private triggerChangeMode(mode: EditorMode): void {
    for (const cb of this.changeModeCallbacks) {
      cb(mode);
    }
  }

  private executePluginCommand(commandName: string): void {
    for (const cb of this.pluginCommandCallbacks) {
      cb(commandName);
    }
  }

  // --- Getters & Setters ---
  public getMode(): EditorMode {
    return this.mode;
  }

  public getCustomKeybindings(): Map<EditorMode, Map<string, string>> {
    return this.customKeybindings;
  }

  public getText(): string {
    return this.buffer.getText();
  }

  public setMode(mode: EditorMode): void {
    if (this.mode === mode) return;

    // Handle exiting insert mode
    if (this.mode === 'INSERT') {
      this.isInsertMutated = false;
    }

    this.mode = mode;

    // Initialize visual selection if entering visual mode
    if (mode === 'VISUAL') {
      this.visualSelection = {
        type: 'char',
        anchor: { ...this.cursor },
        active: { ...this.cursor },
      };
    } else {
      this.visualSelection = null;
    }

    this.triggerChangeMode(mode);
    this.triggerChange();
  }

  public getCursor(): Position {
    return { ...this.cursor };
  }

  public setCursor(line: number, character: number): void {
    const lineCount = this.buffer.getLineCount();
    const targetLine = Math.max(0, Math.min(lineCount - 1, line));
    const lineText = this.buffer.getLine(targetLine);
    const targetChar = Math.max(0, Math.min(lineText.length, character));

    this.cursor = { line: targetLine, character: targetChar };
    this.desiredCol = targetChar;
    // In Visual mode the cursor IS the selection's active end (Vim semantics);
    // pointer-driven cursor placement must extend the selection like motions do.
    if (this.mode === 'VISUAL' && this.visualSelection) {
      this.visualSelection.active = { ...this.cursor };
    }
    this.triggerChange();
  }

  public getBuffer(): VimBuffer {
    return this.buffer;
  }

  public getPendingKeys(): string[] {
    return [...this.pendingKeys];
  }

  public getVisualSelection(): VisualSelection | null {
    return this.visualSelection;
  }

  public getRegister(): RegisterContent | null {
    return this.register;
  }

  public getCommandText(): string {
    return this.commandText;
  }

  /** `:` for ex commands, `/` for search — what the command line should show. */
  public getCommandPrefix(): ':' | '/' {
    return this.commandPrefix;
  }

  public setCommandText(text: string): void {
    if (this.commandText === text) return;
    this.commandText = text;
    this.triggerChange();
  }

  // --- Macro recording / replay (Vim q / @) ---
  private recordingRegister: string | null = null;
  private recordedKeys: string[] = [];
  private macroRegisters: Map<string, string[]> = new Map();
  private isReplaying = false;
  private awaitingRecordRegister = false;
  private awaitingReplayRegister = false;
  private lastPlayedRegister: string | null = null;

  /** True while `q{reg}` recording is active. */
  public isRecording(): boolean {
    return this.recordingRegister !== null;
  }

  /** The register currently being recorded into, or null. */
  public getRecordingRegister(): string | null {
    return this.recordingRegister;
  }

  private replayMacro(reg: string): void {
    const keys = this.macroRegisters.get(reg);
    if (!keys || keys.length === 0) return;
    this.lastPlayedRegister = reg;
    // Nested macro-control is suppressed during replay to avoid runaway
    // recursion in a browser tab; a replayed buffer is executed literally.
    this.isReplaying = true;
    try {
      for (const k of keys) this.dispatchKey(k);
    } finally {
      this.isReplaying = false;
    }
    this.triggerChange();
  }

  // --- Key Input Entry Point ---
  public handleKey(key: string): void {
    // Macro control lives above the dispatcher so `q`/`@` are intercepted
    // before they reach normal-mode command parsing — but only at top level
    // (NORMAL mode, no pending multi-key sequence, not mid-replay).
    if (!this.isReplaying && this.mode === 'NORMAL' && this.pendingKeys.length === 0) {
      if (this.awaitingRecordRegister) {
        this.awaitingRecordRegister = false;
        if (/^[a-z0-9]$/i.test(key)) {
          this.recordingRegister = key.toLowerCase();
          this.recordedKeys = [];
          this.triggerChange();
        }
        return;
      }
      if (this.awaitingReplayRegister) {
        this.awaitingReplayRegister = false;
        const reg = key === '@' ? this.lastPlayedRegister : key.toLowerCase();
        if (reg) this.replayMacro(reg);
        return;
      }
      if (key === 'q') {
        if (this.recordingRegister) {
          this.macroRegisters.set(this.recordingRegister, [...this.recordedKeys]);
          this.recordingRegister = null;
          this.triggerChange();
        } else {
          this.awaitingRecordRegister = true;
        }
        return;
      }
      if (key === '@') {
        this.awaitingReplayRegister = true;
        return;
      }
    }

    // Capture the raw keystroke into the active recording (the stop-`q` and
    // register selectors are handled above, so they never land here).
    if (this.recordingRegister && !this.isReplaying) {
      this.recordedKeys.push(key);
    }

    this.dispatchKey(key);
  }

  private dispatchKey(key: string): void {
    this.statusMessage = '';
    if (this.activePopup) {
      this.handlePopupKey(key);
      return;
    }
    if (this.mode === 'COMMAND') {
      if (key === 'Escape') {
        this.setMode('NORMAL');
        this.commandText = '';
        this.commandPrefix = ':';
        this.triggerChange();
        return;
      }
      if (key === 'Enter') {
        if (this.commandPrefix === '/') {
          this.performSearch(this.commandText, 1);
        } else {
          this.executeCommandLineText(this.commandText);
        }
        this.setMode('NORMAL');
        this.commandText = '';
        this.commandPrefix = ':';
        this.triggerChange();
        return;
      }
      if (key === 'Backspace') {
        // Backspacing over the ':' prompt (empty command line) leaves COMMAND
        // mode, matching Vim — otherwise the ':' is undeletable and only Escape
        // gets you out.
        if (this.commandText.length === 0) {
          this.setMode('NORMAL');
          this.commandPrefix = ':';
          this.triggerChange();
          return;
        }
        this.commandText = this.commandText.substring(0, this.commandText.length - 1);
        this.triggerChange();
        return;
      }
      if (key.length === 1) {
        this.commandText += key;
        this.triggerChange();
        return;
      }
      return;
    }

    // Check custom keybindings
    const modeBindings = this.customKeybindings.get(this.mode);
    if (modeBindings) {
      const currentSequence = [...this.pendingKeys, key].join('');
      let hasExactMatch = false;
      let hasPartialMatch = false;
      let matchedCommand = '';

      for (const [keys, cmd] of modeBindings.entries()) {
        if (keys === currentSequence) {
          hasExactMatch = true;
          matchedCommand = cmd;
        } else if (keys.startsWith(currentSequence)) {
          hasPartialMatch = true;
        }
      }

      if (hasExactMatch && !hasPartialMatch) {
        this.pendingKeys = [];
        this.executePluginCommand(matchedCommand);
        this.triggerChange();
        return;
      }

      if (hasPartialMatch) {
        this.pendingKeys.push(key);
        this.triggerChange();
        return;
      }

      if (this.pendingKeys.length > 0) {
        const keysToReplay = [...this.pendingKeys, key];
        this.pendingKeys = [];
        for (const k of keysToReplay) {
          this.handleKeyStandard(k);
        }
        return;
      }
    }

    this.handleKeyStandard(key);
  }

  private handleKeyStandard(key: string): void {
    if (this.mode === 'INSERT') {
      if (key === 'Escape') {
        this.setMode('NORMAL');
        // Move cursor back one character in Normal mode
        this.cursor.character = Math.max(0, this.cursor.character - 1);
        this.desiredCol = this.cursor.character;
        this.triggerChange();
        return;
      }
      if (key === 'Backspace') {
        this.handleBackspaceInInsert();
        this.triggerChange();
        return;
      }
      if (key === 'Enter') {
        this.handleEnterInInsert();
        this.triggerChange();
        return;
      }
      if (key.length === 1) {
        this.handleCharInputInInsert(key);
        this.triggerChange();
        return;
      }
      return;
    }

    // Normal or Visual Mode
    if (key === 'Escape') {
      this.pendingKeys = [];
      if (this.mode === 'VISUAL') {
        this.setMode('NORMAL');
      }
      this.triggerChange();
      return;
    }

    this.pendingKeys.push(key);
    const parsed = parseKeys(this.pendingKeys, this.mode);

    if (!parsed.isValid) {
      this.pendingKeys = [];
      return;
    }

    if (parsed.isComplete) {
      this.pendingKeys = [];
      this.executeCommand(parsed);
      this.triggerChange();
    }
  }

  // --- Insertion Helpers ---
  private handleCharInputInInsert(char: string): void {
    if (!this.isInsertMutated) {
      this.saveStateForUndo();
      this.isInsertMutated = true;
    }
    const line = this.buffer.getLine(this.cursor.line);
    const before = line.substring(0, this.cursor.character);
    const after = line.substring(this.cursor.character);
    this.cursor.character++;
    this.desiredCol = this.cursor.character;
    this.buffer.setLine(this.cursor.line, before + char + after);
  }

  private handleBackspaceInInsert(): void {
    if (!this.isInsertMutated) {
      this.saveStateForUndo();
      this.isInsertMutated = true;
    }
    if (this.cursor.character > 0) {
      const line = this.buffer.getLine(this.cursor.line);
      const before = line.substring(0, this.cursor.character - 1);
      const after = line.substring(this.cursor.character);
      this.cursor.character--;
      this.desiredCol = this.cursor.character;
      this.buffer.setLine(this.cursor.line, before + after);
    } else if (this.cursor.line > 0) {
      const prevLine = this.buffer.getLine(this.cursor.line - 1);
      const currLine = this.buffer.getLine(this.cursor.line);
      const lineToDelete = this.cursor.line;
      this.cursor.line--;
      this.cursor.character = prevLine.length;
      this.desiredCol = this.cursor.character;
      this.buffer.setLine(this.cursor.line, prevLine + currLine);
      this.buffer.deleteLines(lineToDelete, lineToDelete);
    }
  }

  private handleEnterInInsert(): void {
    if (!this.isInsertMutated) {
      this.saveStateForUndo();
      this.isInsertMutated = true;
    }
    const line = this.buffer.getLine(this.cursor.line);
    const before = line.substring(0, this.cursor.character);
    const after = line.substring(this.cursor.character);
    const oldLine = this.cursor.line;
    this.cursor.line++;
    this.cursor.character = 0;
    this.desiredCol = 0;
    this.buffer.setLine(oldLine, before);
    this.buffer.insertLine(oldLine + 1, after);
  }

  // --- Command Execution ---
  private executeCommand(cmd: ParsedCommand): void {
    if (this.mode === 'VISUAL') {
      this.executeVisualCommand(cmd);
      return;
    }

    // NORMAL mode commands
    if (cmd.operator) {
      this.executeOperatorCommand(cmd);
      return;
    }

    if (cmd.motion) {
      this.moveCursorByMotion(cmd.motion, cmd.count);
      return;
    }

    if (cmd.command) {
      switch (cmd.command) {
        case 'i':
          this.setMode('INSERT');
          break;
        case 'I':
          this.moveToFirstNonWhitespace();
          this.setMode('INSERT');
          break;
        case 'a':
          this.moveCursorRightForInsert();
          this.setMode('INSERT');
          break;
        case 'A':
          this.moveToEndOfLine();
          this.setMode('INSERT');
          break;
        case 'o':
          this.saveStateForUndo();
          this.buffer.insertLine(this.cursor.line + 1, '');
          this.cursor.line++;
          this.cursor.character = 0;
          this.desiredCol = 0;
          this.setMode('INSERT');
          break;
        case 'O':
          this.saveStateForUndo();
          this.buffer.insertLine(this.cursor.line, '');
          this.cursor.character = 0;
          this.desiredCol = 0;
          this.setMode('INSERT');
          break;
        case 'x':
          this.saveStateForUndo();
          this.deleteCharUnderCursor(cmd.count);
          break;
        case 'X': {
          const from = Math.max(0, this.cursor.character - cmd.count);
          if (from < this.cursor.character) {
            this.saveStateForUndo();
            const line = this.buffer.getLine(this.cursor.line);
            this.register = {
              text: line.substring(from, this.cursor.character),
              type: 'char',
            };
            this.buffer.setLine(
              this.cursor.line,
              line.substring(0, from) + line.substring(this.cursor.character),
            );
            this.cursor.character = from;
            this.desiredCol = from;
          }
          break;
        }
        case 'D':
          this.saveStateForUndo();
          this.deleteToEndOfLine();
          break;
        case 'C':
          this.saveStateForUndo();
          this.deleteToEndOfLine(true);
          this.setMode('INSERT');
          break;
        case 'Y': {
          const endLine = Math.min(
            this.buffer.getLineCount() - 1,
            this.cursor.line + cmd.count - 1,
          );
          const lines: string[] = [];
          for (let l = this.cursor.line; l <= endLine; l++) lines.push(this.buffer.getLine(l));
          this.register = { text: lines.join('\n') + '\n', type: 'line' };
          break;
        }
        case 's': {
          this.saveStateForUndo();
          this.deleteCharUnderCursor(cmd.count);
          this.setMode('INSERT');
          break;
        }
        case 'S': {
          this.saveStateForUndo();
          this.register = { text: this.buffer.getLine(this.cursor.line) + '\n', type: 'line' };
          this.buffer.setLine(this.cursor.line, '');
          this.cursor.character = 0;
          this.desiredCol = 0;
          this.setMode('INSERT');
          break;
        }
        case '/':
          this.setMode('COMMAND');
          this.commandText = '';
          this.commandPrefix = '/';
          break;
        case 'n':
          this.repeatSearch(1);
          break;
        case 'N':
          this.repeatSearch(-1);
          break;
        case 'u':
          this.undo();
          break;
        case '<C-r>':
          this.redo();
          break;
        case 'v':
          this.setMode('VISUAL');
          if (this.visualSelection) this.visualSelection.type = 'char';
          break;
        case 'V':
          this.setMode('VISUAL');
          if (this.visualSelection) this.visualSelection.type = 'line';
          break;
        case '<C-v>':
          this.setMode('VISUAL');
          if (this.visualSelection) this.visualSelection.type = 'block';
          break;
        case 'p':
          this.saveStateForUndo();
          this.paste(false);
          break;
        case 'P':
          this.saveStateForUndo();
          this.paste(true);
          break;
        case ':':
          this.setMode('COMMAND');
          this.commandText = '';
          break;
        // Scroll motions. Vim ties these to the window height; with no viewport
        // coupling here we use fixed line counts that feel like a half/full
        // screen, so Ctrl-D/U/F/B/E/Y move the cursor instead of the browser
        // hijacking them (Ctrl-D bookmarks, Ctrl-F finds, …).
        case '<C-d>':
          this.moveCursorVertically(this.halfPageLines);
          break;
        case '<C-u>':
          this.moveCursorVertically(-this.halfPageLines);
          break;
        case '<C-f>':
          this.moveCursorVertically(this.halfPageLines * 2);
          break;
        case '<C-b>':
          this.moveCursorVertically(-this.halfPageLines * 2);
          break;
        case '<C-e>':
          this.moveCursorVertically(1);
          break;
        case '<C-y>':
          this.moveCursorVertically(-1);
          break;
      }
    }
  }

  /** Approximate half-screen for Ctrl-D/U (no viewport model in core). */
  private halfPageLines = 15;

  private moveCursorVertically(delta: number): void {
    const last = this.buffer.getLineCount() - 1;
    this.cursor.line = Math.max(0, Math.min(last, this.cursor.line + delta));
    const lineLen = this.buffer.getLine(this.cursor.line).length;
    const maxChar = this.mode === 'INSERT' ? lineLen : Math.max(0, lineLen - 1);
    this.cursor.character = Math.min(this.desiredCol, maxChar);
  }

  private static globalExCommands: Map<string, (arg: string, state: VemEditorState) => void> =
    new Map();

  /**
   * Register an ex command for EVERY editor state — Vim commands are
   * editor-global, so this is what applications almost always want: states
   * created later (splits, tabs) see the command too. The handler receives
   * the argument text and the state the command ran in.
   */
  public static registerGlobalExCommand(
    name: string,
    handler: (arg: string, state: VemEditorState) => void,
  ): void {
    VemEditorState.globalExCommands.set(name, handler);
  }

  /**
   * Register a custom command-line (ex) command, e.g. `:docs` or `:help`,
   * on this state only. Instance commands win over global ones, which win
   * over the built-ins.
   */
  public registerExCommand(name: string, handler: (arg: string) => void): void {
    this.exCommands.set(name, handler);
  }

  private executeCommandLineText(cmdLine: string): void {
    const trimmed = cmdLine.trim();
    if (!trimmed) return;
    const spaceIdx = trimmed.indexOf(' ');
    const name = spaceIdx === -1 ? trimmed : trimmed.substring(0, spaceIdx);
    const arg = spaceIdx === -1 ? '' : trimmed.substring(spaceIdx + 1).trim();

    const custom = this.exCommands.get(name);
    if (custom) {
      custom(arg);
      return;
    }
    const global = VemEditorState.globalExCommands.get(name);
    if (global) {
      global(arg, this);
      return;
    }

    // A trailing '!' forces the command (e.g. :q! quit without saving).
    const force = name.endsWith('!');
    const base = force ? name.slice(0, -1) : name;

    if (base === 'w') {
      this.triggerSave();
    } else if (base === 'q') {
      this.triggerQuit(force);
    } else if (base === 'wq' || base === 'x') {
      this.triggerSave();
      this.triggerQuit(force);
    } else if (base === 'vsp' || base === 'vs') {
      this.triggerSplit('vertical');
    } else if (base === 'sp') {
      this.triggerSplit('horizontal');
    } else if (base === 'set') {
      this.executeSetOption(arg);
    } else {
      this.statusMessage = `E492: Not an editor command: ${name}`;
    }
  }

  private executeSetOption(option: string): void {
    if (option === 'relativenumber' || option === 'rnu') {
      this.layoutConfig = { ...this.layoutConfig, lineNumbers: 'relative' };
    } else if (option === 'norelativenumber' || option === 'nornu') {
      // Falls back to absolute if numbers are on, else stays off.
      const next = this.layoutConfig.lineNumbers === 'relative' ? 'absolute' : 'none';
      this.layoutConfig = { ...this.layoutConfig, lineNumbers: next };
    } else if (option === 'number' || option === 'nu') {
      this.layoutConfig = { ...this.layoutConfig, lineNumbers: 'absolute' };
    } else if (option === 'nonumber' || option === 'nonu') {
      this.layoutConfig = { ...this.layoutConfig, lineNumbers: 'none' };
    } else {
      this.statusMessage = `E518: Unknown option: ${option}`;
    }
  }

  private executeVisualCommand(cmd: ParsedCommand): void {
    if (cmd.motion) {
      this.moveCursorByMotion(cmd.motion, cmd.count);
      if (this.visualSelection) {
        this.visualSelection.active = { ...this.cursor };
      }
      return;
    }

    const op = cmd.command || cmd.operator;
    if (op === 'd' || op === 'x' || op === 'c' || op === 'y') {
      this.saveStateForUndo();
      this.operateOnVisualSelection(op);
      if (op === 'c') {
        this.setMode('INSERT');
      } else {
        this.setMode('NORMAL');
      }
    }
  }

  // --- Motions Execution ---
  private moveCursorByMotion(motion: string, count: number): void {
    for (let i = 0; i < count; i++) {
      switch (motion) {
        case 'h':
          this.cursor.character = Math.max(0, this.cursor.character - 1);
          this.desiredCol = this.cursor.character;
          break;
        case 'l': {
          const lineLen = this.buffer.getLine(this.cursor.line).length;
          const maxChar = this.mode === 'INSERT' ? lineLen : Math.max(0, lineLen - 1);
          this.cursor.character = Math.min(maxChar, this.cursor.character + 1);
          this.desiredCol = this.cursor.character;
          break;
        }
        case 'j':
          if (this.cursor.line < this.buffer.getLineCount() - 1) {
            this.cursor.line++;
            const lineLen = this.buffer.getLine(this.cursor.line).length;
            const maxChar = this.mode === 'INSERT' ? lineLen : Math.max(0, lineLen - 1);
            this.cursor.character = Math.min(maxChar, this.desiredCol);
          }
          break;
        case 'k':
          if (this.cursor.line > 0) {
            this.cursor.line--;
            const lineLen = this.buffer.getLine(this.cursor.line).length;
            const maxChar = this.mode === 'INSERT' ? lineLen : Math.max(0, lineLen - 1);
            this.cursor.character = Math.min(maxChar, this.desiredCol);
          }
          break;
        case 'w':
          this.cursor = getWordForward(this.buffer, this.cursor);
          this.desiredCol = this.cursor.character;
          break;
        case 'b':
          this.cursor = getWordBackward(this.buffer, this.cursor);
          this.desiredCol = this.cursor.character;
          break;
        case 'e':
          this.cursor = getWordEndForward(this.buffer, this.cursor);
          this.desiredCol = this.cursor.character;
          break;
        case 'W':
          this.cursor = getWORDForward(this.buffer, this.cursor);
          this.desiredCol = this.cursor.character;
          break;
        case 'B':
          this.cursor = getWORDBackward(this.buffer, this.cursor);
          this.desiredCol = this.cursor.character;
          break;
        case 'E':
          this.cursor = getWORDEndForward(this.buffer, this.cursor);
          this.desiredCol = this.cursor.character;
          break;
        case '%': {
          const match = getMatchingBracket(this.buffer, this.cursor);
          if (match) {
            this.cursor = match;
            this.desiredCol = match.character;
          }
          break;
        }
        case '^': {
          const text = this.buffer.getLine(this.cursor.line);
          const first = text.search(/\S/);
          this.cursor.character = first === -1 ? 0 : first;
          this.desiredCol = this.cursor.character;
          break;
        }
        case '0':
          this.cursor.character = 0;
          this.desiredCol = 0;
          break;
        case '$': {
          const lineLen = this.buffer.getLine(this.cursor.line).length;
          this.cursor.character = Math.max(0, lineLen - 1);
          this.desiredCol = Infinity;
          break;
        }
        case 'gg':
          this.cursor.line = 0;
          this.cursor.character = 0;
          this.desiredCol = 0;
          break;
        case 'G':
          this.cursor.line = this.buffer.getLineCount() - 1;
          this.cursor.character = 0;
          this.desiredCol = 0;
          break;
      }
    }
  }

  // --- Operator Command Execution ---
  private executeOperatorCommand(cmd: ParsedCommand): void {
    const op = cmd.operator!;
    const count = cmd.count;

    // Double operator e.g. dd, cc, yy
    if (cmd.command === op + op) {
      this.saveStateForUndo();
      const startLine = this.cursor.line;
      const endLine = Math.min(this.buffer.getLineCount() - 1, this.cursor.line + count - 1);

      // Extract text for yank
      const yankedLines: string[] = [];
      for (let l = startLine; l <= endLine; l++) {
        yankedLines.push(this.buffer.getLine(l));
      }
      this.register = {
        text: yankedLines.join('\n') + '\n',
        type: 'line',
      };

      if (op === 'd' || op === 'c') {
        this.buffer.deleteLines(startLine, endLine);
        this.cursor.line = Math.min(this.cursor.line, this.buffer.getLineCount() - 1);
        this.cursor.character = 0;
        this.desiredCol = 0;
        if (op === 'c') {
          this.buffer.insertLine(this.cursor.line, '');
          this.setMode('INSERT');
        }
      }
      return;
    }

    // Motions or Text Objects
    let range: { start: Position; end: Position } | null = null;
    let isLineWise = false;

    if (cmd.textObject) {
      range = getTextObjectRange(this.buffer, this.cursor, cmd.textObject);
    } else if (cmd.motion) {
      const startPos = { ...this.cursor };
      this.moveCursorByMotion(cmd.motion, count);
      const endPos = { ...this.cursor };
      this.cursor = { ...startPos }; // Restore cursor before operation

      range = { start: startPos, end: endPos };

      // Line-wise motion check
      if (cmd.motion === 'j' || cmd.motion === 'k' || cmd.motion === 'gg' || cmd.motion === 'G') {
        isLineWise = true;
      }
    }

    if (!range) return;

    this.saveStateForUndo();

    // Ensure start is before end
    let s = { ...range.start };
    let e = { ...range.end };
    if (s.line > e.line || (s.line === e.line && s.character > e.character)) {
      const temp = s;
      s = e;
      e = temp;
    }

    if (isLineWise) {
      const yankedLines: string[] = [];
      for (let l = s.line; l <= e.line; l++) {
        yankedLines.push(this.buffer.getLine(l));
      }
      this.register = {
        text: yankedLines.join('\n') + '\n',
        type: 'line',
      };

      if (op === 'd' || op === 'c') {
        this.buffer.deleteLines(s.line, e.line);
        this.cursor.line = Math.min(s.line, this.buffer.getLineCount() - 1);
        this.cursor.character = 0;
        this.desiredCol = 0;
        if (op === 'c') {
          this.buffer.insertLine(this.cursor.line, '');
          this.setMode('INSERT');
        }
      }
    } else {
      // Character-wise operation
      // Inclusive vs Exclusive: motions like $ or text objects are inclusive. Others are exclusive.
      // E.g. 'dw' deletes from start to start of next word (exclusive).
      // 'd$' deletes to end of line (inclusive).
      // e/E land ON the word's last char and % ON the matching bracket, so the
      // operated range includes that character, exactly like d$ (:help inclusive).
      let isInclusive =
        cmd.textObject !== undefined ||
        cmd.motion === '$' ||
        cmd.motion === 'e' ||
        cmd.motion === 'E' ||
        cmd.motion === '%';

      const startLineText = this.buffer.getLine(s.line);
      const endLineText = this.buffer.getLine(e.line);

      let yankText = '';
      if (s.line === e.line) {
        yankText = startLineText.substring(s.character, e.character + (isInclusive ? 1 : 0));
      } else {
        yankText = startLineText.substring(s.character) + '\n';
        for (let l = s.line + 1; l < e.line; l++) {
          yankText += this.buffer.getLine(l) + '\n';
        }
        yankText += endLineText.substring(0, e.character + (isInclusive ? 1 : 0));
      }

      this.register = {
        text: yankText,
        type: 'char',
      };

      if (op === 'd' || op === 'c') {
        const deleteEnd = { ...e };
        if (isInclusive) {
          deleteEnd.character++;
        }
        this.buffer.deleteRange(s, deleteEnd);
        this.cursor = { ...s };
        this.desiredCol = this.cursor.character;
        if (op === 'c') {
          this.setMode('INSERT');
        }
      }
    }
  }

  // --- Visual Mode Operations ---
  private operateOnVisualSelection(op: string): void {
    if (!this.visualSelection) return;

    const { type, anchor, active } = this.visualSelection;
    let s = { ...anchor };
    let e = { ...active };

    // Standard ordering
    if (s.line > e.line || (s.line === e.line && s.character > e.character)) {
      const temp = s;
      s = e;
      e = temp;
    }

    if (type === 'line') {
      const startLine = Math.min(s.line, e.line);
      const endLine = Math.max(s.line, e.line);

      const yankedLines: string[] = [];
      for (let l = startLine; l <= endLine; l++) {
        yankedLines.push(this.buffer.getLine(l));
      }
      this.register = {
        text: yankedLines.join('\n') + '\n',
        type: 'line',
      };

      if (op === 'd' || op === 'c') {
        this.buffer.deleteLines(startLine, endLine);
        this.cursor.line = Math.min(startLine, this.buffer.getLineCount() - 1);
        this.cursor.character = 0;
        this.desiredCol = 0;
        if (op === 'c') {
          this.buffer.insertLine(this.cursor.line, '');
        }
      }
    } else if (type === 'char') {
      const startLineText = this.buffer.getLine(s.line);
      const endLineText = this.buffer.getLine(e.line);

      let yankText = '';
      if (s.line === e.line) {
        yankText = startLineText.substring(s.character, e.character + 1);
      } else {
        yankText = startLineText.substring(s.character) + '\n';
        for (let l = s.line + 1; l < e.line; l++) {
          yankText += this.buffer.getLine(l) + '\n';
        }
        yankText += endLineText.substring(0, e.character + 1);
      }

      this.register = {
        text: yankText,
        type: 'char',
      };

      if (op === 'd' || op === 'c') {
        const deleteEnd = { ...e };
        deleteEnd.character++; // Inclusive delete
        this.buffer.deleteRange(s, deleteEnd);
        this.cursor = { ...s };
        this.desiredCol = this.cursor.character;
      }
    } else if (type === 'block') {
      // Block-wise selection yanks/deletes character rectangles
      const minCol = Math.min(anchor.character, active.character);
      const maxCol = Math.max(anchor.character, active.character);
      const minLine = Math.min(anchor.line, active.line);
      const maxLine = Math.max(anchor.line, active.line);

      const yankedBlocks: string[] = [];
      for (let l = minLine; l <= maxLine; l++) {
        const lineText = this.buffer.getLine(l);
        const chunk = lineText.substring(minCol, maxCol + 1);
        yankedBlocks.push(chunk);
      }

      this.register = {
        text: yankedBlocks.join('\n'),
        type: 'block',
      };

      if (op === 'd' || op === 'c') {
        for (let l = minLine; l <= maxLine; l++) {
          const lineText = this.buffer.getLine(l);
          const before = lineText.substring(0, minCol);
          const after = lineText.substring(maxCol + 1);
          this.buffer.setLine(l, before + after);
        }
        this.cursor = { line: minLine, character: minCol };
        this.desiredCol = minCol;
      }
    }
  }

  // --- Editing Actions ---
  private moveToFirstNonWhitespace(): void {
    const line = this.buffer.getLine(this.cursor.line);
    const match = /^[ \t]*/.exec(line);
    const index = match ? match[0].length : 0;
    this.cursor.character = Math.min(index, Math.max(0, line.length - 1));
    this.desiredCol = this.cursor.character;
  }

  private moveCursorRightForInsert(): void {
    const lineLen = this.buffer.getLine(this.cursor.line).length;
    this.cursor.character = Math.min(lineLen, this.cursor.character + 1);
    this.desiredCol = this.cursor.character;
  }

  private moveToEndOfLine(): void {
    const lineLen = this.buffer.getLine(this.cursor.line).length;
    this.cursor.character = lineLen;
    this.desiredCol = Infinity;
  }

  /** Vim's D / C: kill from the cursor to end of line (charwise register). */
  private deleteToEndOfLine(keepCursorForInsert = false): void {
    const line = this.buffer.getLine(this.cursor.line);
    if (this.cursor.character >= line.length) return;
    this.register = { text: line.substring(this.cursor.character), type: 'char' };
    this.buffer.setLine(this.cursor.line, line.substring(0, this.cursor.character));
    if (!keepCursorForInsert) {
      this.cursor.character = Math.max(0, this.cursor.character - 1);
    }
    this.desiredCol = this.cursor.character;
  }

  /**
   * Literal (non-regex) search with wrapscan, matching Vim's default UX for
   * plain patterns. `dir` 1 searches forward from just after the cursor,
   * -1 backward from just before it.
   */
  private performSearch(query: string, dir: 1 | -1): void {
    const q = query || this.lastSearch;
    if (!q) return;
    this.lastSearch = q;
    this.lastSearchDir = dir;
    this.jumpToMatch(q, dir);
  }

  private repeatSearch(mult: 1 | -1): void {
    if (!this.lastSearch) return;
    this.jumpToMatch(this.lastSearch, (this.lastSearchDir * mult) as 1 | -1);
  }

  private jumpToMatch(q: string, dir: 1 | -1): void {
    const lineCount = this.buffer.getLineCount();
    const move = (line: number, character: number) => {
      this.cursor = { line, character };
      this.desiredCol = character;
    };

    if (dir === 1) {
      for (let offset = 0; offset <= lineCount; offset++) {
        const l = (this.cursor.line + offset) % lineCount;
        const text = this.buffer.getLine(l);
        const from = offset === 0 ? this.cursor.character + 1 : 0;
        const idx = text.indexOf(q, from);
        if (idx !== -1) {
          // On the wrapped-around visit of the cursor line, any match counts.
          if (offset === lineCount && idx > this.cursor.character) break;
          move(l, idx);
          return;
        }
      }
    } else {
      for (let offset = 0; offset <= lineCount; offset++) {
        const l = (this.cursor.line - offset + lineCount * 2) % lineCount;
        const text = this.buffer.getLine(l);
        const upTo = offset === 0 ? this.cursor.character - 1 : text.length;
        if (upTo >= 0) {
          const idx = text.lastIndexOf(q, upTo);
          if (idx !== -1 && (offset !== 0 || idx < this.cursor.character)) {
            move(l, idx);
            return;
          }
        }
      }
    }
    this.statusMessage = `E486: Pattern not found: ${q}`;
  }

  private deleteCharUnderCursor(count: number): void {
    const line = this.buffer.getLine(this.cursor.line);
    if (line.length === 0) return;

    const deleteCount = Math.min(count, line.length - this.cursor.character);
    const deletedText = line.substring(this.cursor.character, this.cursor.character + deleteCount);

    this.register = {
      text: deletedText,
      type: 'char',
    };

    const before = line.substring(0, this.cursor.character);
    const after = line.substring(this.cursor.character + deleteCount);
    this.buffer.setLine(this.cursor.line, before + after);

    // Adjust cursor if it's past the end of the line in Normal mode
    const newLineLen = this.buffer.getLine(this.cursor.line).length;
    this.cursor.character = Math.min(this.cursor.character, Math.max(0, newLineLen - 1));
    this.desiredCol = this.cursor.character;
  }

  private paste(before: boolean): void {
    if (!this.register) return;

    const { text, type } = this.register;

    if (type === 'line') {
      const targetLine = before ? this.cursor.line : this.cursor.line + 1;
      const pasteLines = text.split('\n');
      // If trailing newline, split leaves empty string at end, remove it
      if (pasteLines[pasteLines.length - 1] === '') {
        pasteLines.pop();
      }
      for (let i = 0; i < pasteLines.length; i++) {
        this.buffer.insertLine(targetLine + i, pasteLines[i]);
      }
      this.cursor.line = targetLine;
      this.cursor.character = 0;
      this.desiredCol = 0;
    } else {
      // Character-wise or block-wise paste (block-wise simple fallback to char paste)
      const line = this.buffer.getLine(this.cursor.line);
      const insertIdx = before
        ? this.cursor.character
        : Math.min(line.length, this.cursor.character + 1);

      const endPos = this.buffer.insertText({ line: this.cursor.line, character: insertIdx }, text);
      this.cursor = endPos;
      // In Normal mode, leave cursor on last pasted character
      this.cursor.character = Math.max(0, this.cursor.character - 1);
      this.desiredCol = this.cursor.character;
    }
  }

  // --- Undo & Redo ---
  private saveStateForUndo(): void {
    this.modified = true;
    this.undoManager.push(this.buffer.getLines());
  }

  /** True once the buffer has been edited; drives Vim's intro-screen dismissal. */
  public modified = false;

  /**
   * Whether Vim's centered intro splash should show: an unmodified, empty,
   * single-line buffer (the fresh-start screen). Cleared the moment the buffer
   * is touched.
   */
  public shouldShowIntro(): boolean {
    return !this.modified && this.buffer.getLineCount() === 1 && this.buffer.getLine(0) === '';
  }

  public undo(): void {
    const prevState = this.undoManager.undo(this.buffer.getLines());
    if (prevState) {
      this.buffer.setLines(prevState);
      // Clamp cursor
      this.cursor.line = Math.min(this.cursor.line, this.buffer.getLineCount() - 1);
      const lineLen = this.buffer.getLine(this.cursor.line).length;
      this.cursor.character = Math.min(this.cursor.character, Math.max(0, lineLen - 1));
      this.desiredCol = this.cursor.character;
    }
  }

  public redo(): void {
    const nextState = this.undoManager.redo(this.buffer.getLines());
    if (nextState) {
      this.buffer.setLines(nextState);
      // Clamp cursor
      this.cursor.line = Math.min(this.cursor.line, this.buffer.getLineCount() - 1);
      const lineLen = this.buffer.getLine(this.cursor.line).length;
      this.cursor.character = Math.min(this.cursor.character, Math.max(0, lineLen - 1));
      this.desiredCol = this.cursor.character;
    }
  }
}
