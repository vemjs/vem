import { describe, it, expect } from 'bun:test';
import { FileSystemHandler } from './FileSystemHandler';

describe('FileSystemHandler', () => {
  it('should map directory entries to TreeNode structures and sort folders first', async () => {
    const mockFileHandle = {
      kind: 'file',
      name: 'index.ts',
      getFile: async () => ({
        text: async () => 'console.log("hello");',
      }),
    };

    const mockSubDirHandle = {
      kind: 'directory',
      name: 'components',
      values: async function* () {
        yield {
          kind: 'file',
          name: 'Button.ts',
        };
      },
    };

    const mockDirHandle = {
      kind: 'directory',
      name: 'src',
      values: async function* () {
        yield mockFileHandle;
        yield mockSubDirHandle;
      },
    };

    const handler = new FileSystemHandler();
    const nodes = await handler.readDirectory(mockDirHandle as any);

    expect(nodes.length).toBe(2);
    // Folder components should be sorted first
    expect(nodes[0].label).toBe('components');
    expect(nodes[0].icon).toBe('📁');
    expect(nodes[1].label).toBe('index.ts');
    expect(nodes[1].icon).toBe('📄');

    // Test lazy children loading
    const childrenFunc = nodes[0].children as () => Promise<any[]>;
    expect(typeof childrenFunc).toBe('function');
    const children = await childrenFunc();
    expect(children.length).toBe(1);
    expect(children[0].label).toBe('Button.ts');
  });
});
