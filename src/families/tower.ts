import { Artifact, Family, Node, Contract, Instance, isGenerated } from "../artifact";

/** The locus tower: every instance the contracts name, nested by its path. */
export const tower: Family = {
  id: "hale.tower",
  title: "Tower",
  reads: ["contracts", "supervision", "sealed"],
  build(a: Artifact): Node[] {
    const byLocus = new Map<string, Contract>();
    for (const c of a.contracts ?? []) byLocus.set(c.locus, c);
    const inst: { i: Instance; c: Contract }[] = [];
    for (const c of a.contracts ?? []) for (const i of c.instances ?? []) inst.push({ i, c });
    inst.sort((x, y) => x.i.path.localeCompare(y.i.path));
    const nodeOf = (e: { i: Instance; c: Contract }): Node => {
      const seg = e.i.path.split(".");
      const name = seg[seg.length - 1];
      const direct = inst.filter((o) => o.i.path.startsWith(e.i.path + ".") && o.i.path.split(".").length === seg.length + 1);
      const own = direct.filter((o) => !isGenerated(o.i.path.split(".").pop() ?? ""));
      const gen = direct.filter((o) => isGenerated(o.i.path.split(".").pop() ?? ""));
      const children = [
        ...own.map(nodeOf),
        ...(gen.length ? [{ label: "generated", description: `${gen.length} · the api binding's and the stdlib's loci`, icon: "gear", children: gen.map(nodeOf) } as Node] : []),
      ];
      const sup = (a.supervision ?? []).filter((s) => s.locus === e.c.locus);
      const tip = [
        `${e.i.path}: ${e.c.locus}${e.c.sealed ? " @sealed" : ""}`,
        `domain ${e.i.domain}`,
        e.c.params.length ? `params ${e.c.params.map((p) => `${p.name}: ${p.type}`).join(", ")}` : "no params",
        `${e.c.methods.length} method(s)`,
        ...sup.map((s) => `supervises ${s.child} on ${s.err}: ${s.ops.join(", ")}`),
      ].join("\n");
      return {
        label: name,
        description: `${e.c.locus} · ${e.i.domain}`,
        tooltip: tip,
        icon: e.i.owner === null ? "home" : "symbol-class",
        children,
        location: { file: e.c.file, span: e.c.span },
        expanded: true,
      };
    };
    const roots = inst.filter((e) => e.i.owner === null).map(nodeOf);
    if (roots.length) return roots;
    // A library seed has no main and so no instances: list its loci flat.
    return [...byLocus.values()].filter((c) => !isGenerated(c.locus)).map((c) => ({
      label: c.locus,
      description: c.params.length ? `params ${c.params.map((p) => p.name).join(", ")}` : "",
      tooltip: [
        `${c.locus}${c.sealed ? " @sealed" : ""}: ${c.methods.length} method(s), ${c.subscribes.length} subscription(s)`,
        ...(c.params.length ? [`params ${c.params.map((p) => `${p.name}: ${p.type}`).join(", ")}`] : []),
        ...(a.supervision ?? []).filter((s) => s.locus === c.locus).map((s) => `supervises ${s.child} on ${s.err}: ${s.ops.join(", ")}`),
      ].join("\n"),
      icon: "symbol-class",
      location: { file: c.file, span: c.span },
    }));
  },
};
