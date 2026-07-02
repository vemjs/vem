# Vem

> A next-generation Vim editor powered by [VectoJS](https://github.com/vectojs/vectojs), running in Web & Tauri

[![CI](https://github.com/vemjs/vem/actions/workflows/ci.yml/badge.svg)](https://github.com/vemjs/vem/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/@vemjs/core?label=%40vemjs%2Fcore)](https://www.npmjs.com/package/@vemjs/core)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

Vem is a **modal editor** built entirely on a high-performance Canvas 2D engine.
Zero DOM overhead in the editing area — every glyph, cursor, and highlight is drawn directly with VectoJS.

## Packages

| Package                                              | Description                                                   | Version                                                                                                           |
| ---------------------------------------------------- | ------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| [`@vemjs/core`](./packages/core)                     | Vim state machine, keybinding parser, buffer, diagnostics API | [![npm](https://img.shields.io/npm/v/@vemjs/core)](https://www.npmjs.com/package/@vemjs/core)                     |
| [`@vemjs/renderer-vecto`](./packages/renderer-vecto) | VectoJS canvas renderer, WorkspaceExplorer, split panes       | [![npm](https://img.shields.io/npm/v/@vemjs/renderer-vecto)](https://www.npmjs.com/package/@vemjs/renderer-vecto) |
| [`@vemjs/lsp-client`](./packages/lsp-client)         | JSON-RPC 2.0 engine, LSP document sync, diagnostics bridge    | [![npm](https://img.shields.io/npm/v/@vemjs/lsp-client)](https://www.npmjs.com/package/@vemjs/lsp-client)         |
| [`@vemjs/plugin-api`](./packages/plugin-api)         | Plugin SDK, keybinding overrides, editor event hooks          | [![npm](https://img.shields.io/npm/v/@vemjs/plugin-api)](https://www.npmjs.com/package/@vemjs/plugin-api)         |

## Why Vem?

- **Zero DOM** in the editor core — text rendering via Canvas 2D with VectoJS
- **Full Vim modal editing** — NORMAL / INSERT / VISUAL / COMMAND with motions, operators, text objects
- **LSP-native** — built-in JSON-RPC 2.0 client, completion, hover, diagnostics
- **Plugin system** — TypeScript-first plugin API with custom keybindings and event hooks
- **Web & Tauri** — runs in any browser today, Tauri desktop planned

## Getting Started

```bash
bun add @vemjs/core @vemjs/renderer-vecto
```

See each package's README for full documentation.

## Development

```bash
git clone https://github.com/vemjs/vem.git
cd vem
bun install
bun run build
bun test
```

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md). Every change goes through `Issue → Branch → PR → Review → Merge`.

## License

MIT © [vemjs](https://github.com/vemjs)
