// The language, as a table: every construct the spec names, grouped the
// way spec/tokens.md groups the keywords and the book groups its
// chapters. Each row says how the construct is spelled (a pattern over
// comment-stripped source), where the book explains it, and which view
// of this extension shows what the compiler derives from it.
//
// This table drives the Language view (every construct, used or not,
// with its uses in the open seed), the hover on a construct, and the
// corpus test (test/language.test.mjs), which holds every pattern to a
// real program in the hale checkout and every keyword of the
// compiler's table to a row here.

export interface Part { id: string; title: string; doc: string; gloss: string }
export interface Construct {
  key: string;
  part: string;
  gloss: string;
  /** How the construct is spelled, over comment-stripped source. */
  re: RegExp;
  /** The chapter (a docs/src or spec path, with an optional #anchor). */
  doc: string;
  /** The view of this extension that shows what the compiler derives from it. */
  lens?: string;
  /** A snippet that writes the construct, for completion. */
  snippet?: string;
  /** "spec": the spec names it and no program in the checkout spells it yet (the corpus test holds this). */
  corpus?: "spec";
}

export const PARTS: Part[] = [
  { id: "values", title: "Values & types", doc: "docs/src/basics/values.md", gloss: "bindings, records, enums, interfaces, lists and literals" },
  { id: "functions", title: "Functions & control flow", doc: "docs/src/basics/functions.md", gloss: "fns, branches, loops, match, strings" },
  { id: "fallible", title: "When a call can fail", doc: "docs/src/basics/fallible.md", gloss: "fallible fns and the `or` dispositions" },
  { id: "units", title: "Units & quantities", doc: "docs/src/units.md", gloss: "units, quantities, points, identities, ranges and rounding" },
  { id: "locus", title: "The locus", doc: "docs/src/everyday/locus-gently.md", gloss: "params, contract, bus, capacity, forms" },
  { id: "lifecycle", title: "The lifecycle", doc: "docs/src/services/lifecycle.md", gloss: "birth, accept, release, run, drain, dissolve; draining, terminate, yield" },
  { id: "bus", title: "The bus", doc: "docs/src/services/bus.md", gloss: "topics, subscriptions, publishes, keys, bounds" },
  { id: "placement", title: "Concurrency & placement", doc: "docs/src/services/concurrency.md", gloss: "pinned, cooperative, pools, replicas, the machine's topology" },
  { id: "perspectives", title: "Perspectives, modes & projections", doc: "docs/src/services/perspectives.md", gloss: "contracts a locus serves, live rebinding, the three modes, projection classes" },
  { id: "failure", title: "When things fail", doc: "docs/src/services/failure.md", gloss: "closures, violate, on_failure, restart, quarantine, bubble" },
  { id: "memory", title: "Memory & lifetime", doc: "docs/src/systems/memory.md", gloss: "capacity slots, forms, sealing, secrets, bounded growth" },
  { id: "effects", title: "Effects & contracts", doc: "docs/src/effects.md", gloss: "what a fn may do, asserted and checked transitively" },
  { id: "claims", title: "Claims & the law", doc: "docs/src/claims.md", gloss: "groups, forbid, require, bound, cover, count; constitutions" },
  { id: "api", title: "The API surface", doc: "docs/src/services/api.md", gloss: "surfaces, rpc rows, roles, transports, hubs, codecs" },
  { id: "binaries", title: "Across binaries & projects", doc: "docs/src/services/multi-binary.md", gloss: "bindings, codecs, imports, modules, packages" },
  { id: "systems", title: "Systems control", doc: "docs/src/parts/systems.md", gloss: "FFI, WebAssembly, hot paths, locality, the observer, replay" },
  { id: "stdlib", title: "The standard library", doc: "spec/stdlib.md", gloss: "the std:: namespaces a program reaches" },
  { id: "testing", title: "Testing", doc: "docs/src/everyday/testing.md", gloss: "test programs, assertions, the test transport, benches" },
];

const r = (s: string, flags = "m") => new RegExp(s, flags);
const row = (key: string, part: string, gloss: string, re: RegExp, doc: string, lens?: string, snippet?: string): Construct => ({ key, part, gloss, re, doc, lens, snippet });
const spec = (c: Construct): Construct => ({ ...c, corpus: "spec" });

export const CONSTRUCTS: Construct[] = [
  // ---- values & types --------------------------------------------------
  row("let", "values", "an immutable binding", r("\\blet\\s+(?!mut\\b)\\w+"), "docs/src/basics/values.md"),
  row("let mut", "values", "a binding that may be reassigned", r("\\blet\\s+mut\\b"), "docs/src/basics/values.md"),
  row("const", "values", "a compile-time constant", r("^\\s*const\\s+\\w+"), "docs/src/basics/values.md"),
  row("type", "values", "a record type: named fields with defaults", r("^\\s*type\\s+\\w+\\s*\\{"), "docs/src/everyday/records.md", undefined, "type ${1:Name} {\n    ${2:field}: ${3:Int} = ${4:0};\n}"),
  row("enum", "values", "a sum type: variants, some carrying payloads", r("\\btype\\s+\\w+\\s*=\\s*enum\\b|\\btype\\s+\\w+\\s*\\{\\s*[A-Z]\\w*\\s*[,}|]"), "docs/src/everyday/records.md#enums"),
  row("type alias", "values", "a name for another type", r("^\\s*type\\s+\\w+\\s*=\\s*(?!enum\\b|quantity\\b|point\\b|distinct\\b)[A-Z\\[(]"), "docs/src/basics/values.md"),
  row("interface", "values", "a structural interface: a method set any locus may satisfy", r("\\binterface\\s+\\w+\\s*\\{"), "spec/tokens.md#declaration-keywords-hard"),
  row("bounded[T; N]", "values", "a list with a compile-time capacity", r("\\bbounded\\["), "docs/src/everyday/collections.md"),
  row("list literal", "values", "a growable list, `[a, b]`", r("\\[\\s*[\\w\"\\-][^\\]]*,"), "docs/src/everyday/collections.md"),
  row("tuple", "values", "a fixed group of values, `(a, b)`", r("\\blet\\s+(?:mut\\s+)?\\(\\s*\\w+\\s*,"), "docs/src/basics/values.md"),
  row("Decimal", "values", "exact decimal arithmetic, `1.50d`", r("\\bDecimal\\b|\\b\\d+(?:\\.\\d+)?d\\b"), "docs/src/basics/math.md"),
  row("Duration literal", "values", "a duration with its unit, `100ms`, `2s`", r("\\b\\d+(?:ns|us|ms|s|m|h)\\b"), "docs/src/basics/math.md#time"),
  row("Time", "values", "a point in time; `std::time::now()`", r("\\bTime\\b|\\bstd::time::now\\("), "docs/src/basics/math.md#time"),
  row("Bytes", "values", "an owned byte buffer, and its views", r("\\bBytes(?:View|Mut)?\\b"), "spec/types.md"),
  row("nil", "values", "the absent value of an optional", r("\\bnil\\b"), "docs/src/basics/values.md"),
  // ---- functions & control flow ---------------------------------------
  row("fn", "functions", "a free function or a locus method", r("\\bfn\\s+\\w+\\s*\\("), "docs/src/basics/functions.md", undefined, "fn ${1:name}(${2:x: Int}) -> ${3:Int} {\n    $0\n}"),
  row("default param", "functions", "a parameter with a default", r("\\bfn\\s+\\w+\\s*\\([^)]*\\w+\\s*:\\s*[\\w:<>\\[\\]]+\\s*=\\s*[^,)]+\\)"), "docs/src/basics/functions.md"),
  row("if / else", "functions", "a branch", r("\\bif\\b[^{]*\\{"), "docs/src/basics/control-flow.md"),
  row("while", "functions", "a loop with a condition", r("\\bwhile\\b[^{]*\\{"), "docs/src/basics/control-flow.md"),
  row("for in", "functions", "iteration over a list, a range or a map", r("\\bfor\\s+\\(?\\s*\\w+[^{]*\\bin\\b[^{]*\\{"), "docs/src/basics/control-flow.md"),
  row("range", "functions", "`a..b` exclusive, `a..=b` inclusive", r("\\d\\s*\\.\\.=?\\s*[\\w\\d]"), "docs/src/basics/control-flow.md"),
  row("break / continue", "functions", "leave or skip a loop iteration", r("\\b(?:break|continue)\\s*;"), "docs/src/basics/control-flow.md"),
  row("match", "functions", "a match over an enum, a value or a tuple", r("\\bmatch\\s+[^{]+\\{"), "docs/src/basics/control-flow.md#match", undefined, "match ${1:value} {\n    ${2:Variant} => { $0 }\n}"),
  row("return", "functions", "return a value", r("\\breturn\\b"), "docs/src/basics/functions.md"),
  row("f-string", "functions", "a string with `{expr}` holes", r("\\bf\""), "docs/src/basics/strings.md"),
  row("string concat", "functions", "`+` on strings", r("\"\\s*\\+\\s*[\\w\"]"), "docs/src/basics/strings.md"),
  row("to_string", "functions", "a value as text", r("\\bto_string\\s*\\("), "docs/src/basics/strings.md"),
  row("println", "functions", "print a line to stdout", r("\\bprintln\\s*\\("), "docs/src/basics/first-program.md"),
  row("fn main", "functions", "the program's entry: builds the main locus", r("\\bfn\\s+main\\s*\\(\\s*\\)"), "docs/src/basics/first-program.md"),
  row("self", "functions", "the enclosing locus inside its members", r("\\bself\\.\\w+"), "docs/src/everyday/locus-gently.md"),
  // ---- fallible --------------------------------------------------------
  row("fallible", "fallible", "a fn that may fail with a typed error", r("\\bfallible\\s*\\("), "docs/src/basics/fallible.md", undefined, "fallible(${1:Error})"),
  row("fail", "fallible", "end a fallible fn with its error", r("\\bfail\\s*[\\(;]|\\bfail\\s+\\w"), "docs/src/basics/fallible.md"),
  row("or raise", "fallible", "propagate the error to the caller", r("\\bor\\s+raise\\b"), "docs/src/basics/fallible.md#or-raise"),
  row("or discard", "fallible", "drop the error and the value", r("\\bor\\s+discard\\b"), "docs/src/basics/fallible.md"),
  row("or wait", "fallible", "block until the call succeeds", r("\\bor\\s+wait\\b"), "docs/src/basics/fallible.md"),
  row("or <fallback>", "fallible", "a value to use instead", r("\\bor\\s+(?!raise\\b|discard\\b|wait\\b|self\\.\\w+\\(err\\))[\\w\"\\d]"), "docs/src/basics/fallible.md"),
  row("or self.", "fallible", "hand the error to a handler of this locus", r("\\bor\\s+self\\.\\w+\\(err\\)"), "docs/src/services/failure.md#crossing-from-value-to-structural", "hale.lifecycle"),
  row("@no_panic", "fallible", "assert a fn never traps", r("@no_panic\\b"), "docs/src/effects.md#never-trapping", "hale.effects"),
  // ---- units -----------------------------------------------------------
  row("unit", "units", "a unit of measure, alone or as a multiple of another", r("^\\s*unit\\s+\\w+"), "docs/src/units.md", "hale.units", "unit ${1:cent};\nunit ${2:USD} = 100 ${1:cent};"),
  row("quantity", "units", "an amount in a unit; arithmetic keeps the unit", r("\\bquantity\\s+\\w+\\s+in\\b"), "docs/src/units.md", "hale.units", "type ${1:Money} = quantity Int in ${2:cent};"),
  row("point", "units", "a position on a quantity's axis (a time, a price level)", r("=\\s*point\\s+\\w+"), "docs/src/units.md", "hale.units"),
  row("distinct", "units", "an identity: an Int that is not a number", r("=\\s*distinct\\s+\\w+"), "docs/src/units.md", "hale.units", "type ${1:OrderId} = distinct Int;"),
  row("range:", "units", "a scalar's admissible range", r("\\brange:\\s*[\\d_\\-]+\\.\\."), "docs/src/units.md", "hale.units"),
  row("round:", "units", "the rounding policy a narrowing uses", r("\\bround:\\s*\\w+"), "docs/src/units.md", "hale.units"),
  row("origin:", "units", "where a point's axis starts", r("\\borigin:\\s*"), "docs/src/units.md", "hale.units"),
  row("narrowing policy", "units", "`or floor|ceil|trunc|half_even|half_up|clamp|wrap` on a conversion", r("\\bor\\s+(?:floor|ceil|trunc|half_even|half_up|clamp|wrap)\\b"), "docs/src/units.md", "hale.units"),
  // ---- the locus ---------------------------------------------------------
  row("locus", "locus", "a unit of state with a lifecycle, a region and a bus", r("^\\s*(?:@\\w+(?:\\([^)]*\\))?\\s*)*locus\\s+\\w+"), "docs/src/everyday/locus-gently.md", "hale.tower", "locus ${1:Name} {\n    params {\n        ${2:field}: ${3:Int} = ${4:0};\n    }\n    run() {\n        $0\n    }\n}"),
  row("main locus", "locus", "the entry: its params are the tower", r("\\bmain\\s+locus\\b"), "docs/src/services/parents-children.md", "hale.tower"),
  row("params", "locus", "the fields a locus is born with", r("\\bparams\\s*(?::\\s*inferred\\s*)?\\{"), "docs/src/everyday/locus-gently.md", "hale.tower"),
  row("contract", "locus", "what a locus exposes to and consumes from its parent", r("\\bcontract\\s*(?::\\s*inferred\\s*)?\\{"), "spec/tokens.md#contract-keywords-contextual", "hale.lifecycle"),
  row("expose", "locus", "a contract member the parent may read", r("\\bexpose\\s+\\w+"), "spec/tokens.md#contract-keywords-contextual"),
  row("consume", "locus", "a contract member the locus takes from its parent", r("\\bconsume\\s+\\w+"), "spec/tokens.md#contract-keywords-contextual"),
  spec(row("inferred", "locus", "let the compiler derive the params or the contract", r("\\b(?:params|contract)\\s*:\\s*inferred\\b"), "spec/tokens.md#contract-keywords-contextual")),
  row("child instance", "locus", "a param holding a locus: a child in the tower", r("\\b\\w+\\s*:\\s*[A-Z]\\w*\\s*=\\s*[A-Z]\\w*\\s*\\{"), "docs/src/services/parents-children.md", "hale.tower"),
  row("locus method", "locus", "a fn on a locus, called through self or a handle", r("^\\s{4}fn\\s+\\w+\\s*\\("), "docs/src/everyday/locus-gently.md", "hale.lifecycle"),
  row("perspective slot", "locus", "a handle typed by a contract, not an implementation", r("\\bperspective\\s*\\(\\s*\\w+\\s*\\)"), "docs/src/services/perspectives.md#holding-and-calling-through-a-perspective", "hale.lifecycle"),
  row("capacity", "locus", "bounded storage slots a locus owns", r("\\bcapacity\\s*\\{"), "docs/src/systems/memory.md#bounded-storage-capacity-slots", "hale.lifecycle"),
  row("pool", "locus", "a capacity slot of many T", r("\\bpool\\s+\\w+\\s+of\\b"), "docs/src/systems/memory.md#bounded-storage-capacity-slots", "hale.lifecycle"),
  row("heap", "locus", "a capacity slot ordered by a key", r("\\bheap\\s+\\w+\\s+of\\b"), "spec/forms.md", "hale.lifecycle"),
  row("indexed_by", "locus", "the key field of a hashmap slot", r("\\bindexed_by\\s+\\w+"), "spec/tokens.md#locus-member-keywords-contextual"),
  row("ordered_by", "locus", "the order of a heap slot", r("\\bordered_by\\b"), "spec/forms.md"),
  row("as_parent_for", "locus", "share a slot's allocator with a child's same-named slot", r("\\bas_parent_for\\s+\\w+"), "spec/tokens.md#locus-member-keywords-contextual"),
  row("@form(vec)", "locus", "a locus lowered to a vector", r("@form\\(\\s*vec\\b"), "docs/src/systems/forms.md", "hale.lifecycle"),
  row("@form(hashmap)", "locus", "a locus lowered to a hash map", r("@form\\(\\s*hashmap\\b"), "docs/src/systems/forms.md", "hale.lifecycle"),
  row("@form(set)", "locus", "a locus lowered to a set", r("@form\\(\\s*set\\b"), "docs/src/systems/forms.md", "hale.lifecycle"),
  row("@form(ring_buffer)", "locus", "a locus lowered to a ring", r("@form\\(\\s*ring_buffer\\b"), "docs/src/systems/forms.md", "hale.lifecycle"),
  row("@form(lru_cache)", "locus", "a locus lowered to an LRU cache", r("@form\\(\\s*lru_cache\\b"), "docs/src/systems/forms.md", "hale.lifecycle"),
  row("@form(heap)", "locus", "a locus lowered to a priority heap", r("@form\\(\\s*heap\\b"), "docs/src/systems/forms.md", "hale.lifecycle"),
  row("keyed_by", "locus", "the key a form indexes by", r("\\bkeyed_by\\b"), "docs/src/systems/forms.md"),
  // ---- lifecycle ---------------------------------------------------------
  row("birth", "lifecycle", "the first hook: the locus has its params", r("\\bbirth\\s*\\(\\s*\\)"), "docs/src/services/lifecycle.md#the-five-phases", "hale.lifecycle"),
  row("accept", "lifecycle", "a child arrives from a handle or a construction", r("\\baccept\\s*\\(\\s*\\w+\\s*:\\s*[\\w:]+\\s*\\)"), "docs/src/services/lifecycle.md#the-five-phases", "hale.lifecycle"),
  row("release", "lifecycle", "an accepted child's run() ended: reclaim it (it is a flow)", r("\\brelease\\s*\\(\\s*\\w+\\s*:\\s*[\\w:]+\\s*\\)"), "spec/semantics.md", "hale.lifecycle"),
  row("run", "lifecycle", "the locus's own activity; returning means ready", r("\\brun\\s*\\(\\s*\\)\\s*\\{"), "docs/src/services/lifecycle.md#the-five-phases", "hale.lifecycle"),
  row("drain", "lifecycle", "stop taking new work; the bus is quiesced", r("\\bdrain\\s*\\(\\s*\\)"), "docs/src/services/lifecycle.md#shutdown-cascades", "hale.lifecycle"),
  row("dissolve", "lifecycle", "the last hook before the region is freed", r("\\bdissolve\\s*\\(\\s*\\)"), "docs/src/services/lifecycle.md#when-does-a-locus-dissolve", "hale.lifecycle"),
  row("self.draining", "lifecycle", "true once a drain began: a run() loop's exit", r("\\bself\\.draining\\b"), "docs/src/services/lifecycle.md#shutdown-cascades", "hale.lifecycle"),
  row("terminate", "lifecycle", "end this locus's lifecycle from inside", r("\\bterminate\\s*;"), "spec/semantics.md", "hale.lifecycle"),
  row("yield", "lifecycle", "a cooperative yield point", r("\\byield\\s*;"), "docs/src/services/concurrency.md", "hale.lifecycle"),
  row("birth_check", "lifecycle", "a check the main locus runs before its tower is built", r("\\bbirth_check\\b"), "spec/semantics.md"),
  // ---- bus -------------------------------------------------------------
  row("topic", "bus", "a typed channel with a subject", r("\\btopic\\s+\\w+\\s*\\{"), "docs/src/services/bus.md", "hale.bus", "topic ${1:Name} { payload: ${2:Type}; subject: \"${3:a.b}\"; }"),
  row("payload:", "bus", "a topic's value type", r("\\bpayload\\s*:"), "docs/src/services/bus.md", "hale.bus"),
  row("subject:", "bus", "a topic's wire name", r("\\bsubject\\s*:\\s*\""), "docs/src/services/bus.md", "hale.bus"),
  row("bus", "bus", "a locus's subscriptions and publishes", r("\\bbus\\s*\\{"), "docs/src/services/bus.md", "hale.bus", "bus {\n    subscribe ${1:Topic} as ${2:on_topic};\n}"),
  row("subscribe", "bus", "take a topic's frames in a handler", r("\\bsubscribe\\s+\\w+"), "docs/src/services/bus.md", "hale.bus"),
  row("publish", "bus", "declare that a locus publishes a topic", r("\\bpublish\\s+\\w+\\s*;"), "docs/src/services/bus.md", "hale.bus"),
  row("send <-", "bus", "publish one frame, `Topic <- value`", r("\\b[A-Z]\\w*\\s*<-\\s*"), "docs/src/services/bus.md", "hale.bus"),
  row("where key", "bus", "a keyed subscription: only frames with this key", r("\\bwhere\\s+key\\s*=="), "docs/src/services/bus.md", "hale.bus"),
  row("of type", "bus", "a subscription or publish on a literal subject, typed", r("\\b(?:subscribe|publish)\\s+\"[^\"]+\"(?:\\s+as\\s+\\w+)?\\s+of\\s+type\\b"), "docs/src/services/bus.md", "hale.bus"),
  row("ring_layout", "bus", "the slot layout of a zero-copy ring", r("\\bring_layout\\b"), "docs/src/systems/zero-copy-bus.md", "hale.placement"),
  row("shm_ring", "bus", "a shared-memory ring binding across processes", r("\\bshm_ring\\s*\\("), "docs/src/systems/zero-copy-bus.md", "hale.placement"),
  row("on_overflow", "bus", "a ring's policy when a slot is not free: fail, drop or block", r("\\bon_overflow\\s*:"), "docs/src/systems/zero-copy-bus.md", "hale.placement"),
  // ---- placement ---------------------------------------------------------
  row("placement", "placement", "where each child of main runs", r("\\bplacement\\s*\\{"), "docs/src/services/concurrency.md#placement-lives-on-main", "hale.placement", "placement {\n    ${1:field}: pinned(core = ${2:1});\n}"),
  row("pinned", "placement", "a thread of its own, optionally on a core", r("\\bpinned\\s*\\("), "docs/src/services/concurrency.md", "hale.placement"),
  row("cooperative", "placement", "a slot on a cooperative pool", r("\\bcooperative\\s*\\("), "docs/src/services/concurrency.md", "hale.placement"),
  row("cores", "placement", "a set or range of cores for a pinned child", r("\\bcores\\s*="), "docs/src/services/concurrency.md", "hale.placement"),
  row("replicas", "placement", "K copies of a pinned child, one per thread", r("\\breplicas\\s*="), "docs/src/services/concurrency.md#parallelism-replicas--k", "hale.placement"),
  row("topology", "placement", "the machine: nodes, L3 domains, reserved cores", r("\\btopology\\s*\\{"), "docs/src/services/concurrency.md#describing-the-machine-topology--", "hale.placement"),
  row("node / l3", "placement", "a NUMA node or an L3 domain to pin into", r("\\b(?:node|l3)\\s*=\\s*\\w+"), "docs/src/services/concurrency.md", "hale.placement"),
  row("reserve", "placement", "cores the program leaves alone", r("\\breserve\\b"), "docs/src/services/concurrency.md", "hale.placement"),
  row("where async_io", "placement", "a pool whose handlers may block on I/O", r("\\bwhere\\s+async_io\\b"), "docs/src/services/concurrency.md#high-concurrency-io-where-async_io", "hale.placement"),
  row("recognition sub-mode", "placement", "how a recognition-class locus pools its children: fixed_cell, shared_slab, spillover, summary_only", r("\\b(?:fixed_cell|shared_slab|spillover|summary_only)\\b"), "spec/memory.md", "hale.lifecycle"),
  // ---- perspectives, modes, projections ------------------------------------
  row("perspective", "perspectives", "a contract: bodyless methods a locus may serve", r("^\\s*perspective\\s+\\w+\\s*\\{"), "docs/src/services/perspectives.md", "hale.lifecycle", "perspective ${1:Name} {\n    fn ${2:method}(${3:x: Int}) -> ${4:Int};\n}"),
  row("serves", "perspectives", "a locus declares it serves a perspective", r("\\bserves\\s+\\w+"), "docs/src/services/perspectives.md#serving-a-contract", "hale.lifecycle"),
  row("reperspective", "perspectives", "re-point a perspective slot at a new implementation, live", r("\\breperspective\\b"), "docs/src/services/perspectives.md#live-redeploy-reperspective", "hale.lifecycle"),
  row("stable_when", "perspectives", "when a perspective member's value may be relied on", r("\\bstable_when\\b"), "spec/tokens.md#perspective-keywords-contextual"),
  row("serialize_as", "perspectives", "how a perspective member crosses a boundary", r("\\bserialize_as\\b"), "spec/tokens.md#perspective-keywords-contextual"),
  row("mode", "perspectives", "a named projection of one locus's kernel", r("\\bmode\\s+\\w+\\s*\\("), "docs/src/systems/modes.md", "hale.lifecycle"),
  row("bulk / harmonic / resolution", "perspectives", "the three modes", r("\\bmode\\s+(?:bulk|harmonic|resolution)\\b"), "docs/src/systems/modes.md", "hale.lifecycle"),
  row("projection", "perspectives", "a locus's projection class: rich, chunked, recognition", r("\\bprojection\\s+(?:rich|chunked|recognition)\\b"), "docs/src/systems/memory.md#projection-classes-committing-to-resolution", "hale.lifecycle"),
  spec(row("tier", "perspectives", "a locus's memory tier", r("\\btier\\s+\\d"), "docs/src/systems/memory.md", "hale.lifecycle")),
  // ---- failure -------------------------------------------------------------
  row("closure", "failure", "an invariant the locus holds; violating it is structural failure", r("\\bclosure\\s+\\w+\\s*\\{"), "docs/src/services/failure.md#declaring-an-invariant-closure", "hale.lifecycle", "closure ${1:name} {\n    captures: ${2:field};\n    epoch inline;\n}"),
  row("epoch", "failure", "when a closure's totals reset: inline, birth, tick, duration", r("\\bepoch\\s+\\w+"), "docs/src/services/failure.md", "hale.lifecycle"),
  row("captures", "failure", "the fields a closure reads", r("\\bcaptures\\s*:"), "docs/src/services/failure.md", "hale.lifecycle"),
  row("tick / duration", "failure", "a closure measured per tick or per duration", r("\\b(?:tick|duration)\\s*\\(|\\bepoch\\s+(?:tick|duration)\\b"), "docs/src/services/failure.md", "hale.lifecycle"),
  row("approx / within", "failure", "a closure assertion with tolerance", r("\\b(?:approx|within)\\b"), "docs/src/services/failure.md", "hale.lifecycle"),
  row("explicit", "failure", "an explicitly asserted closure", r("\\bexplicit\\b"), "docs/src/services/failure.md", "hale.lifecycle"),
  row("persists_through / resets_on", "failure", "which recoveries keep or reset a closure's totals", r("\\b(?:persists_through|resets_on|resets_per_epoch)\\s*\\("), "docs/src/services/failure.md#what-a-recovery-does-to-a-closures-running-totals", "hale.lifecycle"),
  row("violate", "failure", "break a closure on purpose: the value channel reaches the structural one", r("\\bviolate\\s+\\w+"), "docs/src/services/failure.md#crossing-from-value-to-structural", "hale.lifecycle"),
  row("on_failure", "failure", "a parent's handler for a child's structural failure", r("\\bon_failure\\s*\\("), "docs/src/services/failure.md#handling-failure-on_failure", "hale.lifecycle", "on_failure(c: ${1:Child}, err: ClosureViolation) {\n    restart(c);\n}"),
  row("restart", "failure", "re-run the child's birth on the same memory", r("\\brestart\\s*\\("), "docs/src/services/failure.md", "hale.lifecycle"),
  row("restart for N", "failure", "a retry cap on a restart", r("\\brestart\\s*\\([^)]*\\)\\s*for\\s+\\d"), "docs/src/services/failure.md#saying-how-many-times-restartchild-for-n", "hale.lifecycle"),
  row("restart_in_place", "failure", "restart without re-accepting", r("\\brestart_in_place\\s*\\("), "docs/src/services/failure.md", "hale.lifecycle"),
  row("quarantine", "failure", "keep the child but stop routing to it", r("\\bquarantine\\s*\\("), "docs/src/services/failure.md", "hale.lifecycle"),
  spec(row("reorganize", "failure", "rebuild the parent's tower", r("\\breorganize\\s*\\("), "docs/src/services/failure.md", "hale.lifecycle")),
  row("bubble", "failure", "pass the failure to the grandparent", r("\\bbubble\\s*[;(]"), "docs/src/services/failure.md", "hale.lifecycle"),
  row("ClosureViolation", "failure", "the structural error a handler receives", r("\\bClosureViolation\\b"), "docs/src/services/failure.md"),
  // ---- memory ----------------------------------------------------------------
  row("@sealed", "memory", "no reads of this locus's params from outside", r("@sealed\\b"), "docs/src/systems/memory.md", "hale.advice"),
  spec(row("@secret", "memory", "a parameter whose value must not leak: `fn write(@secret b: Bytes)`", r("@secret\\b"), "docs/src/verification.md", "hale.advice")),
  row("std::secret", "memory", "sealed handling of secrets", r("\\bstd::secret::"), "docs/src/everyday/crypto.md"),
  row("@unbounded", "memory", "own a growth the compiler flagged", r("@unbounded\\b"), "docs/src/systems/memory.md", "hale.advice"),
  row("@bounded_by", "memory", "name what bounds a growth", r("@bounded_by\\s*\\("), "docs/src/systems/memory.md", "hale.advice"),
  row("@locality", "memory", "a locality budget for a hot locus", r("@locality\\b"), "docs/src/systems/performance.md", "hale.advice"),
  row("@hot", "memory", "a certified hot path", r("@hot\\b"), "docs/src/systems/performance.md", "hale.advice"),
  // ---- effects ---------------------------------------------------------------
  row("@effects", "effects", "what a fn may or may not do, by class: `none:`, `only:`, `does:`, `is:`", r("@effects\\s*\\("), "docs/src/effects.md#declaring-what-a-function-may-do", "hale.effects", "@effects(none: {${1:syscall}})"),
  row("@effects(only:)", "effects", "the whole list of what a fn may do", r("@effects\\s*\\([^)]*\\bonly\\s*:"), "docs/src/effects.md#saying-what-a-function-may-do-not-what-it-may-not", "hale.effects"),
  row("@no_block", "effects", "assert a fn never blocks", r("@no_block\\b"), "docs/src/effects.md", "hale.effects"),
  row("@no_syscall", "effects", "assert a fn never reaches the OS", r("@no_syscall\\b"), "docs/src/effects.md", "hale.effects"),
  row("@no_recursion", "effects", "assert a fn never recurses", r("@no_recursion\\b"), "docs/src/effects.md", "hale.effects"),
  row("@deterministic", "effects", "assert a fn reads no clock, no randomness, no environment", r("@deterministic\\b"), "docs/src/effects.md", "hale.effects"),
  row("@budget", "effects", "a count bound on an effect class", r("@budget\\s*\\("), "docs/src/effects.md#counting-not-just-forbidding", "hale.effects"),
  row("@phase_effects", "effects", "effects allowed per lifecycle phase", r("@phase_effects\\s*\\("), "docs/src/effects.md#effects-by-lifecycle-phase", "hale.effects"),
  row("effect", "effects", "an effect class of your own: `effect money;` and `@effects(is: {money})` on its sources", r("^\\s*effect\\s+\\w+\\s*;|@effects\\s*\\([^)]*\\bis\\s*:"), "docs/src/effects.md#effects-you-declare-yourself", "hale.effects"),
  // ---- claims ----------------------------------------------------------------
  row("claims", "claims", "laws the compiler checks on the main locus", r("\\bclaims\\s*\\{"), "docs/src/claims.md#claims----placement-and-naming", "hale.law", "claims {\n    ${1:one_writer}: count publishers(topic ${2:T}) == 1;\n}"),
  row("group", "claims", "a named set of loci, fns or roles", r("\\bgroup\\s+\\w+\\s*="), "docs/src/claims.md#group--the-vocabulary", "hale.law"),
  row("domain", "claims", "a data-plane vocabulary: which effects count", r("\\bdomain\\s+\\w+\\s*[={]"), "docs/src/claims.md#domain-and-effect-families--the-data-plane-vocabulary", "hale.law"),
  row("forbid reaches", "claims", "nothing in SRC reaches DST", r("\\bforbid\\s+reaches\\b"), "docs/src/claims.md#forbid-reachessrc-dst--absence-under-closure", "hale.law"),
  row("only edges", "claims", "the boundary form: only these edges cross", r("\\bonly\\s+edges\\b"), "docs/src/claims.md#only-edges-a---b----the-boundary-form", "hale.law"),
  spec(row("only effects", "claims", "the law an `@effects(only:)` or `@phase_effects` lowers to: only these classes on these loci, during a phase", r("\\bonly\\s+effects\\b"), "docs/src/claims.md", "hale.law")),
  row("bound", "claims", "a capability budget on paths", r("^\\s*\\w+\\s*:\\s*bound\\s+\\w+\\s*<="), "docs/src/claims.md#bound-c--n-on-paths-from-g--capability-budgets", "hale.law"),
  row("require publishes", "claims", "something publishes this topic", r("\\brequire\\s+publishes\\b"), "docs/src/claims.md#require--existence", "hale.law"),
  row("require subscribes", "claims", "something subscribes to this topic", r("\\brequire\\s+subscribes\\b"), "docs/src/claims.md#require--existence", "hale.law"),
  row("require sealed", "claims", "these loci are sealed", r("\\brequire\\s+sealed\\b"), "docs/src/claims.md#require--existence", "hale.law"),
  row("require no_silent_loss", "claims", "no configured silent discard", r("\\brequire\\s+no_silent_loss\\b"), "docs/src/claims.md#require-no_silent_loss--no-configured-silent-discard", "hale.law"),
  row("cover", "claims", "a bounded universal: every member satisfies", r("\\bcover\\b"), "docs/src/claims.md#cover--bounded-universals", "hale.law"),
  row("count publishers", "claims", "cardinality: how many publish", r("\\bcount\\s+publishers\\b"), "docs/src/claims.md#count--cardinality", "hale.law"),
  row("count subscribers", "claims", "cardinality: how many subscribe", r("\\bcount\\s+subscribers\\b"), "docs/src/claims.md#count--cardinality", "hale.law"),
  row("during", "claims", "a claim scoped to a lifecycle phase", r("\\bduring\\s+\\w+"), "docs/src/claims.md", "hale.law"),
  row("avoiding", "claims", "a reachability claim that skips an edge set", r("\\bavoiding\\b"), "docs/src/claims.md", "hale.law"),
  row("may_be_empty", "claims", "a group that may have no members", r("\\bmay_be_empty\\b"), "docs/src/claims.md", "hale.law"),
  row("constitution", "claims", "a named claimset shared across entrypoints", r("\\bconstitution\\s+\\w+"), "docs/src/constitutions.md", "hale.law", "constitution ${1:Name} {\n    $0\n}"),
  row("extends", "claims", "a constitution built on another", r("\\bconstitution\\s+\\w+\\s+extends\\s+\\w+"), "docs/src/constitutions.md", "hale.law"),
  row("adopt", "claims", "an entrypoint takes a constitution as law", r("\\badopt\\s+\\w+\\s*;"), "docs/src/constitutions.md", "hale.law"),
  // ---- api ------------------------------------------------------------------
  row("api", "api", "a surface: the rpc rows it offers", r("\\bapi\\s+\\w+\\s*\\{"), "docs/src/services/build-an-api.md", "hale.program", "api ${1:Name} {\n    rpc ${2:Locus::fn};\n}"),
  row("rpc", "api", "one member: a locus method callable from outside", r("\\brpc\\s+\\w+::\\w+"), "docs/src/services/api.md", "hale.program"),
  row("@rpc", "api", "a method marked callable, on the method", r("@rpc\\b"), "docs/src/services/api.md", "hale.program"),
  row("requires:", "api", "the roles a caller must hold", r("\\brequires\\s*:\\s*\\["), "docs/src/services/build-an-api.md#5-roles", "hale.program"),
  row("role", "api", "a role name the program knows", r("\\brole\\s+\\w+\\s*;"), "docs/src/services/build-an-api.md#5-roles", "hale.program"),
  row("includes", "api", "a role that implies another", r("\\brole\\s+\\w+\\s+includes\\b"), "docs/src/services/api.md", "hale.program"),
  row("api::serve", "api", "serve a surface over a transport from the main locus", r("\\bapi::serve\\s*\\("), "docs/src/services/build-an-api.md#2-a-surface-served", "hale.program"),
  row("unix::Rpc", "api", "the unix socket transport", r("\\bunix::Rpc\\s*\\{"), "docs/src/services/build-an-api.md", "hale.program"),
  row("http::Rpc", "api", "the HTTP transport, bearer tokens", r("\\bhttp::Rpc\\s*\\{"), "docs/src/services/build-an-api.md#6-http", "hale.program"),
  row("grpc::Rpc", "api", "the gRPC transport", r("\\bgrpc::Rpc\\s*\\{"), "spec/api.md", "hale.program"),
  row("mcp::Rpc", "api", "the MCP transport: members as agent tools", r("\\bmcp::Rpc\\s*\\{"), "docs/src/services/build-an-api.md#8-tools", "hale.program"),
  row("ws::Hub", "api", "a WebSocket hub: topics as streams", r("\\bws::Hub\\s*\\{"), "docs/src/services/build-an-api.md#7-a-stream", "hale.program"),
  row("test::Rpc", "api", "the in-process transport a test calls through", r("\\btest::Rpc\\s*\\{"), "docs/src/everyday/testing.md", "hale.program"),
  row("principals:", "api", "who a token is: a locus with fn principal", r("\\bprincipals\\s*:\\s*self\\."), "docs/src/services/build-an-api.md#4-who-is-calling", "hale.program"),
  row("roles:", "api", "who holds a role: std::api::StaticRoles or fn holds", r("\\broles\\s*:\\s*self\\."), "docs/src/services/build-an-api.md#5-roles", "hale.program"),
  row("ctx: std::api::Context", "api", "the caller, the door and the role, in a handler", r("\\bstd::api::Context\\b"), "docs/src/services/build-an-api.md#4-who-is-calling", "hale.program"),
  row("codec: json", "api", "the one generated codec of a transport", r("\\bcodec\\s*:\\s*json\\b"), "spec/api.md", "hale.program"),
  row("bound / on_full", "api", "the serve queue's bound and its full policy", r("\\bbound\\s*:\\s*\\d+|\\bon_full\\s*:"), "docs/src/services/build-an-api.md", "hale.program"),
  row("cors:", "api", "a browser origin the HTTP exposure allows", r("\\bcors\\s*:"), "spec/api.md", "hale.program"),
  row("hub stream", "api", "a topic bound to a hub: a stream out or in", r("^\\s*\\w+\\s*:\\s*self\\.\\w+\\s+requires\\s*:"), "docs/src/services/build-an-api.md#7-a-stream", "hale.program"),
  // ---- across binaries & projects ----------------------------------------------
  row("bindings", "binaries", "a topic's transport out of the process", r("\\bbindings\\s*\\{"), "docs/src/services/multi-binary.md", "hale.placement", "bindings {\n    ${1:Topic}: unix(\"${2:/tmp/topic.sock}\");\n}"),
  row("unix(…)", "binaries", "a unix socket binding", r("\\bunix\\s*\\(\\s*\""), "docs/src/services/multi-binary.md", "hale.placement"),
  row("listen / connect", "binaries", "which end of a binding this process is: `role: listen | connect`", r("\\brole\\s*:\\s*(?:listen|connect)\\b"), "docs/src/services/multi-binary.md", "hale.placement"),
  row("codec(…)", "binaries", "a codec locus on a binding: encode and decode", r("\\bcodec\\s*\\(\\s*\\w+"), "docs/src/services/multi-binary.md#talking-to-other-languages-codecs", "hale.placement"),
  row("where same_process", "binaries", "an operational constraint on a binding", r("\\bwhere\\s+(?:same_process|intra_process|intra_machine|cross_machine|zero_copy)\\b"), "docs/src/services/multi-binary.md", "hale.placement"),
  row("import", "binaries", "another seed's declarations under a name", r("^\\s*import\\s+\""), "spec/projects.md", "hale.program", "import \"${1:../lib}\" as ${2:lib};"),
  row("module", "binaries", "a named block of declarations in one file", r("\\bmodule\\s+\\w+\\s*\\{"), "spec/projects.md", "hale.program"),
  row("qualified path", "binaries", "`lib::Name`: a declaration of an imported seed", r("\\b(?!std\\b)[a-z_]\\w*::[A-Z]\\w*"), "spec/projects.md", "hale.program"),
  // ---- systems ----------------------------------------------------------------
  row("@ffi", "systems", "a C or JS function the program calls", r("@ffi\\s*\\("), "docs/src/systems/binding-c.md", "hale.effects"),
  row("@export", "systems", "a fn the host may call (WebAssembly)", r("@export\\b"), "docs/src/systems/webassembly.md", "hale.effects"),
  row("target wasm", "systems", "the program builds for the browser", r("\\btarget\\s+wasm\\b"), "docs/src/systems/webassembly.md", "hale.program"),
  row("std::shm", "systems", "shared memory across processes", r("\\bstd::shm::"), "docs/src/systems/zero-copy-bus.md"),
  row("std::process", "systems", "child processes", r("\\bstd::process::"), "docs/src/systems/operations.md"),
  row("std::os", "systems", "the operating system: signals, exit", r("\\bstd::os::"), "docs/src/systems/operations.md"),
  row("std::env", "systems", "environment variables", r("\\bstd::env::"), "docs/src/everyday/cli-config.md"),
  row("std::cli", "systems", "argv and flags", r("\\bstd::cli::"), "docs/src/everyday/cli-config.md"),
  // ---- stdlib -------------------------------------------------------------------
  row("std::str", "stdlib", "text", r("\\bstd::str::"), "docs/src/basics/strings.md"),
  row("std::text", "stdlib", "text building and formatting", r("\\bstd::text::"), "docs/src/basics/strings.md"),
  row("std::math", "stdlib", "numbers", r("\\bstd::math::"), "docs/src/basics/math.md"),
  row("std::decimal", "stdlib", "exact decimals", r("\\bstd::decimal::"), "docs/src/basics/math.md"),
  row("std::time", "stdlib", "clocks, sleeps, durations", r("\\bstd::time::"), "docs/src/basics/math.md#time"),
  row("std::json", "stdlib", "JSON", r("\\bstd::json::"), "docs/src/everyday/json.md"),
  row("std::io::fs", "stdlib", "files", r("\\bstd::io::fs::"), "docs/src/everyday/files.md"),
  row("std::io::file", "stdlib", "an open file", r("\\bstd::io::file::"), "docs/src/everyday/files.md"),
  row("std::io::stdin / stdout", "stdlib", "the standard streams", r("\\bstd::io::(?:stdin|stdout)::"), "docs/src/everyday/files.md"),
  row("std::io::tcp", "stdlib", "TCP", r("\\bstd::io::tcp::"), "docs/src/everyday/sockets.md"),
  row("std::io::udp", "stdlib", "UDP", r("\\bstd::io::udp::"), "docs/src/everyday/sockets.md"),
  row("std::io::tls", "stdlib", "TLS", r("\\bstd::io::tls::"), "docs/src/everyday/sockets.md"),
  row("std::io::unix", "stdlib", "unix sockets", r("\\bstd::io::unix::"), "docs/src/everyday/sockets.md"),
  row("std::io::sockopt", "stdlib", "socket options", r("\\bstd::io::sockopt::"), "docs/src/everyday/sockets.md"),
  row("std::http", "stdlib", "an HTTP client and server", r("\\bstd::http::"), "docs/src/everyday/http.md"),
  row("std::url", "stdlib", "URLs", r("\\bstd::url::"), "docs/src/everyday/http.md"),
  row("std::crypto", "stdlib", "hashing, HMAC, randomness", r("\\bstd::crypto::"), "docs/src/everyday/crypto.md"),
  row("std::hex", "stdlib", "hex encoding", r("\\bstd::hex::"), "docs/src/everyday/crypto.md"),
  row("std::rand", "stdlib", "random numbers", r("\\bstd::rand::"), "docs/src/everyday/crypto.md"),
  row("std::compress", "stdlib", "compression", r("\\bstd::compress::"), "docs/src/everyday/files.md"),
  row("std::tar", "stdlib", "tar archives", r("\\bstd::tar::"), "docs/src/everyday/files.md"),
  row("std::log", "stdlib", "logging", r("\\bstd::log::"), "docs/src/everyday/logging.md"),
  row("std::metrics", "stdlib", "counters and gauges", r("\\bstd::metrics::"), "docs/src/everyday/metrics.md"),
  row("std::regex", "stdlib", "regular expressions", r("\\bstd::regex::"), "docs/src/basics/strings.md"),
  row("std::bytes", "stdlib", "byte buffers", r("\\bstd::bytes::"), "spec/stdlib.md"),
  row("std::bus", "stdlib", "the bus at run time", r("\\bstd::bus::"), "docs/src/services/bus.md"),
  row("std::api", "stdlib", "principals, roles, the context, the client", r("\\bstd::api::(?!test\\b|unix\\b|Context\\b)"), "docs/src/services/api.md"),
  row("std::api::unix", "stdlib", "a unix client", r("\\bstd::api::unix::"), "docs/src/services/build-an-api.md"),
  row("std::iter", "stdlib", "iteration helpers", r("\\bstd::iter::"), "spec/stdlib.md"),
  row("std::ts", "stdlib", "TypeScript emission for a surface", r("\\bstd::ts::"), "spec/stdlib.md"),
  row("std::lang", "stdlib", "the language's own helpers", r("\\bstd::lang::"), "spec/stdlib.md"),
  row("std::term", "stdlib", "the terminal", r("\\bstd::term::"), "docs/src/everyday/cli-config.md"),
  // ---- testing ------------------------------------------------------------------
  row("std::test", "testing", "assertions", r("\\bstd::test::"), "docs/src/everyday/testing.md", "hale.tests"),
  row("std::api::test", "testing", "call a surface in-process from a test", r("\\bstd::api::test::"), "docs/src/everyday/testing.md", "hale.tests"),
  row("_test.hl", "testing", "a test program: its own seed, run by hale test", r("^$"), "spec/testing.md", "hale.tests"),
  spec(row("bench_", "testing", "a bench fn in a *_bench.hl, run by hale bench", r("\\bfn\\s+bench_\\w+"), "spec/testing.md", "hale.tests")),
];

/** The words the compiler's keyword table names that this catalog spells, for the sync test. */
export const KEYWORD_COVERAGE: Record<string, string> = {
  // hard
  locus: "locus", perspective: "perspective", type: "type", const: "const", fn: "fn", import: "import", module: "module",
  let: "let", mut: "let mut", if: "if / else", else: "if / else", match: "match", for: "for in", in: "for in", while: "while",
  return: "return", break: "break / continue", continue: "break / continue", self: "self", interface: "interface",
  trait: "(reserved)", impl: "(reserved)", async: "(reserved)", await: "(reserved)", macro: "(reserved)", export: "(reserved)",
  // contextual
  params: "params", contract: "contract", bus: "bus", capacity: "capacity", as_parent_for: "as_parent_for", indexed_by: "indexed_by",
  birth: "birth", accept: "accept", release: "release", run: "run", drain: "drain", dissolve: "dissolve", on_failure: "on_failure",
  bulk: "bulk / harmonic / resolution", harmonic: "bulk / harmonic / resolution", resolution: "bulk / harmonic / resolution",
  projection: "projection", rich: "projection", chunked: "projection", recognition: "projection", tier: "tier",
  closure: "closure", epoch: "epoch", persists_through: "persists_through / resets_on", resets_on: "persists_through / resets_on", resets_per_epoch: "persists_through / resets_on",
  restart: "restart", restart_in_place: "restart_in_place", quarantine: "quarantine", reorganize: "reorganize", bubble: "bubble",
  expose: "expose", consume: "consume", inferred: "inferred",
  subscribe: "subscribe", publish: "publish", on: "bound", of: "of type",
  stable_when: "stable_when", serialize_as: "serialize_as",
  yield: "yield", terminate: "terminate", where: "where key",
  topic: "topic", ring_layout: "ring_layout", as: "subscribe", main: "main locus",
  mode: "mode", bindings: "bindings", birth_check: "birth_check", placement: "placement",
  cooperative: "cooperative", pinned: "pinned", pool: "pool", core: "pinned", cores: "cores", heap: "heap",
  topology: "topology", node: "node / l3", l3: "node / l3", reserve: "reserve", replicas: "replicas",
  schedule: "(reserved)", fixed_cell: "recognition sub-mode", shared_slab: "recognition sub-mode", spillover: "recognition sub-mode", summary_only: "recognition sub-mode", cap: "recognition sub-mode",
  payload: "payload:", subject: "subject:",
  captures: "captures", inline: "epoch", tick: "tick / duration", duration: "tick / duration", explicit: "explicit", approx: "approx / within", within: "approx / within",
  with: "violate", violate: "violate", fail: "fail", until: "or wait",
  sum: "closure", prod: "closure", or: "or <fallback>", fallible: "fallible",
  unix: "unix(…)", shm_ring: "shm_ring", role: "role", listen: "listen / connect", connect: "listen / connect", slot_count: "shm_ring",
  on_overflow: "on_overflow", block: "on_overflow", drop: "on_overflow",
  ordered_by: "ordered_by",
  api: "api", bound: "bound", on_full: "bound / on_full", refuse: "bound / on_full",
  serve: "api::serve", http: "http::Rpc", principals: "principals:",
  includes: "includes", roles: "roles:",
  rpc: "rpc", requires: "requires:",
  intra_process: "where same_process", intra_machine: "where same_process", cross_machine: "where same_process", zero_copy: "where same_process",
  serves: "serves", reperspective: "reperspective",
  group: "group", claims: "claims", forbid: "forbid reaches", reaches: "forbid reaches", via: "forbid reaches", may_be_empty: "may_be_empty",
  domain: "domain", edges: "only edges", require: "require publishes", cover: "cover", count: "count publishers",
  during: "during", avoiding: "avoiding", seed: "only edges",
  constitution: "constitution", extends: "extends", adopt: "adopt",
  unit: "unit", quantity: "quantity", point: "point", distinct: "distinct",
  range: "range:", round: "round:", origin: "origin:",
  floor: "narrowing policy", ceil: "narrowing policy", trunc: "narrowing policy", half_even: "narrowing policy", half_up: "narrowing policy", clamp: "narrowing policy", wrap: "narrowing policy",
  raise: "or raise", discard: "or discard", wait: "or wait",
};

export const byKey = new Map(CONSTRUCTS.map((c) => [c.key, c]));
export const partOf = new Map(PARTS.map((p) => [p.id, p]));

/** Source with `//` comments blanked (lengths kept, so offsets hold) and `///` docs too. */
export function stripComments(text: string): string {
  let out = ""; let i = 0;
  while (i < text.length) {
    const c = text[i];
    if (c === '"') { let j = i + 1; while (j < text.length && text[j] !== '"') { if (text[j] === "\\") j++; j++; } out += text.slice(i, j + 1); i = j + 1; continue; }
    if (c === "/" && text[i + 1] === "/") { let j = i; while (j < text.length && text[j] !== "\n") j++; out += " ".repeat(j - i); i = j; continue; }
    if (c === "/" && text[i + 1] === "*") { let j = text.indexOf("*/", i + 2); if (j < 0) j = text.length; else j += 2; out += text.slice(i, j).replace(/[^\n]/g, " "); i = j; continue; }
    out += c; i++;
  }
  return out;
}

export interface Use { key: string; offset: number; length: number; line: number }

/** Every use of every construct in `text` (comments stripped), with its line. */
export function usesIn(text: string, file?: string): Use[] {
  const src = stripComments(text);
  const out: Use[] = [];
  const lineOf = (off: number) => { let n = 0; for (let i = 0; i < off; i++) if (src.charCodeAt(i) === 10) n++; return n; };
  for (const c of CONSTRUCTS) {
    if (c.key === "_test.hl") { if (file && /_test\.hl$/.test(file)) out.push({ key: c.key, offset: 0, length: 0, line: 0 }); continue; }
    const re = new RegExp(c.re.source, c.re.flags.includes("g") ? c.re.flags : c.re.flags + "g");
    let m: RegExpExecArray | null; let guard = 0;
    while ((m = re.exec(src)) && guard++ < 5000) {
      if (m[0].length === 0) { re.lastIndex++; continue; }
      out.push({ key: c.key, offset: m.index, length: m[0].length, line: lineOf(m.index) });
    }
  }
  return out;
}

/** The construct spelled at `offset` in `text`: the longest match covering it. */
export function constructAtOffset(text: string, offset: number): Construct | undefined {
  const src = stripComments(text);
  const lo = Math.max(0, text.lastIndexOf("\n", offset) + 1); const hi = text.indexOf("\n", offset); const lineEnd = hi < 0 ? text.length : hi;
  const line = src.slice(lo, lineEnd); const col = offset - lo;
  let best: { c: Construct; len: number } | undefined;
  for (const c of CONSTRUCTS) {
    const re = new RegExp(c.re.source, c.re.flags.replace("m", "") + "g");
    let m: RegExpExecArray | null;
    while ((m = re.exec(line))) {
      if (m[0].length === 0) { re.lastIndex++; continue; }
      if (m.index <= col && col <= m.index + m[0].length && (!best || m[0].length > best.len)) best = { c, len: m[0].length };
    }
  }
  return best?.c;
}

/** The chapter as a URL on GitHub, for when no checkout is at hand. */
export function docUrl(doc: string): string {
  const [p, anchor] = doc.split("#");
  return `https://github.com/hale-lang/hale/blob/main/${p}${anchor ? `#${anchor}` : ""}`;
}
