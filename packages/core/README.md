# @vemjs/core

[![npm version](https://img.shields.io/npm/v/@vemjs/core.svg)](https://www.npmjs.com/package/@vemjs/core)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

The pure TypeScript, zero-dependency core state machine and Vim keybinding parser engine for the **Vem Editor**. It handles buffers, undo/redo states, custom keybindings, visual selections, and coordinates with Language Server Protocol (LSP) diagnostics.

## Features

- **Pure Modal Editing Engine**: Fully decoupled state tracking for `NORMAL`, `INSERT`, `VISUAL`, and `COMMAND` modes.
- **Vim Parser & Motions**: Native parsing of Vim keyboard sequences. Supports counts, motion combinations (e.g. `2w`, `3j`), operators (`d`, `y`, `c`), and text objects (`iw`, `aw`, `i"`, `a"`, etc.).
- **Line-oriented Vim Buffer**: High-performance buffer with transaction tracking and a deep undo/redo stack (`UndoManager`).
- **Reactive Hooks**: Event triggers for buffer changes, mode switches, commands, and diagnostics to seamlessly integrate plugins and renderers.
- **Diagnostic Collection**: Structured APIs for storing, querying, and subscribing to compilation and linting diagnostics (errors, warnings, hints).
- **Extensible Configuration**: ESM-native configuration loading (`ConfigLoader`) for registering settings and keybindings.

## Installation

```bash
bun add @vemjs/core
# or via npm
npm install @vemjs/core
```

## Quick Start

Initialize the editor state machine and feed it keystrokes programmatically:

```typescript
import { VemEditorState } from '@vemjs/core';

// Create a state machine preloaded with text
const editor = new VemEditorState('const greeting = "Hello World";\nconsole.log(greeting);\n');

// Subscribe to buffer changes
editor.onDidChangeBuffer(() => {
  console.log('Buffer updated! Current text:\n', editor.getText());
});

// Subscribe to mode changes
editor.onDidChangeMode((mode) => {
  console.log(`Switched to mode: ${mode}`);
});

// Currently in NORMAL mode; send keys to move cursor and insert text
editor.input('j'); // Move down to line 2
editor.input('$'); // Move cursor to end of line
editor.input('i'); // Transition to INSERT mode
editor.input(' '); // Type space
editor.input('/'); // Type comment character
editor.input('/'); // Type comment character
editor.input(' '); // Type space
editor.input('P'); // Type P
editor.input('r'); // Type r
editor.input('i'); // Type i
editor.input('n'); // Type n
editor.input('t'); // Type t
editor.input('<Esc>'); // Back to NORMAL mode
```

## API Reference

### `VemEditorState`

The central state machine coordinator.

- `constructor(initialText?: string)`: Creates a new editor state.
- `input(key: string): void`: Processes a keypress string (e.g., `'a'`, `'h'`, `'<Esc>'`, `'<C-r>'`).
- `getMode(): EditorMode`: Returns the current active mode.
- `getText(): string`: Returns the complete content of the buffer.
- `getCursor(): Position`: Returns current cursor position `{ line: number, character: number }`.
- `getDiagnostics(): Diagnostic[]`: Gets current collection of diagnostics.
- `setDiagnostics(diagnostics: Diagnostic[]): void`: Replaces current diagnostics and notifies subscribers.
- `registerKeybinding(mode: EditorMode, keys: string, commandName: string)`: Binds a key sequence to a named command.
- `onDidChangeBuffer(cb: () => void): void`: Fires whenever the text inside the buffer changes.
- `onDidOpenBuffer(cb: () => void): void`: Fires when a new buffer opens.
- `onDidChangeMode(cb: (mode: EditorMode) => void): void`: Fires on editor mode switches.
- `onPublishDiagnostics(cb: (diagnostics: Diagnostic[]) => void): void`: Fires when new diagnostics are published.

### `VimBuffer`

Encapsulates buffer rows. Accessible via `editorState.getBuffer()`.

- `getText(): string`: Get entire text.
- `setText(text: string): void`: Overwrite text.
- `getLine(lineIndex: number): string`: Get single line content.
- `getLinesCount(): number`: Get total lines.

---

## Vim Keybinding Reference

| Key                | Mode   | Description                                                  |
| ------------------ | ------ | ------------------------------------------------------------ |
| `h`, `j`, `k`, `l` | NORMAL | Move cursor Left, Down, Up, Right                            |
| `w`, `b`, `e`      | NORMAL | Move forward/backward/end-of-word                            |
| `0`, `$`           | NORMAL | Move to start/end of line                                    |
| `gg`, `G`          | NORMAL | Move to first/last line                                      |
| `i`, `a`           | NORMAL | Enter INSERT mode (before/after cursor)                      |
| `v`                | NORMAL | Enter VISUAL mode (character selection)                      |
| `:`                | NORMAL | Enter COMMAND mode                                           |
| `d`                | NORMAL | Delete operator (e.g., `dw` deletes word, `dd` deletes line) |
| `y`                | NORMAL | Yank (copy) operator                                         |
| `p`                | NORMAL | Paste text from yank register                                |
| `u`, `<C-r>`       | NORMAL | Undo / Redo                                                  |
| `<Esc>`            | ANY    | Return to NORMAL mode                                        |

---

## Diagnostics API

Diagnostics are mapped to the standard LSP diagnostic severity levels:

```typescript
import { VemEditorState, type Diagnostic } from '@vemjs/core';

const editor = new VemEditorState('let x: number = "hello";');

editor.onPublishDiagnostics((diagnostics) => {
  console.log(`Received ${diagnostics.length} diagnostics.`);
  for (const diag of diagnostics) {
    console.log(`[${diag.severity.toUpperCase()}] Line ${diag.line}: ${diag.message}`);
  }
});

// Setting diagnostics (typically done by @vemjs/lsp-client)
const errors: Diagnostic[] = [
  {
    line: 0,
    startCharacter: 16,
    endCharacter: 23,
    severity: 'error',
    message: "Type 'string' is not assignable to type 'number'.",
    source: 'typescript-lsp',
  },
];

editor.setDiagnostics(errors);
```

## Architecture

The following diagram illustrates the relationship between `@vemjs/core` and the other packages:

```mermaid
graph TD
    subgraph Core Engine [@vemjs/core]
        VemEditorState --> VimBuffer
        VemEditorState --> UndoManager
    end

    subgraph Renderer [@vemjs/renderer-vecto]
        VectoRenderer --> VemEditorState
        VemEditorEntity --> VemEditorState
    end

    subgraph LSP Layer [@vemjs/lsp-client]
        LSPClient --> VemEditorState
        JsonRpcClient --> WebSocket
    end

    subgraph Plugins [@vemjs/plugin-api]
        PluginRegistry --> VemEditorState
    end
```

## Contributing

Please review [CONTRIBUTING.md](../../CONTRIBUTING.md) for details on our workflow and engineering guidelines.

## License

This package is licensed under the MIT License - see the LICENSE file for details.
