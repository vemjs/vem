import type { TreeNode } from '@vectojs/ui';
import { FileSystemHandler } from './FileSystemHandler';

/**
 * A file opened through a host picker. `save` is what `:w` calls; a buffer
 * without one has no save target (Vim's E32 territory, handled by the host).
 */
export interface PickedFile {
  name: string;
  content: string;
  save?: (content: string) => Promise<void>;
}

/**
 * A directory opened through a host picker: the tree to show plus the I/O
 * needed to open and write back files selected from it. `id` is the tree
 * node id (web: workspace-relative path; Tauri: absolute path).
 */
export interface PickedDirectory {
  nodes: TreeNode[];
  readFile: (id: string) => Promise<string>;
  saveFile?: (id: string, content: string) => Promise<void>;
}

/**
 * Platform seam for the Explorer's "Dir"/"File" buttons. The default is the
 * browser's File System Access API, which WebKitGTK (Tauri on Linux) does not
 * implement — desktop shells inject their own provider backed by native
 * dialogs instead of silently dead buttons. Resolving `null` means the picker
 * was cancelled or is unsupported; the Explorer stays as it is.
 */
export interface WorkspaceFsProvider {
  pickDirectory(): Promise<PickedDirectory | null>;
  pickFile(): Promise<PickedFile | null>;
}

const isAbort = (err: unknown): boolean => (err as { name?: string })?.name === 'AbortError';

/** Default provider: the browser's File System Access API (Chromium). */
export function createWebFsProvider(): WorkspaceFsProvider {
  return {
    async pickDirectory(): Promise<PickedDirectory | null> {
      if (typeof window === 'undefined' || !(window as any).showDirectoryPicker) {
        console.warn('File System Access API is not supported in this environment.');
        return null;
      }
      try {
        const rootHandle = await (window as any).showDirectoryPicker();
        // A fresh handler per pick: a same-named file in a newly opened
        // folder must never resolve to a previous folder's handle.
        const handler = new FileSystemHandler();
        const nodes = await handler.readDirectory(rootHandle);
        const handleFor = (id: string) => {
          const handle = handler.getFileHandle(id);
          if (!handle) throw new Error(`No file handle for ${id}`);
          return handle;
        };
        return {
          nodes,
          readFile: (id) => handler.readFile(handleFor(id)),
          saveFile: (id, content) => handler.saveFile(handleFor(id), content),
        };
      } catch (err) {
        if (!isAbort(err)) console.error('Error selecting directory:', err);
        return null;
      }
    },

    async pickFile(): Promise<PickedFile | null> {
      if (typeof window === 'undefined' || !(window as any).showOpenFilePicker) {
        console.warn('File System Access API is not supported in this environment.');
        return null;
      }
      try {
        const [handle] = await (window as any).showOpenFilePicker();
        if (!handle) return null;
        const handler = new FileSystemHandler();
        const content = await handler.readFile(handle);
        return {
          name: handle.name,
          content,
          save: (text) => handler.saveFile(handle, text),
        };
      } catch (err) {
        if (!isAbort(err)) console.error('Error opening file:', err);
        return null;
      }
    },
  };
}
