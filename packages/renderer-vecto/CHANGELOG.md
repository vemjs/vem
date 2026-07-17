# @vemjs/renderer-vecto

## 0.4.4

### Patch Changes

- 9ea701f: Implement first batch of Vim-native motions and commands: zz/zt/zb, H/M/L, J, ~, {/}, gf, gv, gi, [[/]]/[]/][, <C-a>/<C-x>, m{a-zA-Z}/'{a-zA-Z}, ZZ/ZQ.
- Updated dependencies [9ea701f]
  - @vemjs/core@0.4.0

## 0.4.3

### Patch Changes

- 9c0996c: Fix a solid-black-screen bug in scrollable buffers: the content clip in `VemEditorEntity.render()` used screen-space coordinates while inside the scroll `translate()`, so once `scrollY * lineHeight` exceeded roughly one screenful (e.g. `:help`'s 64-line buffer scrolled a couple of wheel notches down), the clip region drifted off past the top of the viewport and every glyph drawn after it was silently discarded — text was computed and drawn at the correct coordinates, it just never reached the screen. Affects any buffer/pane, not just `:help`. The clip's Y is now offset to counteract the active scroll transform, keeping it pinned to the pane's actual on-screen bounds regardless of scroll position.

## 0.4.2

### Patch Changes

- 7476fbd: A lone buffer no longer shows a tab bar: `VemWorkspace` opts into `@vectojs/ui` 1.9.5's `autoHideTabBar` (Vim `showtabline=1` semantics), so a fresh start renders only the intro splash — like `vim` with no arguments — and the bar appears once a second buffer opens. Layout heights follow the live bar height via `effectiveTabBarHeight`. Engine floors raised to `@vectojs/core@^1.9.2` / `@vectojs/ui@^1.9.5`.
- 7476fbd: Plugin-architecture fixes from the 2026-07-16 audit. `@vemjs/core`: new static `VemEditorState.onDidCreateState(cb)` hook (fires for every state construction — splits, new tabs, snapshot restores — so hosts can attach per-state services like the plugin registry; returns an unsubscribe, cleared by `resetDefaults`) and `executePluginCommand` is now public (command palettes no longer need to reach into the private callback list). `@vemjs/plugin-api`: `PluginRegistry.register()` is idempotent (re-invocation can no longer stack duplicate buffer/mode/save listeners), new `has(name)`, and the registry accepts optional `PluginHostCapabilities` (`openFile`, `gitDiff`) surfaced on the plugin context — plugins must treat them as absent-able. `@vemjs/renderer-vecto`: `VemWorkspace.onLastTabClose(cb)` notifies hosts after the final tab closes and the workspace has self-reset, letting the desktop build exit like Vim's `:q` while the web build keeps the splash.
- Updated dependencies [7476fbd]
  - @vemjs/core@0.3.1

## 0.4.1

### Patch Changes

- b361f5b: Fix two interaction bugs from the 2026-07-16 audit:

  - Split panes now re-layout when the workspace box changes: `WorkspaceLayout`
    calls `PanelGroup.resize()` instead of writing width/height bare, so
    opening the Explorer/PluginLab or resizing the window after `:vsp`/`:sp`
    no longer leaves panes at stale sizes overflowing off-screen.
  - Mouse clicks land on the character cell containing the pointer (Vim
    mouse=a semantics): the x→column mapping used `Math.round`, sending
    right-half clicks one cell to the right; it now floors and clamps at 0.

- b361f5b: Fix printable keystrokes being delivered twice to the Vim state machine. `VemEditorEntity`'s keydown handler already fed every non-composing key to `handleKey()` unconditionally, but only called `preventDefault()` for a narrow whitelist (arrows, Home/End, Tab, Backspace, Escape, Space) — letters, digits, punctuation, Enter, and Delete were left unprevented. That let the keystroke also reach the focused a11y shadow `<textarea>` natively, which mutated its `.value` and fired the `change` handler added for IME support, redelivering the same character a second time. In NORMAL mode this meant `i`/`a` both switched to INSERT _and_ inserted the literal character, with rapid/held `a` compounding on every press; in INSERT mode, Enter could additionally leak a literal `\n` into the buffer instead of a clean line split. `preventDefault()` now covers every single printable character plus `Enter`/`Delete`, so the shadow textarea's `change` event is reserved for genuine IME composition commits only.

## 0.4.0

### Minor Changes

- dd6ebe5: Make the Explorer's file/folder pickers pluggable. The sidebar "Dir"/"File" buttons were hardwired to the browser's File System Access API, which WebKitGTK (Tauri on Linux) doesn't implement — in the desktop app they silently did nothing. New `WorkspaceFsProvider` interface (`pickDirectory`/`pickFile`) with the web implementation as the default (`createWebFsProvider()`); host shells inject native dialogs via `WorkspaceExplorer.setFileSystemProvider()`. `openDirectory(dir)` is public so hosts can show a CLI-resolved directory without a picker, and `openFileBuffer`'s third argument is now a plain `save` callback instead of a `FileSystemFileHandle` (breaking for direct callers). `onDidOpenDirectory` callbacks now receive the `PickedDirectory` instead of the internal `FileSystemHandler`. A save backend that throws a Vim-style `E##:` error gets its message surfaced verbatim in the status line.

### Patch Changes

- 13e9468: Fix the command-line `:` prefix rendering taller than the typed command in the Tauri (WebKitGTK) build. The prefix used `bold 14px monospace` while the input uses `14px monospace`; WebKitGTK synthesizes bold monospace with different metrics, so the glyphs didn't line up. The prefix now uses the exact same font as the input — which also matches Vim, whose command line is plain Normal text.
- 4461923: Fix IME input (Fcitx5, Pinyin/Zhuyin, and other composition-based input methods) being completely unusable. `VemEditorEntity`'s keydown handler had no `isComposing`/`'Process'` guard, so every intermediate composing keystroke was fed straight into the Vim state machine, corrupting the buffer and breaking composition. Composing keydowns are now ignored, and the committed text is inserted via the `'change'` event `@vectojs/core`'s a11y projection already emits once a composition ends.

## 0.3.0

### Minor Changes

- ec10976: Fix a batch of vem.run UX and correctness bugs, plus expose new APIs for the web build's persistence layer:

  - **Long lines no longer hide the cursor.** `VemEditorEntity` had vertical scroll-to-cursor but no horizontal equivalent — a line longer than the viewport rendered the cursor off-screen. Added `scrollX` mirroring `scrollY`, applied consistently to text, selection, diagnostics, and the cursor itself, matching Vim's default sidescroll behavior.
  - **`:q` on a modified buffer now warns instead of silently discarding edits** (`E37: No write since last change (add ! to override)`), matching real Vim. `:q!`/`:quit!`/`:exit!` force it. `:w` now correctly clears the modified flag (it never did before, which would have made every future `:q` show E37 even right after a successful save).
  - **Opening a file replaces a pristine "untitled" buffer in place** instead of stacking a new tab next to an empty one nobody asked to keep — matches `:e` in a fresh Vim session. New `VemWorkspace.isActiveBufferPristine()` API backs this.
  - **`WorkspaceExplorer.closeWorkspace()`**: once a folder was opened there was no way to open a different one — the Dir/File buttons were removed and nothing ever restored them. Adds a "Close" button next to the file tree that returns to the picker buttons and drops stale file handles.
  - **Square Dir/File buttons** instead of the old wide "Open Folder"/"Open File" pills.
  - New `VemWorkspace.getBuffersSnapshot()`/`restoreBuffersSnapshot()` for a host app (like vem-website) to persist open buffers across a page reload — the web build has no backing filesystem to reopen from, so a refresh previously wiped all unsaved work.

### Patch Changes

- Updated dependencies [ec10976]
  - @vemjs/core@0.3.0

## 0.2.0

### Minor Changes

- 76ef0d5: Vim-parity pass: fixed Insert-mode Arrow/Home/End/PageUp/PageDown (previously no-ops), added dot-repeat (`.`), `f`/`F`/`t`/`T` find-char motions, `r{char}` replace, `*`/`#` whole-word search, the Vim `:set {option}!` toggle suffix, `:quit`/`:exit` as friendlier aliases for `:q`, and system-clipboard integration via `:set clipboard=unnamed`/`unnamedplus` (core exposes a pluggable `ClipboardProvider`; `renderer-vecto` wires in the browser Clipboard API). Also fixed the CommandBar's `:`/`/` prefix sitting on a different baseline than the typed command text.

### Patch Changes

- Updated dependencies [76ef0d5]
  - @vemjs/core@0.2.0

## 0.1.14

### Patch Changes

- Add `VemWorkspace.switchToBuffer(id)` — focus an earlier tab after later ones
  were opened. Needed by any host that opens multiple files in sequence and
  wants control over which one ends up active (e.g. a CLI's `+<lnum>` applying
  to the first file argument regardless of open order).

## 0.1.13

### Patch Changes

- Vim-fidelity pass:

  - **core**: uppercase operators/motions (`D`, `C`, `Y`, `X`, `s`, `S`, `W`/`B`/`E`
    WORD motions, `^`, `%` bracket matching), a `/` search prompt with
    wrapscan `n`/`N` repeat.
  - **renderer-vecto**: command-line bar now uses the editor background (not the
    StatusLine highlight) and the `:`/`/` prefix sits flush against the typed
    text; exactly one pane is ever the "current window" (clicking a pane, or a
    fresh `:sp`/`:vsp`/`:help` split, updates both keyboard routing and which
    cursor renders solid — previously every split left every pane's cursor
    hollow until clicked); the INSERT-mode cursor is always a thin vertical bar
    regardless of focus, matching GUI Vim; Ctrl-D/U/F/B/E/Y/O now translate and
    preventDefault correctly on a pane's own a11y textarea (previously only the
    window-level router had the full table, so these leaked to the browser
    once a pane itself had focus); mouse wheel scrolls the viewport 3 lines per
    notch without moving the cursor (Vim's `mousescroll` default).

- Updated dependencies
  - @vemjs/core@0.1.12

## 0.1.12

### Patch Changes

- WorkspaceExplorer: propagate width/height changes via `PanelGroup.resize()` — a
  bare width write never redistributed panel sizes, freezing the editor at its
  construction size (empty bottom-right band when the viewport grew or the
  browser zoom changed).

## 0.1.11

### Patch Changes

- Upgrade to `@vectojs/core` ^1.5.0 / `@vectojs/ui` ^1.7.1 — picks up the generalized
  browser-native selectable-text contract (VMT-ordered content projections, subtree
  removal, clipping-aware hiding) and selection-fidelity fixes from 1.4.1/1.6.2.

## 0.1.10

### Patch Changes

- Mouse text selection, Vim `mouse=a` style: dragging in the editor starts a charwise Visual selection anchored at the press cell, the active end follows the pointer, and the selection survives release; a plain click in Visual mode leaves Visual and just moves the cursor. Upgrades to `@vectojs/core` 1.4 / `@vectojs/ui` 1.6 and drops the manual `detachA11y` calls the framework now performs on `Entity.remove()` (also fixing a closed tab's layout lingering as a hidden child of the tab strip).
- Updated dependencies
  - @vemjs/core@0.1.11

## 0.1.9

### Patch Changes

- Render like real Vim: `~` NonText markers for empty lines, the centered `:intro` splash on a fresh empty buffer (cleared on first edit), a zero-width gutter when line numbers are off, and a bare last-line ruler (`line,col` / `0,0-1`, plus All/Top/Bot/NN%) with the mode message only shown outside NORMAL. The statusline bar is painted only when a plugin (lualine) supplies one.
- Updated dependencies
  - @vemjs/core@0.1.10

## 0.1.8

### Patch Changes

- a96c4af: Tabs are now buffers with stable ids and file-name labels, closable via the × affordance (and virtualized/scrollable when many are open) — closing a middle tab no longer renumbers survivors, `:q` on an unsplit pane closes its tab, and the last tab resets to empty instead of vanishing. The sidebar gains an "Open File" button (single-file open, not just folders) and `toggleSidebar()`/`setSidebarVisible()`. Files open in tabs labeled with their name and wire `:w` to write back to disk; the file tree shows material-style per-extension icons (via the new `fileIcon()` helper and `TreeNode.iconColor`). A macro recording indicator shows in the status bar.
- Updated dependencies [a96c4af]
  - @vemjs/core@0.1.8

## 0.1.7

### Patch Changes

- 1426c10: Draw the editor gutter and buffer text directly on the monospace character grid instead of flowing them through Text/RichText: paragraph-flow layout collapsed whitespace runs (indentation vanished, caret drifted from glyphs) and used a subtly different line advance than the caret/selection math (gutter numbers sank below their lines). Grid drawing also virtualizes to visible rows, re-measures charWidth once webfonts load, renders relative line numbers when `layoutConfig.lineNumbers` is `relative`, shows core statusMessage feedback in the status bar, and `splitPane`/`splitActivePane` accept `initialText` for Vim-style `:help` splits.
- Updated dependencies [1426c10]
  - @vemjs/core@0.1.6

## 0.1.6

### Patch Changes

- 6e2ae90: Propagate workspace size to every tab layout on update. Tabs does not size its content entities, so layouts kept their construction width and bled past the hosting Panel clip by the divider width (a 3.2px right-edge escape flagged by the @vectojs/devtools scene audit).

## 0.1.5

### Patch Changes

- a4739fe: Update VectoJS runtime dependencies to `@vectojs/core` ^1.0.1 / `@vectojs/ui` ^1.1.2 (post-rebrand scope), align renderer scene lifecycle with embedded canvas teardown, fix `:vsp`/`:sp` split orientation being inverted, fix stale pane-map entries leaving the surviving pane unresponsive after closing a split, and add `WorkspaceLayout.refreshActivePane()` so externally driven state mutations (e.g. an app-level keydown handler) actually repaint instead of silently mutating state with no visible change.
- Updated dependencies [4203dae]
  - @vemjs/core@0.1.5

## 0.1.4

### Patch Changes

- Pin VectoJS runtime packages to `@vectojs/core@0.2.2` and `@vectojs/ui@0.2.2`.
- Fix VectoUI entity lifecycle cleanup for command bars, workspaces, layouts, and explorer panes.
- Synchronize command-line text through editor state and route textarea keys through Vim mode by default.
- Limit published package contents to built `dist` files.
- Updated dependencies
  - @vemjs/core@0.1.4

## 0.1.3

### Patch Changes

- fix: update workspace dependencies to standard registry versions in package.json files
- Updated dependencies
  - @vemjs/core@0.1.3

## 0.1.2

### Patch Changes

- 02d5968: fix: replace workspace protocol references with exact versions on npm publish
- Updated dependencies [02d5968]
  - @vemjs/core@0.1.2

## 0.1.1

### Patch Changes

- f5ccf66: feat(config): add browser-compatible configuration evaluation and pane splits keybindings inheritance

  - Expose `getCustomKeybindings()` in `VemEditorState` to query custom keymap bindings
  - Inherit custom keybindings when performing pane splits inside `WorkspaceLayout`
  - Implement `loadConfigFromJsString` in `ConfigLoader` utilizing browser-native Object URL dynamic imports
  - Expose `onDidOpenDirectory` hook in `WorkspaceExplorer` to capture directory handle loaded events

- ad81302: feat(renderer): implement diagnostic highlights (wavy underlines) and autocomplete popover menu on the Canvas editor

  - Render diagnostic wavy lines under text characters based on severity levels (error, warning, info, hint)
  - Implement interactive autocomplete popup menu rendered directly below the cursor
  - Support active item selection and scrolling inside the canvas-rendered popover
  - Expose methods on VemEditorEntity to control autocomplete states (setAutocompleteItems, selectNextAutocomplete, selectPrevAutocomplete, clearAutocomplete)

- Updated dependencies [f5ccf66]
  - @vemjs/core@0.1.1

## 0.1.0

### Patch Changes

- 0498765: chore: release infrastructure, package metadata, and documentation scaffolding

  This changeset covers all release preparation work for the initial 0.1.0 publish:

  **Package metadata** — Added `license`, `repository`, `keywords`, and `publishConfig` fields to
  all four packages so they display correctly on npmjs.com with proper source links, license badges,
  and searchable tags.

  **CI/CD pipeline** — Rewrote `.github/workflows/ci.yml` and `release.yml`:

  - `quality` job: build → test → lint (oxlint) → dead-code scan (knip) on every PR and push
  - `publish` job: automatic `changeset publish` to npm on every merge to `main` via
    `changesets/action@v1` using the `NPM_TOKEN` org secret

  **Changesets** — Initialized `.changeset/` with a `config.json` configured for public access and
  patch-level internal dependency updates, enabling a fully automated release flow.

  **Tooling** — Added `knip.config.ts` (dead-code detection), `oxlintrc.json` (TypeScript-aware
  lint rules), `.lintstagedrc.json` (auto-fix staged files on commit), and updated root
  `package.json` scripts: `build`, `test`, `lint`, `knip`, `changeset`, `version-packages`,
  `release`.

  **Dependabot** — Configured weekly npm dependency scanning with dev/prod groups and
  `@vectojs/*` major-version pin to avoid upstream breaking changes.

  **Repository** — Updated root `README.md` with CI/npm/license badges and package table.
  Updated `SECURITY.md` with all four `@vemjs/*` packages and coordinated-disclosure guidance.
  Added GitHub topics (vim, editor, typescript, vectojs, canvas, modal-editing, lsp) and branch
  protection requiring the `quality` status check before merging to `main`.

  **Build hygiene** — Cleaned all `dist/` directories and rebuilt from source to ensure no
  test artefacts are included in published tarballs. Verified `knip` reports zero issues.

- Updated dependencies [0498765]
- Updated dependencies [3fa4848]
  - @vemjs/core@0.2.0

### Features

- `VemEditorEntity` — zero-DOM canvas text editor with line numbers, cursor blink, VISUAL selection highlights, scroll, gutter
- `CommandBar` — VectoUI `Input`-based command palette (`:w`, `:q`, `:vsp`, `:sp`)
- `WorkspaceLayout` — resizable `PanelGroup` / `Panel` split panes (vertical + horizontal)
- `VemWorkspace` — tabbed multi-file workspace using VectoUI `Tabs`
- `WorkspaceExplorer` — sidebar `TreeView` file picker + editor area, File System Access API integration
- `FileSystemHandler` — recursive directory handle mapper with lazy expansion and folder-first sort
