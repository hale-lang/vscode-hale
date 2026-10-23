// Generates syntaxes/hale.tmLanguage.json from the compiler's keyword
// table (crates/hale-syntax/src/keywords.rs). Run after a language
// change: `node scripts/gen-grammar.mjs [path/to/keywords.rs]`. A
// keyword the script does not classify is listed under
// `x-unclassified` in the output and printed, so a new keyword is a
// visible to-do, never a silent gap.
import fs from "node:fs";
import path from "node:path";

const src = process.argv[2] || ["../hale-main", "../hale"].map((d) => path.resolve(d, "crates/hale-syntax/src/keywords.rs")).find((p) => fs.existsSync(p));
const text = fs.readFileSync(src, "utf8");
function table(name) {
  // Strip comments first: the tables carry `// GH #N` notes that may
  // themselves contain brackets; then take the bracketed list.
  const clean = text.replace(/\/\/[^\n]*/g, "");
  const at = clean.search(new RegExp(`${name}\\s*:`));
  if (at < 0) throw new Error(`no ${name} in ${src}`);
  const open = clean.indexOf("= &[", at) + 3;
  const close = clean.indexOf("]", open + 1);
  if (open < 0 || close < 0) throw new Error(`unterminated ${name} in ${src}`);
  return [...clean.slice(open + 1, close).matchAll(/"([^"]+)"/g)].map((x) => x[1]);
}
const hard = table("HARD_KEYWORDS");
const ctx = table("CONTEXTUAL_KEYWORDS");
const all = [...new Set([...hard, ...ctx])];

// Classification: scope -> keywords. Hard keywords are matched as
// bare words. Contextual ones only in the position the language gives
// them (a block head, a statement head, a hook, a policy after `or`),
// since many are ordinary identifiers elsewhere (`core`, `count`, `node`).
const bare = {
  "keyword.control.hale": ["if", "else", "match", "for", "in", "while", "return", "break", "continue", "yield", "terminate", "violate", "fail", "bubble", "until", "wait"],
  "storage.type.hale": ["locus", "perspective", "type", "const", "fn", "module", "interface", "trait", "impl", "macro", "topic", "group", "constitution", "closure", "ring_layout", "api", "rpc", "unit", "quantity", "point", "distinct", "range"],
  "keyword.control.import.hale": ["import", "export", "as"],
  "storage.modifier.hale": ["let", "mut", "async", "await", "fallible", "main", "inline", "explicit", "approx", "extends", "adopt"],
  "variable.language.hale": ["self"],
  "keyword.operator.word.hale": ["or", "where", "with", "via", "during", "avoiding", "within", "serves", "requires", "includes", "ordered_by", "keyed_by", "persists_through", "resets_on", "resets_per_epoch", "stable_when", "serialize_as", "as_parent_for", "indexed_by"],
};
const blockHeads = ["params", "contract", "bus", "capacity", "placement", "bindings", "claims", "mode", "topology", "schedule", "birth_check", "projection", "roles", "principals", "captures", "epoch", "payload", "subject", "domain", "edges", "seed", "origin", "round"];
const statementHeads = ["subscribe", "publish", "expose", "consume", "forbid", "require", "count", "bound", "cover", "serve", "listen", "connect", "restart", "restart_in_place", "quarantine", "reorganize", "reserve", "tick", "duration"];
const hooks = ["birth", "accept", "release", "run", "drain", "dissolve", "on_failure", "bulk", "harmonic", "resolution", "on_full", "on_overflow"];
const placementFns = ["cooperative", "pinned", "pool", "core", "cores", "replicas", "host", "node", "l3", "heap", "slot_count", "unix", "shm_ring", "http", "role", "intra_process", "intra_machine", "cross_machine", "zero_copy", "reperspective"];
const policies = ["floor", "ceil", "trunc", "half_even", "half_up", "clamp", "wrap", "raise", "discard", "block", "drop", "refuse", "default", "wait", "sum", "prod"];
const projectionClasses = ["rich", "chunked", "recognition", "tier", "fixed_cell", "shared_slab", "spillover", "summary_only", "cap", "inferred", "may_be_empty", "of", "on", "reaches", "effects"];

const classified = new Set(["fleet", ...Object.values(bare).flat(), ...blockHeads, ...statementHeads, ...hooks, ...placementFns, ...policies, ...projectionClasses]);
const unclassified = all.filter((k) => !classified.has(k));
const stale = [...classified].filter((k) => !all.includes(k) && !["default", "effects", "keyed_by", "sealed"].includes(k));

const alt = (ws) => ws.map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|");
const patterns = [
  { include: "#comments" },
  { include: "#strings" },
  { include: "#attributes" },
  { include: "#numbers" },
  // Contextual syntax absent from keywords.rs is specified by grammar.ebnf
  // (seams, set types, routes) and spec/api.md (consumed surfaces).
  { name: "storage.modifier.hale", match: "\\bfleet(?=\\s+locus\\b)" },
  { match: "\\b(seam)\\s+([a-z_][A-Za-z0-9_]*)(?=\\s*\\()", captures: { 1: { name: "keyword.other.block.hale" }, 2: { name: "entity.name.function.hale" } } },
  { name: "keyword.other.block.hale", match: "\\bseam(?=\\s*\\{)" },
  { name: "keyword.other.policy.hale", match: "(?<=\\bor\\s)end\\b" },
  { match: "\\b(api)\\s+([A-Za-z_][A-Za-z0-9_]*)\\s+(from)\\s+(openapi|mcp)(?=\\s*\")", captures: { 1: { name: "storage.type.hale" }, 2: { name: "entity.name.type.hale" }, 3: { name: "keyword.control.import.hale" }, 4: { name: "keyword.control.import.hale" } } },
  { include: "#rpc-row" },
  { name: "entity.name.function.lifecycle.hale", match: `\\b(${alt(hooks)})(?=\\s*\\()` },
  { match: `(?:^|(?<=[{;]))\\s*(${alt(blockHeads)})(?=\\s*(\\{|\\(|:|$))`, captures: { 1: { name: "keyword.other.block.hale" } } },
  { match: `(?:^|(?<=[{;:]))\\s*(${alt(statementHeads)})\\b`, captures: { 1: { name: "keyword.other.statement.hale" } } },
  { name: "support.function.placement.hale", match: `\\b(${alt(placementFns)})(?=\\s*(\\(|=|,|\\)))` },
  { name: "keyword.other.policy.hale", match: `(?<=\\bor\\s)(${alt(policies)})\\b` },
  // These are ordinary qualified values, not api/placement declarations.
  { name: "entity.name.namespace.hale", match: "\\b(?:api|http)(?=::)" },
  { name: "support.type.collection.hale", match: "\\bbounded(?=\\s*\\[)" },
  { name: "storage.type.hale", match: "(?<==)\\s*\\Kenum\\b" },
  // Presence triples are ordinary fields, not a new clear_* keyword.
  { name: "variable.other.property.hale", match: "\\b[a-z_][A-Za-z0-9_]*(?=\\s*:(?!:))" },
  { name: "constant.language.hale", match: "\\b(?:true|false|nil)\\b" },
  ...Object.entries(bare).map(([name, ws]) => ({ name, match: `\\b(${alt(ws)})\\b` })),
  { name: "support.type.primitive.hale", match: "\\b(Int|Uint|Float|Decimal|String|Bool|Time|Duration|Bytes|StringView|BytesView|Never|Unit)\\b" },
  { name: "support.function.std.hale", match: "\\bstd(::[a-z_][A-Za-z0-9_]*)+\\b" },
  { match: "\\b(fn)\\s+([a-z_][A-Za-z0-9_]*)", captures: { 1: { name: "storage.type.hale" }, 2: { name: "entity.name.function.hale" } } },
  { match: "\\b([A-Z][A-Za-z0-9_]*)\\s*(<-)", captures: { 1: { name: "entity.name.type.topic.hale" }, 2: { name: "keyword.operator.send.hale" } } },
  { name: "entity.name.type.hale", match: "\\b[A-Z][A-Za-z0-9_]*\\b" },
  { name: "entity.name.function.call.hale", match: "\\b[a-z_][A-Za-z0-9_]*(?=\\s*\\()" },
  { name: "keyword.operator.hale", match: "<-|->|==|!=|<=|>=|&&|\\|\\||[-+*/%=<>!|]" },
  { name: "punctuation.accessor.hale", match: "::|\\." },
];
const grammar = {
  "$schema": "https://raw.githubusercontent.com/martinring/tmlanguage/master/tmlanguage.json",
  name: "Hale",
  scopeName: "source.hale",
  fileTypes: ["hl"],
  patterns,
  repository: {
    "rpc-row": {
      begin: "\\b(rpc)\\s+(?=[A-Za-z_])", end: ";|(?=\\})",
      beginCaptures: { 1: { name: "storage.type.hale" } },
      patterns: [
        { include: "#comments" }, { include: "#strings" },
        { name: "keyword.other.clause.hale", match: "\\bat(?=\\s*\")|\\b(?:status|wire)(?=\\s*:)" },
        { include: "$self" },
      ],
    },
    comments: { patterns: [
      { name: "comment.line.documentation.hale", match: "///.*$" },
      { name: "comment.line.double-slash.hale", match: "//.*$" },
      { name: "comment.block.hale", begin: "/\\*", end: "\\*/" },
    ] },
    strings: { patterns: [
      // tokens.md: any fence of 3+ quotes; only a line-leading fence
      // of the same length closes it. Raw body: no escapes/interpolation.
      { name: "string.quoted.double.block.hale", begin: '("{3,})[ \\t]*$', end: '^[ \\t]*\\1(?!")' },
      { name: "string.quoted.double.interpolated.hale", begin: "f\"", end: "\"", patterns: [
        { name: "constant.character.escape.hale", match: "\\\\." },
        { name: "meta.embedded.interpolation.hale", begin: "\\{", end: "\\}", patterns: [{ include: "$self" }] },
      ] },
      { name: "string.quoted.double.hale", begin: "\"", end: "\"", patterns: [{ name: "constant.character.escape.hale", match: "\\\\." }] },
      // GH #607: a Time literal is ISO-8601 between backticks.
      { name: "constant.other.time.hale", match: "`\\d{4}-\\d{2}-\\d{2}T[^`]*`" },
    ] },
    attributes: { patterns: [
      { name: "entity.name.tag.attribute.hale", match: "@[A-Za-z_][A-Za-z0-9_]*" },
    ] },
    numbers: { patterns: [
      { match: "\\b(0x[0-9A-Fa-f_]+)\\b", captures: { 1: { name: "constant.numeric.hex.hale" } } },
      { match: "\\b(\\d[\\d_]*(?:\\.\\d[\\d_]*)?(?:[eE][+-]?\\d+)?)([A-Za-z_][A-Za-z0-9_]*)?\\b", captures: { 1: { name: "constant.numeric.hale" }, 2: { name: "keyword.other.unit.hale" } } },
    ] },
  },
  "x-generated-from": path.basename(src),
  "x-keyword-count": all.length,
  "x-unclassified": unclassified,
};
fs.mkdirSync("syntaxes", { recursive: true });
fs.writeFileSync("syntaxes/hale.tmLanguage.json", JSON.stringify(grammar, null, 2) + "\n");
console.log(`grammar: ${all.length} keywords from ${path.basename(src)}; unclassified: ${unclassified.length ? unclassified.join(", ") : "none"}${stale.length ? `; classified but gone from the table: ${stale.join(", ")}` : ""}`);
