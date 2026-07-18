import type { Position, EditorMode } from './index';
import { VimBuffer, UndoManager } from './buffer';
import {
  getWordForward,
  getWordBackward,
  getWordEndForward,
  getWordEndBackward,
  getWORDForward,
  getWORDBackward,
  getWORDEndForward,
  getMatchingBracket,
  getTextObjectRange,
} from './motions';
import { parseKeys } from './parser';
import type { ParsedCommand } from './parser';

/**
 * <Home>/<End>/arrow-key equivalents to the hjkl/0/$ motions they mirror in
 * real Vim — reused so Normal/Visual mode gets identical clamping and (for
 * Visual) selection-extension behavior as their letter counterparts, instead
 * of a second hand-rolled cursor-movement path.
 */
const NAV_KEY_MOTION: Record<string, string> = {
  ArrowLeft: 'h',
  ArrowRight: 'l',
  ArrowUp: 'k',
  ArrowDown: 'j',
  Home: '0',
  End: '$',
};

export interface RegisterContent {
  text: string;
  type: 'char' | 'line' | 'block';
}

/**
 * Pluggable system-clipboard backend. Core has zero DOM/environment
 * dependency (no `navigator`, no Tauri APIs), so the host — the browser
 * renderer or the desktop shell — supplies this: `write` is fired
 * synchronously whenever the unnamed register changes and `:set
 * clipboard=unnamed` is on; reading the OS clipboard is inherently async in
 * both a browser and Tauri, so there's no `read` here — the host instead
 * pushes fresh text in via {@link VemEditorState.setSystemClipboardText}
 * (e.g. on window focus), keeping `p`/`P` fully synchronous.
 */
export interface ClipboardProvider {
  write(text: string): void;
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

// Mutable copies backing newly-constructed states. A `.vemrc` sets these
// (via ConfigLoader) so every buffer opened afterwards — a fresh tab, a
// split, a file passed on the CLI — inherits it, not just whichever state
// happened to be active when the config loaded. Vim's vimrc is global in
// exactly this sense: options apply to windows that don't exist yet.
let activeDefaultTheme: VemTheme = { ...DEFAULT_THEME };
let activeDefaultLayoutConfig: VemLayoutConfig = { ...DEFAULT_LAYOUT_CONFIG };

export class VemEditorState {
  /** Change the theme every subsequently-constructed state starts with. */
  public static setDefaultTheme(theme: Partial<VemTheme>): void {
    activeDefaultTheme = { ...activeDefaultTheme, ...theme };
  }

  /** Change the layout config every subsequently-constructed state starts with. */
  public static setDefaultLayoutConfig(config: Partial<VemLayoutConfig>): void {
    activeDefaultLayoutConfig = { ...activeDefaultLayoutConfig, ...config };
  }

  /** Restore the built-in Vim defaults (test isolation; `--clean`/`:set all&`). */
  public static resetDefaults(): void {
    activeDefaultTheme = { ...DEFAULT_THEME };
    activeDefaultLayoutConfig = { ...DEFAULT_LAYOUT_CONFIG };
    VemEditorState.didCreateStateCallbacks = [];
  }

  public theme: VemTheme = { ...activeDefaultTheme };
  public layoutConfig: VemLayoutConfig = { ...activeDefaultLayoutConfig };
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
  private clipboardMode: 'internal' | 'system' = 'internal';
  private clipboardProvider: ClipboardProvider | null = null;
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
  private scrollToLineCallbacks: ((line: number) => void)[] = [];
  private openFileUnderCursorCallbacks: ((path: string) => void)[] = [];
  private windowActionCallbacks: ((action: string) => void)[] = [];
  private optionsChangedCallbacks: ((key: string, value: string) => void)[] = [];
  /** The cursor position BEFORE the last change (for g;/g,). */
  private changeList: Position[] = [];
  /** Jump list (Ctrl-o/Ctrl-i): oldest entries at index 0. */
  private jumpList: Position[] = [];
  private jumpListIndex: number = -1;
  /** Number of visible lines in the viewport, set by the renderer (for H/M/L). */
  public visibleLines: number = 0;
  /** Current scroll line offset, set by the renderer (for H/M/L). */
  public viewportTop: number = 0;
  /** Stored marks (lowercase per-buffer, uppercase global shared). */
  private marks: Map<string, Position> = new Map();
  /** The last insert position (for `gi`). */
  private lastInsertPosition: Position | null = null;
  /** The last visual selection (for `gv`). */
  private lastVisualSelection: VisualSelection | null = null;

  constructor(initialText?: string) {
    this.buffer = new VimBuffer(initialText);
    this.undoManager = new UndoManager();
    this.buffer.onChange(() => {
      if (this.recordingDotActive) {
        this.recordingDotMutated = true;
      }
      this.triggerChangeBuffer();
    });
    setTimeout(() => {
      this.triggerDidOpenBuffer();
    }, 0);
    for (const cb of VemEditorState.didCreateStateCallbacks) {
      cb(this);
    }
  }

  /**
   * Static hook fired at the end of every VemEditorState construction —
   * states are created deep inside the renderer (splits, new tabs, snapshot
   * restore), so a host that must attach per-state services (the plugin
   * registry, project-file lists) has no other seam that covers them all.
   * Register before constructing any workspace. Returns an unsubscribe
   * function.
   */
  public static onDidCreateState(callback: (state: VemEditorState) => void): () => void {
    VemEditorState.didCreateStateCallbacks.push(callback);
    return () => {
      const idx = VemEditorState.didCreateStateCallbacks.indexOf(callback);
      if (idx !== -1) VemEditorState.didCreateStateCallbacks.splice(idx, 1);
    };
  }

  private static didCreateStateCallbacks: Array<(state: VemEditorState) => void> = [];

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
    // Optimistic clear, matching Vim's own UX: `:w` marks the buffer clean
    // immediately rather than waiting on a save callback that may be async
    // (e.g. renderer-vecto's File System Access write). A failed save still
    // surfaces its own status message (see WorkspaceExplorer's onSave
    // handler) — it just doesn't re-arm the `:q` E37 guard, a known,
    // narrow gap versus real Vim's synchronous-write guarantee.
    this.modified = false;
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

  public onScrollToLine(callback: (line: number) => void): void {
    this.scrollToLineCallbacks.push(callback);
  }

  public onOpenFileUnderCursor(callback: (path: string) => void): void {
    this.openFileUnderCursorCallbacks.push(callback);
  }

  public onOptionsChanged(callback: (key: string, value: string) => void): void {
    this.optionsChangedCallbacks.push(callback);
  }

  private triggerOptionsChanged(key: string, value: string): void {
    for (const cb of this.optionsChangedCallbacks) cb(key, value);
  }

  private triggerScrollToLine(line: number): void {
    for (const cb of this.scrollToLineCallbacks) {
      cb(line);
    }
  }

  private triggerOpenFileUnderCursor(path: string): void {
    for (const cb of this.openFileUnderCursorCallbacks) {
      cb(path);
    }
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

  /**
   * Run a plugin command by name through every attached registry. Public so
   * hosts and plugins (e.g. a command palette) can trigger commands without
   * reaching into the private callback list.
   */
  public executePluginCommand(commandName: string): void {
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

    // Track last insert position for `gi`
    if (mode === 'INSERT') {
      this.lastInsertPosition = { ...this.cursor };
      // Inserting before the last char (a) or at end (A) goes one right
    }

    // Store last visual selection for `gv` when exiting VISUAL
    if (this.mode === 'VISUAL' && mode !== 'VISUAL') {
      if (this.visualSelection) {
        this.lastVisualSelection = { ...this.visualSelection };
      }
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

  /** Write every yank/delete to `this.register`, and mirror it out to the
   * system clipboard too when `:set clipboard=unnamed` is active. */
  private setRegister(content: RegisterContent): void {
    this.register = content;
    if (this.clipboardMode === 'system') {
      this.clipboardProvider?.write(content.text);
    }
  }

  /** `internal` (default `"` register only) or `system` (`:set clipboard=unnamed`). */
  public getClipboardMode(): 'internal' | 'system' {
    return this.clipboardMode;
  }

  /** Programmatic equivalent of `:set clipboard=unnamed` — used by ConfigLoader. */
  public setClipboardMode(mode: 'internal' | 'system'): void {
    this.clipboardMode = mode;
  }

  /** Host-supplied system-clipboard write backend — see {@link ClipboardProvider}. */
  public setClipboardProvider(provider: ClipboardProvider | null): void {
    this.clipboardProvider = provider;
  }

  /**
   * Push freshly-read OS clipboard text in so `p`/`P` see it — since reading
   * the system clipboard is async everywhere, the host calls this proactively
   * (e.g. on window/pane focus) rather than core awaiting a read mid-keystroke.
   * A no-op unless `:set clipboard=unnamed` is active.
   */
  public setSystemClipboardText(text: string): void {
    if (this.clipboardMode !== 'system') return;
    this.register = { text, type: 'char' };
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

  // --- Dot-repeat (Vim `.`) ---
  // Tracks the raw keystrokes of the currently in-progress top-level NORMAL-
  // mode command (through any INSERT-mode typing it triggers, until back to
  // a settled NORMAL state) and promotes them to `lastChangeKeys` only if
  // the buffer was actually mutated — motions don't get remembered, changes
  // do, matching Vim's "repeat last change" semantics.
  private recordingDotActive = false;
  private recordingDotKeys: string[] = [];
  private recordingDotMutated = false;
  private lastChangeKeys: string[] = [];

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

  /** Replay the last completed change verbatim (Vim `.`). */
  private repeatLastChange(): void {
    if (this.lastChangeKeys.length === 0) return;
    const keys = this.lastChangeKeys;
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
      if (key === '.' && !this.awaitingRecordRegister && !this.awaitingReplayRegister) {
        this.repeatLastChange();
        return;
      }
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

    // A fresh top-level NORMAL-mode key starts a new dot-repeat candidate;
    // once started, every key (including a whole INSERT-mode typing spree)
    // keeps accumulating until we're back to a settled NORMAL state.
    if (!this.isReplaying) {
      if (this.mode === 'NORMAL' && this.pendingKeys.length === 0 && !this.recordingDotActive) {
        this.recordingDotActive = true;
        this.recordingDotKeys = [];
        this.recordingDotMutated = false;
      }
      if (this.recordingDotActive) {
        this.recordingDotKeys.push(key);
      }
    }

    this.dispatchKey(key);

    if (
      !this.isReplaying &&
      this.recordingDotActive &&
      this.mode === 'NORMAL' &&
      this.pendingKeys.length === 0
    ) {
      if (this.recordingDotMutated) {
        this.lastChangeKeys = [...this.recordingDotKeys];
      }
      this.recordingDotActive = false;
      this.recordingDotKeys = [];
    }
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
      // Arrow/Home/PageUp/PageDown move the cursor without leaving INSERT,
      // exactly like real Vim/most editors; <End> lands past the last
      // character (unlike Normal-mode $) so appending stays natural.
      if (key === 'End') {
        this.moveToEndOfLine();
        this.triggerChange();
        return;
      }
      if (key === 'PageUp' || key === 'PageDown') {
        this.moveCursorVertically(
          key === 'PageUp' ? -this.halfPageLines * 2 : this.halfPageLines * 2,
        );
        this.triggerChange();
        return;
      }
      const insertNavMotion = NAV_KEY_MOTION[key];
      if (insertNavMotion && insertNavMotion !== '$') {
        this.moveCursorByMotion(insertNavMotion, 1);
        this.triggerChange();
        return;
      }
      if (key.length === 1) {
        this.handleCharInputInInsert(key);
        this.triggerChange();
        return;
      }

      // Insert mode special keys (Ctrl-w, Ctrl-u, Ctrl-t, Ctrl-d, Ctrl-r, etc.)
      if (key === '<C-w>') {
        this.handleCtrlWInInsert();
        this.triggerChange();
        return;
      }
      if (key === '<C-u>') {
        this.handleCtrlUInInsert();
        this.triggerChange();
        return;
      }
      if (key === '<C-t>') {
        this.handleIndentInInsert(1);
        this.triggerChange();
        return;
      }
      if (key === '<C-d>') {
        this.handleIndentInInsert(-1);
        this.triggerChange();
        return;
      }
      if (key === '<C-r>') {
        // Ctrl-r in INSERT: insert from register
        // We need to await the next key. For now, paste the unnamed register.
        this.saveStateForUndo();
        if (this.register) {
          this.handleCharInputInInsert(this.register.text);
        }
        this.triggerChange();
        return;
      }
      if (key === '<C-n>') {
        // Simple word completion: cycle through words in the buffer
        this.handleWordCompletion(1);
        this.triggerChange();
        return;
      }
      if (key === '<C-p>') {
        this.handleWordCompletion(-1);
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

    // Arrow keys/<Home>/<End> reuse the hjkl/0/$ motion pipeline (correct
    // Visual-mode selection extension included); <PageUp>/<PageDown> mirror
    // Ctrl-B/Ctrl-F's full-screen jump.
    const navMotion = NAV_KEY_MOTION[key];
    if (navMotion) {
      this.pendingKeys = [];
      this.executeCommand({ count: 1, motion: navMotion, isComplete: true, isValid: true });
      this.triggerChange();
      return;
    }
    if (key === 'PageUp' || key === 'PageDown') {
      this.pendingKeys = [];
      this.moveCursorVertically(
        key === 'PageUp' ? -this.halfPageLines * 2 : this.halfPageLines * 2,
      );
      if (this.mode === 'VISUAL' && this.visualSelection) {
        this.visualSelection.active = { ...this.cursor };
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

  /** `<C-w>` in INSERT: delete word back from cursor. */
  private handleCtrlWInInsert(): void {
    if (!this.isInsertMutated) {
      this.saveStateForUndo();
      this.isInsertMutated = true;
    }
    const line = this.buffer.getLine(this.cursor.line);
    const before = line.substring(0, this.cursor.character);
    const after = line.substring(this.cursor.character);
    // Delete back to start of word (or previous non-space, then word-start)
    const trimmed = before.trimEnd();
    const spaceIdx = trimmed.lastIndexOf(' ');
    const wordStart = spaceIdx === -1 ? 0 : spaceIdx + 1;
    const remaining = before.substring(0, wordStart);
    this.buffer.setLine(this.cursor.line, remaining + after);
    this.cursor.character = remaining.length;
    this.desiredCol = this.cursor.character;
  }

  /** `<C-u>` in INSERT: delete from cursor to start of line. */
  private handleCtrlUInInsert(): void {
    if (!this.isInsertMutated) {
      this.saveStateForUndo();
      this.isInsertMutated = true;
    }
    const line = this.buffer.getLine(this.cursor.line);
    const after = line.substring(this.cursor.character);
    this.buffer.setLine(this.cursor.line, after);
    this.cursor.character = 0;
    this.desiredCol = 0;
  }

  /** `<C-t>`/`<C-d>` in INSERT: indent/outdent the current line (shiftwidth = 2). */
  private handleIndentInInsert(dir: number): void {
    if (!this.isInsertMutated) {
      this.saveStateForUndo();
      this.isInsertMutated = true;
    }
    const line = this.buffer.getLine(this.cursor.line);
    const indent = 2; // shiftwidth
    if (dir > 0) {
      const spaces = ' '.repeat(indent);
      this.buffer.setLine(this.cursor.line, spaces + line);
      this.cursor.character += indent;
      this.desiredCol = this.cursor.character;
    } else {
      const before = line.substring(0, indent);
      const leadingSpaces = before.match(/^ */)?.[0].length ?? 0;
      const remove = Math.min(leadingSpaces, indent);
      this.buffer.setLine(this.cursor.line, line.substring(remove));
      this.cursor.character = Math.max(0, this.cursor.character - remove);
      this.desiredCol = this.cursor.character;
    }
  }

  /** `<C-n>`/`<C-p>` in INSERT: simple word completion based on buffer content. */
  private wordCompletionMatches: string[] = [];
  private wordCompletionIndex = -1;

  private handleWordCompletion(dir: number): void {
    if (this.wordCompletionMatches.length === 0 || (dir === 1 && this.wordCompletionIndex === -1)) {
      // Collect all unique words from buffer (first call)
      const words = new Set<string>();
      for (let i = 0; i < this.buffer.getLineCount(); i++) {
        const line = this.buffer.getLine(i);
        for (const w of line.split(/[^a-zA-Z0-9_]+/)) {
          if (w.length >= 2 && !/^\d+$/.test(w)) words.add(w);
        }
      }
      this.wordCompletionMatches = Array.from(words).sort();
      this.wordCompletionIndex = -1;
    }
    if (this.wordCompletionMatches.length === 0) return;

    this.wordCompletionIndex = (this.wordCompletionIndex + 1) % this.wordCompletionMatches.length;
    if (this.wordCompletionIndex < 0)
      this.wordCompletionIndex = this.wordCompletionMatches.length - 1;

    const word = this.wordCompletionMatches[this.wordCompletionIndex];
    const line = this.buffer.getLine(this.cursor.line);
    const before = line.substring(0, this.cursor.character);
    const after = line.substring(this.cursor.character);
    // Replace the partial word under/behind cursor with the completion
    const partial = before.replace(/[a-zA-Z0-9_]+$/, '');
    if (!this.isInsertMutated) {
      this.saveStateForUndo();
      this.isInsertMutated = true;
    }
    this.buffer.setLine(this.cursor.line, partial + word + after);
    this.cursor.character = partial.length + word.length;
    this.desiredCol = this.cursor.character;
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
      this.moveCursorByMotion(cmd.motion, cmd.count, cmd.findChar);
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
            this.setRegister({
              text: line.substring(from, this.cursor.character),
              type: 'char',
            });
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
          this.setRegister({ text: lines.join('\n') + '\n', type: 'line' });
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
          this.setRegister({ text: this.buffer.getLine(this.cursor.line) + '\n', type: 'line' });
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
        case '*':
          this.searchWordUnderCursor(1);
          break;
        case '#':
          this.searchWordUnderCursor(-1);
          break;
        case 'r':
          if (cmd.findChar !== undefined) {
            this.saveStateForUndo();
            this.replaceCharUnderCursor(cmd.findChar, cmd.count);
          }
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

        // --- zz/zt/zb: scroll viewport (callbacks wired to the renderer entity) ---
        case 'zz': {
          const half = Math.max(1, Math.floor(this.visibleLines / 2));
          this.triggerScrollToLine(Math.max(0, this.cursor.line - half));
          break;
        }
        case 'zt': {
          this.triggerScrollToLine(this.cursor.line);
          break;
        }
        case 'zb': {
          this.triggerScrollToLine(
            Math.max(0, this.cursor.line - Math.max(1, this.visibleLines) + 1),
          );
          break;
        }

        // --- H/M/L: cursor to window top/middle/bottom ---
        case 'H': {
          const topLine = this.viewportTop;
          this.cursor.line = Math.min(this.buffer.getLineCount() - 1, topLine);
          this.cursor.character = 0;
          this.desiredCol = 0;
          break;
        }
        case 'M': {
          const visible = this.visibleLines || Math.floor(this.halfPageLines);
          const midLine = this.viewportTop + Math.floor(visible / 2);
          this.cursor.line = Math.min(this.buffer.getLineCount() - 1, midLine);
          this.cursor.character = 0;
          this.desiredCol = 0;
          break;
        }
        case 'L': {
          const visible = this.visibleLines || Math.floor(this.halfPageLines);
          const botLine = this.viewportTop + visible - 1;
          this.cursor.line = Math.min(this.buffer.getLineCount() - 1, botLine);
          this.cursor.character = 0;
          this.desiredCol = 0;
          break;
        }

        // --- J: join lines ---
        case 'J':
          this.saveStateForUndo();
          this.joinLines(cmd.count);
          break;

        // --- ~: toggle case ---
        case '~':
          this.saveStateForUndo();
          this.toggleCase(cmd.count);
          break;

        // --- {/}: paragraph jumps ---
        case '{':
          this.jumpParagraph(-cmd.count);
          break;
        case '}':
          this.jumpParagraph(cmd.count);
          break;

        // --- gf: open file under cursor (caller-provided callback) ---
        case 'gf': {
          const word = this.getWordAtCursor();
          if (word) this.triggerOpenFileUnderCursor(word);
          break;
        }

        // --- gv: reselect last visual selection ---
        case 'gv':
          if (this.lastVisualSelection) {
            this.visualSelection = { ...this.lastVisualSelection };
            this.cursor.line = this.lastVisualSelection.active.line;
            this.cursor.character = this.lastVisualSelection.active.character;
            this.desiredCol = this.lastVisualSelection.active.character;
            this.setMode('VISUAL');
          }
          break;

        // --- gi: go to last insert position ---
        case 'gi':
          if (this.lastInsertPosition) {
            this.cursor.line = this.lastInsertPosition.line;
            this.cursor.character = this.lastInsertPosition.character;
            this.desiredCol = this.lastInsertPosition.character;
            this.setMode('INSERT');
          }
          break;

        // --- [[/]]: section jumps (same as {/} for now) ---
        case '[[':
          this.jumpParagraph(-cmd.count);
          break;
        case ']]':
          this.jumpParagraph(cmd.count);
          break;
        case '[]':
          this.jumpParagraph(cmd.count);
          break;
        case '][':
          this.jumpParagraph(-cmd.count);
          break;

        // --- <C-a>/<C-x>: increment/decrement number under cursor ---
        case '<C-a>':
          this.saveStateForUndo();
          this.addNumber(cmd.count);
          break;
        case '<C-x>':
          this.saveStateForUndo();
          this.addNumber(-cmd.count);
          break;

        // --- <C-o>/<C-i>: jump list navigation ---
        case '<C-o>':
          this.goBackInJumplist();
          break;
        case '<C-i>':
          this.goForwardInJumplist();
          break;

        // --- m{a-zA-Z}: set mark ---
        case 'm':
          if (cmd.mark) {
            this.marks.set(cmd.mark, { ...this.cursor });
          }
          break;

        // --- `{a-zA-Z} / '{a-zA-Z}: jump to mark ---
        case '`':
        case "'": {
          if (cmd.mark) {
            const pos = this.marks.get(cmd.mark);
            if (pos) {
              if (cmd.command === "'") {
                this.cursor.line = pos.line;
                this.cursor.character = 0;
              } else {
                this.cursor.line = pos.line;
                this.cursor.character = pos.character;
              }
              this.desiredCol = this.cursor.character;
            }
          }
          break;
        }

        // --- ZZ/ZQ: write+quit / quit+discard (via existing quit/save callbacks) ---
        case 'ZZ':
          // Save then quit
          this.modified = false;
          this.triggerSave();
          this.triggerQuit(false);
          break;
        case 'ZQ':
          this.triggerQuit(true);
          break;

        // --- g; / g,: change list navigation ---
        case 'g;':
          if (this.changeList.length > 0) {
            const pos = this.changeList[this.changeList.length - 1];
            this.cursor.line = pos.line;
            this.cursor.character = pos.character;
            this.desiredCol = pos.character;
          }
          break;
        case 'g,':
          if (this.changeList.length > 1) {
            const pos = this.changeList[this.changeList.length - 2];
            this.cursor.line = pos.line;
            this.cursor.character = pos.character;
            this.desiredCol = pos.character;
          }
          break;

        // --- gu / gU: make lowercase / uppercase ---
        case 'gu':
          this.saveStateForUndo();
          this.toggleCaseRange(this.cursor.line, this.cursor.line, false);
          break;
        case 'gU':
          this.saveStateForUndo();
          this.toggleCaseRange(this.cursor.line, this.cursor.line, true);
          break;

        // --- gJ: join without inserting space ---
        case 'gJ':
          this.saveStateForUndo();
          this.joinLinesNoSpace(cmd.count);
          break;

        // --- z. / z- / z<CR>: redraw viewport ---
        case 'z.':
          this.triggerScrollToLine(
            this.cursor.line - Math.max(1, Math.floor(this.visibleLines / 2)),
          );
          break;
        case 'z-':
          this.triggerScrollToLine(
            Math.max(0, this.cursor.line - Math.max(1, this.visibleLines) + 1),
          );
          break;
        case 'z\n':
          this.triggerScrollToLine(this.cursor.line);
          break;

        // --- ge: go backwards to end of previous word ---
        case 'ge':
          this.moveCursorByMotion('ge', cmd.count);
          break;

        // --- <C-w> window commands ---
        case 'C-w-h':
          this.triggerWindowAction('left');
          break;
        case 'C-w-j':
          this.triggerWindowAction('down');
          break;
        case 'C-w-k':
          this.triggerWindowAction('up');
          break;
        case 'C-w-l':
          this.triggerWindowAction('right');
          break;
        case 'C-w-w':
          this.triggerWindowAction('next');
          break;
        case 'C-w-q':
          this.triggerQuit(false);
          break;
        case 'C-w-o':
          this.triggerWindowAction('only');
          break;
        case 'C-w-v':
          this.triggerSplit('vertical');
          break;
        case 'C-w-s':
          this.triggerSplit('horizontal');
          break;

        // --- > / < operators: indent/outdent ---
        case '>':
          this.saveStateForUndo();
          this.indentLines(this.cursor.line, this.cursor.line, 2);
          break;
        case '<':
          this.saveStateForUndo();
          this.indentLines(this.cursor.line, this.cursor.line, -2);
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

  /** `J`: join `count` lines below the current one, replacing the newline with a space. */
  private joinLines(count: number): void {
    const start = this.cursor.line;
    const last = this.buffer.getLineCount() - 1;
    const end = Math.min(start + count, last);
    let text = this.buffer.getLine(start);
    for (let l = start + 1; l <= end; l++) {
      const next = this.buffer.getLine(l);
      text += ' ' + next.trimStart();
    }
    this.buffer.setLine(start, text);
    this.buffer.deleteLines(start + 1, end);
    this.cursor.character = text.length - (end > start ? 0 : 0); // end of joined line
    this.desiredCol = this.cursor.character;
  }

  /** `~`: toggle case of `count` characters under and right of cursor. */
  private toggleCase(count: number): void {
    const line = this.buffer.getLine(this.cursor.line);
    const chars = [...line];
    const end = Math.min(this.cursor.character + count, chars.length);
    for (let i = this.cursor.character; i < end; i++) {
      const c = chars[i];
      if (c >= 'a' && c <= 'z') chars[i] = c.toUpperCase();
      else if (c >= 'A' && c <= 'Z') chars[i] = c.toLowerCase();
    }
    this.buffer.setLine(this.cursor.line, chars.join(''));
    this.cursor.character = Math.max(0, end - 1);
    this.desiredCol = this.cursor.character;
  }

  /** Jump to the next/prev paragraph boundary (`{`/`}`). */
  private jumpParagraph(direction: number): void {
    const last = this.buffer.getLineCount() - 1;
    let line = this.cursor.line;
    if (direction > 0) {
      while (line < last) {
        line++;
        if (this.buffer.getLine(line).trim() === '') break;
        // empty line = paragraph boundary
      }
    } else {
      while (line > 0) {
        line--;
        if (this.buffer.getLine(line).trim() === '') break;
      }
    }
    this.cursor.line = Math.max(0, Math.min(last, line));
    this.cursor.character = 0;
    this.desiredCol = 0;
  }

  /** Increment/decrement the first number on the current line (`<C-a>`/`<C-x>`). */
  private addNumber(delta: number): void {
    const line = this.buffer.getLine(this.cursor.line);
    const match = line.match(/-?\d+(\.\d+)?/);
    if (match && match.index !== undefined) {
      const numStr = match[0];
      const isFloat = numStr.includes('.');
      const num = isFloat ? parseFloat(numStr) : parseInt(numStr, 10);
      const newNum = isFloat ? num + delta : num + delta;
      const newNumStr = isFloat ? newNum.toFixed(numStr.split('.')[1].length) : String(newNum);
      const before = line.substring(0, match.index);
      const after = line.substring(match.index + numStr.length);
      this.buffer.setLine(this.cursor.line, before + newNumStr + after);
    }
  }

  /** Get the word under the cursor (for `gf`). */
  private getWordAtCursor(): string | null {
    const line = this.buffer.getLine(this.cursor.line);
    const pos = this.cursor.character;
    if (!line || pos >= line.length) return null;
    let start = pos;
    let end = pos;
    const isWordChar = (c: string) => /^[\w.]$/.test(c);
    while (start > 0 && isWordChar(line[start - 1])) start--;
    while (end < line.length && isWordChar(line[end])) end++;
    return start < end ? line.substring(start, end) : null;
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
    } else if (base === 'q' || base === 'quit' || base === 'exit') {
      // `quit`/`exit` aren't real Vim commands (Vim only has `:q`), but
      // they're what newcomers instinctively type — accepting them narrows
      // that surprise gap instead of bouncing new users off an E492.
      // Real Vim's E37 guard: an unforced quit on a modified buffer refuses
      // rather than silently discarding edits; `:q!`/`:quit!`/`:exit!` force it.
      if (!force && this.modified) {
        this.statusMessage = 'E37: No write since last change (add ! to override)';
      } else {
        this.triggerQuit(force);
      }
    } else if (base === 'wq' || base === 'x') {
      this.triggerSave();
      this.triggerQuit(force);
    } else if (base === 'vsp' || base === 'vs') {
      this.triggerSplit('vertical');
    } else if (base === 'sp') {
      this.triggerSplit('horizontal');
    } else if (base === 'set') {
      this.executeSetOption(arg);
    } else if (base === 's') {
      // :s/pattern/replacement/flags — line substitute
      // :%s/pattern/replacement/flags — global substitute
      let isGlobal = false;
      let pattern = '';
      let replacement = '';
      let flags = '';

      // Detect %s (global range)
      let searchStart = 0;
      if (trimmed.startsWith('%')) {
        isGlobal = true;
        searchStart = 1;
      }

      const body = trimmed.substring(searchStart);
      if (body.startsWith('s') && body.length > 2 && body[1] === '/') {
        const sep = '/';
        const endIdx = body.indexOf(sep, 2);
        if (endIdx !== -1) {
          pattern = body.substring(2, endIdx);
          const replEnd = body.indexOf(sep, endIdx + 1);
          if (replEnd !== -1) {
            replacement = body.substring(endIdx + 1, replEnd);
            flags = body.substring(replEnd + 1);
          } else {
            replacement = body.substring(endIdx + 1);
          }
        }
      }

      if (pattern !== undefined) {
        try {
          const caseInsensitive = flags.includes('i');
          const globalFlag = flags.includes('g');

          // Build line range
          let startLine = isGlobal ? 0 : this.cursor.line;
          let endLine = isGlobal ? this.buffer.getLineCount() - 1 : this.cursor.line;

          this.saveStateForUndo();

          let totalMatches = 0;
          for (let l = startLine; l <= endLine; l++) {
            const line = this.buffer.getLine(l);
            // Vim's `:s` without `g` uses a non-global regex (first match only)
            const lineRe = new RegExp(pattern, caseInsensitive ? 'i' : '');
            // Vim's `:s/.../.../g` uses a global regex (all matches)
            const globalRe = new RegExp(pattern, caseInsensitive ? 'gi' : 'g');
            const [newLine, count] = this.substituteLine(
              line,
              globalFlag ? globalRe : lineRe,
              replacement,
            );
            if (count > 0) {
              this.buffer.setLine(l, newLine);
              totalMatches += count;
            }
          }

          if (totalMatches > 0) {
            this.modified = true;
            this.statusMessage = `${totalMatches} substitution${totalMatches > 1 ? 's' : ''} on ${
              isGlobal ? 'all lines' : 'this line'
            }`;
          } else if (pattern) {
            this.statusMessage = `E486: Pattern not found: ${pattern}`;
          }
        } catch (e: any) {
          this.statusMessage = `E475: Invalid argument: ${e.message}`;
        }
      }
    } else {
      this.statusMessage = `E492: Not an editor command: ${name}`;
    }
  }

  private substituteLine(line: string, regex: RegExp, replacement: string): [string, number] {
    let count = 0;
    const result = line.replace(regex, (...args: any[]) => {
      count++;
      const match = args[0] as string;
      const groups: string[] = args.slice(1, -2);
      const offset = args[args.length - 2] as number;
      const input = args[args.length - 1] as string;
      return replacement.replace(/\$(\d|[&`'])/g, (m, ref) => {
        if (ref === '&') return match;
        if (ref === '`') return input.substring(0, offset);
        if (ref === "'") return input.substring(offset + match.length);
        const n = parseInt(ref, 10);
        if (!isNaN(n) && n < groups.length) return groups[n] ?? '';
        return m;
      });
    });
    return [result, count];
  }

  /** Toggle case on a range of lines: `true` = uppercase, `false` = lowercase. */
  private toggleCaseRange(startLine: number, endLine: number, toUpper: boolean): void {
    for (let l = startLine; l <= endLine; l++) {
      const line = this.buffer.getLine(l);
      const chars = [...line].map((c) => {
        if (toUpper) return c.toUpperCase();
        return c.toLowerCase();
      });
      this.buffer.setLine(l, chars.join(''));
    }
  }

  /** Record a cursor position in the jump list. Called by moveCursorByMotion. */
  public pushJumpList(): void {
    this.jumpList.push({ ...this.cursor });
    if (this.jumpList.length > 100) this.jumpList.shift();
    this.jumpListIndex = this.jumpList.length - 1;
  }

  /** `<C-o>`: go to the previous (older) position in the jump list. */
  private goBackInJumplist(): void {
    if (this.jumpListIndex > 0 && this.jumpList.length > 1) {
      this.jumpListIndex--;
      const pos = this.jumpList[this.jumpListIndex];
      this.cursor.line = pos.line;
      this.cursor.character = pos.character;
      this.desiredCol = pos.character;
    }
  }

  /** `<C-i>`: go to the next (newer) position in the jump list. */
  private goForwardInJumplist(): void {
    if (this.jumpListIndex < this.jumpList.length - 1) {
      this.jumpListIndex++;
      const pos = this.jumpList[this.jumpListIndex];
      this.cursor.line = pos.line;
      this.cursor.character = pos.character;
      this.desiredCol = pos.character;
    }
  }

  /** `gJ`: join lines without inserting a space. */
  private joinLinesNoSpace(count: number): void {
    const start = this.cursor.line;
    const last = this.buffer.getLineCount() - 1;
    const end = Math.min(start + count, last);
    let text = this.buffer.getLine(start);
    for (let l = start + 1; l <= end; l++) {
      text += this.buffer.getLine(l);
    }
    this.buffer.setLine(start, text);
    this.buffer.deleteLines(start + 1, end);
    this.cursor.character = text.length;
    this.desiredCol = this.cursor.character;
  }

  /** Indent or outdent a range of lines by `amount` spaces (negative = outdent). */
  private indentLines(startLine: number, endLine: number, amount: number): void {
    for (let l = startLine; l <= endLine; l++) {
      const line = this.buffer.getLine(l);
      if (amount > 0) {
        this.buffer.setLine(l, ' '.repeat(amount) + line);
      } else {
        const remove = Math.min(-amount, line.search(/\S|$/) || 0);
        this.buffer.setLine(l, line.substring(remove));
      }
    }
  }

  /** Trigger a window action (left/right/up/down/next/only). */
  public onWindowAction(callback: (action: string) => void): void {
    this.windowActionCallbacks.push(callback);
  }

  private triggerWindowAction(action: string): void {
    for (const cb of this.windowActionCallbacks) {
      cb(action);
    }
  }

  public executeSetOption(option: string): void {
    // Vim's real syntax for OS-clipboard integration: `:set clipboard=unnamed`
    // (or `unnamedplus`) routes y/d/c/x/p/P through the system clipboard
    // instead of just the internal `"` register; `:set clipboard=` reverts.
    const eq = option.indexOf('=');
    if (eq !== -1) {
      const key = option.substring(0, eq);
      const value = option.substring(eq + 1);
      if (key === 'clipboard' || key === 'cb') {
        if (value === 'unnamed' || value === 'unnamedplus') {
          this.clipboardMode = 'system';
        } else if (value === '') {
          this.clipboardMode = 'internal';
        } else {
          this.statusMessage = `E474: Invalid argument: clipboard=${value}`;
        }
      } else {
        this.statusMessage = `E518: Unknown option: ${key}`;
      }
      return;
    }

    // Vim's `:set {option}!` toggles a boolean option — very common muscle
    // memory (`:set nu!`, `:set rnu!`) that errored as "unknown option"
    // before, since it was never stripped from the option name.
    if (option.endsWith('!')) {
      const base = option.slice(0, -1);
      const isRelevant = ['relativenumber', 'rnu', 'number', 'nu'].includes(base);
      if (!isRelevant) {
        this.statusMessage = `E518: Unknown option: ${option}`;
        return;
      }
      const isRelativeOpt = base === 'relativenumber' || base === 'rnu';
      const currentlyOn = isRelativeOpt
        ? this.layoutConfig.lineNumbers === 'relative'
        : this.layoutConfig.lineNumbers !== 'none';
      this.executeSetOption(currentlyOn ? `no${base}` : base);
      return;
    }

    if (option === 'relativenumber' || option === 'rnu') {
      this.layoutConfig = { ...this.layoutConfig, lineNumbers: 'relative' };
      this.triggerOptionsChanged('relativenumber', 'relative');
    } else if (option === 'norelativenumber' || option === 'nornu') {
      // Falls back to absolute if numbers are on, else stays off.
      const next = this.layoutConfig.lineNumbers === 'relative' ? 'absolute' : 'none';
      this.layoutConfig = { ...this.layoutConfig, lineNumbers: next };
      this.triggerOptionsChanged('number', next);
    } else if (option === 'number' || option === 'nu') {
      this.layoutConfig = { ...this.layoutConfig, lineNumbers: 'absolute' };
      this.triggerOptionsChanged('number', 'absolute');
    } else if (option === 'nonumber' || option === 'nonu') {
      this.layoutConfig = { ...this.layoutConfig, lineNumbers: 'none' };
      this.triggerOptionsChanged('number', 'none');
    } else {
      this.statusMessage = `E518: Unknown option: ${option}`;
    }
  }

  private executeVisualCommand(cmd: ParsedCommand): void {
    if (cmd.motion) {
      this.moveCursorByMotion(cmd.motion, cmd.count, cmd.findChar);
      if (this.visualSelection) {
        this.visualSelection.active = { ...this.cursor };
      }
      return;
    }

    const op = cmd.command || cmd.operator;
    if (op === 'd' || op === 'x' || op === 'c' || op === 'y') {
      this.saveStateForUndo();
      this.operateOnVisualSelection(op);
      if (op === 'c') this.setMode('INSERT');
      else this.setMode('NORMAL');
    } else if (op === 'gu') {
      this.saveStateForUndo();
      const sel = this.visualSelection;
      if (sel) this.toggleCaseRange(sel.anchor.line, sel.active.line, false);
      this.setMode('NORMAL');
    } else if (op === 'gU') {
      this.saveStateForUndo();
      const sel = this.visualSelection;
      if (sel) this.toggleCaseRange(sel.anchor.line, sel.active.line, true);
      this.setMode('NORMAL');
    }
  }

  // --- Motions Execution ---
  /**
   * Returns false only for a failed f/F/t/T search (target char not found) —
   * matching Vim, where the whole motion (and any operator riding on it)
   * aborts rather than leaving the cursor somewhere half-moved.
   */
  private moveCursorByMotion(motion: string, count: number, findChar?: string): boolean {
    this.pushJumpList();
    if (motion === 'f' || motion === 'F' || motion === 't' || motion === 'T') {
      return this.moveByFindChar(motion, count, findChar);
    }
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
        case 'ge':
          this.cursor = getWordEndBackward(this.buffer, this.cursor);
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
    return true;
  }

  /**
   * f/F/t/T: find the count'th occurrence of `findChar` on the current
   * line only (Vim's find-char motions never cross lines). f/F land ON the
   * char; t/T land just before/after it. Fails (returns false, cursor
   * untouched) if there aren't `count` occurrences.
   */
  private moveByFindChar(motion: 'f' | 'F' | 't' | 'T', count: number, findChar?: string): boolean {
    if (!findChar) return false;
    const line = this.buffer.getLine(this.cursor.line);
    let pos = this.cursor.character;
    for (let i = 0; i < count; i++) {
      let found: number | null = null;
      if (motion === 'f' || motion === 't') {
        for (let c = pos + 1; c < line.length; c++) {
          if (line[c] === findChar) {
            found = motion === 'f' ? c : c - 1;
            break;
          }
        }
      } else {
        for (let c = pos - 1; c >= 0; c--) {
          if (line[c] === findChar) {
            found = motion === 'F' ? c : c + 1;
            break;
          }
        }
      }
      if (found === null) return false;
      pos = found;
    }
    this.cursor.character = pos;
    this.desiredCol = pos;
    return true;
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
      this.setRegister({
        text: yankedLines.join('\n') + '\n',
        type: 'line',
      });

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
      const moved = this.moveCursorByMotion(cmd.motion, count, cmd.findChar);
      const endPos = { ...this.cursor };
      this.cursor = { ...startPos }; // Restore cursor before operation

      // A failed f/F/t/T search aborts the whole operator, matching Vim —
      // no partial deletion for a target that was never found.
      if (!moved) return;

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
      this.setRegister({
        text: yankedLines.join('\n') + '\n',
        type: 'line',
      });

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
      // f/F/t/T are inclusive too — the sort-then-extend-high-end logic above
      // already makes this correct for F/T's backward searches as well.
      let isInclusive =
        cmd.textObject !== undefined ||
        cmd.motion === '$' ||
        cmd.motion === 'e' ||
        cmd.motion === 'E' ||
        cmd.motion === '%' ||
        cmd.motion === 'f' ||
        cmd.motion === 'F' ||
        cmd.motion === 't' ||
        cmd.motion === 'T';

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

      this.setRegister({
        text: yankText,
        type: 'char',
      });

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
      this.setRegister({
        text: yankedLines.join('\n') + '\n',
        type: 'line',
      });

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

      this.setRegister({
        text: yankText,
        type: 'char',
      });

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

      this.setRegister({
        text: yankedBlocks.join('\n'),
        type: 'block',
      });

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
    this.setRegister({ text: line.substring(this.cursor.character), type: 'char' });
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

  private isWordChar(ch: string | undefined): boolean {
    return !!ch && /[a-zA-Z0-9_]/.test(ch);
  }

  /** Vim's `*`/`#`: search for the whole word under the cursor, boundary-matched. */
  private searchWordUnderCursor(dir: 1 | -1): void {
    const line = this.buffer.getLine(this.cursor.line);
    if (!this.isWordChar(line[this.cursor.character])) return;

    let start = this.cursor.character;
    while (start > 0 && this.isWordChar(line[start - 1])) start--;
    let end = this.cursor.character;
    while (end < line.length - 1 && this.isWordChar(line[end + 1])) end++;
    const word = line.substring(start, end + 1);

    this.lastSearch = word;
    this.lastSearchDir = dir;
    this.jumpToWholeWord(word, dir, { line: this.cursor.line, character: dir === 1 ? end : start });
  }

  /** Like jumpToMatch, but only accepts matches with a non-word char (or edge) on both sides. */
  private jumpToWholeWord(word: string, dir: 1 | -1, from: Position): void {
    const lineCount = this.buffer.getLineCount();
    const isBoundaryMatch = (text: string, idx: number) =>
      !this.isWordChar(text[idx - 1]) && !this.isWordChar(text[idx + word.length]);

    if (dir === 1) {
      for (let offset = 0; offset <= lineCount; offset++) {
        const l = (from.line + offset) % lineCount;
        const text = this.buffer.getLine(l);
        let idx = text.indexOf(word, offset === 0 ? from.character + 1 : 0);
        while (idx !== -1 && !isBoundaryMatch(text, idx)) {
          idx = text.indexOf(word, idx + 1);
        }
        if (idx !== -1) {
          if (offset === lineCount && idx > from.character) break;
          this.cursor = { line: l, character: idx };
          this.desiredCol = idx;
          return;
        }
      }
    } else {
      for (let offset = 0; offset <= lineCount; offset++) {
        const l = (from.line - offset + lineCount * 2) % lineCount;
        const text = this.buffer.getLine(l);
        const upTo = offset === 0 ? from.character - 1 : text.length;
        if (upTo < 0) continue;
        let idx = text.lastIndexOf(word, upTo);
        while (idx !== -1 && !isBoundaryMatch(text, idx)) {
          idx = idx === 0 ? -1 : text.lastIndexOf(word, idx - 1);
        }
        if (idx !== -1 && (offset !== 0 || idx < from.character)) {
          this.cursor = { line: l, character: idx };
          this.desiredCol = idx;
          return;
        }
      }
    }
    this.statusMessage = `E486: Pattern not found: ${word}`;
  }

  private deleteCharUnderCursor(count: number): void {
    const line = this.buffer.getLine(this.cursor.line);
    if (line.length === 0) return;

    const deleteCount = Math.min(count, line.length - this.cursor.character);
    const deletedText = line.substring(this.cursor.character, this.cursor.character + deleteCount);

    this.setRegister({
      text: deletedText,
      type: 'char',
    });

    const before = line.substring(0, this.cursor.character);
    const after = line.substring(this.cursor.character + deleteCount);
    this.buffer.setLine(this.cursor.line, before + after);

    // Adjust cursor if it's past the end of the line in Normal mode
    const newLineLen = this.buffer.getLine(this.cursor.line).length;
    this.cursor.character = Math.min(this.cursor.character, Math.max(0, newLineLen - 1));
    this.desiredCol = this.cursor.character;
  }

  /** Vim's r{char}: replace `count` chars starting at the cursor with `char`, no mode change. */
  private replaceCharUnderCursor(char: string, count: number): void {
    const line = this.buffer.getLine(this.cursor.line);
    if (this.cursor.character + count > line.length) return; // not enough chars — Vim beeps, no-op
    const before = line.substring(0, this.cursor.character);
    const after = line.substring(this.cursor.character + count);
    this.buffer.setLine(this.cursor.line, before + char.repeat(count) + after);
    this.cursor.character += count - 1;
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
    // Track change position for g;/g,
    this.changeList.push({ ...this.cursor });
    if (this.changeList.length > 100) this.changeList.shift();
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
