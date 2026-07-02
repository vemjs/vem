/**
 * @vemjs/lsp-client — Language Server Protocol Client
 *
 * Implements the LSP specification subset needed for:
 *   - Initialize / Shutdown handshake
 *   - textDocument/didOpen, didChange, didClose
 *   - textDocument/completion (autocomplete)
 *   - textDocument/publishDiagnostics (error / warning highlights)
 *   - textDocument/hover
 */

import type { VemEditorState, Diagnostic, DiagnosticSeverity } from '@vemjs/core';
import { JsonRpcClient } from './JsonRpcClient';
export type {
  JsonRpcRequest,
  JsonRpcNotification,
  JsonRpcResponse,
  JsonRpcMessage,
  NotificationHandler,
} from './JsonRpcClient';

// ── LSP Types (subset of the spec) ─────────────────────────────────────────

export interface LspPosition {
  line: number;
  character: number;
}

export interface LspRange {
  start: LspPosition;
  end: LspPosition;
}

export interface LspTextDocumentIdentifier {
  uri: string;
}

export interface LspTextDocumentItem {
  uri: string;
  languageId: string;
  version: number;
  text: string;
}

export interface LspCompletionItem {
  label: string;
  kind?: number;
  detail?: string;
  insertText?: string;
}

export interface LspCompletionList {
  isIncomplete: boolean;
  items: LspCompletionItem[];
}

export interface LspDiagnostic {
  range: LspRange;
  severity?: 1 | 2 | 3 | 4; // error, warning, info, hint
  message: string;
  source?: string;
}

export type CompletionResultCallback = (items: LspCompletionItem[]) => void;
export type HoverCallback = (content: string) => void;

// ── Severity mapping ────────────────────────────────────────────────────────

const LSP_SEVERITY_MAP: Record<number, DiagnosticSeverity> = {
  1: 'error',
  2: 'warning',
  3: 'info',
  4: 'hint',
};

// ── LSPClient ───────────────────────────────────────────────────────────────

export class LSPClient {
  private rpc: JsonRpcClient;
  private fileUri: string;
  private languageId: string;
  private editorState: VemEditorState | null = null;
  private version = 0;
  private initialized = false;
  private completionCallbacks: CompletionResultCallback[] = [];
  private hoverCallbacks: HoverCallback[] = [];

  constructor(serverUrl: string, fileUri: string, languageId: string) {
    this.rpc = new JsonRpcClient(serverUrl);
    this.fileUri = fileUri;
    this.languageId = languageId;
  }

  // ── Lifecycle ─────────────────────────────────────────────────────────────

  public async connect(editorState?: VemEditorState): Promise<void> {
    await this.rpc.connect();

    if (editorState) {
      this.attach(editorState);
    }

    // LSP initialize handshake
    await this.rpc.sendRequest('initialize', {
      processId: null,
      clientInfo: { name: 'vem', version: '0.1.0' },
      rootUri: null,
      capabilities: {
        textDocument: {
          synchronization: { didOpen: true, didChange: true, didClose: true },
          completion: { completionItem: { snippetSupport: false } },
          hover: {},
          publishDiagnostics: {},
        },
      },
    });

    this.rpc.sendNotification('initialized', {});
    this.initialized = true;

    // Register diagnostics listener
    this.rpc.onNotification('textDocument/publishDiagnostics', (params: unknown) => {
      this.handlePublishDiagnostics(params as { uri: string; diagnostics: LspDiagnostic[] });
    });

    // If editor was already open, sync immediately
    if (this.editorState) {
      this.sendDidOpen();
    }
  }

  public disconnect(): void {
    if (this.initialized) {
      this.rpc.sendNotification('exit', undefined);
    }
    this.rpc.disconnect();
    this.initialized = false;
  }

  // ── Editor state binding ──────────────────────────────────────────────────

  public attach(editorState: VemEditorState): void {
    this.editorState = editorState;

    editorState.onDidOpenBuffer(() => {
      if (this.initialized) this.sendDidOpen();
    });

    editorState.onDidChangeBuffer(() => {
      if (this.initialized) this.sendDidChange();
    });
  }

  // ── textDocument sync ─────────────────────────────────────────────────────

  private sendDidOpen(): void {
    if (!this.editorState) return;
    this.rpc.sendNotification('textDocument/didOpen', {
      textDocument: {
        uri: this.fileUri,
        languageId: this.languageId,
        version: ++this.version,
        text: this.editorState.getText(),
      } satisfies LspTextDocumentItem,
    });
  }

  private sendDidChange(): void {
    if (!this.editorState) return;
    this.rpc.sendNotification('textDocument/didChange', {
      textDocument: { uri: this.fileUri, version: ++this.version },
      contentChanges: [{ text: this.editorState.getText() }],
    });
  }

  public sendDidClose(): void {
    this.rpc.sendNotification('textDocument/didClose', {
      textDocument: { uri: this.fileUri } satisfies LspTextDocumentIdentifier,
    });
  }

  // ── Completion ────────────────────────────────────────────────────────────

  public async requestCompletion(line: number, character: number): Promise<LspCompletionItem[]> {
    if (!this.initialized) return [];

    const result = await this.rpc.sendRequest('textDocument/completion', {
      textDocument: { uri: this.fileUri },
      position: { line, character } satisfies LspPosition,
    });

    const items = this.parseCompletionResult(result);
    for (const cb of this.completionCallbacks) cb(items);
    return items;
  }

  private parseCompletionResult(result: unknown): LspCompletionItem[] {
    if (!result) return [];
    if (Array.isArray(result)) return result as LspCompletionItem[];
    if (typeof result === 'object' && 'items' in (result as object)) {
      return (result as LspCompletionList).items;
    }
    return [];
  }

  public onCompletion(cb: CompletionResultCallback): void {
    this.completionCallbacks.push(cb);
  }

  // ── Hover ─────────────────────────────────────────────────────────────────

  public async requestHover(line: number, character: number): Promise<string | null> {
    if (!this.initialized) return null;

    const result = await this.rpc.sendRequest('textDocument/hover', {
      textDocument: { uri: this.fileUri },
      position: { line, character } satisfies LspPosition,
    });

    if (!result || typeof result !== 'object') return null;
    const hover = result as { contents: unknown };

    let text: string | null = null;
    if (typeof hover.contents === 'string') {
      text = hover.contents;
    } else if (
      typeof hover.contents === 'object' &&
      hover.contents !== null &&
      'value' in hover.contents
    ) {
      text = (hover.contents as { value: string }).value;
    }

    if (text) {
      for (const cb of this.hoverCallbacks) cb(text);
    }
    return text;
  }

  public onHover(cb: HoverCallback): void {
    this.hoverCallbacks.push(cb);
  }

  // ── Diagnostics ───────────────────────────────────────────────────────────

  private handlePublishDiagnostics(params: { uri: string; diagnostics: LspDiagnostic[] }): void {
    if (!this.editorState || params.uri !== this.fileUri) return;

    const mapped: Diagnostic[] = params.diagnostics.map((d) => ({
      line: d.range.start.line,
      startCharacter: d.range.start.character,
      endCharacter: d.range.end.character,
      severity: LSP_SEVERITY_MAP[d.severity ?? 1] ?? 'error',
      message: d.message,
      source: d.source,
    }));

    this.editorState.setDiagnostics(mapped);
  }

  // ── Workspace ─────────────────────────────────────────────────────────────

  public setFileUri(uri: string): void {
    this.fileUri = uri;
  }

  public setLanguageId(languageId: string): void {
    this.languageId = languageId;
  }
}
