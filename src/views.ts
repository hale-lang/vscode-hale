import * as vscode from "vscode";
import * as fs from "fs";
import * as path from "path";
import { Artifact, BuildContext, Family, Loc, Model, Node, charOffsetOfByte } from "./artifact";

const TONE: Record<NonNullable<Node["tone"]>, string> = {
  ok: "testing.iconPassed",
  warn: "editorWarning.foreground",
  error: "errorForeground",
};

export class FamilyView implements vscode.TreeDataProvider<Node> {
  private changed = new vscode.EventEmitter<Node | undefined>();
  readonly onDidChangeTreeData = this.changed.event;
  private roots: Node[] = [];
  constructor(readonly family: Family) {}

  set(artifact: Artifact | undefined, ctx?: BuildContext): void {
    this.roots = artifact ? this.family.build(artifact, ctx) : [];
    this.changed.fire(undefined);
  }

  getChildren(n?: Node): Node[] {
    return n ? n.children ?? [] : this.roots;
  }

  getTreeItem(n: Node): vscode.TreeItem { return itemOf(n); }
}

/** A node as a tree item: the one rendering every view of the extension shares. */
export function itemOf(n: Node): vscode.TreeItem {
  const state = n.children?.length
    ? n.expanded ? vscode.TreeItemCollapsibleState.Expanded : vscode.TreeItemCollapsibleState.Collapsed
    : vscode.TreeItemCollapsibleState.None;
  const item = new vscode.TreeItem(n.label, state);
  item.description = n.description;
  item.tooltip = n.tooltip ?? n.description;
  if (n.icon) item.iconPath = new vscode.ThemeIcon(n.icon, n.tone ? new vscode.ThemeColor(TONE[n.tone]) : undefined);
  if (n.command) item.command = n.command;
  else if (n.location) item.command = { command: "hale.reveal", title: "Reveal", arguments: [n.location] };
  if (n.contextValue) item.contextValue = n.contextValue;
  return item;
}

/** A plain tree over nodes that a loader fills; refreshed when told to. */
export class NodeView implements vscode.TreeDataProvider<Node> {
  private changed = new vscode.EventEmitter<Node | undefined>();
  readonly onDidChangeTreeData = this.changed.event;
  roots: Node[] = [];
  set(roots: Node[]): void { this.roots = roots; this.changed.fire(undefined); }
  refresh(): void { this.changed.fire(undefined); }
  getChildren(n?: Node): Node[] { return n ? n.children ?? [] : this.roots; }
  getTreeItem(n: Node): vscode.TreeItem { return itemOf(n); }
}

/** Open `file` (absolute, or relative to the seed) at a 1-based line and column. */
export async function revealAt(model: Model | undefined, file: string, line: number, col = 1): Promise<void> {
  const resolved = path.isAbsolute(file) ? file : model ? resolveSource(model, file) : undefined;
  if (!resolved || !fs.existsSync(resolved)) { void vscode.window.showWarningMessage(`hale: cannot find ${file}`); return; }
  const doc = await vscode.workspace.openTextDocument(resolved);
  const pos = new vscode.Position(Math.max(0, line - 1), Math.max(0, col - 1));
  const editor = await vscode.window.showTextDocument(doc, { preserveFocus: false, preview: true });
  editor.selection = new vscode.Selection(pos, pos);
  editor.revealRange(new vscode.Range(pos, pos), vscode.TextEditorRevealType.InCenterIfOutsideViewport);
}

/** Resolve an artifact path (absolute, or relative to the seed or an ancestor) to a file on disk. */
export function resolveSource(model: Model, p: string): string | undefined {
  if (path.isAbsolute(p)) return fs.existsSync(p) ? p : undefined;
  let dir = model.seedDir;
  for (let i = 0; i < 6; i++) {
    const cand = path.join(dir, p);
    if (fs.existsSync(cand)) return cand;
    const up = path.dirname(dir);
    if (up === dir) break;
    dir = up;
  }
  return undefined;
}

export async function reveal(model: Model | undefined, loc: Loc): Promise<void> {
  if (!model) return;
  const file = "file" in loc ? loc.file : model.artifact.sources?.find((s) => s.id === loc.source)?.path;
  if (!file) return;
  const resolved = resolveSource(model, file);
  if (!resolved) { void vscode.window.showWarningMessage(`hale: cannot find ${file}`); return; }
  const doc = await vscode.workspace.openTextDocument(resolved);
  const text = doc.getText();
  const start = doc.positionAt(charOffsetOfByte(text, loc.span[0]));
  const end = doc.positionAt(charOffsetOfByte(text, loc.span[1]));
  const editor = await vscode.window.showTextDocument(doc, { preserveFocus: false, preview: true });
  editor.selection = new vscode.Selection(start, end);
  editor.revealRange(new vscode.Range(start, end), vscode.TextEditorRevealType.InCenterIfOutsideViewport);
}
