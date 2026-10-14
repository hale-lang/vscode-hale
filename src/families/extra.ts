import { Artifact, Family, Node } from "../artifact";

const META = new Set(["schema", "semantics", "shape_hash", "artifact_digest"]);

/**
 * Every artifact section no lens claims, shown raw. When the compiler
 * adds a family (the registry reserves `transitions` for `@evented`
 * loci and `runs_under` for authority), its rows appear here on the
 * next check, before anyone writes the lens that reads them properly.
 */
export function unreadSections(claimed: Set<string>): Family {
  return {
    id: "hale.other",
    title: "Other sections",
    reads: [],
    build(a: Artifact): Node[] {
      const nodes: Node[] = [];
      for (const [key, value] of Object.entries(a as unknown as Record<string, unknown>)) {
        if (META.has(key) || claimed.has(key)) continue;
        const rows: Node[] = [];
        let count = 0;
        if (Array.isArray(value)) {
          count = value.length;
          for (const v of value.slice(0, 50)) rows.push({ label: typeof v === "string" ? v : JSON.stringify(v).slice(0, 160), icon: "circle-small" });
        } else if (value && typeof value === "object") {
          const entries = Object.entries(value as Record<string, unknown>);
          count = entries.length;
          for (const [k, v] of entries.slice(0, 50)) rows.push({ label: k, description: JSON.stringify(v).slice(0, 140), icon: "circle-small" });
        } else {
          rows.push({ label: String(value), icon: "circle-small" });
          count = 1;
        }
        nodes.push({ label: key, description: `${count} row(s)`, icon: "json", children: rows });
      }
      if (!nodes.length) nodes.push({ label: "every section has a lens", icon: "pass", tone: "ok" });
      return nodes;
    },
  };
}
