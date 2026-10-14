import * as vscode from "vscode";
import { Model } from "./artifact";
import { run } from "./hale";

/**
 * The API docs of a seed, rendered from what the compiler prints for
 * each surface: the OpenAPI form (`hale check --api --surface S
 * --openapi`), with the MCP form and the raw JSON a click away. Nothing
 * here is authored by hand: the page is the rows.
 */
export class ApiDocsPanel {
  private static current: ApiDocsPanel | undefined;
  private model: Model | undefined;
  private surface: string | undefined;
  private form: "openapi" | "mcp" | "description" = "openapi";

  static show(ctx: vscode.ExtensionContext, model: Model | undefined): void {
    if (!ApiDocsPanel.current) {
      const panel = vscode.window.createWebviewPanel("hale.apidocs", "Hale API docs", vscode.ViewColumn.Beside, { enableScripts: true, retainContextWhenHidden: true });
      ApiDocsPanel.current = new ApiDocsPanel(panel);
      panel.onDidDispose(() => { ApiDocsPanel.current = undefined; });
      ctx.subscriptions.push(panel);
    }
    ApiDocsPanel.current.model = model;
    ApiDocsPanel.current.panel.reveal(undefined, true);
    void ApiDocsPanel.current.render();
  }

  static update(model: Model | undefined): void {
    if (!ApiDocsPanel.current) return;
    ApiDocsPanel.current.model = model;
    void ApiDocsPanel.current.render();
  }

  private constructor(private readonly panel: vscode.WebviewPanel) {
    panel.webview.onDidReceiveMessage((m: { surface?: string; form?: string }) => {
      if (m.surface) this.surface = m.surface;
      if (m.form === "openapi" || m.form === "mcp" || m.form === "description") this.form = m.form;
      void this.render();
    });
  }

  private async render(): Promise<void> {
    const m = this.model;
    const surfaces = m?.inventory?.surfaces?.map((s) => s.name) ?? [];
    if (!this.surface || !surfaces.includes(this.surface)) this.surface = surfaces[0];
    let body = "";
    if (!m) body = `<p class="note">No checked seed. Open a .hl file that typechecks.</p>`;
    else if (!surfaces.length) body = `<p class="note">This seed declares no <code>api</code> surface. One is <code>api Name { rpc Locus::fn; }</code>.</p>`;
    else {
      const seed = m.seedDir;
      const flag = this.form === "openapi" ? "--openapi" : this.form === "mcp" ? "--mcp" : "--json-schema";
      const r = await run(["check", "--api", "--surface", this.surface!, flag, seed]);
      const i = r.stdout.indexOf("{");
      let doc: unknown = undefined;
      if (i >= 0) { try { doc = JSON.parse(r.stdout.slice(i)); } catch { doc = undefined; } }
      if (!doc) body = `<p class="note">${esc(r.stderr || r.stdout || "the compiler printed nothing for this surface")}</p>`;
      else if (this.form === "openapi") body = renderOpenApi(doc as OpenApi, m);
      else if (this.form === "mcp") body = renderMcp(doc as McpDoc);
      else body = `<pre>${esc(JSON.stringify(doc, null, 2))}</pre>`;
      body += `<details class="raw"><summary>raw ${this.form} JSON</summary><pre>${esc(JSON.stringify(doc, null, 2))}</pre></details>`;
    }
    const nonce = Math.random().toString(36).slice(2);
    const tabs = (["openapi", "mcp", "description"] as const).map((f) => `<button data-form="${f}" class="${f === this.form ? "on" : ""}">${f === "description" ? "json schema" : f}</button>`).join("");
    const pick = surfaces.length > 1 ? `<select id="surface">${surfaces.map((s) => `<option ${s === this.surface ? "selected" : ""}>${esc(s)}</option>`).join("")}</select>` : surfaces.length ? `<span class="meta">api ${esc(surfaces[0])}</span>` : "";
    this.panel.title = this.surface ? `API docs · ${this.surface}` : "Hale API docs";
    this.panel.webview.html = `<!doctype html><html><head><meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${nonce}';">
<style>
  body { margin: 0; font-family: var(--vscode-font-family); font-size: 13px; color: var(--vscode-foreground); background: var(--vscode-editor-background); }
  .bar { position: sticky; top: 0; display: flex; gap: 6px; align-items: center; padding: 6px 10px; background: var(--vscode-editorGroupHeader-tabsBackground); border-bottom: 1px solid var(--vscode-panel-border); }
  button { background: var(--vscode-button-secondaryBackground); color: var(--vscode-button-secondaryForeground); border: 0; padding: 3px 10px; border-radius: 3px; cursor: pointer; }
  button.on { background: var(--vscode-button-background); color: var(--vscode-button-foreground); }
  select { background: var(--vscode-dropdown-background); color: var(--vscode-dropdown-foreground); border: 1px solid var(--vscode-dropdown-border); }
  .meta { opacity: .7; }
  main { padding: 12px 16px; max-width: 900px; }
  h1 { font-size: 16px; margin: 4px 0 2px; } h2 { font-size: 14px; margin: 18px 0 6px; border-bottom: 1px solid var(--vscode-panel-border); padding-bottom: 3px; }
  .op { border: 1px solid var(--vscode-panel-border); border-radius: 4px; padding: 8px 10px; margin: 8px 0; }
  .op .head { display: flex; gap: 8px; align-items: baseline; }
  .verb { font-weight: 600; font-size: 11px; padding: 1px 6px; border-radius: 3px; background: var(--vscode-badge-background); color: var(--vscode-badge-foreground); }
  code, pre { font-family: var(--vscode-editor-font-family); font-size: 12px; }
  pre { background: var(--vscode-textCodeBlock-background); padding: 8px; border-radius: 4px; overflow: auto; }
  table { border-collapse: collapse; margin: 4px 0; } td, th { text-align: left; padding: 2px 10px 2px 0; vertical-align: top; } th { opacity: .7; font-weight: 500; }
  .note { opacity: .8; } .req { color: var(--vscode-editorWarning-foreground); } .desc { opacity: .85; margin: 4px 0; }
  details.raw { margin-top: 18px; } summary { cursor: pointer; opacity: .8; }
</style></head><body>
<div class="bar">${pick}${tabs}<span class="meta" style="margin-left:auto">${m ? esc(m.seedDir.split("/").pop() ?? "") : ""}</span></div>
<main>${body}</main>
<script nonce="${nonce}">
  const vscode = acquireVsCodeApi();
  for (const b of document.querySelectorAll('button[data-form]')) b.addEventListener('click', () => vscode.postMessage({ form: b.dataset.form }));
  const s = document.getElementById('surface'); if (s) s.addEventListener('change', () => vscode.postMessage({ surface: s.value }));
</script></body></html>`;
  }
}

interface Schema { type?: string; $ref?: string; properties?: Record<string, Schema>; required?: string[]; items?: Schema; const?: string; enum?: unknown[]; description?: string; oneOf?: Schema[]; anyOf?: Schema[] }
interface OpenApi {
  info?: { title?: string; version?: string; description?: string };
  paths?: Record<string, Record<string, { operationId?: string; summary?: string; description?: string; requestBody?: { content?: Record<string, { schema?: Schema }> }; responses?: Record<string, { description?: string; content?: Record<string, { schema?: Schema }> }> }>>;
  components?: { schemas?: Record<string, Schema> };
}
interface McpDoc { tools?: { name: string; description?: string; inputSchema?: Schema; "x-hale-requires"?: string[] }[] }

function esc(s: string): string {
  return s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c] as string));
}
function refName(s: Schema | undefined): string {
  if (!s) return "";
  if (s.$ref) return s.$ref.split("/").pop() ?? s.$ref;
  if (s.type === "array") return `[${refName(s.items)}]`;
  return s.type ?? "";
}
function schemaTable(s: Schema | undefined, all: Record<string, Schema>, depth = 0): string {
  if (!s) return "";
  if (s.$ref) { const n = refName(s); return depth > 2 ? `<code>${esc(n)}</code>` : schemaTable(all[n], all, depth + 1); }
  if (s.properties) {
    const req = new Set(s.required ?? []);
    return `<table><tr><th>field</th><th>type</th></tr>${Object.entries(s.properties).map(([k, v]) => `<tr><td><code>${esc(k)}</code>${req.has(k) ? "" : ' <span class="meta">optional</span>'}</td><td><code>${esc(refName(v) || v.type || "")}</code>${v.enum ? ` <span class="meta">one of ${esc(v.enum.map(String).join(", "))}</span>` : ""}${v.description ? `<div class="desc">${esc(v.description)}</div>` : ""}</td></tr>`).join("")}</table>`;
  }
  if (s.oneOf || s.anyOf) return (s.oneOf ?? s.anyOf ?? []).map((x) => schemaTable(x, all, depth + 1)).join('<div class="meta">or</div>');
  return `<code>${esc(refName(s) || JSON.stringify(s))}</code>`;
}
function renderOpenApi(d: OpenApi, m: Model): string {
  const all = d.components?.schemas ?? {};
  const inv = m.inventory;
  const exposures = inv?.exposures?.filter((e) => e.surface === (d.info?.["x-hale-surface" as keyof typeof d.info] ?? "") || true) ?? [];
  let out = `<h1>${esc(d.info?.title ?? "surface")}</h1><div class="meta">${esc(d.info?.version ?? "")}</div>`;
  if (d.info?.description) out += `<p class="desc">${esc(d.info.description)}</p>`;
  if (exposures.length) out += `<h2>served</h2><table><tr><th>as</th><th>listener</th><th>codec</th><th>callers</th><th>roles</th></tr>${exposures.map((e) => `<tr><td>${esc(e.name)}</td><td>${esc(e.listener.transport || "via a hub")} ${esc(e.listener.address || "(address set at run time)")}</td><td>${esc(e.codec)}</td><td>${esc(e.principals.source)}</td><td>${esc(e.roles.source)}</td></tr>`).join("")}</table>`;
  out += `<h2>operations</h2>`;
  for (const [p, ops] of Object.entries(d.paths ?? {})) for (const [verb, op] of Object.entries(ops)) {
    const req = op.requestBody?.content?.["application/json"]?.schema;
    out += `<div class="op"><div class="head"><span class="verb">${esc(verb.toUpperCase())}</span><code>${esc(p)}</code><span class="meta">${esc(op.operationId ?? "")}</span></div>`;
    if (op.description) out += `<div class="desc">${esc(op.description)}</div>`;
    if (req) out += `<div><b>request</b> <code>${esc(refName(req))}</code>${schemaTable(req, all)}</div>`;
    const resp = Object.entries(op.responses ?? {});
    if (resp.length) out += `<div><b>responses</b><table>${resp.map(([code, r]) => `<tr><td><code>${esc(code)}</code></td><td>${esc(r.description ?? "")}</td><td><code>${esc(refName(r.content?.["application/json"]?.schema))}</code></td></tr>`).join("")}</table></div>`;
    const ok = op.responses?.["200"]?.content?.["application/json"]?.schema;
    if (ok && !ok.$ref?.startsWith("#/components/schemas/hale.")) out += `<div><b>result</b> <code>${esc(refName(ok))}</code>${schemaTable(ok, all)}</div>`;
    out += `</div>`;
  }
  const own = Object.entries(all).filter(([n]) => !n.startsWith("hale."));
  if (own.length) out += `<h2>schemas</h2>${own.map(([n, s]) => `<div class="op"><div class="head"><code>${esc(n)}</code></div>${schemaTable(s, all, 1)}</div>`).join("")}`;
  return out;
}
function renderMcp(d: McpDoc): string {
  return `<h1>MCP tools</h1>${(d.tools ?? []).map((t) => `<div class="op"><div class="head"><code>${esc(t.name)}</code>${t["x-hale-requires"]?.length ? `<span class="req">requires ${esc(t["x-hale-requires"].join(", "))}</span>` : ""}</div>${t.description ? `<div class="desc">${esc(t.description)}</div>` : ""}${schemaTable(t.inputSchema, {})}</div>`).join("") || `<p class="note">no tools</p>`}`;
}
