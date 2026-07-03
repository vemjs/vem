import type { Position, EditorMode } from './index';
import { VimBuffer, UndoManager } from './buffer';
import { getWordForward, getWordBackward, getWordEndForward, getTextObjectRange } from './motions';
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
}

export interface VemLayoutConfig {
  sidebarPosition: 'left' | 'right' | 'hidden';
  statusBarPosition: 'bottom' | 'top';
  sidebarWidth: number;
}

const DEFAULT_THEME: VemTheme = {
  bg: '#0f172a',
  fg: '#e2e8f0',
  sidebarBg: '#090d16',
  gutterBg: '#0b0f19',
  gutterFg: '#64748b',
  statusBarBg: '#1e293b',
  statusBarFg: '#e2e8f0',
  accent: '#8b5cf6',
};

const DEFAULT_LAYOUT_CONFIG: VemLayoutConfig = {
  sidebarPosition: 'left',
  statusBarPosition: 'bottom',
  sidebarWidth: 240,
};

export class VemEditorState {
  public theme: VemTheme = { ...DEFAULT_THEME };
  public layoutConfig: VemLayoutConfig = { ...DEFAULT_LAYOUT_CONFIG };
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
  private saveCallbacks: (() => void)[] = [];
  private quitCallbacks: (() => void)[] = [];
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

  public onQuit(callback: () => void): void {
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

  private triggerQuit(): void {
    for (const cb of this.quitCallbacks) {
      cb();
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

  // --- Key Input Entry Point ---
  public handleKey(key: string): void {
    if (this.mode === 'COMMAND') {
      if (key === 'Escape') {
        this.setMode('NORMAL');
        this.commandText = '';
        this.triggerChange();
        return;
      }
      if (key === 'Enter') {
        this.executeCommandLineText(this.commandText);
        this.setMode('NORMAL');
        this.commandText = '';
        this.triggerChange();
        return;
      }
      if (key === 'Backspace') {
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
      }
    }
  }

  private executeCommandLineText(cmd: string): void {
    if (cmd === 'w') {
      this.triggerSave();
    } else if (cmd === 'q') {
      this.triggerQuit();
    } else if (cmd === 'vsp') {
      this.triggerSplit('vertical');
    } else if (cmd === 'sp') {
      this.triggerSplit('horizontal');
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
      let isInclusive = cmd.textObject !== undefined || cmd.motion === '$';

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
    this.undoManager.push(this.buffer.getLines());
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
