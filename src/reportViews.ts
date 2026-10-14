import * as vscode from "vscode";
import { Model, Node, isGenerated } from "./artifact";
import { run } from "./hale";
import { itemOf } from "./views";
import { parseBudget, parseDiagnostics, parseFlows, parseSections, parseUnits, UnitDecl } from "./reports";

/**
 * A view fed by a compiler report the check does not already produce:
 * run when the view is visible and the model changed, never otherwise,
 * so an idle view costs nothing.
 */
export class ReportView implements vscode.TreeDataProvider<Node> {
  private changed = new vscode.EventEmitter<Node | undefined>();
  readonly onDidChangeTreeData = this.changed.event;
  private roots: Node[] = [];
  private model: Model | undefined;
  private visible = false;
  private key = "";
  private inflight: Promise<void> | undefined;
  constructor(readonly id: string, private readonly build: (m: Model) => Promise<Node[]>) {}

  attach(view: vscode.TreeView<Node>): vscode.Disposable {
    this.visible = view.visible;
    return view.onDidChangeVisibility((e) => { this.visible = e.visible; void this.load(); });
  }
  set(m: Model | undefined): void { this.model = m; if (!m) { this.key = ""; this.roots = []; this.changed.fire(undefined); } void this.load(); }
  refresh(): void { this.key = ""; void this.load(); }
  private async load(): Promise<void> {
    const m = this.model;
    if (!this.visible || !m) return;
    const key = `${m.artifactPath}:${m.artifact.artifact_digest ?? m.artifact.shape_hash}`;
    if (key === this.key) return;
    if (this.inflight) await this.inflight;
    if (key === this.key) return;
    this.key = key;
    this.roots = [{ label: "asking the compiler…", icon: "sync~spin" }];
    this.changed.fire(undefined);
    this.inflight = (async () => {
      try { this.roots = await this.build(m); } catch (e) { this.roots = [{ label: "the report failed", description: String((e as Error).message ?? e), icon: "error", tone: "error" }]; }
      this.changed.fire(undefined);
    })();
    await this.inflight; this.inflight = undefined;
  }
  getChildren(n?: Node): Node[] { return n ? n.children ?? [] : this.roots; }
  getTreeItem(n: Node): vscode.TreeItem { return itemOf(n); }
}

/** `main.hl:24:1` as a reveal command. */
function at(m: Model, s: string | undefined | null): Node["command"] | undefined {
  const mm = s ? /^(.*):(\d+):(\d+)$/.exec(s) : null;
  return mm ? { command: "hale.revealAt", title: "Reveal", arguments: [mm[1], Number(mm[2]), Number(mm[3])] } : undefined;
}

const KIND_GLOSS: Record<string, string> = {
  quantity: "an amount in a unit; arithmetic keeps the unit, mixing units is a check error",
  point: "a position on a quantity's axis: points subtract to a quantity, a quantity moves a point",
  identity: "an Int that is not a number: compares, never adds",
  range: "a scalar held to a range",
  unit: "a unit of measure",
};

function unitNode(m: Model, d: UnitDecl): Node {
  const bits: string[] = [d.kind];
  if (d.denomination) bits.push(`in ${d.denomination}`);
  if (d.of) bits.push(`of ${d.of}`);
  if (d.policy) bits.push(`round ${d.policy}`);
  if (d.range) bits.push(`range ${typeof d.range === "string" ? d.range : JSON.stringify(d.range)}`);
  const children: Node[] = [];
  if (d.declared) children.push({ label: d.declared.text, description: d.declared.at, icon: "symbol-key", command: at(m, d.declared.at) });
  if (d.denomination_fixed_by && d.denomination_fixed_by.at !== d.declared?.at) children.push({ label: `denomination from ${d.denomination_fixed_by.text}`, description: d.denomination_fixed_by.at, icon: "symbol-ruler", command: at(m, d.denomination_fixed_by.at) });
  if (d.policy_from) children.push({ label: `policy from ${d.policy_from.text}`, description: d.policy_from.at, icon: "symbol-operator", command: at(m, d.policy_from.at) });
  if (d.headroom?.count) children.push({ label: `headroom ${d.headroom.count} ${d.headroom.unit ?? ""}`, description: d.headroom.coarse ? `≈ ${d.headroom.coarse.count} ${d.headroom.coarse.unit}` : "", tooltip: "How far the representation reaches in this denomination.", icon: "arrow-both" });
  if (d.origin !== null && d.origin !== undefined) children.push({ label: `origin ${typeof d.origin === "string" ? d.origin : JSON.stringify(d.origin)}`, icon: "target" });
  if (d.fits_in !== null && d.fits_in !== undefined) children.push({ label: `fits in ${typeof d.fits_in === "string" ? d.fits_in : JSON.stringify(d.fits_in)}`, icon: "symbol-ruler" });
  return {
    label: d.name, description: bits.join(" · "),
    tooltip: `${d.name}: ${d.kind}${KIND_GLOSS[d.kind] ? `\n${KIND_GLOSS[d.kind]}` : ""}${d.declared ? `\n${d.declared.text}` : ""}`,
    icon: d.kind === "quantity" ? "symbol-numeric" : d.kind === "point" ? "target" : d.kind === "identity" ? "symbol-key" : "symbol-ruler",
    command: at(m, d.declared?.at), children,
  };
}

/** `hale check --units --json`: every quantity, point and identity, its denomination and policy. */
export async function unitsReport(m: Model): Promise<Node[]> {
  const r = await run(["check", "--units", "--json", m.seedDir]);
  const u = parseUnits(r.stdout);
  if (!u) return [{ label: "no units report", description: (r.stderr || r.stdout).split("\n")[0], icon: "info" }];
  const decls = u.declarations ?? [];
  const nodes: Node[] = [];
  if (!decls.length) return [{ label: "no units declared", description: "unit cent; type Money = quantity Int in cent;", tooltip: "A quantity carries its unit through arithmetic; mixing units is a check error; the JSON codec carries it as its count.", icon: "info" }];
  const byKind = new Map<string, UnitDecl[]>();
  for (const d of decls) byKind.set(d.kind, [...(byKind.get(d.kind) ?? []), d]);
  nodes.push({ label: `${decls.length} declaration(s)`, description: [...byKind.entries()].map(([k, v]) => `${v.length} ${k}`).join(" · "), icon: "symbol-ruler" });
  for (const [kind, ds] of byKind) nodes.push({ label: kind, description: `${ds.length}`, tooltip: KIND_GLOSS[kind], icon: "folder", expanded: true, children: ds.map((d) => unitNode(m, d)) });
  for (const [k, v] of Object.entries(u)) {
    if (k === "declarations" || !Array.isArray(v) || !v.length) continue;
    nodes.push({ label: k, description: `${v.length}`, icon: "json", children: v.map((x: unknown) => ({ label: typeof x === "string" ? x : JSON.stringify(x).slice(0, 160), icon: "circle-small" })) });
  }
  return nodes;
}

/** `--sealable`, `--flows`, `--dump-resource-budget` and `hale verify --json`: what the compiler advises beyond the check. */
export async function adviceReport(m: Model): Promise<Node[]> {
  const [seal, flows, budget, verify] = await Promise.all([
    run(["check", "--sealable", m.seedDir]),
    run(["check", "--flows", m.seedDir]),
    run(["check", "--dump-resource-budget", m.seedDir]),
    run(["verify", "--json", m.seedDir]),
  ]);
  const nodes: Node[] = [];
  const own = (n: string) => !isGenerated(n);
  const sealed = new Set(m.artifact.sealed ?? []);
  // sealable
  const s = parseSections(seal.stdout + "\n" + seal.stderr);
  const sealNodes: Node[] = [];
  for (const sec of s.sections) {
    const mine = sec.items.filter(own); const gen = sec.items.filter((x) => !own(x));
    const free = /free to seal/.test(sec.title);
    sealNodes.push({
      label: sec.title, description: `${mine.length} of yours${gen.length ? ` · ${gen.length} generated` : ""}`, icon: free ? "unlock" : "lock",
      expanded: free,
      children: [
        ...mine.map((l): Node => free && !sealed.has(l) && !(m.artifact.contracts ?? []).some((c) => c.locus === l && c.instances.some((i) => i.owner === null))
          ? { label: l, description: "add @sealed", tooltip: "Nothing outside reads this locus's params: @sealed costs nothing and makes the confinement law.", icon: "lightbulb-autofix", tone: "warn", command: { command: "hale.sealLocus", title: "Seal", arguments: [l] } }
          : { label: l, description: sealed.has(l) ? "@sealed" : "", icon: sealed.has(l) ? "lock" : "symbol-class", location: (m.artifact.provenance?.decls ?? {})[l] }),
        ...(gen.length ? [{ label: "generated by the compiler", description: `${gen.length}`, icon: "gear", children: gen.map((l) => ({ label: l, icon: "gear" })) } as Node] : []),
      ],
    });
  }
  nodes.push({ label: "sealability", description: s.summary.replace(/^sealability:\s*/, ""), tooltip: "Which loci could be @sealed today: nothing outside touches their params. A secret rests on sealing.", icon: "lock", expanded: true, children: sealNodes.length ? sealNodes : [{ label: s.summary || "no report", icon: "info" }] });
  // flows
  const f = parseFlows(flows.stdout + "\n" + flows.stderr);
  nodes.push({
    label: "flows", description: f.summary.split(" — ")[0], tooltip: `${f.summary}\n${f.note}`, icon: "git-merge",
    expanded: f.flows.some((x) => own(x.type)),
    children: [
      ...f.flows.filter((x) => own(x.type)).map((x): Node => ({ label: x.type, description: `a flow, by ${x.clauses.length} release clause(s)`, icon: "git-merge", location: (m.artifact.provenance?.decls ?? {})[x.type], children: x.clauses.map((c) => ({ label: c.text, description: c.at ?? "", icon: "symbol-method", command: at(m, c.at) })) })),
      ...(f.flows.some((x) => !own(x.type)) ? [{ label: "generated by the compiler", description: `${f.flows.filter((x) => !own(x.type)).length}`, icon: "gear", children: f.flows.filter((x) => !own(x.type)).map((x) => ({ label: x.type, description: x.clauses.map((c) => c.text).join("; "), icon: "gear" })) } as Node] : []),
      ...(f.flows.length ? [] : [{ label: "no flows: every accepted child is a resident until its owner dissolves", description: "release(c: T) makes T a flow", icon: "info" } as Node]),
    ],
  });
  // budget
  const b = parseBudget(budget.stdout);
  nodes.push({
    label: "resource budget", description: b.filter((r) => /thread|pool/i.test(r.label)).map((r) => `${r.label} ${r.value.split(" ")[0]}`).join(" · "), tooltip: "OS threads, pools and bus subjects the placement implies, counted by the compiler.", icon: "dashboard",
    children: b.map((r): Node => ({ label: r.label, description: r.value, icon: "circle-small", children: r.children.map((c) => ({ label: c.label, description: c.value, icon: "circle-small", children: c.children.map((cc) => ({ label: cc.label, icon: "circle-small" })) })) })),
  });
  // verify findings
  const d = parseDiagnostics(verify.stdout);
  const findings = d.filter((x) => x.severity !== "error");
  nodes.push({
    label: "verify", description: findings.length ? `${findings.length} finding(s): hale verify fails` : verify.code === 0 ? "clean: nothing an advisory would fail" : `exit ${verify.code}`, tooltip: "hale verify is check plus every advisory as a failure: the CI gate.", icon: findings.length ? "warning" : "pass", tone: findings.length ? "warn" : "ok",
    expanded: findings.length > 0,
    children: findings.map((x) => ({ label: x.message.split("\n")[0].slice(0, 140), description: `${x.kind} · ${x.file.split("/").pop()}:${x.line}`, icon: "warning", tone: "warn", command: x.file ? { command: "hale.revealAt", title: "Reveal", arguments: [x.file, x.line, x.col] } : undefined })),
  });
  return nodes;
}
