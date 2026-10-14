import { Artifact, Family, Node } from "../artifact";

function toneOf(verdict: string): Node["tone"] {
  if (verdict === "holds") return "ok";
  if (verdict === "violated" || verdict === "invalid") return "error";
  return "warn";
}

/** Claims with their verdicts, the adequacy of each judgment family, and the capabilities. */
export const law: Family = {
  id: "hale.law",
  title: "Law",
  reads: ["claims", "law", "verdict", "adequacy", "capabilities", "groups", "lowered"],
  build(a: Artifact): Node[] {
    const nodes: Node[] = [];
    const rows = a.law?.rows ?? [];
    nodes.push({ label: `verdict: ${a.verdict ?? "?"}`, icon: a.verdict === "clean" ? "pass" : "warning", tone: a.verdict === "clean" ? "ok" : "warn" });
    for (const c of a.claims ?? []) {
      const row = rows.find((r) => r.ordinal === c.ordinal && r.name === c.name) ?? rows.find((r) => r.name === c.name);
      const verdict = row?.verdict ?? c.result;
      const children: Node[] = [];
      if (row) {
        children.push({ label: `family ${row.family}`, description: `adequacy ${a.adequacy?.[row.family] ?? "?"}`, icon: "law" });
        children.push({ label: `origin ${row.origin}`, icon: "symbol-namespace" });
        if (row.witness !== undefined) children.push({ label: "witness", description: JSON.stringify(row.witness).slice(0, 200), icon: "eye" });
      }
      nodes.push({
        label: c.name,
        description: `${verdict} · ${c.form}`,
        tooltip: `${c.name}: ${c.form}\nverdict ${verdict}${row ? `\nfamily ${row.family}, origin ${row.origin}` : ""}`,
        icon: verdict === "holds" ? "pass" : verdict === "violated" ? "error" : "question",
        tone: toneOf(verdict),
        location: row ? { file: row.file, span: row.span } : undefined,
        children,
      });
    }
    const lowered = a.lowered ?? [];
    if (lowered.length) nodes.push({
      label: "lowered",
      description: `${lowered.length} · ${lowered.filter((l) => l.result === "holds").length} hold`,
      tooltip: "Every law in its canonical form: the claims, and the effect assertions the compiler lowered to claims.",
      icon: "law",
      children: lowered.map((l) => ({ label: l.form, description: `${l.result} · ${l.subject}`, icon: l.result === "holds" ? "pass" : "error", tone: l.result === "holds" ? "ok" : "error" })),
    });
    const groups = Object.entries(a.groups ?? {});
    if (groups.length) nodes.push({
      label: "groups", description: `${groups.length}`, icon: "symbol-array",
      children: groups.map(([g, members]) => ({ label: g, description: members.join(", "), icon: "symbol-array" })),
    });
    const adequacy = Object.entries(a.adequacy ?? {});
    if (adequacy.length) nodes.push({
      label: "adequacy", description: adequacy.every(([, v]) => v === "exact") ? "all exact" : "degraded", icon: "verified",
      children: adequacy.map(([f, v]) => ({ label: f, description: v, icon: v === "exact" ? "pass" : "warning", tone: v === "exact" ? "ok" : "warn" })),
    });
    const caps = Object.entries(a.capabilities ?? {});
    if (caps.length) nodes.push({
      label: "capabilities", description: `${caps.filter(([, v]) => v).length}/${caps.length} exact`, icon: "shield",
      children: caps.map(([k, v]) => ({ label: k, description: v ? "exact" : "not exact", icon: v ? "pass" : "circle-slash", tone: v ? "ok" : "warn" })),
    });
    return nodes;
  },
};
