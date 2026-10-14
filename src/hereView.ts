import * as vscode from "vscode";
import { Model, Node } from "./artifact";
import { Here, Offer, guideOf, hereAt } from "./contexts";
import { examplesOf } from "./examples";
import { itemOf } from "./views";

/**
 * The cursor's situation: which block it is in, what that block is
 * for someone who has not read the book, what this seed already has
 * there, what can be written there (each row inserts it), and what
 * must hold. Rebuilt as the cursor moves.
 */
export class HereView implements vscode.TreeDataProvider<Node> {
  private changed = new vscode.EventEmitter<Node | undefined>();
  readonly onDidChangeTreeData = this.changed.event;
  private roots: Node[] = [];
  private model: Model | undefined;
  private timer: NodeJS.Timeout | undefined;
  set(m: Model | undefined): void { this.model = m; this.rebuild(); }
  refresh(): void { if (this.timer) clearTimeout(this.timer); this.timer = setTimeout(() => this.rebuild(), 120); }
  private rebuild(): void {
    const ed = vscode.window.activeTextEditor;
    if (!ed || ed.document.languageId !== "hale") { this.roots = []; this.changed.fire(undefined); return; }
    const here = hereAt(ed.document.getText(), ed.document.offsetAt(ed.selection.active), this.model);
    this.roots = render(here);
    this.changed.fire(undefined);
  }
  getChildren(n?: Node): Node[] { return n ? n.children ?? [] : this.roots; }
  getTreeItem(n: Node): vscode.TreeItem { return itemOf(n); }
}

const offerNode = (o: Offer): Node => ({
  label: o.label,
  description: o.present ? `already here · ${o.gloss}` : o.gloss,
  tooltip: `${o.label}\n${o.gloss}\n\n${o.snippet.replace(/\$\{\d+:([^}|]*)\}/g, "$1").replace(/\$\{\d+\|([^,|]*)[^}]*\}/g, "$1").replace(/\$\d/g, "")}`,
  icon: o.present ? "pass" : "insert",
  tone: o.present ? "ok" : undefined,
  command: { command: "hale.insertHere", title: "Insert", arguments: [o.snippet] },
});

function sectionsOf(here: Here, frameIndex: number, expanded: boolean): Node[] {
  const f = here.frames[frameIndex];
  const kind = f ? f.kind : "top";
  const g = guideOf(kind);
  const sub = new Here(here.text, here.frames.slice(0, frameIndex + 1), here.seed);
  const derived = g.derived(sub);
  const offers = g.offers(sub);
  const key = f?.kind === "main_locus" ? "main locus" : f?.kind === "fn" ? "fn" : f?.kind ?? "";
  const ex = examplesOf(key).length;
  const first = g.gloss.split(/(?<=\.)\s/)[0];
  return [
    {
      label: first, tooltip: g.gloss, icon: "book", expanded,
      description: g.doc.replace(/^docs\/src\//, "").replace(/\.md.*/, ""),
      children: [
        ...g.gloss.split(/(?<=\.)\s/).slice(1).map((s) => ({ label: s, icon: "circle-small" })),
        { label: "chapter", description: g.doc, icon: "book", command: { command: "hale.openChapter", title: "Open", arguments: [g.doc] } },
        ...(ex ? [{ label: "examples", description: `${ex} in the hale checkout`, icon: "file-code", command: { command: "hale.examplesFor", title: "Examples", arguments: [key] } } as Node] : []),
      ],
    },
    ...(derived.length ? [{ label: "here, in this seed", description: `${derived.length}`, icon: "eye", expanded, children: derived } as Node] : []),
    ...(offers.length ? [{ label: "you can write here", description: `${offers.filter((o) => !o.present).length} to add · ${offers.filter((o) => o.present).length} present`, icon: "edit", expanded, children: offers.map(offerNode) } as Node] : []),
    ...(g.rules.length ? [{ label: "what must hold", description: `${g.rules.length}`, icon: "law", expanded, children: g.rules.map((r) => ({ label: r, tooltip: r, icon: "circle-small" })) } as Node] : []),
  ];
}

export function render(here: Here): Node[] {
  const crumbs = here.frames.map((f) => guideOf(f.kind).title(f));
  const nodes: Node[] = [{
    label: crumbs.length ? `in ${crumbs[crumbs.length - 1]}` : "at the top level",
    description: crumbs.length > 1 ? crumbs.slice(0, -1).join(" › ") : here.seed ? here.seed.seedDir.split("/").pop() : "",
    tooltip: crumbs.length ? crumbs.join(" › ") : "Outside every block: declarations go here.",
    icon: "location",
  }];
  nodes.push(...sectionsOf(here, here.frames.length - 1, true));
  for (let i = here.frames.length - 2; i >= -1; i--) {
    const f = here.frames[i];
    nodes.push({ label: f ? `enclosing: ${guideOf(f.kind).title(f)}` : "enclosing: top level", icon: "layers", children: sectionsOf(here, i, false) });
  }
  return nodes;
}

export function registerHere(ctx: vscode.ExtensionContext, view: HereView): void {
  ctx.subscriptions.push(
    vscode.commands.registerCommand("hale.insertHere", async (snippet: string) => {
      const ed = vscode.window.activeTextEditor; if (!ed) return;
      const line = ed.document.lineAt(ed.selection.active.line);
      // On a line with text, start a new line after it so the insert does not split a statement.
      if (line.text.trim() && !/^\s*$/.test(line.text.slice(ed.selection.active.character))) {
        await ed.edit((b) => b.insert(line.range.end, "\n" + line.text.match(/^\s*/)![0]));
        ed.selection = new vscode.Selection(line.lineNumber + 1, ed.document.lineAt(line.lineNumber + 1).text.length, line.lineNumber + 1, ed.document.lineAt(line.lineNumber + 1).text.length);
      }
      await ed.insertSnippet(new vscode.SnippetString(snippet));
    }),
    vscode.window.onDidChangeTextEditorSelection((e) => { if (e.textEditor === vscode.window.activeTextEditor) view.refresh(); }),
    vscode.window.onDidChangeActiveTextEditor(() => view.refresh()),
    vscode.workspace.onDidChangeTextDocument((e) => { if (e.document === vscode.window.activeTextEditor?.document) view.refresh(); }),
    vscode.languages.registerCompletionItemProvider({ scheme: "file", language: "hale" }, {
      provideCompletionItems(doc, pos) {
        const here = hereAt(doc.getText(), doc.offsetAt(pos), view["model"]);
        const f = here.frame; const g = guideOf(f ? f.kind : "top");
        return g.offers(here).filter((o) => !o.present).map((o, i) => {
          const it = new vscode.CompletionItem(o.label, vscode.CompletionItemKind.Snippet);
          it.insertText = new vscode.SnippetString(o.snippet);
          it.detail = `${g.title(f ?? { kind: "top", head: "", open: 0, close: 0 })}: ${o.gloss}`;
          it.sortText = "0" + String(i).padStart(3, "0");
          return it;
        });
      },
    }),
  );
}
