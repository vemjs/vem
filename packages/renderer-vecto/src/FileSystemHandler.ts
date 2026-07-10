import type { TreeNode } from '@vectojs/ui';

const FOLDER_ICON = '📁';

/**
 * Material-ish file glyph + accent color by extension. Deliberately small and
 * dependency-free — a single monospace glyph plus a distinctive color reads as
 * an icon in the canvas tree without shipping an icon font.
 */
interface FileIcon {
  icon: string;
  color: string;
}
const DEFAULT_FILE: FileIcon = { icon: '📄', color: '#94a3b8' };
const FILE_ICONS: Record<string, FileIcon> = {
  ts: { icon: 'TS', color: '#3178c6' },
  tsx: { icon: 'TS', color: '#3178c6' },
  js: { icon: 'JS', color: '#f7df1e' },
  jsx: { icon: 'JS', color: '#f7df1e' },
  json: { icon: '{}', color: '#f5b301' },
  md: { icon: 'M', color: '#42a5f5' },
  html: { icon: '<>', color: '#e34c26' },
  css: { icon: '#', color: '#2965f1' },
  yaml: { icon: 'Y', color: '#cb171e' },
  yml: { icon: 'Y', color: '#cb171e' },
  toml: { icon: 'T', color: '#9c4221' },
  lock: { icon: '🔒', color: '#9e9e9e' },
  svg: { icon: '◈', color: '#ffb13b' },
  png: { icon: '🖼', color: '#26a69a' },
  jpg: { icon: '🖼', color: '#26a69a' },
  jpeg: { icon: '🖼', color: '#26a69a' },
  gif: { icon: '🖼', color: '#26a69a' },
  sh: { icon: '$', color: '#4caf50' },
  rs: { icon: 'R', color: '#dea584' },
  py: { icon: 'PY', color: '#3572a5' },
  txt: { icon: '📄', color: '#94a3b8' },
};

/** Public helper: resolve a file name to its tree icon + color. */
export function fileIcon(name: string): FileIcon {
  const lower = name.toLowerCase();
  if (lower.startsWith('.git')) return { icon: '⑂', color: '#f05133' };
  if (lower === 'license') return { icon: '§', color: '#c0a000' };
  const ext = lower.includes('.') ? lower.slice(lower.lastIndexOf('.') + 1) : '';
  return FILE_ICONS[ext] ?? DEFAULT_FILE;
}

export class FileSystemHandler {
  private fileHandles = new Map<string, FileSystemFileHandle>();

  public async readDirectory(
    dirHandle: FileSystemDirectoryHandle,
    pathPrefix = '',
  ): Promise<TreeNode[]> {
    const nodes: TreeNode[] = [];

    for await (const entry of (dirHandle as any).values()) {
      const fullPath = pathPrefix ? `${pathPrefix}/${entry.name}` : entry.name;

      if (entry.kind === 'directory') {
        nodes.push({
          id: fullPath,
          label: entry.name,
          icon: FOLDER_ICON,
          iconColor: '#e2b64a',
          children: async () => {
            return this.readDirectory(entry, fullPath);
          },
        } as any);
      } else if (entry.kind === 'file') {
        this.fileHandles.set(fullPath, entry);
        const fi = fileIcon(entry.name);
        nodes.push({
          id: fullPath,
          label: entry.name,
          icon: fi.icon,
          iconColor: fi.color,
        });
      }
    }

    // Sort: directories first, then files alphabetically
    nodes.sort((a, b) => {
      const aIsDir = a.icon === FOLDER_ICON;
      const bIsDir = b.icon === FOLDER_ICON;
      if (aIsDir && !bIsDir) return -1;
      if (!aIsDir && bIsDir) return 1;
      return a.label.localeCompare(b.label);
    });

    return nodes;
  }

  public getFileHandle(path: string): FileSystemFileHandle | undefined {
    return this.fileHandles.get(path);
  }

  public async readFile(fileHandle: FileSystemFileHandle): Promise<string> {
    const file = await fileHandle.getFile();
    return await file.text();
  }

  public async saveFile(fileHandle: FileSystemFileHandle, content: string): Promise<void> {
    const writable = await (fileHandle as any).createWritable();
    await writable.write(content);
    await writable.close();
  }
}
