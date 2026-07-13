---
'@vemjs/renderer-vecto': minor
---

Make the Explorer's file/folder pickers pluggable. The sidebar "Dir"/"File" buttons were hardwired to the browser's File System Access API, which WebKitGTK (Tauri on Linux) doesn't implement — in the desktop app they silently did nothing. New `WorkspaceFsProvider` interface (`pickDirectory`/`pickFile`) with the web implementation as the default (`createWebFsProvider()`); host shells inject native dialogs via `WorkspaceExplorer.setFileSystemProvider()`. `openDirectory(dir)` is public so hosts can show a CLI-resolved directory without a picker, and `openFileBuffer`'s third argument is now a plain `save` callback instead of a `FileSystemFileHandle` (breaking for direct callers). `onDidOpenDirectory` callbacks now receive the `PickedDirectory` instead of the internal `FileSystemHandler`. A save backend that throws a Vim-style `E##:` error gets its message surfaced verbatim in the status line.
