import * as vscode from "vscode";
import * as fs from "fs";
import * as path from "path";
import { Model } from "./artifact";
import { Ctx, TIPS, tipActions } from "./tips";
import { exampleActions } from "./examples";
import { runHale } from "./commands";
import { findHale } from "./hale";

/** Contextual code actions and the book's next-step edits.
 * Repository and API setup live in scaffolding.ts and work without a model. */
export function registerAssembly(ctx: vscode.ExtensionContext, current: () => Model | undefined): void {
  const selector: vscode.DocumentSelector = { scheme: "file", language: "hale" };
  ctx.subscriptions.push(
    vscode.languages.registerCodeActionsProvider(selector, {
      provideCodeActions: (doc, range, context) => {
        const m = current();
        const out: vscode.CodeAction[] = [...boundActions(doc, context.diagnostics), ...exampleActions(doc, range)];
        if (m) out.push(...tipActions(new Ctx(doc, m), range));
        return out;
      },
    }, { providedCodeActionKinds: [vscode.CodeActionKind.QuickFix, vscode.CodeActionKind.Refactor, vscode.CodeActionKind.Empty] }),
    vscode.commands.registerCommand("hale.runInTerminal", (args: string[], cwd?: string, pre?: string) => runHale(args, cwd, pre)),
    vscode.commands.registerCommand("hale.applyTip", async (id: string, siteIndex: number) => {
      const ed = vscode.window.activeTextEditor; const m = current(); if (!ed || !m) return;
      const c = new Ctx(ed.document, m); const tip = TIPS.find((t) => t.id === id); if (!tip) return;
      const site = tip.sites(c)[siteIndex ?? 0]; if (!site) { void vscode.window.showInformationMessage("Hale: that tip no longer applies here."); return; }
      if (tip.kind === "edit") { const e = tip.edit?.(c, site); if (e) await vscode.workspace.applyEdit(e); }
      else if (tip.kind === "command") { const cmd = tip.command!(c, site); await vscode.commands.executeCommand(cmd.command, ...(cmd.arguments ?? [])); }
      else await vscode.commands.executeCommand("hale.showTip", id);
    }),
    vscode.commands.registerCommand("hale.showTip", async (id: string) => {
      const tip = TIPS.find((t) => t.id === id); if (!tip) return;
      const pick = await vscode.window.showInformationMessage(`${tip.note ?? tip.id} (${tip.source.doc} § ${tip.source.section})`, "Open the example");
      if (pick) void vscode.commands.executeCommand("hale.openSource", tip.source.example);
    }),
    vscode.commands.registerCommand("hale.openSource", async (rel: string) => {
      const root = haleRootFromBinary(); const abs = root ? path.join(root, rel) : undefined;
      if (abs && fs.existsSync(abs)) await vscode.window.showTextDocument(await vscode.workspace.openTextDocument(abs), { preview: true, viewColumn: vscode.ViewColumn.Beside });
      else void vscode.window.showInformationMessage(`Hale: ${rel} lives in the hale checkout (github.com/hale-lang/hale); no checkout sits beside this binary.`);
    }),
    vscode.commands.registerCommand("hale.insertSnippetAtTop", async (body: string) => {
      const ed = vscode.window.activeTextEditor; if (!ed) return;
      const text = ed.document.getText(); const imports = [...text.matchAll(/^import\s+"[^"]*"\s+as\s+\w+;\s*\n/gm)]; const last = imports.length ? imports[imports.length - 1] : undefined;
      const at = last ? ed.document.positionAt(last.index! + last[0].length) : new vscode.Position(0, 0);
      await ed.insertSnippet(new vscode.SnippetString(body), at);
    }),
    vscode.commands.registerCommand("hale.applyFuse", async (locus: string, open: number, close: number) => {
      const ed = vscode.window.activeTextEditor; if (!ed) return;
      const text = ed.document.getText(); const body = text.slice(open, close);
      const p = /\bparams\s*\{\s*([a-z_]\w*)\s*:/.exec(body); const first = p?.[1];
      const raise = body.search(/\bor\s+raise\b/);
      if (raise >= 0) {
        const e = new vscode.WorkspaceEdit();
        e.replace(ed.document.uri, new vscode.Range(ed.document.positionAt(open + raise), ed.document.positionAt(open + raise + "or raise".length)), "or self.failed(err)");
        await vscode.workspace.applyEdit(e);
      }
      // the locus's closing brace, found again after the replacement moved it
      const after = ed.document.getText(); const lm = new RegExp(`\\b(?:main\\s+)?locus\\s+${locus}\\s*\\{`).exec(after); if (!lm) return;
      let depth = 0, closeNow = -1; for (let i = lm.index + lm[0].length - 1; i < after.length; i++) { if (after[i] === "{") depth++; else if (after[i] === "}") { depth--; if (depth === 0) { closeNow = i; break; } } }
      if (closeNow < 0) return;
      await ed.insertSnippet(new vscode.SnippetString(`    closure fuse {${first ? ` captures: ${first};` : ""} epoch inline; }\n    fn failed(err: \${1:IoError}) { violate fuse; }\n`), ed.document.positionAt(closeNow));
    }),
    vscode.commands.registerCommand("hale.applyBus", async (verb: "subscribe" | "publish", topic: string) => {
      const ed = vscode.window.activeTextEditor; const m = current(); if (!ed || !m) return;
      const c = new Ctx(ed.document, m);
      const locus = await vscode.window.showQuickPick(c.userLoci, { placeHolder: `Which locus should ${verb} ${topic}?` }); if (!locus) return;
      const b = c.locusBlock(locus); if (!b) return;
      const bus = c.busBlock(locus); const e = new vscode.WorkspaceEdit();
      const handler = `on_${lower(topic)}`;
      const line = verb === "subscribe" ? `subscribe ${topic} as ${handler};` : `publish ${topic};`;
      if (bus) e.insert(ed.document.uri, ed.document.positionAt(bus.open + 1), ` ${line}`);
      else e.insert(ed.document.uri, ed.document.positionAt(b.open + 1), `\n    bus { ${line} }`);
      if (verb === "subscribe") e.insert(ed.document.uri, ed.document.positionAt(b.close), `    fn ${handler}(x: ${c.payloadOf(topic) ?? "Payload"}) {\n        // handle x\n    }\n`);
      await vscode.workspace.applyEdit(e);
    }),

  );
}

/** The hale checkout a build in a checkout belongs to, or undefined. */
function haleRootFromBinary(): string | undefined {
  const bin = findHale(); const m = bin ? /^(.*)\/target\/(release|debug)\/hale$/.exec(bin) : null;
  return m && fs.existsSync(path.join(m[1], "crates")) ? m[1] : undefined;
}

/** The compiler's unbounded-allocation warning, answered: name the bound, or own the growth. */
function boundActions(doc: vscode.TextDocument, diagnostics: readonly vscode.Diagnostic[]): vscode.CodeAction[] {
  const out: vscode.CodeAction[] = [];
  for (const d of diagnostics) {
    if (!/unbounded allocation/.test(d.message)) continue;
    const text = doc.getText(); const off = doc.offsetAt(d.range.start);
    const before = text.slice(0, off);
    const fnAt = Math.max(before.lastIndexOf("\n    fn "), before.lastIndexOf("\n    run()"), before.lastIndexOf("\n    birth()"), before.lastIndexOf("\n    accept("));
    if (fnAt < 0) continue;
    for (const [title, ann] of [["Hale: name what bounds this growth (@bounded_by)", "@bounded_by(input)"], ["Hale: own this growth for now (@unbounded)", "@unbounded"]]) {
      const a = new vscode.CodeAction(title, vscode.CodeActionKind.QuickFix); a.diagnostics = [d];
      a.edit = new vscode.WorkspaceEdit(); a.edit.insert(doc.uri, doc.positionAt(fnAt + 1), `    ${ann}\n`);
      out.push(a);
    }
  }
  return out;
}

const lower = (s: string) => s.replace(/([a-z0-9])([A-Z])/g, "$1_$2").toLowerCase();
