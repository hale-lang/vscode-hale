import { Artifact, Family, Node, HOOKS, declLoc, isGenerated, phasesOf } from "../artifact";

const HOOK_GLOSS: Record<string, string> = {
  birth: "the first hook: the params are set, the region is fresh",
  accept: "a child arrives: accept(c: T) receives it",
  release: "an accepted child's run() ended: release(c: T) reclaims it, making T a flow",
  run: "the locus's own activity; returning means ready, a loop that reads self.draining ends on drain",
  drain: "stop taking new work; the bus is quiesced",
  dissolve: "the last hook; the region is freed after it",
  on_failure: "a child's structural failure arrives here: restart, quarantine or bubble it",
};

/**
 * Each locus as a lifecycle: which of the seven hooks it declares, in
 * the order the runtime calls them, with the missing ones named; its
 * modes, its methods, what it supervises and how, what it subscribes
 * to and with what capacity, and the instances it has in the tower.
 */
export const lifecycle: Family = {
  id: "hale.lifecycle",
  title: "Lifecycle",
  reads: ["phases", "contracts", "supervision", "sealed", "evaluation"],
  build(a: Artifact): Node[] {
    const nodes: Node[] = [];
    const contracts = (a.contracts ?? []).filter((c) => !isGenerated(c.locus));
    const sup = a.supervision ?? [];
    const counts = new Map<string, number>();
    for (const c of contracts) for (const h of phasesOf(a, c.locus).hooks) counts.set(h, (counts.get(h) ?? 0) + 1);
    nodes.push({
      label: `${contracts.length} loci`,
      description: HOOKS.filter((h) => counts.get(h)).map((h) => `${h} ${counts.get(h)}`).join(" · ") || "no hooks declared",
      tooltip: "The seven hooks, and how many loci declare each.",
      icon: "symbol-event",
    });
    for (const c of contracts) {
      const { hooks, modes, methods } = phasesOf(a, c.locus);
      const loc = { file: c.file, span: c.span };
      const supOf = sup.filter((s) => s.locus === c.locus);
      const supBy = sup.filter((s) => s.child === c.locus);
      const children: Node[] = [];
      children.push({
        label: "lifecycle",
        description: hooks.length ? hooks.join(" → ") : "no hooks: a table of fns",
        icon: "symbol-event",
        expanded: true,
        children: HOOKS.map((h): Node => {
          // The phase table lists hooks with a body of their own; a supervision
          // row proves an on_failure as well.
          const has = hooks.includes(h) || (h === "on_failure" && supOf.length > 0);
          if (h === "accept" || h === "release" || h === "on_failure") {
            // These take a child type; the contract names what the locus supervises.
            const detail = h === "on_failure" ? supOf.map((s) => `${s.child} on ${s.err}: ${s.ops.join(", ")}`).join("; ") : "";
            return { label: h, description: has ? detail || "declared" : "not declared", tooltip: HOOK_GLOSS[h], icon: has ? "pass" : "circle-outline", tone: has ? "ok" : undefined, location: has ? loc : undefined };
          }
          return { label: h, description: has ? "declared" : "not declared", tooltip: HOOK_GLOSS[h], icon: has ? "pass" : "circle-outline", tone: has ? "ok" : undefined, location: has ? loc : undefined };
        }),
      });
      if (modes.length) children.push({ label: "modes", description: modes.join(", "), tooltip: "Three named projections of one kernel: self.bulk(), self.harmonic(), self.resolution().", icon: "symbol-enum", children: modes.map((m) => ({ label: m, icon: "symbol-enum-member", location: loc })) });
      if (methods.length) children.push({ label: "methods", description: `${methods.length}`, icon: "symbol-method", children: methods.map((m) => ({ label: m, icon: "symbol-method", location: declLoc(a, `${c.locus}::${m}`) ?? loc })) });
      if (c.subscribes?.length) children.push({
        label: "subscribes", description: `${c.subscribes.length}`, icon: "arrow-left",
        children: c.subscribes.map((s) => ({ label: `${s.topic} as ${s.handler}`, description: `${s.capacity !== null && s.capacity !== undefined ? `capacity ${JSON.stringify(s.capacity)}` : "default capacity"} · ${s.shed}`, icon: "arrow-left", location: declLoc(a, `${c.locus}::${s.handler}`) ?? loc })),
      });
      if (supOf.length) children.push({ label: "supervises", description: supOf.map((s) => s.child).join(", "), icon: "shield", children: supOf.map((s) => ({ label: s.child, description: `on ${s.err}: ${s.ops.join(", ")}`, icon: "shield", location: declLoc(a, s.child) })) });
      if (supBy.length) children.push({ label: "supervised by", description: supBy.map((s) => s.locus).join(", "), icon: "shield", children: supBy.map((s) => ({ label: s.locus, description: `on ${s.err}: ${s.ops.join(", ")}`, icon: "shield", location: declLoc(a, s.locus) })) });
      if (c.params?.length) children.push({ label: "params", description: `${c.params.length}`, icon: "symbol-field", children: c.params.filter((p) => !isGenerated(p.name)).map((p) => ({ label: p.name, description: p.type, icon: "symbol-field", location: loc })) });
      const inst = c.instances ?? [];
      children.push({ label: "instances", description: inst.length ? inst.map((i) => i.path).join(", ") : "none standing: spawned per use or never born", icon: "symbol-class", children: inst.map((i) => ({ label: i.path, description: i.domain, icon: "symbol-field" })) });
      const bits: string[] = [];
      const shown = [...hooks, ...(supOf.length && !hooks.includes("on_failure") ? ["on_failure"] : [])];
      if (shown.length) bits.push(shown.join(" → "));
      if (modes.length) bits.push(`modes ${modes.join(", ")}`);
      if (supOf.length) bits.push(`supervises ${supOf.map((s) => s.child).join(", ")}`);
      nodes.push({
        label: c.locus,
        description: `${c.sealed ? "@sealed · " : ""}${bits.join(" · ") || `${methods.length} method(s)`}`,
        tooltip: `${c.locus}${c.sealed ? " @sealed" : ""}\nhooks: ${hooks.join(", ") || "none"}\nmodes: ${modes.join(", ") || "none"}\n${methods.length} method(s), ${inst.length} instance(s)`,
        icon: inst.some((i) => i.owner === null) ? "home" : c.sealed ? "lock" : "symbol-class",
        location: loc,
        children,
      });
    }
    if (sup.length) nodes.push({
      label: "supervision",
      description: `${sup.length} edge(s)`,
      tooltip: "Every on_failure in the seed: the parent, the child type, the error it handles and what it does.",
      icon: "shield",
      children: sup.map((s) => ({ label: `${s.locus} → ${s.child}`, description: `on ${s.err}: ${s.ops.join(", ")}`, icon: "shield", location: declLoc(a, s.locus) })),
    });
    const ev = a.evaluation;
    if (ev && (ev.roots?.length || ev.closure?.length)) nodes.push({ label: "evaluation", description: `${ev.roots?.length ?? 0} root(s) · ${ev.closure?.length ?? 0} in closure`, icon: "graph", children: [...(ev.roots ?? []).map((r) => ({ label: String(typeof r === "string" ? r : JSON.stringify(r)).slice(0, 120), icon: "circle-small" }))] });
    return nodes;
  },
};
