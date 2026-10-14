// Where the cursor is, and what belongs there. A frame is one enclosing
// block (`main locus App`, `bus`, `run()`), classified by its head; a
// guide per kind says what the block is for a reader who has not read
// the book, what this seed already has there, what can be written
// there (as snippets), and what must hold. Pure: hereView.ts and the
// completion provider render it.
import { Artifact, Inventory, Node, isGenerated, ownerOf, phasesOf, HOOKS } from "./artifact";
import { stripComments } from "./language";
import { busRows } from "./families/bus";

export interface Frame {
  kind: string;
  /** The declared name (`App`, `Book`, `Orders`), when the head has one. */
  name?: string;
  /** The head's argument text (`c: Worker, err: ClosureViolation`). */
  args?: string;
  head: string;
  open: number;
  close: number;
}

export interface Seed { artifact: Artifact; inventory?: Inventory; seedDir: string }

export interface Offer { label: string; gloss: string; snippet: string; present?: boolean }

export interface Guide {
  /** The block's name for a breadcrumb. */
  title: (f: Frame) => string;
  /** What this block is, for someone who has not read the book. */
  gloss: string;
  doc: string;
  /** What must hold here, as the book states it. */
  rules: string[];
  offers: (c: Here) => Offer[];
  derived: (c: Here) => Node[];
}

/** The cursor's situation, computed once per request. */
export class Here {
  readonly src: string;
  constructor(readonly text: string, readonly frames: Frame[], readonly seed?: Seed) { this.src = stripComments(text); }
  get frame(): Frame | undefined { return this.frames[this.frames.length - 1]; }
  get locusFrame(): Frame | undefined { return [...this.frames].reverse().find((f) => f.kind === "locus" || f.kind === "main_locus"); }
  get locus(): string | undefined { return this.locusFrame?.name; }
  get isMain(): boolean { return this.locusFrame?.kind === "main_locus"; }
  body(f = this.frame): string { return f ? this.src.slice(f.open + 1, f.close < 0 ? this.src.length : f.close) : this.src; }
  has(re: RegExp, f = this.frame): boolean { return re.test(this.body(f)); }
  get a(): Artifact | undefined { return this.seed?.artifact; }
  get topics() { return (this.a?.topics ?? []).filter((t) => !isGenerated(t.name)); }
  get userLoci() { return (this.a?.sorts?.loci ?? []).filter((l) => !isGenerated(l)); }
  contract(l = this.locus) { return (this.a?.contracts ?? []).find((c) => c.locus === l); }
  get mainContract() { return (this.a?.contracts ?? []).find((c) => c.instances?.some((i) => i.owner === null)); }
  /** The type a topic's payload declares, from the text. */
  payloadOf(topic: string): string | undefined { return new RegExp(`\\btopic\\s+${topic}\\s*\\{[^}]*\\bpayload\\s*:\\s*([A-Za-z_][\\w:]*)`).exec(this.src)?.[1]; }
}

const HEADS: [string, RegExp][] = [
  ["main_locus", /\bmain\s+locus\s+([A-Za-z_]\w*)\s*(?::[^{]*)?$/],
  ["locus", /(?:^|[^.\w])locus\s+([A-Za-z_]\w*)\s*(?::[^{]*)?$/],
  ["perspective", /^perspective\s+([A-Za-z_]\w*)\s*$/],
  ["interface", /^interface\s+([A-Za-z_]\w*)\s*$/],
  ["constitution", /^constitution\s+([A-Za-z_]\w*)(?:\s+extends\s+\w+)?\s*$/],
  ["api", /^api\s+([A-Za-z_]\w*)\s*$/],
  ["topic", /^topic\s+([A-Za-z_]\w*)\s*$/],
  ["module", /^module\s+([A-Za-z_]\w*)\s*$/],
  ["type", /^type\s+([A-Za-z_]\w*)\s*(?:=\s*enum\s*)?$/],
  ["target", /^target\s+(\w+)\s*$/],
  ["params", /^params\s*(?::\s*inferred\s*)?$/],
  ["contract", /^contract\s*(?::\s*inferred\s*)?$/],
  ["bus", /^bus\s*$/],
  ["capacity", /^capacity\s*$/],
  ["closure", /^closure\s+([A-Za-z_]\w*)\s*$/],
  ["claims", /^claims\s*$/],
  ["placement", /^placement\s*$/],
  ["bindings", /^bindings\s*$/],
  ["topology", /^topology\s*$/],
  ["birth_check", /^birth_check\s*$/],
  ["birth", /^birth\s*\(\s*\)\s*$/],
  ["run", /^run\s*\(\s*\)\s*$/],
  ["drain", /^drain\s*\(\s*\)\s*$/],
  ["dissolve", /^dissolve\s*\(\s*\)\s*$/],
  ["accept", /^accept\s*\(([^)]*)\)\s*$/],
  ["release", /^release\s*\(([^)]*)\)\s*$/],
  ["on_failure", /^on_failure\s*\(([^)]*)\)\s*$/],
  ["mode", /^mode\s+([A-Za-z_]\w*)\s*\([^)]*\)[^{]*$/],
  ["fn", /^(?:@\w+(?:\([^)]*\))?\s*)*fn\s+([A-Za-z_]\w*)\s*\(([^)]*)\)[^{]*$/],
  ["match", /^match\b/],
  ["block", /^(?:if|else|while|for)\b/],
  ["literal", /(?:=|\(|,|^)\s*(?:[A-Za-z_][\w:]*)\s*$/],
];

/** The enclosing frames of `offset`, outermost first. */
export function framesAt(text: string, offset: number): Frame[] {
  const src = stripComments(text);
  const stack: number[] = [];
  for (let i = 0; i < offset && i < src.length; i++) {
    const c = src[i];
    if (c === '"') { i++; while (i < src.length && src[i] !== '"') { if (src[i] === "\\") i++; i++; } continue; }
    if (c === "{") stack.push(i);
    else if (c === "}") stack.pop();
  }
  return stack.map((open) => {
    // the head: the text since the last `;`, `{` or `}` before the brace
    let j = open - 1;
    while (j >= 0 && !";{}".includes(src[j])) j--;
    const head = src.slice(j + 1, open).replace(/^\s*(?:@\w+(?:\([^)]*\))?\s*)*/, "").trim();
    let close = -1, depth = 0;
    for (let k = open; k < src.length; k++) {
      const c = src[k];
      if (c === '"') { k++; while (k < src.length && src[k] !== '"') { if (src[k] === "\\") k++; k++; } continue; }
      if (c === "{") depth++; else if (c === "}") { depth--; if (depth === 0) { close = k; break; } }
    }
    for (const [kind, re] of HEADS) {
      const m = re.exec(head);
      if (m) return { kind, name: kind === "fn" || kind === "accept" || kind === "release" || kind === "on_failure" ? m[1] : m[1], args: kind === "fn" ? m[2] : kind === "accept" || kind === "release" || kind === "on_failure" ? m[1] : undefined, head, open, close };
    }
    return { kind: "block", head, open, close };
  });
}

const ind = "    ";
const lower = (s: string) => s.replace(/([a-z0-9])([A-Z])/g, "$1_$2").toLowerCase();
const offer = (label: string, gloss: string, snippet: string, present?: boolean): Offer => ({ label, gloss, snippet, present });
const hookOffers = (c: Here, main: boolean): Offer[] => {
  const h = (name: string, gloss: string, body: string) => offer(`${name}()`, gloss, `${name}() {\n${ind}${body}\n}`, c.has(new RegExp(`\\b${name}\\s*\\(\\s*\\)\\s*\\{`)));
  return [
    h("birth", "runs once at construction: acquire what the locus needs (open a socket, read a file)", "$0"),
    h("run", main ? "the program's steady state; return and the process ends after its children" : "the steady-state body, a loop until drained; return means ready", main ? "while !self.draining {\n${ind}${ind}std::time::sleep(100ms);\n${ind}}$0" : "while !self.draining {\n${ind}${ind}$0\n${ind}}"),
    h("drain", "shutdown began: stop taking new work, let in-flight work finish", "$0"),
    h("dissolve", "the last hook: release what birth acquired; memory is freed after", "$0"),
    offer("accept(c: T)", "a child arrives from a handle or a construction", "accept(c: ${1:Child}) {\n    $0\n}", c.has(/\baccept\s*\(/)),
    offer("release(c: T)", "an accepted child's run() ended: reclaim it (T becomes a flow)", "release(c: ${1:Child}) { }", c.has(/\brelease\s*\(/)),
    offer("on_failure(c: T, err)", "a child's structural failure: restart, quarantine or bubble it", "on_failure(c: ${1:Child}, err: ClosureViolation) {\n    restart(c);\n}", c.has(/\bon_failure\s*\(/)),
  ];
};
const memberOffers = (c: Here): Offer[] => [
  offer("params { }", "the fields the locus is born with; a field typed by a locus is a child", "params {\n    ${1:field}: ${2:Int} = ${3:0};\n}", c.has(/\bparams\s*(?::\s*inferred\s*)?\{/)),
  offer("bus { }", "which topics this locus subscribes to and publishes", "bus {\n    subscribe ${1:Topic} as ${2:on_topic};\n}", c.has(/\bbus\s*\{/)),
  offer("fn", "a method, called through self or a handle; an rpc row can expose it", "fn ${1:name}(${2:x: Int}) -> ${3:Int} {\n    $0\n}"),
  offer("fn … fallible(E)", "a method that may fail with a typed error", "fn ${1:name}(${2:x: Int}) -> ${3:Int} fallible(${4:Error}) {\n    $0\n}"),
  offer("@phase_effects", "effects allowed per lifecycle phase, above a hook", "@phase_effects(${1:birth}: {${2:alloc}})"),
  offer("@locality", "a cache-tier budget for this locus", "@locality(${1|L1,L2,L3,any|})"),
  offer("closure { }", "an invariant the runtime checks at an epoch; breaking it is structural failure", "closure ${1:name} {\n    ${2:self.a} ~~ ${3:self.b} within ${4:0.01d};\n    epoch ${5:tick};\n}", c.has(/\bclosure\s+\w+\s*\{/)),
  offer("contract { }", "what the locus exposes to its parent and consumes from it", "contract {\n    expose ${1:field};\n}", c.has(/\bcontract\s*\{/)),
  offer("capacity { }", "bounded storage slots the locus owns: pools and heaps", "capacity {\n    pool ${1:items} of ${2:Item};\n}", c.has(/\bcapacity\s*\{/)),
  offer("mode", "a named projection of the kernel: bulk, harmonic or resolution", "mode ${1|bulk,harmonic,resolution|}() -> ${2:Int} {\n    $0\n}", c.has(/\bmode\s+\w+/)),
  offer("birth_check", "a check after birth; failing it violates a closure", "birth_check { ${1:self.ready} } -> violate ${2:fuse};", c.has(/\bbirth_check\b/)),
];
const annotationOffers = (c: Here): Offer[] => {
  const f = c.locusFrame; const before = f ? c.src.slice(Math.max(0, f.open - 300), f.open) : "";
  return [
    offer("@sealed", "no reads of this locus's params from outside: the confinement a secret rests on", "@sealed", /@sealed\b[^{]*$/.test(before)),
    ...(["vec", "a growable vector", "hashmap", "a hash map keyed by a field (keyed_by)", "set", "a set", "ring_buffer", "a fixed ring", "lru_cache", "an LRU cache with a capacity", "heap", "a priority heap (ordered_by)"] as string[]).reduce<Offer[]>((acc, v, i, arr) => i % 2 ? acc : [...acc, offer(`@form(${v})`, `lower this locus to ${arr[i + 1]}`, `@form(${v})`, new RegExp(`@form\\(\\s*${v}\\b`).test(before))], []),
    offer(": serves P", "this locus implements a perspective's contract", ": serves ${1:Perspective}", /:\s*serves\b/.test(f?.head ?? "")),
    offer(": projection rich", "its projection class: rich, chunked or recognition", ": projection ${1|rich,chunked,recognition|}", /projection/.test(f?.head ?? "")),
  ];
};
const sendOffers = (c: Here): Offer[] => {
  const l = c.locus; const pubs = busRows(c.a ?? ({} as Artifact)).pubs;
  const mine = l ? [...new Set(pubs.filter((p) => ownerOf(p.fn) === l && !isGenerated(p.subject)).map((p) => p.subject))] : [];
  const declared = l ? [...c.body(c.locusFrame).matchAll(/\bpublish\s+([A-Za-z_]\w*)\s*;/g)].map((m) => m[1]) : [];
  const topics = [...new Set([...declared, ...mine])];
  return topics.length
    ? topics.map((t) => offer(`${t} <- …`, `send one ${t} frame; the topic's bound decides what a full queue does`, `${t} <- ${c.payloadOf(t) ?? "Payload"} { $1 }${c.has(new RegExp(`\\b${t}\\s*<-`), c.locusFrame) ? "" : ""};`))
    : [offer("Topic <- value", "send one frame on a topic this locus declares `publish` for", "${1:Topic} <- ${2:Payload} { $3 };")];
};
const stmtOffers = (c: Here): Offer[] => [
  ...sendOffers(c),
  offer("let", "an immutable binding", "let ${1:x} = ${2:value};"),
  offer("let mut", "a binding that may be reassigned", "let mut ${1:x} = ${2:value};"),
  offer("if / else", "a branch", "if ${1:cond} {\n    $0\n}"),
  offer("match", "a match over an enum, a value or a tuple", "match ${1:value} {\n    ${2:Variant} => { $0 }\n}"),
  offer("for in", "iterate a list, a range or a map", "for ${1:x} in ${2:items} {\n    $0\n}"),
  offer("or raise", "a fallible call: propagate the error to the caller (the caller must be fallible)", "${1:call}() or raise;"),
  offer("or discard", "a fallible call: drop the error and the value", "${1:call}() or discard;"),
  offer("or <fallback>", "a fallible call: use a value instead", "let ${1:x} = ${2:call}() or ${3:fallback};"),
  offer("println", "print a line", "println(\"$1\");"),
  offer("f-string", "a string with holes", "f\"${1:text} {${2:expr}}\""),
  offer("std::time::sleep", "block this thread for a duration", "std::time::sleep(${1:100ms});"),
  offer("self.field", "read or set this locus's own param", "self.${1:field}"),
  offer("terminate;", "end this locus's lifecycle from inside", "terminate;"),
  offer("yield;", "a cooperative yield point", "yield;"),
  offer("violate", "break a closure on purpose: the value channel reaches the structural one", "violate ${1:fuse};"),
  offer("reperspective", "re-point a perspective slot at another implementation, live", "reperspective self.${1:router} as ${2:RouterV2};"),
  offer("while", "a loop with a condition", "while ${1:cond} {\n    $0\n}"),
  offer("break / continue", "leave or skip a loop iteration", "${1|break,continue|};"),
  offer("or self.handler(err)", "a fallible call: hand the error to a handler of this locus (which may violate a closure)", "${1:call}() or self.${2:failed}(err);"),
  offer("return", "return a value", "return ${1:value};"),
  offer("or wait", "a fallible send or call: block until it goes through", "${1:Topic} <- ${2:value} or wait;"),
  offer("fail", "end this fallible fn with its error", "fail ${1:Error} { };"),
  offer("to_string", "a value as text", "to_string(${1:value})"),
  offer("std::log::info", "a structured log line", "std::log::info(\"${1:message}\");"),
  offer("std::json::parse", "parse JSON text", "let ${1:v} = std::json::parse(${2:text}) or raise;"),
  offer("std::io::fs::read_file", "read a whole file", "let ${1:bytes} = std::io::fs::read_file(\"${2:path}\") or raise;"),
  offer("std::str::", "text helpers", "std::str::${1:trim}(${2:s})"),
  offer("std::env::get", "an environment variable", "std::env::get(\"${1:NAME}\") or \"${2:default}\""),
  offer("std::time::now", "the wall clock", "std::time::now()"),
  offer("std::test::assert", "an assertion (in a test program)", "std::test::assert(${1:cond}, \"${2:what}\");"),
  offer("std::http::", "an HTTP request", "std::http::${1:get}(\"${2:url}\") or raise"),
  offer("std::metrics::", "a counter or gauge", "std::metrics::${1:counter}(\"${2:name}\")"),
];
const fnAnnotations: Offer[] = [
  offer("@effects", "what this fn may reach: none:, only:, does:, is:", "@effects(none: {${1:syscall}})"),
  offer("@effects(only:)", "the whole list of what it may reach", "@effects(only: {${1:alloc}})"),
  offer("ctx: std::api::Context", "a handler param: who is calling, through which door, with which role", "ctx: std::api::Context"),
  offer("@no_block", "assert it never blocks", "@no_block"),
  offer("@no_syscall", "assert it never reaches the OS", "@no_syscall"),
  offer("@deterministic", "no clock, randomness or environment", "@deterministic"),
  offer("@no_panic", "assert it never traps", "@no_panic"),
  offer("@no_recursion", "assert it never recurses", "@no_recursion"),
  offer("@budget", "a count bound on an effect class", "@budget(${1:syscall} <= ${2:1})"),
  offer("@bounded_by", "name what bounds this fn's growth", "@bounded_by(${1:input})"),
  offer("@unbounded", "own a growth the compiler flagged", "@unbounded"),
  offer("@hot", "a certified hot path", "@hot"),
  offer("@rpc", "mark a method callable from a surface", "@rpc"),
  offer("@secret param", "a parameter whose value must not leak", "@secret ${1:b}: Bytes"),
];
const claimOffers = (c: Here): Offer[] => {
  const one = c.topics.filter((t) => new Set(busRows(c.a!).pubs.filter((p) => p.subject === t.name || p.subject === t.subject).map((p) => ownerOf(p.fn))).size === 1);
  return [
    ...one.map((t) => offer(`one_writer: count publishers(topic ${t.name}) == 1`, "cardinality: exactly one locus publishes this topic (true today)", `one_writer_${lower(t.name)}: count publishers(topic ${t.name}) == 1;`, c.has(new RegExp(`publishers\\(topic ${t.name}\\)`)))),
    offer("require publishes", "something publishes this topic", "${1:has_writer}: require publishes(topic ${2:T});"),
    offer("require subscribes", "something subscribes to this topic", "${1:has_reader}: require subscribes(topic ${2:T});"),
    offer("forbid reaches", "nothing in SRC reaches DST (a locus, a group, an effect class)", "${1:no_io}: forbid reaches({${2:Src}}, effects(${3:syscall}));"),
    offer("bound", "a capability budget: at most N of C on paths from G", "${1:cheap}: bound ${2:syscall} <= ${3:1} on paths from {${4:Src}};"),
    offer("cover", "a bounded universal: every member of a group satisfies", "${1:all_sealed}: cover {${2:Vaults}} with sealed;"),
    offer("require sealed", "these loci are sealed", "${1:confined}: require sealed(all ${2:vaults});"),
    offer("group", "a named set of loci, fns or roles to claim over", "group ${1:Name} = { ${2:A}, ${3:B} };"),
    offer("adopt", "take a constitution as law here", "adopt ${1:Constitution};", c.has(/\badopt\b/)),
    offer("count subscribers", "cardinality: how many subscribe", "${1:quiet}: count subscribers(topic ${2:T}) == ${3:0};"),
    offer("only edges", "the boundary form: only these edges cross between two groups", "${1:boundary}: only edges ${2:planners} -> ${3:workers} { publish ${4:Plan}; };"),
    offer("require no_silent_loss", "no configured silent discard on these paths", "${1:money_is_safe}: require no_silent_loss(all ${2:money});"),
    offer("forbid … during", "a reachability claim scoped to a phase", "${1:quiet}: forbid reaches(${2:A}, ${3:B}) during ${4|birth,run,drain,dissolve|};"),
    offer("forbid … avoiding", "reachability that must pass through a gate", "${1:gated}: forbid reaches(${2:intake}, ${3:execute}) avoiding ${4:permission_gate};"),
    offer("group may_be_empty", "a group that may have no members", "group ${1:probes} = { } may_be_empty;"),
    offer("domain", "a data-plane vocabulary for claims", "domain ${1:wing} = { ${2:A}, ${3:B} };"),
  ];
};
const serveOffers = (c: Here): Offer[] => {
  const inv = c.seed?.inventory; const out: Offer[] = [];
  const mainC = c.mainContract;
  for (const s of inv?.surfaces ?? []) {
    const owners = [...new Set(s.members.map((m) => ownerOf(m.name)))];
    const recv = owners.map((o) => { const p = mainC?.params.find((pp) => pp.type === o); return `${o}: self.${p ? p.name : lower(o)}`; }).join(", ");
    const served = inv!.exposures.filter((e) => e.surface === s.name).map((e) => e.listener.transport || "hub");
    const has = (t: string) => served.includes(t);
    out.push(offer(`api::serve ${s.name} over unix`, `${s.members.length} member(s)${served.length ? ` · served over ${served.join(", ")}` : " · not served yet"}`, `let \${1:${lower(s.name)}_sock} = api::serve(${s.name}, unix::Rpc { path: "\${2:/tmp/${lower(s.name)}.sock}" }, as: "\${3:${lower(s.name)}}", receivers: { ${recv} }, bound: \${4:64}, on_full: refuse);`, has("unix")));
    out.push(offer(`api::serve ${s.name} over http`, "bearer tokens: needs a principals locus with fn principal(token: String) -> std::api::Principal", `let \${1:${lower(s.name)}_web} = api::serve(${s.name}, http::Rpc { bind: "\${2:127.0.0.1:8080}", codec: json, principals: self.\${3:tokens} }, as: "\${4:web}", receivers: { ${recv} }, bound: \${5:64}, on_full: refuse);`, has("http")));
    out.push(offer(`api::serve ${s.name} over grpc`, "protobuf from the same rows, chosen per request by content type", `let \${1:${lower(s.name)}_grpc} = api::serve(${s.name}, grpc::Rpc { bind: "\${2:127.0.0.1:8070}", codec: json, principals: self.\${3:tokens} }, as: "\${4:grpc}", receivers: { ${recv} }, bound: \${5:64}, on_full: refuse);`, has("grpc")));
    out.push(offer(`api::serve ${s.name} over http with roles and cors`, "a role source gates rows that require one; cors admits a browser origin", `let \${1:${lower(s.name)}_web} = api::serve(${s.name}, http::Rpc { bind: "\${2:127.0.0.1:8080}", codec: json, principals: self.\${3:tokens}, roles: self.\${4:roles}, cors: "\${5:http://localhost:5173}" }, as: "\${6:web}", receivers: { ${recv} }, bound: \${7:64}, on_full: refuse);`));
    out.push(offer(`api::serve ${s.name} over mcp`, "every member becomes an agent tool", `let \${1:${lower(s.name)}_agent} = api::serve(${s.name}, mcp::Rpc { bind: "\${2:127.0.0.1:8090}", principals: self.\${3:tokens} }, as: "\${4:agent}", receivers: { ${recv} }, bound: \${5:64}, on_full: refuse);`, has("mcp")));
  }
  return out;
};

const DOC = {
  lifecycle: "docs/src/services/lifecycle.md", bus: "docs/src/services/bus.md", failure: "docs/src/services/failure.md", conc: "docs/src/services/concurrency.md",
  parents: "docs/src/services/parents-children.md", claims: "docs/src/claims.md", api: "docs/src/services/build-an-api.md", multi: "docs/src/services/multi-binary.md",
  memory: "docs/src/systems/memory.md", persp: "docs/src/services/perspectives.md", modes: "docs/src/systems/modes.md", locus: "docs/src/everyday/locus-gently.md",
  fns: "docs/src/basics/functions.md", fallible: "docs/src/basics/fallible.md", records: "docs/src/everyday/records.md", projects: "spec/projects.md", units: "docs/src/units.md",
};

export const GUIDES: Record<string, Guide> = {
  top: {
    title: () => "top level",
    gloss: "A seed is the .hl files of one directory, read together. At the top level you declare types, topics, loci, surfaces, units and claims; one `main locus` is the entry and `fn main() { App { }; }` builds it.",
    doc: "docs/src/basics/first-program.md",
    rules: [
      "A topic shares one namespace with types and loci: name the channel for what happens (OrderPlaced), not the record.",
      "A topic's payload is a record (a type, a payload-carrying enum, or BytesView), never a bare Int or String.",
      "Everything top-level in an imported seed is visible under its alias; there is no export keyword.",
    ],
    offers: (c) => [
      offer("main locus", "the entry: its params are the tower, born in order", "main locus ${1:App} {\n    params {\n        ${2:child}: ${3:Locus} = ${3:Locus} { };\n    }\n    run() {\n        while !self.draining {\n            std::time::sleep(100ms);\n        }\n    }\n}\n\nfn main() {\n    ${1:App} { };\n}", /\bmain\s+locus\b/.test(c.src)),
      offer("locus", "a unit of state with a lifecycle, a region and a bus", "locus ${1:Name} {\n    params {\n        ${2:field}: ${3:Int} = ${4:0};\n    }\n    run() {\n        $0\n    }\n}"),
      offer("topic", "a typed channel with a wire subject", "topic ${1:Name} { payload: ${2:Type}; subject: \"${3:a.b}\"; }"),
      offer("type", "a record: named fields with defaults", "type ${1:Name} {\n    ${2:field}: ${3:Int} = ${4:0};\n}"),
      offer("enum", "a sum type; variants may carry payloads", "type ${1:Name} = enum { ${2:A}, ${3:B} };"),
      offer("fn", "a free function", "fn ${1:name}(${2:x: Int}) -> ${3:Int} {\n    $0\n}"),
      offer("api", "a surface: the rpc rows callers may reach", "api ${1:Name} {\n    rpc ${2:Locus::fn};\n}", /\bapi\s+\w+\s*\{/.test(c.src)),
      offer("role", "a role name callers may hold", "role ${1:operator};"),
      offer("unit / quantity", "a unit of measure and an amount in it", "unit ${1:cent};\ntype ${2:Money} = quantity Int in ${1:cent};"),
      offer("perspective", "a contract: bodyless methods a locus may serve", "perspective ${1:Name} {\n    fn ${2:method}(${3:x: Int}) -> ${4:Int};\n}"),
      offer("interface", "a structural interface: any locus with these methods satisfies it", "interface ${1:Name} {\n    fn ${2:method}(${3:x: Int}) -> ${4:Int};\n}"),
      offer("constitution", "a named claimset entrypoints adopt", "constitution ${1:Name} {\n    $0\n}"),
      offer("import", "another seed under a name", "import \"${1:../lib}\" as ${2:lib};"),
      offer("module", "a named block of declarations, reached as name::Decl", "module ${1:name} {\n    $0\n}"),
      offer("distinct", "an identity: an Int that is not a number", "type ${1:OrderId} = distinct Int;"),
      offer("point", "a position on a quantity's axis", "type ${1:Price} = point ${2:Tick};"),
      offer("bounded list type", "a list with a compile-time capacity", "type ${1:Batch} { items: bounded[${2:Int}; ${3:16}] = []; }"),
      offer("fn … fallible(E)", "a free fn that may fail", "fn ${1:name}(${2:x: Int}) -> ${3:Int} fallible(${4:Error}) {\n    $0\n}"),
      offer("@ffi fn", "a C function the program calls", "@ffi(\"c\")\nfn ${1:name}(${2:x: Int}) -> ${3:Int};"),
      offer("@export fn", "a fn the host may call (WebAssembly)", "@export\nfn ${1:name}(${2:x: Int}) -> ${3:Int} {\n    $0\n}"),
      offer("target wasm", "build for the browser", "target wasm { }"),
      offer("group", "a named set to claim over", "group ${1:Name} = { ${2:A}, ${3:B} };"),
      offer("domain", "a data-plane vocabulary: which loci count for a claim", "domain ${1:wing} = { ${2:A}, ${3:B} };"),
      offer("const", "a compile-time constant", "const ${1:NAME}: ${2:Int} = ${3:0};"),
      offer("role includes", "a role that implies another", "role ${1:editor} includes ${2:reader};"),
      offer("constitution extends", "a constitution built on another", "constitution ${1:Dev} extends ${2:Core} {\n    $0\n}"),
      offer("scalar with range / round", "a quantity held to a range with a rounding policy", "type ${1:Ledger} = ${2:Money} { range: ${3:0..1_000_000}; round: ${4|half_even,half_up,floor,ceil,trunc,clamp,wrap|}; }"),
      offer("point with origin", "a point whose axis starts somewhere", "type ${1:Epoch} = point ${2:Duration} { origin: ${3:0 ns}; }"),
      offer("ring_layout", "a foreign shared-memory ring's header and record layout", "ring_layout ${1:ForeignRing} {\n    magic ${2:0x52494E47464D5431};\n    version 1 at 8 : u32;\n    buffer_size at 12 : u32;\n    data_at 128;\n}"),
      offer("effect", "an effect class of your own", "effect ${1:money};"),
      offer("fn main", "builds the main locus", "fn main() {\n    ${1:App} { };\n}", /\bfn\s+main\s*\(/.test(c.src)),
    ],
    derived: (c) => {
      const out: Node[] = []; const a = c.a; if (!a) return [{ label: "no checked artifact yet: save to check", icon: "info" }];
      const main = c.mainContract;
      out.push(main ? { label: `entry ${main.locus}`, description: `${c.userLoci.length} loci · ${c.topics.length} topics · verdict ${a.verdict}`, icon: "home" } : { label: "no main locus: a library seed, or one not yet written", description: "a main locus is the entry; its params are the tower", icon: "warning", tone: "warn" });
      const inv = c.seed?.inventory;
      for (const s of inv?.surfaces ?? []) if (!inv!.exposures.some((e) => e.surface === s.name)) out.push({ label: `api ${s.name} is declared but nothing serves it`, description: "serve it from the main locus's run()", icon: "warning", tone: "warn", command: { command: "hale.serveSurface", title: "Serve", arguments: [s.name] } });
      const { pubs, subs } = busRows(a);
      for (const t of c.topics) {
        const p = pubs.some((x) => x.subject === t.name || x.subject === t.subject), s = subs.some((x) => x.subject === t.name || x.subject === t.subject);
        if (!p || !s) out.push({ label: `topic ${t.name} is one-sided`, description: `${p ? "published" : "nothing publishes it"} · ${s ? "subscribed" : "nothing subscribes"}`, icon: "broadcast", tone: "warn" });
      }
      const inst = new Set((a.contracts ?? []).filter((x) => x.instances?.length).map((x) => x.locus));
      for (const l of c.userLoci) if (!inst.has(l) && main && l !== main.locus) out.push({ label: `locus ${l} is never born`, description: "no param of the tower holds one", icon: "symbol-class", tone: "warn" });
      if (main && !(a.claims ?? []).length) out.push({ label: "no claims yet", description: "a claims { } block on the main locus states laws the compiler checks", icon: "law" });
      return out;
    },
  },
  main_locus: {
    title: (f) => `main locus ${f.name}`,
    gloss: "The main locus is the program. Its params are the tower: each child is born in order, top to bottom, with its own region; the process ends when run() returns and the children have drained. Placement, bindings, topology and claims live only here.",
    doc: DOC.parents,
    rules: [
      "Children are born in param order; a child whose run() never returns blocks every later sibling's birth unless it is placed pinned or on a pool.",
      "Anything unplaced runs cooperative on the main thread; placement { } moves a child to its own thread or a pool.",
      "A run() loop should read self.draining, or Ctrl-C waits the grace period.",
      "At teardown pinned workers are joined and drained before their sibling subscribers dissolve.",
    ],
    offers: (c) => [
      ...memberOffers(c).slice(0, 2),
      offer("placement { }", "where each child runs: pinned(core = N) or cooperative(pool = X)", "placement {\n    ${1:child}: pinned(core = ${2:1});\n}", c.has(/\bplacement\s*\{/)),
      offer("bindings { }", "a topic's transport out of the process: unix, shm_ring, a hub", "bindings {\n    ${1:Topic}: unix(\"${2:/tmp/topic.sock}\");\n}", c.has(/\bbindings\s*\{/)),
      offer("claims { }", "laws the compiler checks on this program", "claims {\n    ${1:one_writer}: count publishers(topic ${2:T}) == 1;\n}", c.has(/\bclaims\s*\{/)),
      offer("topology { }", "the machine: nodes, L3 domains, reserved cores, named for placement", "topology {\n    reserve cores 0..2;\n    node 0 {\n        l3 ${1:fast} { cores ${2:4..8}; }\n    }\n}", c.has(/\btopology\s*\{/)),
      ...hookOffers(c, true),
      ...memberOffers(c).slice(2),
    ],
    derived: (c) => {
      const out: Node[] = []; const a = c.a; const main = c.contract(c.locus); if (!a || !main) return [{ label: "not checked yet, or this is not the entry the compiler sees", icon: "info" }];
      const children = main.params.filter((p) => !isGenerated(p.name) && c.userLoci.includes(p.type));
      out.push({ label: `tower: ${children.length} child(ren)`, description: children.map((p) => p.name).join(", ") || "no child loci in params", icon: "type-hierarchy", expanded: true, children: children.map((p) => { const inst = (a.contracts.find((x) => x.locus === p.type)?.instances ?? []).find((i) => i.path === `${main.locus}.${p.name}`); const blocks = (a.effects[`${p.type}::run`] ?? []).includes("block"); return { label: `${p.name}: ${p.type}`, description: `${inst?.domain ?? "main"}${blocks && (inst?.domain ?? "main") === "main" ? " · its run() blocks: pin it or later siblings wait" : ""}`, icon: inst?.domain.startsWith("pinned") ? "pinned" : "symbol-class", tone: blocks && (inst?.domain ?? "main") === "main" ? "warn" : undefined }; }) });
      const inv = c.seed?.inventory;
      if (inv?.surfaces.length) out.push({ label: `surfaces: ${inv.surfaces.length}`, description: inv.surfaces.map((s) => `${s.name} ${inv.exposures.some((e) => e.surface === s.name) ? "served" : "NOT served"}`).join(", "), icon: "plug", tone: inv.surfaces.some((s) => !inv.exposures.some((e) => e.surface === s.name)) ? "warn" : undefined });
      const bound = new Set((a.bindings ?? []).map((b) => String(b["topic"] ?? b["subject"] ?? "")));
      if (c.topics.length) out.push({ label: `topics: ${c.topics.length}`, description: `${c.topics.filter((t) => bound.has(t.name) || bound.has(t.subject)).length} bound out of the process`, icon: "broadcast" });
      const { hooks } = phasesOf(a, main.locus);
      out.push({ label: `hooks: ${hooks.join(" → ") || "none"}`, description: HOOKS.filter((h) => !hooks.includes(h) && h !== "accept" && h !== "release" && h !== "on_failure").map((h) => `no ${h}`).join(", "), icon: "symbol-event" });
      out.push({ label: `claims: ${(a.claims ?? []).length}`, description: a.verdict ? `verdict ${a.verdict}` : "", icon: "law" });
      return out;
    },
  },
  locus: {
    title: (f) => `locus ${f.name}`,
    gloss: "A locus is a unit of state with its own region of memory, a lifecycle (birth, run, drain, dissolve) and a place on the bus. It is born by a parent that holds it in a param, lives on its parent's thread unless placed, and is freed wholesale when it dissolves.",
    doc: DOC.locus,
    rules: [
      "You write only the hooks you need; the rest are no-ops. A lifecycle body returns no value.",
      "Params are not encapsulated by default: a parent may read self.child.field; @sealed forbids it.",
      "A handler on the main thread must not block; put blocking I/O on a `where async_io` pool or pin the locus.",
      "A locus cannot hold one of itself.",
    ],
    offers: (c) => [...memberOffers(c), ...hookOffers(c, false), ...annotationOffers(c)],
    derived: (c) => {
      const a = c.a; const l = c.locus; const ct = c.contract(); if (!a || !l || !ct) return [{ label: "not in the checked artifact yet: save to check", icon: "info" }];
      const { hooks, modes, methods } = phasesOf(a, l);
      const { pubs, subs } = busRows(a);
      const inst = ct.instances ?? [];
      const sup = (a.supervision ?? []).filter((s) => s.child === l);
      const eff = new Set<string>(); for (const [fn, cls] of Object.entries(a.effects ?? {})) if (ownerOf(fn) === l) for (const e of cls) eff.add(e);
      return [
        { label: inst.length ? `${inst.length} instance(s)` : "no standing instance", description: inst.map((i) => `${i.path} (${i.domain})`).join(", ") || "no param of the tower holds one: spawned per use, or never born", icon: inst.length ? "symbol-class" : "warning", tone: inst.length ? undefined : "warn" },
        { label: `hooks: ${hooks.join(" → ") || "none"}`, description: modes.length ? `modes ${modes.join(", ")}` : `${methods.length} method(s)`, icon: "symbol-event" },
        { label: `bus: ${subs.filter((x) => x.locus === l).length} subscription(s), ${new Set(pubs.filter((x) => ownerOf(x.fn) === l && !isGenerated(x.subject)).map((x) => x.subject)).size} topic(s) published`, description: [...subs.filter((x) => x.locus === l).map((x) => `← ${x.subject}`), ...new Set(pubs.filter((x) => ownerOf(x.fn) === l && !isGenerated(x.subject)).map((x) => `→ ${x.subject}`))].join(" "), icon: "broadcast" },
        { label: `effects: ${[...eff].filter((e) => e !== "alloc").sort().join(", ") || "none beyond alloc"}`, description: eff.has("block") ? "blocks: fine pinned or on an async_io pool, not as a main-thread handler" : "", icon: "symbol-misc", tone: eff.has("block") ? "warn" : undefined },
        { label: sup.length ? `supervised by ${sup.map((s) => `${s.locus} (${s.ops.join("/")})`).join(", ")}` : "no supervisor handles its failure", description: sup.length ? "" : "a parent's on_failure(c: " + l + ", err) would restart, quarantine or bubble", icon: "shield" },
        ...(ct.sealed ? [{ label: "@sealed", description: "its params are read only from inside", icon: "lock" } as Node] : []),
      ];
    },
  },
  perspective: {
    title: (f) => `perspective ${f.name}`,
    gloss: "A perspective is a contract: a set of bodyless method signatures. A locus declares `: serves P` to implement it; a holder's param typed `perspective(P)` is one program-wide slot that `reperspective` can re-point at another implementation while the program runs.",
    doc: DOC.persp,
    rules: ["One slot, not many handles: every holder calls through the same binding.", "Prefer an interface when you only need structural typing without live rebinding."],
    offers: () => [offer("fn signature", "a method every server must implement", "fn ${1:method}(${2:x: Int}) -> ${3:Int};"), offer("params { }", "params the contract requires", "params { ${1:field}: ${2:Int}; }"), offer("bus { }", "a bus surface the contract declares", "bus { publish ${1:Topic}; }"), offer("stable_when { }", "when a server's value may be relied on", "stable_when {\n    return ${1:self.ready};\n}"), offer("serialize_as", "how it crosses a boundary", "serialize_as ${1:Kernel};")],
    derived: (c) => { const f = c.frame; const servers = [...c.src.matchAll(new RegExp(`locus\\s+(\\w+)\\s*:[^{]*serves\\s+${f?.name}\\b`, "g"))].map((m) => m[1]); return [{ label: servers.length ? `served by ${servers.join(", ")}` : "no locus serves it yet", description: servers.length ? "" : "locus Impl : serves " + f?.name, icon: servers.length ? "symbol-class" : "warning", tone: servers.length ? undefined : "warn" }]; },
  },
  interface: {
    title: (f) => `interface ${f.name}`,
    gloss: "A structural interface: any locus whose method set covers these signatures satisfies it, with no impl declaration. Use it as a param, return or field type.",
    doc: "spec/tokens.md#declaration-keywords-hard",
    rules: ["Satisfaction is structural: the method names and signatures must match."],
    offers: () => [offer("fn signature", "a required method", "fn ${1:method}(${2:x: Int}) -> ${3:Int};")],
    derived: () => [],
  },
  params: {
    title: () => "params",
    gloss: "The fields a locus is born with, each with a default. A field typed by a locus is a child: it is built with its parent and torn down with it. In the main locus the params are the whole tower.",
    doc: DOC.parents,
    rules: ["Children are born in the order written.", "A default is required; `Locus { }` builds a child with its own defaults.", "A field named like a secret in a String or Bytes is worth sealing the locus for."],
    offers: (c) => [
      offer("field", "a value with a default", "${1:field}: ${2:Int} = ${3:0};"),
      offer("child locus", "a child of this locus, born here", "${1:child}: ${2:Locus} = ${2:Locus} { };"),
      offer("perspective slot", "a handle typed by a contract", "${1:router}: perspective(${2:Router}) = ${3:RouterV1} { };"),
      ...(c.isMain ? [offer("tokens: Tokens", "a principals source for HTTP/MCP serving", "tokens: ${1:Tokens} = ${1:Tokens} { };"), offer("hub: ws::Hub", "a WebSocket hub that streams topics to browsers", "hub: ws::Hub = ws::Hub { bind: \"127.0.0.1:8081\", principals: self.tokens, as: \"stream\" };"), offer("door: std::api::test::Rpc", "an in-process transport a test calls a surface through", "door: std::api::test::Rpc = std::api::test::Rpc { principals: self.tokens, roles: self.roles };"), offer("roles: std::api::StaticRoles", "who holds a role, from LOTUS_API_ROLES", "roles: std::api::StaticRoles = std::api::StaticRoles { known: \"${1:operator}\" };")] : []),
    ],
    derived: (c) => { const ct = c.contract(); if (!ct) return []; return ct.params.filter((p) => !isGenerated(p.name)).map((p) => ({ label: `${p.name}: ${p.type}`, description: c.userLoci.includes(p.type) ? "a child locus" : "", icon: c.userLoci.includes(p.type) ? "symbol-class" : "symbol-field" })); },
  },
  contract: {
    title: () => "contract",
    gloss: "What a locus exposes to its parent and consumes from it, by name. The parent reads an exposed member through its handle; a consumed one is supplied by the parent.",
    doc: "spec/tokens.md#contract-keywords-contextual",
    rules: ["Only exposed members are the parent's to read when the locus is sealed."],
    offers: () => [offer("expose", "a member the parent may read", "expose ${1:field};"), offer("consume", "a member the parent supplies", "consume ${1:value}: ${2:Int};")],
    derived: () => [],
  },
  bus: {
    title: () => "bus",
    gloss: "The bus block says which topics this locus listens to and which it sends. `subscribe T as handler` delivers every T frame to `fn handler(x: Payload)` on this locus; `publish T` lets a method send with `T <- value`. Neither side names the other: the runtime wires delivery.",
    doc: DOC.bus,
    rules: [
      "A handler takes the payload type and runs on the locus's own thread; on the main thread it must not block.",
      "A keyed subscription (`where key == self.id`) hears only frames whose keyed_by field matches.",
      "`bounded(N, drop_old|drop_new)` is this subscriber's private coping bound; the topic's own bound is the publisher's contract.",
      "Frames published before this locus is built wait for it, in order, within its bound.",
    ],
    offers: (c) => {
      const body = c.body(); const out: Offer[] = [];
      for (const t of c.topics) {
        out.push(offer(`subscribe ${t.name}`, `${t.subject} · payload ${t.shape}`, `subscribe ${t.name} as \${1:on_${lower(t.name)}};`, new RegExp(`\\bsubscribe\\s+${t.name}\\b`).test(body)));
        out.push(offer(`publish ${t.name}`, `then send with ${t.name} <- …`, `publish ${t.name};`, new RegExp(`\\bpublish\\s+${t.name}\\b`).test(body)));
      }
      if (!c.topics.length) out.push(offer("subscribe Topic as handler", "declare a topic at the top level first", "subscribe ${1:Topic} as ${2:on_topic};"), offer("publish Topic", "declare a topic at the top level first", "publish ${1:Topic};"));
      out.push(offer("keyed subscribe", "only frames whose key matches this locus", "subscribe ${1:Topic} as ${2:on_topic} where key == self.${3:id};"));
      out.push(offer("bounded subscribe", "keep the newest N when this consumer falls behind", "subscribe ${1:Topic} as ${2:on_topic} bounded(${3:64}, ${4|drop_old,drop_new|});"));
      out.push(offer("literal subject", "a subject no topic declares, typed here", "subscribe \"${1:a.b}\" as ${2:on_frame} of type ${3:Payload};"));
      return out;
    },
    derived: (c) => {
      const l = c.locus; const a = c.a; if (!a || !l) return [];
      const body = c.body(); const out: Node[] = [];
      for (const m of body.matchAll(/\bsubscribe\s+([A-Za-z_"][\w.":]*)\s+as\s+(\w+)/g)) {
        const hasFn = new RegExp(`\\bfn\\s+${m[2]}\\s*\\(`).test(c.body(c.locusFrame));
        out.push({ label: `subscribe ${m[1]} as ${m[2]}`, description: hasFn ? `fn ${m[2]} exists` : `fn ${m[2]}(x: ${c.payloadOf(m[1]) ?? "Payload"}) is missing`, icon: hasFn ? "pass" : "warning", tone: hasFn ? "ok" : "warn" });
      }
      for (const m of body.matchAll(/\bpublish\s+(\w+)\s*;/g)) {
        const sends = new RegExp(`\\b${m[1]}\\s*<-`).test(c.body(c.locusFrame));
        out.push({ label: `publish ${m[1]}`, description: sends ? "sent somewhere in this locus" : `no ${m[1]} <- … send site in this locus yet`, icon: sends ? "pass" : "circle-outline", tone: sends ? "ok" : "warn" });
      }
      const { subs } = busRows(a);
      for (const t of c.topics) if (!subs.some((s) => s.subject === t.name || s.subject === t.subject)) out.push({ label: `${t.name} has no subscriber in this seed`, description: "subscribe it here, or it is read by another binary", icon: "broadcast" });
      return out;
    },
  },
  capacity: {
    title: () => "capacity",
    gloss: "Bounded storage this locus owns: a `pool` of many T, a `heap` ordered by a key. Slots are sized hints and lifetime law: what lives in a slot dies with the locus.",
    doc: DOC.memory + "#bounded-storage-capacity-slots",
    rules: ["`indexed_by field` names the hashmap key of a @form(hashmap) cell type.", "`as_parent_for Child` shares the slot's allocator with a child's same-named slot."],
    offers: () => [offer("pool", "many T", "pool ${1:items} of ${2:Item};"), offer("pool indexed_by", "a keyed pool", "pool ${1:entries} of ${2:Entry} indexed_by ${3:key};"), offer("heap", "T ordered by a key", "heap ${1:jobs} of ${2:Job} ordered_by min ${3:priority};"), offer("as_parent_for", "share this slot's allocator with a child's same-named slot", "pool ${1:items} of ${2:Item} as_parent_for ${3:Child};")],
    derived: () => [],
  },
  closure: {
    title: (f) => `closure ${f.name}`,
    gloss: "An invariant the locus promises to keep, checked by the runtime at the epoch you name. Silent while it holds; when it breaks, a ClosureViolation goes to the parent's on_failure. `violate name;` breaks it on purpose, which is how a value error becomes a structural one.",
    doc: DOC.failure + "#declaring-an-invariant-closure",
    rules: ["`~~ within` is approximate equality with tolerance.", "epoch tick checks every loop iteration; birth, dissolve, duration(1min) and inline (only when violated by hand) are the others.", "persists_through / resets_on say what a restart does to the running totals."],
    offers: () => [offer("assertion", "what must hold", "${1:self.a} ~~ ${2:self.b} within ${3:0.01d};"), offer("captures:", "the fields the closure reads", "captures: ${1:field};"), offer("epoch", "when it is checked", "epoch ${1|tick,birth,dissolve,inline|};"), offer("epoch explicit", "checked only when asked", "epoch explicit;"), offer("epoch duration", "checked on a period", "epoch duration ${1:1min};"), offer("resets_on", "which recoveries reset the totals", "resets_on(${1:restart});")],
    derived: (c) => { const caps = [...c.body().matchAll(/captures\s*:\s*([^;]+);/g)].flatMap((m) => m[1].split(",").map((s) => s.trim())); const ct = c.contract(); return caps.map((f) => ({ label: `captures ${f}`, description: ct?.params.some((p) => p.name === f) ? "a param of this locus" : "no such param", icon: ct?.params.some((p) => p.name === f) ? "pass" : "warning", tone: ct?.params.some((p) => p.name === f) ? "ok" : "warn" })); },
  },
  claims: {
    title: () => "claims",
    gloss: "Laws the compiler checks about the whole program, with zero run-time cost: who publishes what, what reaches what, how many, what is sealed. A failing claim is a check error with a witness path.",
    doc: DOC.claims,
    rules: ["Claims live on the main locus (or in a constitution it adopts).", "A claim names its subject by locus, topic, group or effect class; declare a group first to claim over a set.", "An environment may add law, never drop it."],
    offers: claimOffers,
    derived: (c) => { const a = c.a; if (!a) return []; const rows = a.law?.rows ?? []; return (a.claims ?? []).map((cl) => { const v = rows.find((r) => r.name === cl.name)?.verdict ?? cl.result; return { label: cl.name, description: `${v} · ${cl.form}`, icon: v === "holds" ? "pass" : "error", tone: v === "holds" ? "ok" : "error" } as Node; }); },
  },
  constitution: {
    title: (f) => `constitution ${f.name}`,
    gloss: "A named claimset shared across entrypoints: each main adopts it (`claims { adopt Name; }`), and hale.toml's environments bind one per deployment target.",
    doc: "docs/src/constitutions.md",
    rules: ["`extends` builds on another constitution; an adopting entrypoint must declare every group the constitution names."],
    offers: claimOffers,
    derived: (c) => { const f = c.frame; const adopters = [...c.src.matchAll(new RegExp(`adopt\\s+${f?.name}\\s*;`, "g"))].length; return [{ label: adopters ? `adopted ${adopters} time(s) in this file` : "adopted by no entrypoint in this file", icon: adopters ? "pass" : "info" }]; },
  },
  placement: {
    title: () => "placement",
    gloss: "Where each child of main runs. Unlisted children share the main thread cooperatively; `pinned` gives one its own OS thread (optionally on a core, a core set, a NUMA node or an L3 domain), `cooperative(pool = X)` puts it on a named pool's worker.",
    doc: DOC.conc + "#placement-lives-on-main",
    rules: ["A child whose run() blocks belongs pinned or on a pool, or later siblings never get born.", "The bus crosses threads for you: a pinned child's handlers run on its thread.", "Core affinity is best-effort and Linux-only; the program behaves the same elsewhere.", "replicas = K runs K copies, one per thread."],
    offers: (c) => { const main = c.mainContract; const body = c.body(); return (main?.params ?? []).filter((p) => !isGenerated(p.name) && c.userLoci.includes(p.type)).flatMap((p) => [offer(`${p.name}: pinned`, `${p.type} on its own thread`, `${p.name}: pinned(core = \${1:1});`, new RegExp(`\\b${p.name}\\s*:`).test(body)), offer(`${p.name}: cooperative`, `${p.type} on a pool`, `${p.name}: cooperative(pool = \${1:work});`, new RegExp(`\\b${p.name}\\s*:`).test(body))]).concat([offer("async_io pool", "a pool whose handlers may block on I/O", "${1:child}: cooperative(pool = ${2:io} where async_io);"), offer("replicas", "K copies, one per thread", "${1:child}: pinned(cores = ${2:4..8}, replicas = ${3:4});"), offer("pinned by node / l3", "pin into a NUMA node or an L3 domain the topology names", "${1:child}: pinned(${2|node,l3|} = ${3:0});")]); },
    derived: (c) => { const a = c.a; const main = c.mainContract; if (!a || !main) return []; return main.params.filter((p) => !isGenerated(p.name) && c.userLoci.includes(p.type)).map((p) => { const inst = (a.contracts.find((x) => x.locus === p.type)?.instances ?? []).find((i) => i.path === `${main.locus}.${p.name}`); const blocks = (a.effects[`${p.type}::run`] ?? []).includes("block"); const dom = inst?.domain ?? "main"; return { label: `${p.name}: ${dom}`, description: blocks && dom === "main" ? "its run() blocks on the main thread" : "", icon: dom.startsWith("pinned") ? "pinned" : "symbol-class", tone: blocks && dom === "main" ? "warn" : undefined } as Node; }); },
  },
  bindings: {
    title: () => "bindings",
    gloss: "A topic's way out of the process. A unix socket or a shared-memory ring carries its frames to another binary; a row naming a ws::Hub param streams it to browsers. Without a codec the wire speaks Hale's internal format; `codec(MyCodec { })` makes it readable elsewhere.",
    doc: DOC.multi,
    rules: ["One binding per topic.", "A shm_ring must declare on_overflow: fail, drop or block.", "A codec locus has fn encode(v: T) -> Bytes and fn decode(b: Bytes) -> T, both pure."],
    offers: (c) => { const body = c.body(); return c.topics.flatMap((t) => [offer(`${t.name}: unix(…)`, "a unix socket to another binary", `${t.name}: unix("\${1:/tmp/${lower(t.name)}.sock}");`, new RegExp(`\\b${t.name}\\s*:`).test(body)), offer(`${t.name}: shm_ring(…)`, "a zero-copy shared-memory ring", `${t.name}: shm_ring("\${1:/${lower(t.name)}}", slot_count: \${2:1024}, on_overflow: \${3|drop,fail,block|});`, new RegExp(`\\b${t.name}\\s*:`).test(body)), offer(`${t.name}: self.hub`, "stream it over the WebSocket hub param", `${t.name}: self.\${1:hub} requires: [\${2:reader}], bound: \${3:64}, on_full: drop_old;`, new RegExp(`\\b${t.name}\\s*:\\s*self\\.`).test(body))]).concat([offer("codec(…)", "append to a row: a JSON codec another language can read", " codec(${1:TopicJsonCodec} { })"), offer("role: listen | connect", "which end of a unix binding this process is, when one binary does both", "${1:Topic}: unix(\"${2:/tmp/topic.sock}\", role: ${3|listen,connect|});"), offer("shm_ring where zero_copy", "a foreign ring read in place by a declared layout", "${1:Topic}: shm_ring(\"${2:/foreign.ticks}\", on_overflow: drop, layout: ${3:ForeignRing}) where zero_copy;")]); },
    derived: (c) => (c.a?.bindings ?? []).map((b) => ({ label: String(b["topic"] ?? b["subject"] ?? "binding"), description: Object.entries(b).filter(([k]) => !["topic", "subject"].includes(k)).map(([k, v]) => `${k}=${typeof v === "string" ? v : JSON.stringify(v)}`).join(" "), icon: "plug" })),
  },
  topology: {
    title: () => "topology",
    gloss: "The host's core partition, described once so placement can say `pinned(l3 = fast)` instead of memorizing core numbers.",
    doc: DOC.conc + "#describing-the-machine-topology--",
    rules: ["reserve cores leaves them to the OS.", "node N { l3 name { cores a..b; } } names a cache domain."],
    offers: () => [offer("reserve cores", "hands-off cores", "reserve cores ${1:0..2};"), offer("node { l3 { } }", "a NUMA node with an L3 domain", "node ${1:0} {\n    l3 ${2:fast} { cores ${3:4..8}; }\n}")],
    derived: () => [],
  },
  api: {
    title: (f) => `api ${f.name}`,
    gloss: "A surface: the rpc rows callers may reach, each a locus method. The compiler derives its JSON codec, OpenAPI, JSON Schema, MCP tools and a digest from the rows; the main locus serves it over unix, HTTP, gRPC or MCP with api::serve.",
    doc: DOC.api,
    rules: ["`requires: [role]` on a row gates it by a role the caller holds.", "A handler may take `ctx: std::api::Context` to learn who is calling and through which door.", "Request and response types must be codec-able: records of Int, Float, Bool, String, nested records, bounded lists, Time; not Decimal or Bytes."],
    offers: (c) => { const body = c.body(); const out: Offer[] = []; for (const ct of c.a?.contracts ?? []) { if (isGenerated(ct.locus)) continue; for (const m of ct.methods) { if (isGenerated(m) || HOOKS.includes(m as typeof HOOKS[number])) continue; out.push(offer(`rpc ${ct.locus}::${m}`, "expose this method", `rpc ${ct.locus}::${m};`, new RegExp(`\\brpc\\s+${ct.locus}::${m}\\b`).test(body))); } } out.push(offer("rpc … requires: [role]", "a row only a role may call", "rpc ${1:Locus::fn} requires: [${2:operator}];")); return out; },
    derived: (c) => { const inv = c.seed?.inventory; const s = inv?.surfaces.find((x) => x.name === c.frame?.name); if (!s) return [{ label: "not in the inventory yet: save to check", icon: "info" }]; const ex = inv!.exposures.filter((e) => e.surface === s.name); return [{ label: `${s.members.length} member(s) · digest ${s.digest}`, icon: "symbol-interface" }, ex.length ? { label: `served as ${ex.map((e) => `${e.name} (${e.listener.transport || "hub"})`).join(", ")}`, icon: "radio-tower", tone: "ok" } : { label: "not served: nothing listens", description: "api::serve it in the main locus's run()", icon: "warning", tone: "warn", command: { command: "hale.serveSurface", title: "Serve", arguments: [s.name] } }]; },
  },
  topic: {
    title: (f) => `topic ${f.name}`,
    gloss: "A typed channel. `payload` is the record each frame carries, `subject` its wire name; `keyed_by` picks a payload field so subscribers can listen for one key.",
    doc: DOC.bus,
    rules: ["The payload is a record (a type, a payload-carrying enum, or BytesView), not a bare Int or String.", "A topic shares its namespace with types and loci."],
    offers: (c) => [offer("payload:", "the frame's record type", "payload: ${1:Type};", c.has(/\bpayload\s*:/)), offer("subject:", "the wire name", "subject: \"${1:a.b}\";", c.has(/\bsubject\s*:/)), offer("keyed_by", "route by a payload field", "keyed_by ${1:field};", c.has(/\bkeyed_by\b/))],
    derived: (c) => { const a = c.a; const t = a?.topics.find((x) => x.name === c.frame?.name); if (!a || !t) return []; const { pubs, subs } = busRows(a); return [{ label: `${pubs.filter((x) => x.subject === t.name || x.subject === t.subject).length} publisher(s) → ${subs.filter((x) => x.subject === t.name || x.subject === t.subject).length} subscriber(s)`, description: `payload ${t.shape}`, icon: "broadcast" }]; },
  },
  birth: { title: () => "birth()", gloss: "Runs once at construction, after the params are set: acquire what the locus needs. By the time it returns the locus is live and its subscriptions hear frames.", doc: DOC.lifecycle + "#the-five-phases", rules: ["Returns no value; a bare return ends it early.", "A failed birth_check is a ClosureViolation the parent handles."], offers: stmtOffers, derived: () => [] },
  run: {
    title: () => "run()",
    gloss: "The steady state. For a service it is a loop that reads self.draining; returning means ready (for a child) or done (for main, after its children drain). A flow child with no run is released as soon as birth completes.",
    doc: DOC.lifecycle + "#the-five-phases",
    rules: ["A run() that never reads self.draining holds the process past Ctrl-C until the grace period.", "A blocking run() on the main thread stops later siblings from being born: place the locus pinned or on a pool."],
    offers: (c) => [...(c.isMain ? serveOffers(c) : []), offer("while !self.draining", "the service loop", "while !self.draining {\n    ${1:std::time::sleep(100ms);}\n}", c.has(/self\.draining/)), ...stmtOffers(c)],
    derived: (c) => { const out: Node[] = []; if (!c.has(/self\.draining/)) out.push({ label: "does not read self.draining", description: "a loop here holds the process open past Ctrl-C until the grace expires", icon: "warning", tone: "warn" }); const l = c.locus; const eff = l ? c.a?.effects[`${l}::run`] ?? [] : []; if (eff.length) out.push({ label: `effects: ${eff.filter((e) => e !== "alloc").join(", ") || "alloc only"}`, icon: "symbol-misc" }); return out; },
  },
  drain: { title: () => "drain()", gloss: "Shutdown began: stop accepting new work and let in-flight work finish. The bus is quiesced after it.", doc: DOC.lifecycle + "#shutdown-cascades", rules: ["Children drain before their parent dissolves."], offers: stmtOffers, derived: () => [] },
  dissolve: { title: () => "dissolve()", gloss: "The last hook: release what birth acquired. The region is freed wholesale right after, so nothing needs freeing by hand.", doc: DOC.lifecycle + "#when-does-a-locus-dissolve", rules: ["A publish during dissolve still reaches live subscribers."], offers: stmtOffers, derived: () => [] },
  accept: { title: (f) => `accept(${f.args})`, gloss: "A child arrives: from a handle the parent was given, or a construction. The child is tracked by this locus from here; release(c: T) reclaims it when its run() ends, otherwise it lives until the parent dissolves.", doc: DOC.parents, rules: ["Without release, accepted children are residents: on a daemon, unbounded growth."], offers: (c) => [offer("release(c: T)", "reclaim accepted children when they finish", `release(c: \${1:${c.frame?.args?.split(":")[1]?.trim() ?? "Child"}}) { }`), ...stmtOffers(c)], derived: () => [] },
  release: { title: (f) => `release(${f.args})`, gloss: "An accepted child's run() ended: it is reclaimed. Declaring release for T makes every T a flow, program-wide.", doc: "spec/semantics.md", rules: [], offers: stmtOffers, derived: () => [] },
  on_failure: {
    title: (f) => `on_failure(${f.args})`,
    gloss: "A child's structural failure (a closure violation, a failed birth_check) arrives here with the child and the error. Decide per child type: restart it on the same memory, restart in place, quarantine it (keep it, stop routing), or bubble it up to your own parent.",
    doc: DOC.failure + "#handling-failure-on_failure",
    rules: ["restart(c) for N caps retries; past the cap the failure bubbles.", "A child nothing restarts stops but keeps its memory while a param holds it.", "Without a handler the failure bubbles up the tower to main, and the program ends."],
    offers: (c) => { const child = c.frame?.args?.split(",")[0]?.split(":")[0]?.trim() ?? "c"; return [offer("restart", "re-run birth on the same memory", `restart(${child});`), offer("restart for N", "with a retry cap", `restart(${child}) for \${1:3};`), offer("restart_in_place", "restart without re-accepting", `restart_in_place(${child});`), offer("quarantine", "keep it, stop routing to it", `quarantine(${child});`), offer("bubble", "pass it to the grandparent", "bubble(err);"), offer("println err", "say what broke", `println("${c.locus}: ", err.closure, " on ", err.locus);`)]; },
    derived: (c) => { const l = c.locus; return (c.a?.supervision ?? []).filter((s) => s.locus === l).map((s) => ({ label: `${s.child} on ${s.err}`, description: s.ops.join(", "), icon: "shield" })); },
  },
  mode: { title: (f) => `mode ${f.name}`, gloss: "One of three named projections of the locus's kernel: bulk, harmonic, resolution. They share the arena; self.bulk() runs one.", doc: DOC.modes, rules: ["A method may not take a mode's name."], offers: stmtOffers, derived: () => [] },
  birth_check: { title: () => "birth_check", gloss: "A condition checked right after birth; `-> violate name` names the closure it breaks when false, so a bad start is a structural failure the parent handles.", doc: "spec/semantics.md", rules: [], offers: () => [], derived: () => [] },
  fn: {
    title: (f) => `fn ${f.name}`,
    gloss: "A function. On a locus it is a method with self; free, it is pure data in and out. A fallible one declares its error type and callers choose a disposition at each call.",
    doc: DOC.fns,
    rules: ["A fallible call must say what to do: or raise, or discard, or wait, or a fallback value.", "@effects / @no_block / @deterministic above a fn make what it reaches a checked law.", "A handler (subscribed) must not block on the main thread."],
    offers: (c) => [...stmtOffers(c), ...fnAnnotations],
    derived: (c) => { const l = c.locus; const n = c.frame?.name; const key = l ? `${l}::${n}` : n; const eff = key ? c.a?.effects[key] : undefined; const out: Node[] = []; if (eff) out.push({ label: `effects: ${eff.filter((e) => e !== "alloc").join(", ") || "alloc only"}`, icon: "symbol-misc", tone: eff.includes("block") ? "warn" : undefined, description: eff.includes("block") ? "may block" : "" }); if (l && c.a) { const { subs } = busRows(c.a); const sub = subs.find((s) => s.locus === l && s.handler === n); if (sub) out.push({ label: `handler for ${sub.subject}`, description: "runs for every frame; must not block on the main thread", icon: "arrow-left" }); const inv = c.seed?.inventory; const member = inv?.surfaces.find((s) => s.members.some((m) => m.name === key)); if (member) out.push({ label: `rpc row of api ${member.name}`, description: /std::api::Context/.test(c.frame?.args ?? "") ? "takes ctx" : "add ctx: std::api::Context to learn the caller", icon: "plug" }); } return out; },
  },
  match: { title: () => "match", gloss: "Branches on an enum's variants, a value or a tuple; every arm is an expression or a block.", doc: "docs/src/basics/control-flow.md#match", rules: ["A statement match whose every arm diverges ends the fn."], offers: () => [offer("arm", "one variant", "${1:Variant} => { $0 }"), offer("arm with payload", "bind the variant's payload", "${1:Variant}(${2:v}) => { $0 }")], derived: () => [] },
  block: { title: (f) => f.head.split(/\s+/)[0], gloss: "A statement block: the body of an if, else, while or for. Statements run in order; a bare return leaves the enclosing fn or hook.", doc: "docs/src/basics/control-flow.md", rules: ["break and continue act on the innermost loop."], offers: stmtOffers, derived: () => [] },
  type: { title: (f) => `type ${f.name}`, gloss: "A record: named fields, each with a default, or an enum's variants. Records are what the bus carries and what a surface's codec encodes.", doc: DOC.records, rules: ["A field default is required.", "A quantity field keeps its unit through arithmetic."], offers: () => [offer("field", "a field with a default", "${1:field}: ${2:Int} = ${3:0};"), offer("list field", "a growable list", "${1:items}: [${2:Int}] = [];"), offer("bounded field", "a list with a capacity", "${1:items}: bounded[${2:Int}; ${3:16}] = [];"), offer("variant", "an enum variant", "${1:Variant},"), offer("variant with payload", "a variant that carries a record", "${1:Variant}(${2:Type}),")], derived: () => [] },
  module: { title: (f) => `module ${f.name}`, gloss: "A named block of declarations in one file, reached as `name::Decl`.", doc: DOC.projects, rules: [], offers: (c) => GUIDES.top.offers(c), derived: () => [] },
  target: { title: (f) => `target ${f.name}`, gloss: "Build settings for a target; `target wasm { }` selects wasm32 and the browser host interface.", doc: "docs/src/systems/webassembly.md", rules: [], offers: () => [], derived: () => [] },
  literal: { title: (f) => f.head.split(/\s+/).pop() ?? "literal", gloss: "A struct or locus literal: fields by name; the rest take their defaults.", doc: DOC.records, rules: [], offers: () => [offer("field", "set one field", "${1:field}: ${2:value},")], derived: () => [] },
};

/** The guide for a frame kind, falling back to a plain block. */
export function guideOf(kind: string): Guide { return GUIDES[kind] ?? GUIDES.block; }

/** The cursor's situation and every frame's guide, outermost first. */
export function hereAt(text: string, offset: number, seed?: Seed): Here {
  return new Here(text, framesAt(text, offset), seed);
}
