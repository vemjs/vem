import type { TreeNode } from '@vectojs/ui';

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
          icon: '📁',
          children: async () => {
            return this.readDirectory(entry, fullPath);
          },
        } as any);
      } else if (entry.kind === 'file') {
        this.fileHandles.set(fullPath, entry);
        nodes.push({
          id: fullPath,
          label: entry.name,
          icon: '📄',
        });
      }
    }

    // Sort: directories first, then files alphabetically
    nodes.sort((a, b) => {
      const aIsDir = a.icon === '📁';
      const bIsDir = b.icon === '📁';
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
