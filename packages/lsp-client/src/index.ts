/**
 * @vemjs/lsp-client - Web Language Server Protocol client
 */

export class LSPClient {
  constructor(serverUrl?: string) {
    if (serverUrl) {
      this.connect(serverUrl);
    }
  }

  public connect(url: string): void {
    console.log(`Connecting to LSP Server at ${url}`);
  }

  public requestCompletion(fileUri: string, line: number, character: number): void {
    console.log(`Requesting autocomplete for ${fileUri} at Line ${line}, Col ${character}`);
  }
}
