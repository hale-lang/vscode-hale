import * as vscode from "vscode";
import * as os from "os";
import * as path from "path";
import { LanguageClient, LanguageClientOptions, ServerOptions } from "vscode-languageclient/node";
import { Loc, Model, Node } from "./artifact";
import { families } from "./families";
import { checkSeed, findHale, haleEnv, inputsOf, manifestOf, run, seedOf } from "./hale";
import { FamilyView, NodeView, reveal, revealAt } from "./views";
import { GraphPanel } from "./graph";
import { ApiDocsPanel } from "./apidocs";
import { registerAssembly } from "./assemble";
import { registerScaffolding } from "./scaffolding";
import { registerExamples } from "./examples";
import { Ctx, allTips } from "./tips";
import { registerCommands } from "./commands";
import { setupTests } from "./tests";
import { ReportView, adviceReport, unitsReport } from "./reportViews";
import { HaleCodeLens } from "./lenses";
import { ChangesView } from "./changes";
import { LanguageView, registerLanguage } from "./languageView";
import { HereView, registerHere } from "./hereView";
import { parseEnvironments } from "./reports";
import { CONSTRUCTS } from "./language";

let client: LanguageClient | undefined;
let current: Model | undefined;
let status: vscode.StatusBarItem;
const views = new Map<string, FamilyView>();
const models = new Map<string, Model>();
let nextSteps: NodeView | undefined;
let language: LanguageView | undefined;
let here: HereView | undefined;
let units: ReportView | undefined;
let advice: ReportView | undefined;
let changes: ChangesView | undefined;
let codeLens: HaleCodeLens | undefined;

export interface HaleApi {
  current(): Model | undefined;
  refresh(file: string): Promise<void>;
  /** Every view id the extension contributes, the artifact lenses first. */
  families(): string[];
  /** The construct catalog's size, for a host test to hold. */
  constructs(): number;
  /** The rows a view shows right now (labels, descriptions, children), for a host test to read. */
  rows(view: string): Node[];
}

export async function activate(ctx: vscode.ExtensionContext): Promise<HaleApi> {
  status = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 50);
  status.command = "hale.refresh";
  ctx.subscriptions.push(status);
  const storage = path.join(os.tmpdir(), "vscode-hale");

  for (const f of families) {
    const view = new FamilyView(f);
    views.set(f.id, view);
    ctx.subscriptions.push(vscode.window.createTreeView(f.id, { treeDataProvider: view, showCollapseAll: true }));
  }
  nextSteps = new NodeView();
  ctx.subscriptions.push(vscode.window.createTreeView("hale.next", { treeDataProvider: nextSteps }));
  language = new LanguageView();
  ctx.subscriptions.push(vscode.window.createTreeView("hale.language", { treeDataProvider: language, showCollapseAll: true }));
  here = new HereView();
  ctx.subscriptions.push(vscode.window.createTreeView("hale.here", { treeDataProvider: here, showCollapseAll: true }));
  units = new ReportView("hale.units", unitsReport);
  const unitsTree = vscode.window.createTreeView("hale.units", { treeDataProvider: units, showCollapseAll: true });
  ctx.subscriptions.push(unitsTree, units.attach(unitsTree));
  advice = new ReportView("hale.advice", adviceReport);
  const adviceTree = vscode.window.createTreeView("hale.advice", { treeDataProvider: advice, showCollapseAll: true });
  ctx.subscriptions.push(adviceTree, advice.attach(adviceTree));
  changes = new ChangesView(storage);
  require("fs").mkdirSync(storage, { recursive: true });
  ctx.subscriptions.push(vscode.window.createTreeView("hale.changes", { treeDataProvider: changes, showCollapseAll: true }));
  codeLens = new HaleCodeLens(() => current);
  ctx.subscriptions.push(vscode.languages.registerCodeLensProvider({ scheme: "file", language: "hale" }, codeLens));

  ctx.subscriptions.push(
    vscode.commands.registerCommand("hale.refresh", () => { units?.refresh(); advice?.refresh(); return refresh(activeHaleFile(), true); }),
    vscode.commands.registerCommand("hale.reveal", (loc: Loc) => reveal(current, loc)),
    vscode.commands.registerCommand("hale.revealAt", (file: string, line: number, col?: number) => revealAt(current, file, line, col)),
    vscode.commands.registerCommand("hale.showGraph", () => GraphPanel.show(ctx, current)),
    vscode.commands.registerCommand("hale.showApiDocs", () => ApiDocsPanel.show(ctx, current)),
    vscode.commands.registerCommand("hale.restartLsp", () => startClient(ctx)),
    vscode.commands.registerCommand("hale.pinBaseline", () => { changes?.pin(current); void vscode.commands.executeCommand("setContext", "hale.baselinePinned", true); }),
    vscode.commands.registerCommand("hale.unpinBaseline", () => { changes?.unpin(current); void vscode.commands.executeCommand("setContext", "hale.baselinePinned", false); }),
    vscode.workspace.onDidSaveTextDocument((doc) => {
      if (doc.languageId !== "hale") return;
      if (vscode.workspace.getConfiguration("hale").get<boolean>("checkOnSave", true)) void refresh(doc.uri.fsPath, true);
    }),
    vscode.window.onDidChangeActiveTextEditor((ed) => {
      const f = ed?.document.languageId === "hale" && ed.document.uri.scheme === "file" ? ed.document.uri.fsPath : undefined;
      if (f) void refresh(f, false);
      refreshNext();
    }),
    vscode.workspace.onDidChangeTextDocument((e) => { if (e.document === vscode.window.activeTextEditor?.document) refreshNext(); }),
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration("hale.path") || e.affectsConfiguration("hale.env")) void startClient(ctx);
      if (e.affectsConfiguration("hale.codeLens")) codeLens?.refresh();
    }),
  );

  registerCommands(ctx);
  setupTests(ctx);
  registerAssembly(ctx, () => current);
  registerScaffolding(ctx);
  registerExamples(ctx);
  registerLanguage(ctx, language, () => current);
  registerHere(ctx, here);

  if (!findHale()) {
    status.text = "$(warning) hale: binary not found";
    status.tooltip = "Set hale.path, or put hale on PATH";
    status.show();
    void vscode.window.showWarningMessage("Hale: the hale binary was not found.", "Open settings").then((pick) => {
      if (pick) void vscode.commands.executeCommand("workbench.action.openSettings", "hale.path");
    });
    language.set(undefined);
    here.set(undefined);
    return api;
  }
  void checkVersion();
  await startClient(ctx);
  void refresh(activeHaleFile(), true);
  return api;
}

/** The oldest compiler this extension's views are written against. */
const MIN_HALE = [0, 23, 0];

/** Say so once when the binary is older than the flags the views use. */
async function checkVersion(): Promise<void> {
  try {
    const r = await run(["--version"]);
    const m = /hale\s+(\d+)\.(\d+)\.(\d+)/.exec(r.stdout + r.stderr);
    if (!m) return;
    const v = [Number(m[1]), Number(m[2]), Number(m[3])];
    const older = v[0] < MIN_HALE[0] || (v[0] === MIN_HALE[0] && (v[1] < MIN_HALE[1] || (v[1] === MIN_HALE[1] && v[2] < MIN_HALE[2])));
    if (!older) return;
    const pick = await vscode.window.showWarningMessage(`Hale: this extension expects hale ${MIN_HALE.join(".")} or newer; found ${v.join(".")}. Diagnostics still work; the Units, Advice and Changes views may not.`, "How to update");
    if (pick) void vscode.env.openExternal(vscode.Uri.parse("https://hale-lang.org"));
  } catch { /* no binary: already reported */ }
}

const api: HaleApi = {
  current: () => current,
  refresh: (file) => refresh(file, true),
  families: () => [...views.keys(), "hale.next", "hale.language", "hale.here", "hale.units", "hale.advice", "hale.changes"],
  constructs: () => CONSTRUCTS.length,
  rows: (view) => {
    const strip = (ns: Node[]): Node[] => ns.map((n) => ({ label: n.label, description: n.description, tooltip: n.tooltip, icon: n.icon, tone: n.tone, children: strip(n.children ?? []) }));
    if (views.has(view)) return strip(views.get(view)!.getChildren());
    if (view === "hale.next") return strip(nextSteps?.getChildren() ?? []);
    if (view === "hale.language") return strip(language?.getChildren() ?? []);
    if (view === "hale.here") return strip(here?.getChildren() ?? []);
    if (view === "hale.units") return strip(units?.getChildren() ?? []);
    if (view === "hale.advice") return strip(advice?.getChildren() ?? []);
    if (view === "hale.changes") return strip(changes?.getChildren() ?? []);
    return [];
  },
};

export async function deactivate(): Promise<void> {
  await client?.stop();
}

function activeHaleFile(): string | undefined {
  const ed = vscode.window.activeTextEditor;
  return ed?.document.languageId === "hale" && ed.document.uri.scheme === "file" ? ed.document.uri.fsPath : undefined;
}

async function startClient(ctx: vscode.ExtensionContext): Promise<void> {
  const bin = findHale();
  if (!bin) return;
  if (client) { await client.stop(); client = undefined; }
  const server: ServerOptions = { command: bin, args: ["lsp"], options: { env: haleEnv() } };
  const opts: LanguageClientOptions = {
    documentSelector: [{ scheme: "file", language: "hale" }],
    outputChannelName: "Hale language server",
  };
  client = new LanguageClient("hale", "Hale", server, opts);
  ctx.subscriptions.push(client);
  await client.start();
}

let inflight: Promise<void> | undefined;

/** Re-check the seed of `file` and feed every lens. `force` re-runs even when the seed is the current one. */
async function refresh(file: string | undefined, force: boolean): Promise<void> {
  if (!file) { apply(undefined); return; }
  const seed = seedOf(file);
  const seedDir = seed.endsWith(".hl") ? path.dirname(seed) : seed;
  if (!force && current && current.seedDir === seedDir && models.get(seed)) { apply(models.get(seed)); return; }
  if (inflight) await inflight;
  inflight = (async () => {
    status.text = "$(sync~spin) hale: checking";
    status.show();
    const storage = path.join(os.tmpdir(), "vscode-hale");
    const r = await checkSeed(seed, storage);
    if (r.artifact && r.artifactPath) {
      const man = manifestOf(seedDir);
      const environments = man ? parseEnvironments(man.text) : [];
      const inputs = await inputsOf(seed);
      const m: Model = { artifact: r.artifact, seedDir, artifactPath: r.artifactPath, inventory: r.inventory, environments, inputs };
      models.set(seed, m);
      apply(m);
      const a = r.artifact;
      const holes = (a.unknowns?.length ?? 0);
      const own = (xs: string[]) => xs.filter((x) => !/(^|\.|::)__/.test(x)).length;
      status.text = `$(check) hale · ${own(a.sorts?.loci ?? [])} loci · ${own((a.topics ?? []).map((t) => t.name))} topics · ${r.inventory?.surfaces?.length ?? 0} surfaces · ${holes} hole${holes === 1 ? "" : "s"}`;
      status.tooltip = `${seed}\nschema ${a.schema} · shape ${a.shape_hash} · verdict ${a.verdict}`;
    } else {
      const errors = r.diagnostics.filter((d) => d.severity === "error").length;
      status.text = errors ? `$(error) hale: ${errors} error${errors === 1 ? "" : "s"}` : `$(warning) hale: no artifact`;
      status.tooltip = errors ? r.diagnostics.filter((d) => d.severity === "error").map((d) => `${path.basename(d.file)}:${d.line}: ${d.message}`).join("\n") : r.stderr;
      apply(models.get(seed));
    }
    status.show();
  })();
  await inflight;
  inflight = undefined;
}

function apply(m: Model | undefined): void {
  current = m;
  for (const v of views.values()) v.set(m?.artifact, { inventory: m?.inventory, environments: m?.environments, inputs: m?.inputs });
  GraphPanel.update(m);
  ApiDocsPanel.update(m);
  units?.set(m);
  advice?.set(m);
  void changes?.update(m);
  language?.set(m);
  here?.set(m);
  codeLens?.refresh();
  refreshNext();
}

/** The tips that apply to the active document, as rows that apply them. */
function refreshNext(): void {
  if (!nextSteps) return;
  const ed = vscode.window.activeTextEditor;
  if (!ed || ed.document.languageId !== "hale" || !current) { nextSteps.set([]); return; }
  const c = new Ctx(ed.document, current);
  const counts = new Map<string, number>();
  nextSteps.set(allTips(c).map(({ tip, site }): Node => {
    const i = counts.get(tip.id) ?? 0; counts.set(tip.id, i + 1);
    return {
      label: tip.title(site).replace(/^Hale: /, ""),
      description: `${tip.source.doc.split("/").pop()} § ${tip.source.section}`,
      tooltip: `${tip.note ?? ""}\nexample: ${tip.source.example}`.trim(),
      icon: tip.kind === "edit" ? "lightbulb-autofix" : tip.kind === "command" ? "terminal" : "info",
      tone: tip.kind === "edit" ? "warn" : undefined,
      command: { command: "hale.applyTip", title: tip.title(site), arguments: [tip.id, i] },
      children: [{ label: "example", description: tip.source.example, icon: "go-to-file", command: { command: "hale.openSource", title: "open", arguments: [tip.source.example] } }],
    };
  }));
}
