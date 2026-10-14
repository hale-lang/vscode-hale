import { Artifact, BuildContext, Family, Node, declLoc, isGenerated, ownerOf, refName } from "../artifact";
import { busRows } from "./bus";

/**
 * The program as a reader wants it first: the entry, the surfaces and
 * where each is served, the hubs and their streams, the topics with the
 * compiler's own grouped apart, what crosses the process boundary, the
 * loci by role, and the law. Every row is an artifact or inventory row.
 */
/** A listener as a reader wants it: a transport computed at run time or served over a hub is said, not blank. */
function listenerText(l: { transport: string; address: string }): string {
  const t = l.transport || "via a hub";
  const a = l.address || "address set at run time";
  return `${t} ${a}`;
}

export const program: Family = {
  id: "hale.program",
  title: "Program",
  reads: ["sorts", "topics", "relations", "contracts", "effects", "bindings", "claims", "law", "verdict", "supervision", "seeds", "sources"],
  build(a: Artifact, ctx?: BuildContext): Node[] {
    const inv = ctx?.inventory;
    const nodes: Node[] = [];
    const contracts = a.contracts ?? [];
    const entry = contracts.find((c) => c.instances?.some((i) => i.owner === null));
    const userLoci = (a.sorts?.loci ?? []).filter((l) => !isGenerated(l));
    const topics = a.topics ?? [];
    const userTopics = topics.filter((t) => !isGenerated(t.name));
    const genTopics = topics.filter((t) => isGenerated(t.name));
    const { pubs, subs, pubLoc, subLoc } = busRows(a);

    nodes.push({
      label: entry?.locus ?? inv?.app ?? "no entry locus",
      description: `${userLoci.length} loci · ${userTopics.length} topics · ${inv?.surfaces?.length ?? 0} surfaces · verdict ${a.verdict ?? "?"}`,
      tooltip: entry ? `entry ${entry.locus}\nschema ${a.schema} · shape ${a.shape_hash}` : "A library seed: no main locus, nothing served.",
      icon: "home",
      tone: a.verdict === "clean" ? "ok" : "warn",
      location: entry ? { file: entry.file, span: entry.span } : undefined,
    });

    // Surfaces: the api rows, then every exposure that serves each.
    const surfaces = inv?.surfaces ?? [];
    const exposures = inv?.exposures ?? [];
    nodes.push({
      label: "surfaces",
      description: surfaces.length ? `${surfaces.length} · ${exposures.length} exposure(s)` : "none",
      icon: "plug",
      expanded: true,
      children: surfaces.length ? surfaces.map((s): Node => ({
        label: `api ${s.name}`,
        description: exposures.some((e) => e.surface === s.name) ? s.digest : `${s.digest} · not served`,
        tone: exposures.some((e) => e.surface === s.name) ? undefined : "warn",
        tooltip: `surface ${s.name}\ndigest ${s.digest}\n${s.members.length} member(s)`,
        icon: "symbol-interface",
        location: declLoc(a, s.name),
        expanded: true,
        children: [
          ...s.members.map((m): Node => ({
            label: `${m.name}(${m.request ? refName(m.request) : ""}) -> ${refName(m.response)}${m.error ? ` fallible(${refName(m.error)})` : ""}`,
            description: m.requires.length ? `requires ${m.requires.join(", ")}` : "",
            icon: "symbol-method",
            location: declLoc(a, m.name),
          })),
          ...(exposures.some((e) => e.surface === s.name) ? [] : [{
            label: "serve it from the main locus",
            description: "adds the api::serve line, the receiver params and a main locus if missing",
            icon: "lightbulb-autofix",
            tone: "warn",
            command: { command: "hale.serveSurface", title: "Serve", arguments: [s.name] },
          } as Node]),
          ...exposures.filter((e) => e.surface === s.name).map((e): Node => ({
            label: `served as ${e.name}`,
            description: `${listenerText(e.listener)} · ${e.codec} · callers ${e.principals.source} · roles ${e.roles.source}`,
            tooltip: `${e.exposure}\nlistener ${listenerText(e.listener)}\ncodec ${e.codec}\nprincipals ${e.principals.source}${e.principals.type ? ` (${e.principals.type})` : ""}\nroles ${e.roles.source}${e.roles.type ? ` (${e.roles.type})` : ""}`,
            icon: "radio-tower",
            tone: "ok",
            children: e.receivers.map((r): Node => ({ label: `${r.type} = ${r.instance}`, description: `${r.binding} · pool ${r.pool}`, icon: "symbol-class", location: declLoc(a, r.type) })),
          })),
        ],
      })) : [{ label: "no api declared", description: "an `api Name { rpc Locus::fn; }` block makes one", icon: "info" }],
    });

    // Hubs: streams leaving over a websocket.
    const hubs = inv?.hubs ?? [];
    if (hubs.length) nodes.push({
      label: "hubs",
      description: `${hubs.length}`,
      icon: "broadcast",
      expanded: true,
      children: hubs.map((h): Node => ({
        label: `${h.name} = ${h.instance}`,
        description: `${listenerText(h.listener)} · ${h.codec} · callers ${h.principals.source}`,
        icon: "radio-tower",
        tone: "ok",
        children: h.streams.map((st): Node => ({
          label: `${st.topic} ${st.direction}`,
          description: `${st.subject} · ${refName(st.payload)}${st.bound !== undefined ? ` · bound ${st.bound} ${st.on_full ?? ""}` : ""}`,
          tooltip: st.loss ?? "",
          icon: st.direction === "out" ? "arrow-right" : "arrow-left",
          location: declLoc(a, st.topic),
        })),
      })),
    });

    // Topics: the author's, each with its ends; the compiler's grouped.
    const topicNode = (t: Artifact["topics"][number]): Node => {
      const p = pubs.filter((x) => x.subject === t.name || x.subject === t.subject);
      const s = subs.filter((x) => x.subject === t.name || x.subject === t.subject);
      return {
        label: t.name,
        description: `${t.subject} · ${t.shape} · ${p.length}→${s.length}`,
        tooltip: `topic ${t.name}\nsubject ${t.subject}\npayload ${t.shape} (${t.payload_hash})\n${p.length} publisher(s), ${s.length} subscriber(s)`,
        icon: "symbol-event",
        location: declLoc(a, t.name),
        children: [
          ...p.map((x): Node => ({ label: x.fn, description: "publishes", icon: "arrow-right", location: pubLoc(x.fn, x.subject) })),
          ...s.map((x): Node => ({ label: `${x.locus}::${x.handler}`, description: "subscribes", icon: "arrow-left", location: subLoc(x.locus, x.handler, x.subject) })),
        ],
      };
    };
    nodes.push({
      label: "topics",
      description: `${userTopics.length} declared · ${genTopics.length} generated`,
      icon: "symbol-event",
      expanded: true,
      children: [
        ...userTopics.map(topicNode),
        ...(genTopics.length ? [{
          label: "generated by the compiler",
          description: `${genTopics.length} · the api binding's and the stdlib's own traffic`,
          icon: "gear",
          children: genTopics.map(topicNode),
        } as Node] : []),
      ],
    });

    // Outside the process: every declared edge where a message or a
    // syscall crosses the boundary. Serve sites and hubs are above;
    // here the bus bindings and the loci whose code reaches the OS.
    const bindings = a.bindings ?? [];
    const reach: Node[] = [];
    for (const l of userLoci) {
      const classes = new Set<string>();
      for (const [fn, eff] of Object.entries(a.effects ?? {})) {
        if (ownerOf(fn) !== l) continue;
        for (const e of eff) if (e === "syscall" || e === "ffi" || e === "block") classes.add(e);
      }
      if (classes.size) reach.push({ label: l, description: [...classes].sort().join(", "), icon: "globe", location: declLoc(a, l) });
    }
    nodes.push({
      label: "outside the process",
      description: `${exposures.length} listener(s) · ${hubs.length} hub(s) · ${bindings.length} binding(s) · ${reach.length} loci reach the OS`,
      icon: "globe",
      expanded: true,
      children: [
        ...exposures.map((e): Node => ({ label: listenerText(e.listener), description: `serves ${e.surface} as ${e.name}`, icon: "radio-tower", tone: "ok" })),
        ...hubs.map((h): Node => ({ label: listenerText(h.listener), description: `hub ${h.name}: ${h.streams.map((s) => `${s.topic} ${s.direction}`).join(", ")}`, icon: "radio-tower", tone: "ok" })),
        ...bindings.map((b): Node => ({
          label: String(b["topic"] ?? b["subject"] ?? "binding"),
          description: Object.entries(b).filter(([k]) => !["topic", "subject"].includes(k)).map(([k, v]) => `${k}=${typeof v === "string" ? v : JSON.stringify(v)}`).join(" "),
          icon: "plug",
        })),
        ...(bindings.length ? [] : [{ label: "no bus bindings declared", description: "a topic leaves the process only through a serve site, a hub, or a runtime bus config", icon: "info" } as Node]),
        ...(reach.length ? [{ label: "loci that reach the OS", description: "by their fns' effect classes", icon: "globe", expanded: true, children: reach } as Node] : []),
      ],
    });

    // Loci by role.
    const memberNames = new Set((inv?.surfaces ?? []).flatMap((s) => s.members.map((m) => m.name)));
    const lociNodes: Node[] = userLoci.map((l): Node => {
      const c = contracts.find((x) => x.locus === l);
      const inst = c?.instances ?? [];
      const domains = [...new Set(inst.map((i) => i.domain))];
      // The author's topics only: the api binding's own traffic is the
      // binding's business, not the locus's role.
      const subsOf = subs.filter((x) => x.locus === l && !isGenerated(x.subject)).map((x) => x.subject);
      const pubsOf = [...new Set(pubs.filter((x) => ownerOf(x.fn) === l && !isGenerated(x.subject) && !isGenerated(x.fn)).map((x) => x.subject))];
      const serves = [...new Set([...memberNames].filter((m) => ownerOf(m) === l).map((m) => (inv?.surfaces ?? []).find((s) => s.members.some((x) => x.name === m))?.name ?? ""))].filter(Boolean);
      const sup = (a.supervision ?? []).filter((s) => s.locus === l);
      const role = inst.some((i) => i.owner === null) ? "main locus"
        : domains.length ? domains.map((d) => d.startsWith("pinned:") ? `pinned (${d.slice(7)})` : d.startsWith("pool:") ? `pool ${d.slice(5)}` : d).join(", ")
        : "spawned per use";
      const bits = [role];
      if (subsOf.length) bits.push(`subscribes ${subsOf.join(", ")}`);
      if (pubsOf.length) bits.push(`publishes ${pubsOf.join(", ")}`);
      if (serves.length) bits.push(`serves ${serves.join(", ")}`);
      if (sup.length) bits.push(`supervises ${sup.map((s) => s.child).join(", ")}`);
      return {
        label: l,
        description: bits.join(" · "),
        tooltip: `${l}${c?.sealed ? " @sealed" : ""}\n${bits.join("\n")}\n${inst.length} instance(s): ${inst.map((i) => i.path).join(", ") || "none standing"}\n${c?.methods.length ?? 0} method(s)`,
        icon: inst.some((i) => i.owner === null) ? "home" : domains.some((d) => d.startsWith("pinned")) ? "pinned" : inst.length ? "symbol-class" : "symbol-class",
        location: c ? { file: c.file, span: c.span } : declLoc(a, l),
        children: inst.map((i): Node => ({ label: i.path, description: i.domain, icon: "symbol-field" })),
      };
    });
    const genLoci = (a.sorts?.loci ?? []).filter(isGenerated);
    const genInst = contracts.flatMap((c) => c.instances ?? []).filter((i) => isGenerated(i.path));
    nodes.push({
      label: "loci",
      description: `${userLoci.length} declared · ${genLoci.length} generated`,
      icon: "symbol-class",
      expanded: true,
      children: [
        ...lociNodes,
        ...(genLoci.length ? [{
          label: "generated by the compiler",
          description: `${genLoci.length} loci · ${genInst.length} instance(s)`,
          icon: "gear",
          children: genLoci.map((l): Node => ({ label: l, description: (contracts.find((c) => c.locus === l)?.instances ?? []).map((i) => i.domain).join(", "), icon: "gear" })),
        } as Node] : []),
      ],
    });

    // The files, the seeds imported, and the environments the manifest deploys to.
    const sources = a.sources ?? [];
    const seeds = Object.entries(a.seeds ?? {});
    const envs = ctx?.environments ?? [];
    const inputs = ctx?.inputs ?? [];
    nodes.push({
      label: "files",
      description: `${sources.length} source(s)${seeds.length ? ` · ${seeds.length} imported seed(s)` : ""}${inputs.length > sources.length ? ` · ${inputs.length} input(s) read` : ""}`,
      tooltip: "The .hl files of this seed, the seeds it imports, and every file a build reads (hale inputs).",
      icon: "files",
      children: [
        ...sources.map((s): Node => ({ label: s.path.split("/").pop() ?? s.path, description: s.path, tooltip: `digest ${s.digest}`, icon: "file-code", location: { source: s.id, span: [0, 0] } })),
        ...seeds.map(([alias, v]): Node => ({ label: `import … as ${alias}`, description: typeof v === "string" ? v : JSON.stringify(v).slice(0, 120), icon: "package" })),
        ...(inputs.length ? [{ label: "inputs", description: `${inputs.length} file(s) a build reads`, icon: "list-tree", children: inputs.map((f) => ({ label: f.split("/").pop() ?? f, description: f, icon: "file", command: { command: "hale.revealAt", title: "Open", arguments: [f, 1, 1] } })) } as Node] : []),
      ],
    });
    if (envs.length) nodes.push({
      label: "environments",
      description: envs.map((e) => e.name).join(", "),
      tooltip: "hale.toml [environments.<name>]: where each entrypoint deploys and the constitution it adopts there. hale check --env <name> checks one; --matrix checks every pair.",
      icon: "server-environment",
      expanded: true,
      children: [
        ...envs.map((e): Node => ({
          label: e.name,
          description: `${e.entrypoints.length} entrypoint(s)${e.constitution ? ` · adopts ${e.constitution}` : ""}${e.sourceOnly ? " · source only" : ""}`,
          icon: "server-environment",
          command: { command: "hale.checkEnv", title: "Check for this environment", arguments: [e.name] },
          children: e.entrypoints.map((p) => ({ label: p, icon: "file-directory" })),
        })),
        { label: "check every (entrypoint, environment) pair", description: "hale check --matrix", icon: "run-all", command: { command: "hale.checkMatrix", title: "Matrix" } },
      ],
    });

    // Law.
    const rows = a.law?.rows ?? [];
    nodes.push({
      label: "law",
      description: `verdict ${a.verdict ?? "?"} · ${(a.claims ?? []).length} claim(s)`,
      icon: "law",
      tone: a.verdict === "clean" ? "ok" : "warn",
      children: (a.claims ?? []).map((c): Node => {
        const row = rows.find((r) => r.name === c.name);
        const v = row?.verdict ?? c.result;
        return { label: c.name, description: `${v} · ${c.form}`, icon: v === "holds" ? "pass" : v === "violated" ? "error" : "question", tone: v === "holds" ? "ok" : v === "violated" ? "error" : "warn", location: row ? { file: row.file, span: row.span } : undefined };
      }),
    });
    return nodes;
  },
};
