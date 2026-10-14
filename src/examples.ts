import * as vscode from "vscode";
import * as fs from "fs";
import * as path from "path";
import { findHale } from "./hale";

/**
 * The examples index: every construct of the language mapped to the
 * fixtures, test programs and book snippets that use it, generated
 * from a hale checkout by scripts/gen-examples-index.mjs. Offered as a
 * hover on the construct, a code action, a palette command, and read-
 * only documents when the checkout is not on this machine.
 */
interface Example { file: string; line: number; text: string; title: string }
interface Index { generatedFrom: string; constructs: Record<string, Example[]> }

// eslint-disable-next-line @typescript-eslint/no-require-imports
const INDEX: Index = require("./examples-index.json");

/** The hale checkout the index's paths are relative to, when the binary is a build in one. */
function haleRoot(): string | undefined {
  const bin = findHale();
  if (!bin) return undefined;
  const m = /^(.*)\/target\/(release|debug)\/hale$/.exec(bin);
  if (m && fs.existsSync(path.join(m[1], "crates"))) return m[1];
  return undefined;
}

/** The construct at a position: the longest indexed phrase the text around it spells. */
export function constructAt(doc: vscode.TextDocument, pos: vscode.Position): string | undefined {
  const line = doc.lineAt(pos.line).text;
  const keys = Object.keys(INDEX.constructs).sort((a, b) => b.length - a.length);
  for (const k of keys) {
    const esc = k.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const re = new RegExp(k.startsWith("@") || k.includes("::") ? esc : `\\b${esc}\\b`, "g");
    let m: RegExpExecArray | null;
    while ((m = re.exec(line))) if (m.index <= pos.character && pos.character <= m.index + m[0].length) return k;
  }
  // an annotation with arguments: `@form(hashmap)` from `@form(hashmap, sync = striped)`
  const ann = /@([a-z_]+)(?:\(([a-z_]+)[^)]*\))?/g; let a: RegExpExecArray | null;
  while ((a = ann.exec(line))) if (a.index <= pos.character && pos.character <= a.index + a[0].length) {
    const k = a[1] === "form" && a[2] ? `@form(${a[2]})` : `@${a[1]}`;
    if (INDEX.constructs[k]) return k;
  }
  return undefined;
}

export function examplesOf(key: string): Example[] { return INDEX.constructs[key] ?? []; }
export function allConstructs(): string[] { return Object.keys(INDEX.constructs).sort(); }

const SCHEME = "hale-example";

export function registerExamples(ctx: vscode.ExtensionContext): void {
  const selector: vscode.DocumentSelector = { scheme: "file", language: "hale" };
  // Read-only documents for the index's windows, when the checkout is not at hand.
  ctx.subscriptions.push(vscode.workspace.registerTextDocumentContentProvider(SCHEME, {
    provideTextDocumentContent(uri) {
      const [key, i] = decodeURIComponent(uri.path.replace(/^\//, "")).split("#");
      const e = examplesOf(key)[Number(i)];
      return e ? `// ${e.file}:${e.line} — ${e.title}\n// (a window from the ${INDEX.generatedFrom} checkout; open the file for the whole program)\n\n${e.text}\n` : `// no example ${key} #${i}`;
    },
  }));
  ctx.subscriptions.push(
    vscode.languages.registerHoverProvider(selector, {
      provideHover(doc, pos) {
        const key = constructAt(doc, pos); if (!key) return undefined;
        const ex = examplesOf(key); if (!ex.length) return undefined;
        const md = new vscode.MarkdownString(undefined, true);
        md.isTrusted = true;
        md.appendMarkdown(`**examples of \`${key}\`** · `);
        md.appendMarkdown(ex.slice(0, 4).map((e, i) => `[${path.basename(path.dirname(e.file)) === "examples" ? path.basename(e.file) : path.basename(path.dirname(e.file)) + "/" + path.basename(e.file)}:${e.line}](command:hale.openExample?${encodeURIComponent(JSON.stringify([key, i]))})`).join(" · "));
        md.appendMarkdown(`\n\n\`\`\`hale\n${ex[0].text.split("\n").slice(0, 8).join("\n")}\n\`\`\``);
        return new vscode.Hover(md);
      },
    }),
    vscode.commands.registerCommand("hale.openExample", async (key: string, i: number) => {
      const e = examplesOf(key)[i]; if (!e) return;
      const root = haleRoot();
      const abs = root ? path.join(root, e.file) : undefined;
      if (abs && fs.existsSync(abs)) {
        const d = await vscode.workspace.openTextDocument(abs);
        const ed = await vscode.window.showTextDocument(d, { preview: true, viewColumn: vscode.ViewColumn.Beside });
        const p = new vscode.Position(Math.max(0, e.line - 1), 0);
        ed.selection = new vscode.Selection(p, p); ed.revealRange(new vscode.Range(p, p), vscode.TextEditorRevealType.InCenter);
      } else {
        const d = await vscode.workspace.openTextDocument(vscode.Uri.parse(`${SCHEME}:/${encodeURIComponent(`${key}#${i}`)}.hl`));
        await vscode.languages.setTextDocumentLanguage(d, "hale");
        await vscode.window.showTextDocument(d, { preview: true, viewColumn: vscode.ViewColumn.Beside });
      }
    }),
    vscode.commands.registerCommand("hale.examplesFor", async (key?: string) => {
      const ed = vscode.window.activeTextEditor;
      key = key ?? (ed && ed.document.languageId === "hale" ? constructAt(ed.document, ed.selection.active) : undefined);
      if (!key) key = await vscode.window.showQuickPick(allConstructs(), { placeHolder: "A construct of the language" });
      if (!key) return;
      const ex = examplesOf(key);
      const pick = await vscode.window.showQuickPick(ex.map((e, i) => ({ label: `${e.file}:${e.line}`, description: e.title, i })), { placeHolder: `examples of ${key}` });
      if (pick) await vscode.commands.executeCommand("hale.openExample", key, pick.i);
    }),
  );
}

/** A code action per construct under the cursor: "show examples of X". */
export function exampleActions(doc: vscode.TextDocument, range: vscode.Range): vscode.CodeAction[] {
  const key = constructAt(doc, range.start); if (!key || !examplesOf(key).length) return [];
  const a = new vscode.CodeAction(`Hale: examples of \`${key}\` (${examplesOf(key).length})`, vscode.CodeActionKind.Empty);
  a.command = { command: "hale.examplesFor", title: "examples", arguments: [key] };
  return [a];
}
