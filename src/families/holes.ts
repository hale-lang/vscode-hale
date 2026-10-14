import { Artifact, Family, Node, declLoc, isGenerated } from "../artifact";
import { busRows } from "./bus";

/** What the compiler says it cannot see, and what is declared but not wired. */
export const holes: Family = {
  id: "hale.holes",
  title: "Holes",
  reads: ["unknowns", "adequacy", "capabilities", "topics", "relations", "verdict"],
  build(a: Artifact): Node[] {
    const nodes: Node[] = [];
    for (const u of a.unknowns ?? []) {
      nodes.push({
        label: u.fn,
        description: u.reasons.join("; "),
        tooltip: `${u.fn}\n${u.reasons.join("\n")}`,
        icon: "question",
        tone: "warn",
        location: declLoc(a, u.fn),
        children: u.reasons.map((r) => ({ label: r, icon: "circle-outline" })),
      });
    }
    // A topic with one side missing in this seed is not a hole: the
    // compiler is deployment-blind, and the other side may be another
    // binary bound over a transport. Listed apart, with that reason.
    const { pubs, subs } = busRows(a);
    const oneSided: Node[] = [];
    for (const t of a.topics ?? []) {
      if (isGenerated(t.name)) continue;
      const p = pubs.some((x) => x.subject === t.name || x.subject === t.subject);
      const s = subs.some((x) => x.subject === t.name || x.subject === t.subject);
      if (!p) oneSided.push({ label: `nothing publishes ${t.name}`, description: `subject ${t.subject}`, icon: "broadcast", location: declLoc(a, t.name) });
      if (!s) oneSided.push({ label: `nothing subscribes to ${t.name}`, description: `subject ${t.subject}`, icon: "broadcast", location: declLoc(a, t.name) });
    }
    const limits: Node[] = [];
    for (const [f, v] of Object.entries(a.adequacy ?? {})) {
      if (v !== "exact") limits.push({ label: `${f} is ${v}`, description: "judgment family", icon: "law", tone: "warn" });
    }
    for (const [k, v] of Object.entries(a.capabilities ?? {})) {
      if (!v) limits.push({ label: k, description: "not exact", icon: "shield", tone: "warn" });
    }
    if (!nodes.length) nodes.push({ label: "no holes", description: "nothing the compiler could not resolve", icon: "pass", tone: "ok" });
    if (oneSided.length) nodes.push({
      label: "one-sided in this seed",
      description: `${oneSided.length} · the other side may be another binary`,
      tooltip: "The compiler never connects seeds: a topic published here and consumed in another binary is one-sided in each. Only a running fleet (iris) or a fleet plan can say which of these are unwired.",
      icon: "git-compare",
      children: oneSided,
    });
    if (limits.length) nodes.push({ label: "what the compiler cannot see", description: `${limits.length} row(s)`, icon: "eye-closed", children: limits });
    return nodes;
  },
};
