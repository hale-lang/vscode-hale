import * as vscode from "vscode";
import * as fs from "fs";
import * as path from "path";
import { Model, ownerOf } from "./artifact";
import { Ctx, TIPS, tipActions } from "./tips";
import { exampleActions } from "./examples";
import { runHale } from "./commands";
import { findHale } from "./hale";

/**
 * Graph completion: what the rows say is declared but not wired, offered
 * as edits that write ordinary Hale text. A surface no serve site serves
 * gets a code action that adds the serve line (and the receiver params
 * and a main locus when they are missing); inside a `bus { }`, a
 * `placement { }` or a main's `run()`, completion offers the topics,
 * the params and the surfaces of this seed as snippets.
 */
export function registerAssembly(ctx: vscode.ExtensionContext, current: () => Model | undefined): void {
  const selector: vscode.DocumentSelector = { scheme: "file", language: "hale" };
  ctx.subscriptions.push(
    vscode.languages.registerCodeActionsProvider(selector, {
      provideCodeActions: (doc, range, context) => {
        const m = current();
        const out: vscode.CodeAction[] = [...serveActions(doc, m), ...boundActions(doc, context.diagnostics), ...exampleActions(doc, range)];
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
    vscode.commands.registerCommand("hale.serveSurface", async (surface?: string) => {
      const ed = vscode.window.activeTextEditor;
      const m = current();
      if (!ed || !m) return;
      const name = surface ?? (await vscode.window.showQuickPick(unserved(m).map((s) => s.name), { placeHolder: "Surface to serve" }));
      if (!name) return;
      const action = serveEdit(ed.document, m, name);
      if (action?.edit) await vscode.workspace.applyEdit(action.edit);
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

export function unserved(m: Model) {
  const inv = m.inventory;
  if (!inv) return [];
  return inv.surfaces.filter((s) => !inv.exposures.some((e) => e.surface === s.name));
}

function serveActions(doc: vscode.TextDocument, m: Model | undefined): vscode.CodeAction[] {
  if (!m?.inventory) return [];
  const text = doc.getText();
  const out: vscode.CodeAction[] = [];
  for (const s of unserved(m)) {
    if (!new RegExp(`\\bapi\\s+${s.name}\\b`).test(text)) continue;
    const a = serveEdit(doc, m, s.name);
    if (a) out.push(a);
  }
  return out;
}

const indent = (n: number) => " ".repeat(n);
const lower = (s: string) => s.replace(/([a-z0-9])([A-Z])/g, "$1_$2").toLowerCase();

/** The index of the `}` that closes the `{` at `open`, or -1. Strings and comments are skipped. */
function closeOf(text: string, open: number): number {
  let depth = 0;
  for (let i = open; i < text.length; i++) {
    const c = text[i];
    if (c === '"') { i++; while (i < text.length && text[i] !== '"') { if (text[i] === "\\") i++; i++; } continue; }
    if (c === "/" && text[i + 1] === "/") { while (i < text.length && text[i] !== "\n") i++; continue; }
    if (c === "{") depth++;
    else if (c === "}") { depth--; if (depth === 0) return i; }
  }
  return -1;
}

/** The edit that serves `surface` from this document's main locus, creating what is missing. */
export function serveEdit(doc: vscode.TextDocument, m: Model, surface: string): vscode.CodeAction | undefined {
  const inv = m.inventory;
  const s = inv?.surfaces.find((x) => x.name === surface);
  if (!inv || !s) return undefined;
  const text = doc.getText();
  const owners = [...new Set(s.members.map((mm) => ownerOf(mm.name)))];
  const asName = lower(surface);
  const sockVar = `${asName}_sock`;
  const edit = new vscode.WorkspaceEdit();
  const uri = doc.uri;
  const at = (off: number) => doc.positionAt(off);

  const mainRe = /\bmain\s+locus\s+([A-Za-z_][A-Za-z0-9_]*)\s*\{/;
  const mainMatch = mainRe.exec(text);

  // Receivers: a main param of the owner's type, or a new one.
  const mainContract = m.artifact.contracts.find((c) => c.instances.some((i) => i.owner === null));
  const receivers: string[] = [];
  const newParams: string[] = [];
  for (const o of owners) {
    const p = mainContract?.params.find((pp) => pp.type === o);
    if (p) receivers.push(`${o}: self.${p.name}`);
    else { receivers.push(`${o}: self.${lower(o)}`); newParams.push(`${lower(o)}: ${o} = ${o} { };`); }
  }
  const serveLine = `let ${sockVar} = api::serve(${surface}, unix::Rpc { path: "/tmp/${asName}.sock" }, as: "${asName}", receivers: { ${receivers.join(", ")} }, bound: 64, on_full: refuse);`;
  const runBody = (ind: number) => [
    `${indent(ind)}${serveLine}`,
    `${indent(ind)}while !self.draining {`,
    `${indent(ind + 4)}std::time::sleep(100ms);`,
    `${indent(ind)}}`,
    `${indent(ind)}${sockVar}.stop();`,
  ].join("\n");

  if (mainMatch) {
    const open = mainMatch.index + mainMatch[0].length - 1;
    const close = closeOf(text, open);
    if (close < 0) return undefined;
    const body = text.slice(open + 1, close);
    // params
    if (newParams.length) {
      const pm = /\bparams\s*\{/.exec(body);
      if (pm) {
        const pOpen = open + 1 + pm.index + pm[0].length - 1;
        edit.insert(uri, at(pOpen + 1), "\n" + newParams.map((p) => `${indent(8)}${p}`).join("\n"));
      } else {
        edit.insert(uri, at(open + 1), `\n${indent(4)}params {\n${newParams.map((p) => `${indent(8)}${p}`).join("\n")}\n${indent(4)}}`);
      }
    }
    // run()
    const rm = /\brun\s*\(\s*\)\s*\{/.exec(body);
    if (rm) {
      const rOpen = open + 1 + rm.index + rm[0].length - 1;
      const rClose = closeOf(text, rOpen);
      edit.insert(uri, at(rOpen + 1), `\n${indent(8)}${serveLine}`);
      if (rClose > 0) edit.insert(uri, at(rClose), `${indent(4)}${sockVar}.stop();\n${indent(4)}`);
    } else {
      edit.insert(uri, at(close), `${indent(4)}run() {\n${runBody(8)}\n${indent(4)}}\n`);
    }
  } else {
    // No main locus: write one, and instantiate it from fn main.
    const app = /\bApp\b/.test(text) ? "Main" : "App";
    const block = [
      ``,
      `main locus ${app} {`,
      `${indent(4)}params {`,
      ...newParams.map((p) => `${indent(8)}${p}`),
      `${indent(4)}}`,
      `${indent(4)}run() {`,
      runBody(8),
      `${indent(4)}}`,
      `}`,
      ``,
    ].join("\n");
    const fnMain = /\bfn\s+main\s*\(\s*\)\s*\{/.exec(text);
    if (fnMain) {
      edit.insert(uri, at(fnMain.index), block.trimStart() + "\n");
      const fOpen = fnMain.index + fnMain[0].length - 1;
      const fClose = closeOf(text, fOpen);
      if (fClose > 0 && !new RegExp(`\\b${app}\\s*\\{`).test(text.slice(fOpen, fClose))) edit.insert(uri, at(fClose), `${indent(4)}${app} { };\n`);
    } else {
      edit.insert(uri, at(text.length), `${block}\nfn main() {\n${indent(4)}${app} { };\n}\n`);
    }
  }
  const action = new vscode.CodeAction(`Hale: serve ${surface} over a unix socket from the main locus`, vscode.CodeActionKind.QuickFix);
  action.edit = edit;
  action.isPreferred = true;
  return action;
}
