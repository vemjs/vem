/**
 * @vemjs/lsp-client — JSON-RPC 2.0 Protocol Engine
 *
 * Handles request/response correlation and notification routing
 * over a WebSocket transport layer.
 */

export interface JsonRpcRequest {
  jsonrpc: '2.0';
  id: number;
  method: string;
  params?: unknown;
}

export interface JsonRpcNotification {
  jsonrpc: '2.0';
  method: string;
  params?: unknown;
}

export interface JsonRpcResponse {
  jsonrpc: '2.0';
  id: number;
  result?: unknown;
  error?: { code: number; message: string; data?: unknown };
}

export type JsonRpcMessage = JsonRpcRequest | JsonRpcNotification | JsonRpcResponse;

export type NotificationHandler = (params: unknown) => void;

export class JsonRpcClient {
  private ws: WebSocket | null = null;
  private nextId = 1;
  private pending = new Map<
    number,
    { resolve: (v: unknown) => void; reject: (e: unknown) => void }
  >();
  private notificationHandlers = new Map<string, NotificationHandler[]>();
  private readyQueue: (() => void)[] = [];
  private connected = false;
  private readonly url: string;

  constructor(url: string) {
    this.url = url;
  }

  // ── Connection ─────────────────────────────────────────────────────────────

  public connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(this.url);

      this.ws.onopen = () => {
        this.connected = true;
        for (const fn of this.readyQueue) fn();
        this.readyQueue = [];
        resolve();
      };

      this.ws.onmessage = (ev) => {
        try {
          this.handleMessage(JSON.parse(ev.data as string) as JsonRpcMessage);
        } catch {
          console.warn('[JsonRpcClient] Failed to parse message:', ev.data);
        }
      };

      this.ws.onerror = (ev) => {
        reject(ev);
      };

      this.ws.onclose = () => {
        this.connected = false;
        // Reject all pending requests on disconnect
        for (const [id, p] of this.pending) {
          p.reject(new Error(`Connection closed before response for id=${id}`));
        }
        this.pending.clear();
      };
    });
  }

  public disconnect(): void {
    this.ws?.close();
    this.ws = null;
    this.connected = false;
  }

  public get isConnected(): boolean {
    return this.connected;
  }

  // ── Outbound ───────────────────────────────────────────────────────────────

  public sendRequest(method: string, params?: unknown): Promise<unknown> {
    const id = this.nextId++;
    const message: JsonRpcRequest = {
      jsonrpc: '2.0',
      id,
      method,
      ...(params !== undefined && { params }),
    };

    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.send(message);
    });
  }

  public sendNotification(method: string, params?: unknown): void {
    const message: JsonRpcNotification = {
      jsonrpc: '2.0',
      method,
      ...(params !== undefined && { params }),
    };
    this.send(message);
  }

  // ── Inbound ────────────────────────────────────────────────────────────────

  public onNotification(method: string, cb: NotificationHandler): void {
    const handlers = this.notificationHandlers.get(method) ?? [];
    handlers.push(cb);
    this.notificationHandlers.set(method, handlers);
  }

  // ── Internal ───────────────────────────────────────────────────────────────

  private send(message: JsonRpcMessage): void {
    const send = () => this.ws?.send(JSON.stringify(message));
    if (this.connected) {
      send();
    } else {
      this.readyQueue.push(send);
    }
  }

  private handleMessage(message: JsonRpcMessage): void {
    // Response (has `id` and `result` or `error`)
    if ('id' in message && ('result' in message || 'error' in message)) {
      const response = message as JsonRpcResponse;
      const pending = this.pending.get(response.id);
      if (pending) {
        this.pending.delete(response.id);
        if (response.error) {
          pending.reject(response.error);
        } else {
          pending.resolve(response.result);
        }
      }
      return;
    }

    // Notification (no `id`)
    if ('method' in message && !('id' in message)) {
      const notification = message as JsonRpcNotification;
      const handlers = this.notificationHandlers.get(notification.method);
      if (handlers) {
        for (const h of handlers) h(notification.params);
      }
    }
  }
}
