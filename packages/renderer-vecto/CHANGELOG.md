# @vemjs/renderer-vecto

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
