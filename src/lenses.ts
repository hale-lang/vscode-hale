import * as vscode from "vscode";
import { Model, charOffsetOfByte, isGenerated, ownerOf, phasesOf } from "./artifact";
import { busRows } from "./families/bus";
import { resolveSource } from "./views";

/**
 * The rows, written over the declarations they describe: above a
 * locus its place in the tower, its bus and its effects; above a
 * topic its ends; above a surface where it is served; above a claim
 * its verdict; above a free fn what it reaches. Each lens opens the
 * view that holds the rest.
 */
export class HaleCodeLens implements vscode.CodeLensProvider {
  private changed = new vscode.EventEmitter<void>();
  readonly onDidChangeCodeLenses = this.changed.event;
  constructor(private readonly current: () => Model | undefined) {}
  refresh(): void { this.changed.fire(); }

  provideCodeLenses(doc: vscode.TextDocument): vscode.CodeLens[] {
    if (!vscode.workspace.getConfiguration("hale").get<boolean>("codeLens", true)) return [];
    const m = this.current(); if (!m) return [];
    const a = m.artifact;
    const src = (a.sources ?? []).find((s) => resolveSource(m, s.path) === doc.uri.fsPath);
    if (!src) return [];
    const text = doc.getText();
    const out: vscode.CodeLens[] = [];
    const lineAt = (span: [number, number]) => { const p = doc.positionAt(charOffsetOfByte(text, span[0])); return doc.lineAt(p.line).range; };
    const lens = (range: vscode.Range, title: string, command: string, args: unknown[] = [], tooltip?: string) => { const l = new vscode.CodeLens(range, { title, command, arguments: args, tooltip }); out.push(l); };
    const focus = (view: string): [string, unknown[]] => ["hale.focusView", [view]];
    const { pubs, subs } = busRows(a);
    const contracts = a.contracts ?? [];
    const inv = m.inventory;
    const topicNames = new Set((a.topics ?? []).map((t) => t.name));
    const loci = new Set(a.sorts?.loci ?? []);
    const fns = new Set(a.sorts?.fns ?? []);
    const lawRows = a.law?.rows ?? [];

    for (const [name, loc] of Object.entries(a.provenance?.decls ?? {})) {
      if (loc.source !== src.id || isGenerated(name)) continue;
      const range = lineAt(loc.span);
      if (loci.has(name)) {
        const c = contracts.find((x) => x.locus === name);
        const inst = c?.instances ?? [];
        const entry = inst.some((i) => i.owner === null);
        const own = (a.sorts?.loci ?? []).filter((l) => !isGenerated(l)).length;
        if (entry) lens(range, `$(home) main locus · ${own} loci in the tower · verdict ${a.verdict}`, ...focus("hale.tower"), "The entry: its params are the tower. Open the Tower view.");
        else if (inst.length) lens(range, `$(symbol-class) ${inst.length} instance(s): ${inst.slice(0, 3).map((i) => `${i.path} (${i.domain})`).join(", ")}${inst.length > 3 ? " …" : ""}`, ...focus("hale.tower"), "Where this locus stands in the tower, and on which thread.");
        else lens(range, `$(symbol-class) spawned per use, no standing instance`, ...focus("hale.tower"), "No param of the tower holds one: it is built where it is used, or never.");
        const subsOf = subs.filter((x) => x.locus === name && !isGenerated(x.subject)).map((x) => x.subject);
        const pubsOf = [...new Set(pubs.filter((x) => ownerOf(x.fn) === name && !isGenerated(x.subject)).map((x) => x.subject))];
        if (subsOf.length || pubsOf.length) lens(range, `$(broadcast) ${[subsOf.length ? `subscribes ${subsOf.join(", ")}` : "", pubsOf.length ? `publishes ${pubsOf.join(", ")}` : ""].filter(Boolean).join(" · ")}`, ...focus("hale.bus"), "This locus's ends on the bus.");
        const { hooks } = phasesOf(a, name);
        const sup = (a.supervision ?? []).filter((s) => s.locus === name);
        const life = [hooks.length ? hooks.join(" → ") : "", sup.length ? `supervises ${sup.map((s) => `${s.child} (${s.ops.join("/")})`).join(", ")}` : "", c?.sealed ? "@sealed" : ""].filter(Boolean).join(" · ");
        if (life) lens(range, `$(symbol-event) ${life}`, ...focus("hale.lifecycle"), "The hooks this locus declares, in the order they run.");
        const eff = new Set<string>();
        for (const [fn, cls] of Object.entries(a.effects ?? {})) if (ownerOf(fn) === name && !isGenerated(fn)) for (const e of cls) eff.add(e);
        const shown = [...eff].filter((e) => e !== "alloc").sort();
        if (shown.length) lens(range, `$(symbol-misc) effects: ${shown.join(", ")}`, ...focus("hale.effects"), "The effect classes this locus's fns reach, transitively, as the compiler inferred them.");
        const served = (inv?.surfaces ?? []).filter((s) => s.members.some((mm) => ownerOf(mm.name) === name));
        if (served.length) lens(range, `$(plug) serves ${served.map((s) => `api ${s.name}`).join(", ")}`, ...focus("hale.program"), "Members of this locus are rpc rows of these surfaces.");
      } else if (topicNames.has(name)) {
        const t = (a.topics ?? []).find((x) => x.name === name)!;
        const p = pubs.filter((x) => x.subject === t.name || x.subject === t.subject);
        const s = subs.filter((x) => x.subject === t.name || x.subject === t.subject);
        const hub = (inv?.hubs ?? []).find((h) => h.streams.some((st) => st.topic === name));
        lens(range, `$(broadcast) ${p.length} publisher(s) → ${s.length} subscriber(s) · "${t.subject}"${hub ? ` · streamed by hub ${hub.name}` : ""}${!p.length || !s.length ? " · one-sided in this seed" : ""}`, ...focus("hale.bus"), `payload ${t.shape}`);
      } else if (inv?.surfaces.some((s) => s.name === name)) {
        const ex = inv.exposures.filter((e) => e.surface === name);
        if (ex.length) lens(range, `$(radio-tower) served as ${ex.map((e) => `${e.name} (${e.listener.transport || "hub"} ${e.listener.address || ""})`.trim()).join(", ")}`, "hale.showApiDocs", [], "Open the API docs for this surface.");
        else lens(range, `$(warning) declared, not served · serve it from the main locus`, "hale.serveSurface", [name], "Adds the api::serve line, the receiver params and a main locus if missing.");
      } else if (fns.has(name) && a.effects?.[name]) {
        const cls = a.effects[name].filter((e) => e !== "alloc");
        if (cls.length) lens(range, `$(symbol-misc) effects: ${cls.join(", ")}`, ...focus("hale.effects"));
      }
    }
    for (const r of lawRows) {
      if (!r.file || resolveSource(m, r.file) !== doc.uri.fsPath) continue;
      const range = lineAt(r.span);
      const icon = r.verdict === "holds" ? "$(pass)" : r.verdict === "violated" ? "$(error)" : "$(question)";
      lens(range, `${icon} ${r.verdict} · ${r.family} (${a.adequacy?.[r.family] ?? "?"})`, ...focus("hale.law"), `${r.name}: ${r.origin}`);
    }
    return out;
  }
}
