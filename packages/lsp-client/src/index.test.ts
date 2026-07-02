import { describe, it, expect, beforeEach } from 'bun:test';
import { VemEditorState } from '@vemjs/core';
import { JsonRpcClient } from './JsonRpcClient';
import { LSPClient } from './index';

// ── Mock WebSocket ───────────────────────────────────────────────────────────

interface SentMessage {
  jsonrpc: string;
  id?: number;
  method: string;
  params?: unknown;
}

class MockWebSocket {
  static instances: MockWebSocket[] = [];

  onopen: (() => void) | null = null;
  onmessage: ((ev: { data: string }) => void) | null = null;
  onerror: ((ev: unknown) => void) | null = null;
  onclose: (() => void) | null = null;

  sentMessages: SentMessage[] = [];
  readyState = 1; // OPEN

  constructor(_url: string) {
    MockWebSocket.instances.push(this);
    // Simulate async open
    Promise.resolve().then(() => this.onopen?.());
  }

  send(data: string) {
    this.sentMessages.push(JSON.parse(data) as SentMessage);

    // Auto-respond to requests with a mock result
    const msg = JSON.parse(data) as SentMessage;
    if (msg.id !== undefined) {
      Promise.resolve().then(() => {
        this.onmessage?.({
          data: JSON.stringify({
            jsonrpc: '2.0',
            id: msg.id,
            result:
              msg.method === 'textDocument/completion'
                ? { isIncomplete: false, items: [{ label: 'console', kind: 6 }] }
                : {},
          }),
        });
      });
    }
  }

  close() {
    this.readyState = 3;
    this.onclose?.();
  }

  /** Helper: simulate a server push notification */
  pushNotification(method: string, params: unknown) {
    this.onmessage?.({
      data: JSON.stringify({ jsonrpc: '2.0', method, params }),
    });
  }
}

// Inject mock globally
(globalThis as unknown as Record<string, unknown>).WebSocket = MockWebSocket;

// ── JsonRpcClient tests ──────────────────────────────────────────────────────

describe('JsonRpcClient', () => {
  beforeEach(() => {
    MockWebSocket.instances = [];
  });

  it('should connect and resolve sendRequest via mock response', async () => {
    const client = new JsonRpcClient('ws://localhost:2087');
    await client.connect();

    const ws = MockWebSocket.instances[0];
    expect(ws).toBeDefined();
    expect(client.isConnected).toBe(true);

    const result = await client.sendRequest('textDocument/completion', {
      textDocument: { uri: 'file:///test.ts' },
      position: { line: 0, character: 5 },
    });

    expect(result).toBeDefined();
  });

  it('should dispatch onNotification handlers', async () => {
    const client = new JsonRpcClient('ws://localhost:2087');
    await client.connect();

    let received: unknown = null;
    client.onNotification('textDocument/publishDiagnostics', (params) => {
      received = params;
    });

    const ws = MockWebSocket.instances[0];
    ws.pushNotification('textDocument/publishDiagnostics', {
      uri: 'file:///test.ts',
      diagnostics: [],
    });

    // Give the microtask queue a chance to flush
    await Promise.resolve();
    expect(received).not.toBeNull();
  });

  it('should send notifications without expecting a response', async () => {
    const client = new JsonRpcClient('ws://localhost:2087');
    await client.connect();

    client.sendNotification('textDocument/didClose', {
      textDocument: { uri: 'file:///test.ts' },
    });

    const ws = MockWebSocket.instances[0];
    const notif = ws.sentMessages.find((m) => m.method === 'textDocument/didClose');
    expect(notif).toBeDefined();
    expect(notif?.id).toBeUndefined();
  });
});

// ── LSPClient integration tests ──────────────────────────────────────────────

describe('LSPClient', () => {
  beforeEach(() => {
    MockWebSocket.instances = [];
  });

  it('should sync buffer text on didOpen after connect', async () => {
    const editor = new VemEditorState('const x = 1;');
    const lsp = new LSPClient('ws://localhost:2087', 'file:///test.ts', 'typescript');
    await lsp.connect(editor);

    const ws = MockWebSocket.instances[0];
    // Wait for the async didOpen triggered by the setTimeout in editor state
    await new Promise((r) => setTimeout(r, 10));

    const didOpen = ws.sentMessages.find((m) => m.method === 'textDocument/didOpen');
    expect(didOpen).toBeDefined();
    const doc = (didOpen?.params as { textDocument: { text: string } })?.textDocument;
    expect(doc?.text).toBe('const x = 1;');
  });

  it('should update diagnostics in editor state on publishDiagnostics', async () => {
    const editor = new VemEditorState('let x: number = "oops";');
    const lsp = new LSPClient('ws://localhost:2087', 'file:///test.ts', 'typescript');
    await lsp.connect(editor);

    await new Promise((r) => setTimeout(r, 5));

    const ws = MockWebSocket.instances[0];
    ws.pushNotification('textDocument/publishDiagnostics', {
      uri: 'file:///test.ts',
      diagnostics: [
        {
          range: {
            start: { line: 0, character: 16 },
            end: { line: 0, character: 22 },
          },
          severity: 1,
          message: "Type 'string' is not assignable to type 'number'.",
          source: 'tsserver',
        },
      ],
    });

    await Promise.resolve();
    const diags = editor.getDiagnostics();
    expect(diags).toHaveLength(1);
    expect(diags[0].severity).toBe('error');
    expect(diags[0].line).toBe(0);
    expect(diags[0].source).toBe('tsserver');
  });

  it('should fire onPublishDiagnostics callback when diagnostics arrive', async () => {
    const editor = new VemEditorState('');
    const lsp = new LSPClient('ws://localhost:2087', 'file:///test.ts', 'typescript');
    await lsp.connect(editor);

    let callbackFired = false;
    editor.onPublishDiagnostics((_diags) => {
      callbackFired = true;
    });

    await new Promise((r) => setTimeout(r, 5));
    const ws = MockWebSocket.instances[0];
    ws.pushNotification('textDocument/publishDiagnostics', {
      uri: 'file:///test.ts',
      diagnostics: [],
    });
    await Promise.resolve();

    // setDiagnostics fires callbacks even for empty arrays
    expect(callbackFired).toBe(true);
  });

  it('should request completions and return items', async () => {
    const editor = new VemEditorState('console');
    const lsp = new LSPClient('ws://localhost:2087', 'file:///test.ts', 'typescript');
    await lsp.connect(editor);

    const items = await lsp.requestCompletion(0, 7);
    expect(items.length).toBeGreaterThan(0);
    expect(items[0].label).toBe('console');
  });
});
