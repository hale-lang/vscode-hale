import * as vscode from "vscode";
import * as fs from "fs";
import * as path from "path";
import { Model, Node, isGenerated } from "./artifact";
import { run } from "./hale";
import { itemOf } from "./views";
import { ModelDiff, parseModelDiff } from "./reports";

/**
 * What an edit did to the program's shape: `hale model diff` between
 * a baseline artifact and the current one. The baseline is the
 * previous check by default, or the one the author pinned.
 */
export class ChangesView implements vscode.TreeDataProvider<Node> {
  private changed = new vscode.EventEmitter<Node | undefined>();
  readonly onDidChangeTreeData = this.changed.event;
  private roots: Node[] = [];
  private previous = new Map<string, string>();
  private pinned = new Map<string, string>();
  private lastDigest = new Map<string, string>();
  constructor(private readonly storage: string) {}

  /** Called with every fresh model: rotates the previous artifact and diffs. */
  async update(m: Model | undefined): Promise<void> {
    if (!m) { this.roots = []; this.changed.fire(undefined); return; }
    const key = m.seedDir;
    const digest = m.artifact.artifact_digest ?? m.artifact.shape_hash;
    const base = this.pinned.get(key) ?? this.previous.get(key);
    if (this.lastDigest.get(key) !== digest) {
      // keep a copy: the check overwrites the artifact path on the next run
      const copy = path.join(this.storage, `${Buffer.from(key).toString("base64url").slice(-40)}.${digest}.json`);
      try { fs.copyFileSync(m.artifactPath, copy); } catch { /* no copy, no diff */ }
      if (base !== copy) this.previous.set(key, copy);
      this.lastDigest.set(key, digest);
    }
    if (!base || !fs.existsSync(base)) { this.roots = [{ label: "first check of this seed", description: "save again to see what changed", icon: "history" }]; this.changed.fire(undefined); return; }
    const r = await run(["model", "diff", "--json", base, m.artifactPath]);
    const d = parseModelDiff(r.stdout);
    this.roots = d ? render(d, !!this.pinned.get(key)) : [{ label: "model diff failed", description: (r.stderr || r.stdout).split("\n")[0], icon: "error", tone: "error" }];
    this.changed.fire(undefined);
  }
  pin(m: Model | undefined): void {
    if (!m) return;
    const digest = m.artifact.artifact_digest ?? m.artifact.shape_hash;
    const copy = path.join(this.storage, `${Buffer.from(m.seedDir).toString("base64url").slice(-40)}.pin.${digest}.json`);
    fs.copyFileSync(m.artifactPath, copy);
    this.pinned.set(m.seedDir, copy);
    void this.update(m);
  }
  unpin(m: Model | undefined): void { if (m) { this.pinned.delete(m.seedDir); void this.update(m); } }
  getChildren(n?: Node): Node[] { return n ? n.children ?? [] : this.roots; }
  getTreeItem(n: Node): vscode.TreeItem { return itemOf(n); }
}

const CLASS_GLOSS: Record<string, string> = {
  identical: "the same artifact",
  "source-only": "text moved; the model and every contract are the same",
  contract: "a contract or an effect moved; the shape is the same",
  "model-shape": "the model changed: a locus, a topic, an edge or a law",
};

function render(d: ModelDiff, pinned: boolean): Node[] {
  const nodes: Node[] = [];
  const cls = d.classification;
  const summary = (d.summary ?? {}) as Record<string, number>;
  const counts = Object.entries(summary).filter(([, n]) => n > 0).map(([k, n]) => `${n} ${k.replace(/_deltas$/, "")}`).join(", ");
  nodes.push({
    label: cls,
    description: `${pinned ? "since the pinned baseline" : "since the previous check"}${counts ? ` · ${counts}` : ""}${d.a?.shape_hash !== d.b?.shape_hash ? ` · shape ${d.a?.shape_hash} → ${d.b?.shape_hash}` : ""}`,
    tooltip: CLASS_GLOSS[cls] ?? cls,
    icon: cls === "identical" ? "pass" : cls === "source-only" ? "edit" : cls === "contract" ? "symbol-interface" : "git-compare",
    tone: cls === "model-shape" ? "warn" : cls === "identical" ? "ok" : undefined,
  });
  const decls = (d.declarations ?? []).filter((x) => x.change !== "persisted" && !isGenerated(x.name));
  const byChange = new Map<string, typeof decls>();
  for (const x of decls) byChange.set(x.change, [...(byChange.get(x.change) ?? []), x]);
  const ICON: Record<string, string> = { added: "diff-added", removed: "diff-removed", renamed: "diff-renamed", moved: "diff-modified", changed: "diff-modified", split: "diff-modified", joined: "diff-modified", ambiguous: "question" };
  for (const [change, xs] of byChange) nodes.push({
    label: change, description: `${xs.length}`, icon: ICON[change] ?? "diff-modified", expanded: true,
    children: xs.map((x): Node => ({
      label: x.name, description: `${x.kind}${x.b?.unit ? ` · ${x.b.unit}` : x.a?.unit ? ` · was in ${x.a.unit}` : ""}`, icon: ICON[change] ?? "diff-modified",
      location: x.b ? { file: x.b.unit, span: x.b.span } : x.a ? { file: x.a.unit, span: x.a.span } : undefined,
    })),
  });
  const contracts = (d.contracts ?? []).filter((c) => !isGenerated(String(c.name ?? c.locus ?? "")));
  if (contracts.length) nodes.push({ label: "contracts", description: `${contracts.length}`, icon: "symbol-interface", expanded: true, children: contracts.map((c) => ({ label: String(c.name ?? c.locus ?? "contract"), description: String(c.change ?? JSON.stringify(c).slice(0, 120)), icon: "symbol-interface" })) });
  const eff = d.effects as { classes?: unknown[]; certificates?: unknown[] } | undefined;
  if (eff && ((eff.classes?.length ?? 0) || (eff.certificates?.length ?? 0))) nodes.push({
    label: "effects", description: `${eff.classes?.length ?? 0} class change(s) · ${eff.certificates?.length ?? 0} certificate(s)`, icon: "symbol-misc", expanded: true,
    children: [...(eff.classes ?? []), ...(eff.certificates ?? [])].map((x) => ({ label: typeof x === "string" ? x : JSON.stringify(x).slice(0, 160), icon: "circle-small" })),
  });
  const law = d.law as { claims?: unknown[]; adequacy?: unknown[]; verdict?: unknown } | undefined;
  if (law && ((law.claims?.length ?? 0) || (law.adequacy?.length ?? 0) || law.verdict)) nodes.push({
    label: "law", description: `${law.claims?.length ?? 0} claim change(s)${law.verdict ? ` · verdict ${JSON.stringify(law.verdict)}` : ""}`, icon: "law", expanded: true,
    children: [...(law.claims ?? []), ...(law.adequacy ?? [])].map((x) => ({ label: typeof x === "string" ? x : JSON.stringify(x).slice(0, 160), icon: "circle-small" })),
  });
  for (const [k, v] of Object.entries(d)) {
    if (["a", "b", "classification", "declarations", "contracts", "summary", "effects", "law", "matching", "renames", "schema"].includes(k) || !Array.isArray(v) || !v.length) continue;
    const rows = (v as unknown[]).filter((x) => !(x && typeof x === "object" && "change" in (x as object) && (x as { change: string }).change === "persisted"));
    if (rows.length) nodes.push({ label: k, description: `${rows.length}`, icon: "json", children: rows.map((x) => ({ label: typeof x === "string" ? x : JSON.stringify(x).slice(0, 160), icon: "circle-small" })) });
  }
  if (nodes.length === 1 && cls !== "identical") nodes.push({ label: "no declaration moved", description: "the change is below the declaration level", icon: "info" });
  return nodes;
}
