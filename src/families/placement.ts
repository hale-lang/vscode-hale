import { Artifact, Family, Node } from "../artifact";

/** Who runs where: instances grouped by their thread domain, and the bindings. */
export const placement: Family = {
  id: "hale.placement",
  title: "Placement",
  reads: ["contracts", "bindings"],
  build(a: Artifact): Node[] {
    const byDomain = new Map<string, Node[]>();
    for (const c of a.contracts ?? []) for (const i of c.instances ?? []) {
      const l = byDomain.get(i.domain) ?? [];
      l.push({ label: i.path, description: c.locus, icon: "symbol-class", location: { file: c.file, span: c.span } });
      byDomain.set(i.domain, l);
    }
    const nodes: Node[] = [...byDomain.entries()]
      .sort(([x], [y]) => (x === "main" ? -1 : y === "main" ? 1 : x.localeCompare(y)))
      .map(([domain, children]) => ({
        label: domain,
        description: `${children.length} instance(s)`,
        icon: domain.startsWith("pinned") ? "pinned" : domain === "main" ? "home" : "server-process",
        children,
        expanded: true,
      }));
    const bindings = a.bindings ?? [];
    if (bindings.length) {
      nodes.push({
        label: "bindings",
        description: `${bindings.length}`,
        icon: "plug",
        expanded: true,
        children: bindings.map((b) => ({
          label: String(b["topic"] ?? b["subject"] ?? b["name"] ?? "binding"),
          description: Object.entries(b).filter(([k]) => !["topic", "subject", "name"].includes(k)).map(([k, v]) => `${k}=${typeof v === "string" ? v : JSON.stringify(v)}`).join(" "),
          icon: "plug",
        })),
      });
    }
    return nodes;
  },
};
