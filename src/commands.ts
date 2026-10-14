import * as vscode from "vscode";
import * as path from "path";
import { findHale, haleEnv, manifestOf, run, seedOf } from "./hale";
import { parseEnvironments, parseTargets } from "./reports";

function quote(s: string): string {
  return /[^A-Za-z0-9_\/.:=-]/.test(s) ? `'${s.replace(/'/g, `'\\''`)}'` : s;
}

let terminal: vscode.Terminal | undefined;

/** One terminal for hale commands, carrying the extension's env additions. */
function haleTerminal(): vscode.Terminal {
  if (terminal && terminal.exitStatus === undefined) return terminal;
  const env: Record<string, string> = { HALE_SKIP_STALE_CHECK: "1" };
  for (const [k, v] of Object.entries(vscode.workspace.getConfiguration("hale").get<Record<string, string>>("env", {}))) env[k] = v;
  terminal = vscode.window.createTerminal({ name: "hale", env });
  return terminal;
}

function currentTarget(): string | undefined {
  const ed = vscode.window.activeTextEditor;
  if (ed && ed.document.languageId === "hale" && ed.document.uri.scheme === "file") return seedOf(ed.document.uri.fsPath);
  return vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
}

function inTerminal(args: string[], cwd?: string, pre?: string): void {
  const bin = findHale();
  if (!bin) { void vscode.window.showErrorMessage("hale: binary not found. Set hale.path."); return; }
  const t = haleTerminal();
  t.show(true);
  const line = [bin, ...args].map(quote).join(" ");
  t.sendText([cwd ? `cd ${quote(cwd)}` : "", pre ?? "", line].filter(Boolean).join(" && "), true);
}

/** Run a hale verb in the shared terminal, from `cwd` when given. */
export function runHale(args: string[], cwd?: string, pre?: string): void { inTerminal(args, cwd, pre); }

export function registerCommands(ctx: vscode.ExtensionContext): void {
  const seedCmd = (id: string, verb: string[], executes = false) =>
    vscode.commands.registerCommand(id, () => {
      if (executes && !vscode.workspace.isTrusted) {
        void vscode.window.showWarningMessage("Hale: this command builds or runs workspace code, which needs a trusted workspace.", "Manage trust")
          .then((pick) => { if (pick) void vscode.commands.executeCommand("workbench.trust.manage"); });
        return;
      }
      const target = currentTarget();
      if (!target) { void vscode.window.showWarningMessage("hale: open a .hl file or a workspace first."); return; }
      inTerminal([...verb, target]);
    });
  ctx.subscriptions.push(
    seedCmd("hale.check", ["check"]),
    seedCmd("hale.verify", ["verify"]),
    seedCmd("hale.build", ["build"], true),
    seedCmd("hale.run", ["run"], true),
    seedCmd("hale.runObserve", ["run", "--observe=0"], true),
    seedCmd("hale.test", ["test"], true),
    vscode.commands.registerCommand("hale.fmtCheck", () => {
      const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
      if (root) inTerminal(["fmt", "--check", "."], root);
    }),
    vscode.commands.registerCommand("hale.docStdlib", async () => {
      const r = await run(["doc", "--stdlib"]);
      const doc = await vscode.workspace.openTextDocument({ language: "markdown", content: r.stdout || r.stderr });
      await vscode.window.showTextDocument(doc, { preview: false });
    }),
    // The seed's own reference, from its /// comments, rendered.
    vscode.commands.registerCommand("hale.seedDocs", async () => {
      const target = currentTarget(); if (!target) return;
      const r = await run(["doc", target]);
      const doc = await vscode.workspace.openTextDocument({ language: "markdown", content: r.stdout || r.stderr });
      await vscode.window.showTextDocument(doc, { preview: false, viewColumn: vscode.ViewColumn.Beside });
      await vscode.commands.executeCommand("markdown.showPreview", doc.uri);
    }),
    // Constitutions and environments: one pair, or the whole matrix.
    vscode.commands.registerCommand("hale.checkEnv", async (name?: string) => {
      const target = currentTarget(); if (!target) return;
      const man = manifestOf(target);
      const envs = man ? parseEnvironments(man.text) : [];
      if (!envs.length) { void vscode.window.showInformationMessage("Hale: no [environments.<name>] in a hale.toml above this seed. One names where an entrypoint deploys and the constitution it adopts there."); return; }
      name = name ?? (await vscode.window.showQuickPick(envs.map((e) => ({ label: e.name, description: `${e.entrypoints.join(", ")}${e.constitution ? ` · adopts ${e.constitution}` : ""}` })), { placeHolder: "Check for which environment?" }))?.label;
      if (name) inTerminal(["check", "--env", name, target], man ? path.dirname(man.path) : undefined);
    }),
    vscode.commands.registerCommand("hale.checkMatrix", () => {
      const target = currentTarget(); if (!target) return;
      const man = manifestOf(target);
      inTerminal(["check", "--matrix", man ? path.dirname(man.path) : target]);
    }),
    // Targets: what this compiler can build for.
    vscode.commands.registerCommand("hale.buildTarget", async () => {
      const target = currentTarget(); if (!target) return;
      const r = await run(["targets"]);
      const ts = parseTargets(r.stdout);
      const pick = await vscode.window.showQuickPick([{ label: "native", description: "this machine" }, { label: "wasm32", description: "the browser; a `target wasm { }` declaration selects it too" }, ...ts.map((t) => ({ label: t.name, description: t.note }))], { placeHolder: "Build for which target?" });
      if (!pick) return;
      inTerminal(pick.label === "native" ? ["build", target] : ["build", "--target", pick.label, target]);
    }),
    // The observer: run with LOTUS_OBS=1 and iris beside it, then open the session.
    vscode.commands.registerCommand("hale.observe", async () => {
      const target = currentTarget(); if (!target) return;
      if (!vscode.workspace.isTrusted) { void vscode.window.showWarningMessage("Hale: running the program needs a trusted workspace."); return; }
      const port = vscode.workspace.getConfiguration("hale").get<number>("observePort", 8787);
      inTerminal(["run", `--observe=${port}`, target]);
      setTimeout(() => { void vscode.commands.executeCommand("simpleBrowser.show", `http://127.0.0.1:${port}`); }, 2500);
    }),
    vscode.commands.registerCommand("hale.openIris", () => {
      const port = vscode.workspace.getConfiguration("hale").get<number>("observePort", 8787);
      void vscode.commands.executeCommand("simpleBrowser.show", `http://127.0.0.1:${port}`);
    }),
    // Record and replay.
    vscode.commands.registerCommand("hale.runRecord", () => {
      const target = currentTarget(); if (!target) return;
      if (!vscode.workspace.isTrusted) { void vscode.window.showWarningMessage("Hale: running the program needs a trusted workspace."); return; }
      const dir = target.endsWith(".hl") ? path.dirname(target) : target;
      const rec = path.join(dir, ".hale", `rec-${new Date().toISOString().replace(/[:.]/g, "-")}`);
      inTerminal(["run", target], undefined, `mkdir -p ${quote(path.dirname(rec))} && export LOTUS_OBS_RECORD=${quote(rec)}`);
      void vscode.window.showInformationMessage(`Hale: recording to ${rec}. Replay it with "Hale: Replay a recording".`);
    }),
    vscode.commands.registerCommand("hale.replay", async () => {
      const target = currentTarget(); if (!target) return;
      const dir = target.endsWith(".hl") ? path.dirname(target) : target;
      const picked = await vscode.window.showOpenDialog({ canSelectFiles: true, canSelectFolders: true, canSelectMany: false, defaultUri: vscode.Uri.file(path.join(dir, ".hale")), openLabel: "Replay this recording" });
      if (!picked?.[0]) return;
      inTerminal(["replay", "--diff", picked[0].fsPath, target]);
    }),
    vscode.commands.registerCommand("hale.bench", () => { const t = currentTarget(); if (t) inTerminal(["bench", t.endsWith(".hl") ? path.dirname(t) : t]); }),
    vscode.commands.registerCommand("hale.apiExportCheck", async (surface?: string) => {
      const target = currentTarget(); if (!target) return;
      const dir = target.endsWith(".hl") ? path.dirname(target) : target;
      if (!surface) { const r = await run(["check", "--api", target]); const i = r.stdout.indexOf("{"); try { const inv = JSON.parse(r.stdout.slice(i)); surface = (await vscode.window.showQuickPick((inv.surfaces ?? []).map((s: { name: string }) => s.name), { placeHolder: "Which surface's bundle to hold to spec/?" })) as string | undefined; } catch { /* none */ } }
      if (surface) inTerminal(["api", "export", "--surface", surface, "--check", "spec"], dir);
    }),
    vscode.commands.registerCommand("hale.fleetCheck", async () => {
      const target = currentTarget(); if (!target) return;
      const man = manifestOf(target);
      const plan = man ? /\[fleets\][\s\S]*?(\w+)\s*=\s*"([^"]+)"/.exec(man.text) : null;
      if (!plan) { void vscode.window.showInformationMessage("Hale: no [fleets] in a hale.toml above this seed. A fleet plan composes topology artifacts across binaries."); return; }
      inTerminal(["fleet", "check", plan[2]], path.dirname(man!.path));
    }),
    vscode.commands.registerCommand("hale.sealLocus", async (locus: string) => {
      const ed = vscode.window.activeTextEditor;
      const docs = [ed?.document, ...vscode.workspace.textDocuments].filter((d): d is vscode.TextDocument => !!d && d.languageId === "hale");
      for (const d of docs) {
        const m = new RegExp(`^([ \\t]*)(?:@\\w+(?:\\([^)]*\\))?\\s*\\n[ \\t]*)*((?:main\\s+)?locus\\s+${locus}\\s*\\{)`, "m").exec(d.getText());
        if (!m) continue;
        const e = new vscode.WorkspaceEdit();
        e.insert(d.uri, d.positionAt(m.index), "@sealed\n");
        await vscode.workspace.applyEdit(e);
        await vscode.window.showTextDocument(d);
        return;
      }
      void vscode.window.showInformationMessage(`Hale: open the file that declares ${locus} to seal it.`);
    }),
  );
}

export function relative(p: string): string {
  const f = vscode.workspace.getWorkspaceFolder(vscode.Uri.file(p));
  return f ? path.relative(f.uri.fsPath, p) : p;
}
