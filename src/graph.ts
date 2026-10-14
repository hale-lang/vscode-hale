import * as vscode from "vscode";
import { Model } from "./artifact";
import { graphSvg } from "./hale";

const VIEWS = ["system", "bus", "code", "residue"];

/** The seed's graph, as `hale topology graph` renders the artifact. One panel, re-rendered per view. */
export class GraphPanel {
  private static current: GraphPanel | undefined;
  private view = "system";
  private claim: string | undefined;
  private model: Model | undefined;

  static show(ctx: vscode.ExtensionContext, model: Model | undefined): void {
    if (!GraphPanel.current) {
      const panel = vscode.window.createWebviewPanel("hale.graph", "Hale graph", vscode.ViewColumn.Beside, { enableScripts: true, retainContextWhenHidden: true });
      GraphPanel.current = new GraphPanel(panel);
      panel.onDidDispose(() => { GraphPanel.current = undefined; });
      ctx.subscriptions.push(panel);
    }
    GraphPanel.current.model = model;
    GraphPanel.current.panel.reveal(undefined, true);
    void GraphPanel.current.render();
  }

  static update(model: Model | undefined): void {
    if (!GraphPanel.current) return;
    GraphPanel.current.model = model;
    void GraphPanel.current.render();
  }

  private constructor(private readonly panel: vscode.WebviewPanel) {
    panel.webview.onDidReceiveMessage((m: { view?: string; claim?: string }) => {
      if (m.view) this.view = m.view;
      if (m.claim !== undefined) this.claim = m.claim || undefined;
      void this.render();
    });
  }

  private async render(): Promise<void> {
    const m = this.model;
    let svg = "";
    let note = "";
    if (!m) note = "No checked seed. Open a .hl file that typechecks.";
    else {
      try {
        svg = await graphSvg(m.artifactPath, this.view, this.view === "claim" ? this.claim : undefined);
      } catch (e) {
        note = String((e as Error).message ?? e);
      }
    }
    const claims = m?.artifact.claims?.map((c) => c.name) ?? [];
    const nonce = Math.random().toString(36).slice(2);
    const buttons = [...VIEWS, ...(claims.length ? ["claim"] : [])]
      .map((v) => `<button data-view="${v}" class="${v === this.view ? "on" : ""}">${v}</button>`).join("");
    const select = claims.length
      ? `<select id="claim">${claims.map((c) => `<option ${c === this.claim ? "selected" : ""}>${c}</option>`).join("")}</select>`
      : "";
    this.panel.title = m ? `Hale graph · ${m.seedDir.split("/").pop()}` : "Hale graph";
    this.panel.webview.html = `<!doctype html><html><head><meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${nonce}'; img-src data:;">
<style>
  body { margin: 0; font-family: var(--vscode-font-family); color: var(--vscode-foreground); background: var(--vscode-editor-background); }
  .bar { position: sticky; top: 0; display: flex; gap: 6px; align-items: center; padding: 6px 10px; background: var(--vscode-editorGroupHeader-tabsBackground); border-bottom: 1px solid var(--vscode-panel-border); }
  button { background: var(--vscode-button-secondaryBackground); color: var(--vscode-button-secondaryForeground); border: 0; padding: 3px 10px; border-radius: 3px; cursor: pointer; }
  button.on { background: var(--vscode-button-background); color: var(--vscode-button-foreground); }
  select { background: var(--vscode-dropdown-background); color: var(--vscode-dropdown-foreground); border: 1px solid var(--vscode-dropdown-border); }
  .meta { margin-left: auto; opacity: .7; font-size: 12px; }
  .canvas { padding: 12px; overflow: auto; }
  .canvas svg { max-width: 100%; height: auto; }
  .note { padding: 16px; opacity: .8; }
</style></head><body>
<div class="bar">${buttons}${select}<span class="meta">${m ? `schema ${m.artifact.schema} · shape ${m.artifact.shape_hash} · verdict ${m.artifact.verdict}` : ""}</span></div>
${note ? `<div class="note">${escapeHtml(note)}</div>` : `<div class="canvas">${svg}</div>`}
<script nonce="${nonce}">
  const vscode = acquireVsCodeApi();
  for (const b of document.querySelectorAll('button[data-view]')) b.addEventListener('click', () => vscode.postMessage({ view: b.dataset.view, claim: (document.getElementById('claim')||{}).value }));
  const sel = document.getElementById('claim'); if (sel) sel.addEventListener('change', () => vscode.postMessage({ view: 'claim', claim: sel.value }));
</script></body></html>`;
  }
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c] as string));
}
