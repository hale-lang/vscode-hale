import * as vscode from "vscode";
import * as fs from "fs";
import * as path from "path";
import { Model, Node } from "./artifact";
import { CONSTRUCTS, Construct, PARTS, byKey, constructAtOffset, docUrl, partOf, usesIn } from "./language";
import { examplesOf } from "./examples";
import { findHale } from "./hale";
import { itemOf, resolveSource } from "./views";

interface Occurrence { file: string; line: number; text: string }

/** The seed's files: the artifact's sources, plus the active document when it is not one of them. */
function filesOf(m: Model | undefined): string[] {
  const out = new Set<string>();
  const ed = vscode.window.activeTextEditor;
  if (ed?.document.languageId === "hale" && ed.document.uri.scheme === "file") out.add(ed.document.uri.fsPath);
  if (m) for (const s of m.artifact.sources ?? []) { const p = resolveSource(m, s.path); if (p) out.add(p); }
  return [...out];
}

function textOf(file: string): string {
  const open = vscode.workspace.textDocuments.find((d) => d.uri.fsPath === file);
  if (open) return open.getText();
  try { return fs.readFileSync(file, "utf8"); } catch { return ""; }
}

/** Every construct's occurrences across the seed's files. */
export function scan(m: Model | undefined): Map<string, Occurrence[]> {
  const out = new Map<string, Occurrence[]>();
  for (const file of filesOf(m)) {
    const text = textOf(file);
    const lines = text.split("\n");
    for (const u of usesIn(text, file)) {
      const l = out.get(u.key) ?? [];
      if (l.length < 200) l.push({ file, line: u.line, text: (lines[u.line] ?? "").trim().slice(0, 100) });
      out.set(u.key, l);
    }
  }
  return out;
}

/**
 * The language, construct by construct, with its uses in the open
 * seed: a row per construct under its part of the book, filled when
 * the seed spells it and dim when it does not, each opening its
 * uses, its chapter, its examples and the view that shows what the
 * compiler derives from it.
 */
export class LanguageView implements vscode.TreeDataProvider<Node> {
  private changed = new vscode.EventEmitter<Node | undefined>();
  readonly onDidChangeTreeData = this.changed.event;
  private roots: Node[] = [];
  private model: Model | undefined;
  usedOnly = false;
  private timer: NodeJS.Timeout | undefined;

  set(m: Model | undefined): void { this.model = m; this.rebuild(); }
  refresh(): void { if (this.timer) clearTimeout(this.timer); this.timer = setTimeout(() => this.rebuild(), 250); }
  private rebuild(): void {
    const uses = scan(this.model);
    const used = CONSTRUCTS.filter((c) => uses.has(c.key));
    const seedName = this.model ? path.basename(this.model.seedDir) : vscode.window.activeTextEditor?.document.fileName.split("/").pop();
    this.roots = [{
      label: seedName ? `${seedName} uses ${used.length} of ${CONSTRUCTS.length} constructs` : "open a .hl file",
      description: `${PARTS.filter((p) => used.some((c) => c.part === p.id)).length} of ${PARTS.length} parts of the language`,
      tooltip: "Every construct the spec names, grouped by the chapter that teaches it. A filled row is spelled in this seed; a dim one is not, and opens its chapter and its examples.",
      icon: "book",
    }];
    for (const p of PARTS) {
      const cs = CONSTRUCTS.filter((c) => c.part === p.id);
      const here = cs.filter((c) => uses.has(c.key));
      if (this.usedOnly && !here.length) continue;
      this.roots.push({
        label: p.title,
        description: `${here.length}/${cs.length} · ${p.gloss}`,
        tooltip: `${p.title}\n${p.gloss}\n${p.doc}`,
        icon: here.length ? "book" : "circle-outline",
        tone: here.length ? "ok" : undefined,
        expanded: here.length > 0 && !this.usedOnly ? false : here.length > 0,
        contextValue: "part",
        command: undefined,
        children: cs.filter((c) => !this.usedOnly || uses.has(c.key)).map((c) => this.constructNode(c, uses.get(c.key) ?? [])),
      });
    }
    this.changed.fire(undefined);
  }
  private constructNode(c: Construct, occ: Occurrence[]): Node {
    const n = occ.length;
    const ex = examplesOf(c.key).length;
    const children: Node[] = occ.slice(0, 50).map((o) => ({
      label: `${path.basename(o.file)}:${o.line + 1}`, description: o.text, icon: "go-to-file",
      command: { command: "hale.revealAt", title: "Reveal", arguments: [o.file, o.line + 1, 1] },
    }));
    if (occ.length > 50) children.push({ label: `… ${occ.length - 50} more`, icon: "ellipsis" });
    children.push({ label: "chapter", description: c.doc.replace(/^docs\/src\//, "").replace(/\.md/, ""), icon: "book", command: { command: "hale.openChapter", title: "Open the chapter", arguments: [c.doc] } });
    if (ex) children.push({ label: "examples", description: `${ex} in the hale checkout`, icon: "file-code", command: { command: "hale.examplesFor", title: "Examples", arguments: [c.key] } });
    if (c.lens) children.push({ label: "view", description: c.lens.replace(/^hale\./, ""), icon: "eye", command: { command: "hale.focusView", title: "Open the view", arguments: [c.lens] } });
    if (c.snippet) children.push({ label: "insert", description: "at the cursor", icon: "insert", command: { command: "hale.insertConstruct", title: "Insert", arguments: [c.key] } });
    return {
      label: c.key,
      description: n ? `${n} use${n === 1 ? "" : "s"} · ${c.gloss}` : c.gloss,
      tooltip: `${c.key}: ${c.gloss}\n${c.corpus === "spec" ? "(named by the spec; no program in the checkout spells it yet)\n" : ""}chapter: ${c.doc}`,
      icon: n ? "symbol-key" : c.corpus === "spec" ? "beaker" : "circle-outline",
      tone: n ? "ok" : undefined,
      contextValue: "construct",
      command: n === 1 ? { command: "hale.revealAt", title: "Reveal", arguments: [occ[0].file, occ[0].line + 1, 1] } : undefined,
      children,
    };
  }
  getChildren(n?: Node): Node[] { return n ? n.children ?? [] : this.roots; }
  getTreeItem(n: Node): vscode.TreeItem { return itemOf(n); }
}

function haleRoot(): string | undefined {
  const bin = findHale(); const m = bin ? /^(.*)\/target\/(release|debug)\/hale$/.exec(bin) : null;
  return m && fs.existsSync(path.join(m[1], "crates")) ? m[1] : undefined;
}

export function registerLanguage(ctx: vscode.ExtensionContext, view: LanguageView, current: () => Model | undefined): void {
  const selector: vscode.DocumentSelector = { scheme: "file", language: "hale" };
  const setUsedOnly = (v: boolean) => { view.usedOnly = v; void vscode.commands.executeCommand("setContext", "hale.languageUsedOnly", v); view.refresh(); };
  setUsedOnly(false);
  ctx.subscriptions.push(
    vscode.commands.registerCommand("hale.language.usedOnly", () => setUsedOnly(true)),
    vscode.commands.registerCommand("hale.language.all", () => setUsedOnly(false)),
    vscode.commands.registerCommand("hale.openChapter", async (doc: string) => {
      const root = haleRoot();
      const [p, anchor] = doc.split("#");
      const abs = root ? path.join(root, p) : undefined;
      if (abs && fs.existsSync(abs)) {
        if (abs.endsWith(".md")) {
          const uri = vscode.Uri.file(abs);
          await vscode.commands.executeCommand("markdown.showPreviewToSide", uri);
          if (anchor) { /* the preview has no anchor API; the chapter opens at its top */ }
        } else await vscode.window.showTextDocument(await vscode.workspace.openTextDocument(abs), { preview: true, viewColumn: vscode.ViewColumn.Beside });
      } else await vscode.env.openExternal(vscode.Uri.parse(docUrl(doc)));
    }),
    vscode.commands.registerCommand("hale.insertConstruct", async (key?: string) => {
      const ed = vscode.window.activeTextEditor; if (!ed) return;
      const withSnippet = CONSTRUCTS.filter((c) => c.snippet);
      key = key ?? (await vscode.window.showQuickPick(withSnippet.map((c) => c.key), { placeHolder: "A construct to write" }));
      const c = key ? byKey.get(key) : undefined; if (!c?.snippet) return;
      await ed.insertSnippet(new vscode.SnippetString(c.snippet));
    }),
    vscode.commands.registerCommand("hale.focusView", async (id: string) => {
      await vscode.commands.executeCommand(`${id}.focus`);
    }),
    vscode.commands.registerCommand("hale.languageOf", async () => {
      const ed = vscode.window.activeTextEditor;
      const c = ed ? constructAtOffset(ed.document.getText(), ed.document.offsetAt(ed.selection.active)) : undefined;
      const key = c?.key ?? (await vscode.window.showQuickPick(CONSTRUCTS.map((x) => ({ label: x.key, description: x.gloss, detail: partOf.get(x.part)?.title })), { placeHolder: "A construct of the language" }))?.label;
      const pick = key ? byKey.get(key) : undefined; if (!pick) return;
      const what = await vscode.window.showQuickPick([
        { label: "$(book) chapter", description: pick.doc, do: () => vscode.commands.executeCommand("hale.openChapter", pick.doc) },
        ...(examplesOf(pick.key).length ? [{ label: "$(file-code) examples", description: `${examplesOf(pick.key).length}`, do: () => vscode.commands.executeCommand("hale.examplesFor", pick.key) }] : []),
        ...(pick.lens ? [{ label: "$(eye) view", description: pick.lens, do: () => vscode.commands.executeCommand("hale.focusView", pick.lens) }] : []),
        ...(pick.snippet ? [{ label: "$(insert) insert", description: "at the cursor", do: () => vscode.commands.executeCommand("hale.insertConstruct", pick.key) }] : []),
      ], { placeHolder: `${pick.key}: ${pick.gloss}` });
      if (what) await what.do();
    }),
    vscode.languages.registerHoverProvider(selector, {
      provideHover(doc, pos) {
        const c = constructAtOffset(doc.getText(), doc.offsetAt(pos)); if (!c) return undefined;
        const md = new vscode.MarkdownString(undefined, true); md.isTrusted = true;
        const part = partOf.get(c.part);
        md.appendMarkdown(`**${c.key}** · ${c.gloss}  \n`);
        md.appendMarkdown(`_${part?.title ?? c.part}_ · [chapter](command:hale.openChapter?${encodeURIComponent(JSON.stringify([c.doc]))} "${c.doc}")`);
        if (c.lens) md.appendMarkdown(` · [${c.lens.replace(/^hale\./, "")} view](command:hale.focusView?${encodeURIComponent(JSON.stringify([c.lens]))})`);
        if (examplesOf(c.key).length) md.appendMarkdown(` · [examples](command:hale.examplesFor?${encodeURIComponent(JSON.stringify([c.key]))})`);
        return new vscode.Hover(md);
      },
    }),
    vscode.languages.registerCompletionItemProvider(selector, {
      provideCompletionItems(doc, pos) {
        const before = doc.lineAt(pos.line).text.slice(0, pos.character);
        if (!/^\s*[A-Za-z@]*$/.test(before)) return [];
        return CONSTRUCTS.filter((c) => c.snippet).map((c) => {
          const it = new vscode.CompletionItem(c.key, vscode.CompletionItemKind.Snippet);
          it.insertText = new vscode.SnippetString(c.snippet!);
          it.detail = `${partOf.get(c.part)?.title}: ${c.gloss}`;
          it.documentation = new vscode.MarkdownString(`${c.gloss}\n\n_${c.doc}_`);
          it.sortText = "1" + c.key;
          return it;
        });
      },
    }),
  );
  ctx.subscriptions.push(vscode.window.onDidChangeActiveTextEditor(() => view.refresh()));
  ctx.subscriptions.push(vscode.workspace.onDidChangeTextDocument((e) => { if (e.document.languageId === "hale") view.refresh(); }));
  void current;
}
