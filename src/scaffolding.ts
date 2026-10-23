import * as vscode from "vscode";
import * as fs from "fs/promises";
import * as path from "path";
import { Source, Insertion, Transport, blocks, missingMethods, repoErrors, generateRepo, apiMethods, generateApi, applyInsertions, snake } from "./scaffold";

const selector: vscode.DocumentSelector = { scheme: "file", language: "hale" };
const sourceOf = (doc: vscode.TextDocument): Source => ({ id: doc.uri.toString(), text: doc.getText() });
/** Include unsaved siblings. Test files are standalone seeds, as in hale's CLI. */
async function seed(doc: vscode.TextDocument): Promise<vscode.TextDocument[]> {
  if (/_test\.hl$|_bench\.hl$/.test(doc.fileName)) return [doc];
  const dir = path.dirname(doc.fileName);
  const names = (await fs.readdir(dir)).filter(n => n.endsWith(".hl") && !/_test\.hl$|_bench\.hl$/.test(n));
  const docs = await Promise.all(names.map(n => vscode.workspace.openTextDocument(vscode.Uri.file(path.join(dir, n)))));
  if (!docs.some(d => d.uri.toString() === doc.uri.toString())) docs.push(doc);
  return docs;
}
async function snapshot(doc: vscode.TextDocument) {
  const docs = await seed(doc);
  return { docs, sources: docs.map(sourceOf), versions: docs.map(d => d.version) };
}
async function apply(snap: Awaited<ReturnType<typeof snapshot>>, edits: Insertion[]) {
  if (snap.docs.some((d, i) => d.version !== snap.versions[i])) throw new Error("The seed changed during setup. Run the action again so it uses your latest edits.");
  const edit = new vscode.WorkspaceEdit();
  for (const source of snap.sources) {
    // Insertions, rather than whole-document replacements, preserve cursors and diagnostics.
    const grouped = new Map<number, string>();
    for (const e of edits.filter(e => e.source === source.id)) grouped.set(e.at, (grouped.get(e.at) ?? "") + e.text);
    const doc = snap.docs.find(d => d.uri.toString() === source.id)!;
    for (const [at, text] of grouped) edit.insert(doc.uri, doc.positionAt(at), doc.eol === vscode.EndOfLine.CRLF ? text.replace(/\n/g, "\r\n") : text);
  }
  if (!(await vscode.workspace.applyEdit(edit))) throw new Error("VS Code could not apply the generated edits.");
}
async function editor(uri?: vscode.Uri): Promise<vscode.TextEditor | undefined> {
  if (uri) return vscode.window.showTextDocument(await vscode.workspace.openTextDocument(uri));
  const ed = vscode.window.activeTextEditor;
  if (ed?.document.languageId !== "hale") { void vscode.window.showInformationMessage("Hale: open a .hl file first."); return; }
  return ed;
}
const guarded = (fn: (...args: any[]) => Promise<void>) => async (...args: any[]) => {
  try { await fn(...args); } catch (error) { void vscode.window.showErrorMessage(`Hale: ${error instanceof Error ? error.message : String(error)}`); }
};
async function repository(uri?: vscode.Uri, name?: string) {
  const ed = await editor(uri); if (!ed) return;
  const snap = await snapshot(ed.document);
  const candidates = blocks(sourceOf(ed.document)).filter(b => b.repo && missingMethods(b).length);
  const b = name ? candidates.find(b => b.name === name) : candidates.length === 1 ? candidates[0] : (await vscode.window.showQuickPick(candidates.map(b => ({ label: b.name, description: `@repo(${b.repo}) — ${missingMethods(b).join(", ")}`, b })), { title: "Generate repository methods" }))?.b;
  if (!b) { if (!candidates.length) void vscode.window.showInformationMessage("Hale: add @repo(RecordType) to a locus; completed repositories need no new methods."); return; }
  const errors = repoErrors(b, snap.sources);
  let failure: string | undefined;
  if (errors.type) {
    failure = await vscode.window.showQuickPick(errors.variants, { title: "Error returned by the unimplemented storage methods", placeHolder: "Existing methods and the shared error type are preserved" });
    if (!failure) return;
  }
  await apply(snap, generateRepo(b, snap.sources, failure));
  void vscode.window.showInformationMessage(`Hale: generated ${missingMethods(b).join(", ")} for ${b.name}. Implement the TODO storage bodies and review retry safety.`);
}
const transportItems: { label: string; description: string; transport: Transport; picked?: boolean }[] = [
  { label: "Unix socket", description: "Local RPC", transport: "unix", picked: true },
  { label: "HTTP RPC", description: "JSON RPC with bearer authentication", transport: "http" },
  { label: "REST", description: "HTTP routes; add POST routes to rows without one", transport: "rest" },
  { label: "MCP", description: "Expose the surface as agent tools", transport: "mcp" },
  { label: "gRPC", description: "Protobuf from the same surface", transport: "grpc" },
];
async function api(create: boolean, name?: string, uri?: vscode.Uri) {
  const ed = await editor(uri); if (!ed) return;
  const snap = await snapshot(ed.document), target = sourceOf(ed.document);
  const surfaces = snap.sources.flatMap(blocks).filter(b => b.kind === "api");
  let names: string[], members: string[] | undefined;
  if (create) {
    const picked = await vscode.window.showQuickPick(apiMethods(snap.sources).map(m => ({ label: `${m.owner}::${m.name}`, description: m.header.trim() })), { title: "Create API: select handler methods", canPickMany: true, placeHolder: "Zero or one request argument, plus optional trailing std::api::Context" });
    if (!picked?.length) return;
    members = picked.map(m => m.label);
    const surface = await vscode.window.showInputBox({ title: "Create API: surface name", value: "Service", validateInput: s => !/^[A-Z]\w*$/.test(s) ? "Use a PascalCase identifier" : snap.sources.some(src => new RegExp(`\\b${s}\\b`).test(src.text)) ? "That name is already used in this seed" : undefined });
    if (!surface) return;
    names = [surface];
  } else if (name) names = [name];
  else {
    if (!surfaces.length) { await api(true, undefined, uri); return; }
    const picked = await vscode.window.showQuickPick(surfaces.map(b => ({ label: b.name })), { title: "Serve APIs: select one or more surfaces", canPickMany: true });
    if (!picked?.length) return;
    names = picked.map(p => p.label);
  }
  const kinds = await vscode.window.showQuickPick(transportItems, { title: "API transports", canPickMany: true, placeHolder: "Choose one or more; network listeners require HALE_API_TOKEN" });
  if (!kinds?.length) return;
  const plans: { name: string; transports: { kind: Transport; endpoint: string }[] }[] = [];
  const endpoints = new Set<string>();
  let port = 8080;
  const originalText = snap.sources.map(s => s.text).join("\n");
  for (const name of names) {
    const transports: { kind: Transport; endpoint: string }[] = [];
    for (const t of kinds) {
      while (originalText.includes(`:${port}`) || endpoints.has(`127.0.0.1:${port}`)) port++;
      let sock = `/tmp/${snake(name)}.sock`, n = 2;
      while (originalText.includes(sock) || endpoints.has(sock)) sock = `/tmp/${snake(name)}-${n++}.sock`;
      const endpoint = await vscode.window.showInputBox({ title: `${name}: ${t.label} ${t.transport === "unix" ? "socket path" : "bind address"}`, value: t.transport === "unix" ? sock : `127.0.0.1:${port++}`, validateInput: value => {
        if (endpoints.has(value) || originalText.includes(JSON.stringify(value))) return "That endpoint is already used in this seed or this setup";
        if (/[\r\n\x00]/.test(value)) return "Enter a single endpoint";
        if (t.transport === "unix") return value.startsWith("/") && value.length > 1 ? undefined : "Use an absolute socket path";
        const match = /^([^\s:]+|\[[\da-fA-F:]+\]):(\d+)$/.exec(value);
        return match && +match[2] >= 1 && +match[2] <= 65535 ? undefined : "Use host:port, with a port between 1 and 65535";
      } });
      if (!endpoint) return;
      endpoints.add(endpoint); transports.push({ kind: t.transport, endpoint });
    }
    plans.push({ name, transports });
  }
  // Compose multi-surface setup against intermediate text, then apply as one undo step.
  let sources = snap.sources;
  for (const plan of plans) {
    const currentTarget = sources.find(s => s.id === target.id)!;
    const edits = generateApi(currentTarget, sources, { surface: plan.name, members, transports: plan.transports });
    sources = sources.map(s => ({ ...s, text: applyInsertions(s, edits) }));
  }
  if (snap.docs.some((d, i) => d.version !== snap.versions[i])) throw new Error("The seed changed during setup. Run the action again.");
  const edit = new vscode.WorkspaceEdit();
  for (const [i, source] of sources.entries()) {
    const doc = snap.docs[i];
    if (source.text !== snap.sources[i].text) edit.replace(doc.uri, new vscode.Range(doc.positionAt(0), doc.positionAt(doc.getText().length)), doc.eol === vscode.EndOfLine.CRLF ? source.text.replace(/\r?\n/g, "\r\n") : source.text);
  }
  if (!(await vscode.workspace.applyEdit(edit))) throw new Error("VS Code could not apply the generated edits.");
  void vscode.window.showInformationMessage(`Hale: wired ${names.join(", ")}. Save and run Hale: Check seed.${kinds.some(k => k.transport !== "unix") ? " Set HALE_API_TOKEN before running; configure LOTUS_API_ROLES if rows require roles." : ""}`);
}
export function scaffoldActions(doc: vscode.TextDocument, range: vscode.Range): vscode.CodeAction[] {
  const out: vscode.CodeAction[] = [];
  for (const b of blocks(sourceOf(doc))) {
    if (!new vscode.Range(doc.positionAt(b.annotation ?? b.start), doc.positionAt(b.close)).intersection(range)) continue;
    const repo = !!b.repo && missingMethods(b).length > 0;
    if (!repo && b.kind !== "api" && b.kind !== "locus") continue;
    const title = repo ? `Hale: generate missing repository methods for ${b.name}` : b.kind === "api" ? `Hale: set up transports for ${b.name}…` : "Hale: create an API from methods…";
    const action = new vscode.CodeAction(title, repo ? vscode.CodeActionKind.QuickFix : vscode.CodeActionKind.RefactorRewrite);
    action.command = { title, command: repo ? "hale.generateRepoMethods" : b.kind === "api" ? "hale.serveSurface" : "hale.createApi", arguments: repo ? [doc.uri, b.name] : b.kind === "api" ? [b.name, doc.uri] : [doc.uri] };
    out.push(action);
  }
  return out;
}
export function registerScaffolding(ctx: vscode.ExtensionContext): void {
  ctx.subscriptions.push(
    vscode.commands.registerCommand("hale.generateRepoMethods", guarded(repository)),
    vscode.commands.registerCommand("hale.createApi", guarded((uri?: vscode.Uri) => api(true, undefined, uri))),
    vscode.commands.registerCommand("hale.serveSurface", guarded((name?: string | vscode.Uri, uri?: vscode.Uri) => typeof name === "string" ? api(false, name, uri) : api(false, undefined, name))),
    vscode.languages.registerCodeActionsProvider(selector, { provideCodeActions: scaffoldActions }, { providedCodeActionKinds: [vscode.CodeActionKind.QuickFix, vscode.CodeActionKind.RefactorRewrite] }),
    vscode.languages.registerCodeLensProvider(selector, { provideCodeLenses(doc) {
      if (!vscode.workspace.getConfiguration("hale").get("codeLens", true)) return [];
      return blocks(sourceOf(doc)).flatMap(b => {
        const repo = b.repo && missingMethods(b).length;
        if (!repo && b.kind !== "api") return [];
        return [new vscode.CodeLens(new vscode.Range(doc.positionAt(b.annotation ?? b.start), doc.positionAt(b.annotation ?? b.start)), { title: repo ? `Generate ${missingMethods(b).join(", ")}` : "Set up API transports…", command: repo ? "hale.generateRepoMethods" : "hale.serveSurface", arguments: repo ? [doc.uri, b.name] : [b.name, doc.uri] })];
      });
    } }),
  );
}
