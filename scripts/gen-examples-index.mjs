// Builds src/examples-index.json: every construct of the language mapped
// to the fixtures, test programs and book snippets that use it, with a
// window of source around each use. Run against a hale checkout:
//   node scripts/gen-examples-index.mjs ../hale-main
// It tracks the language by reading it: the keyword table, the
// annotations and stdlib paths the corpus actually spells.
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(process.argv[2] || "../hale");
const out = "src/examples-index.json";
const WINDOW = 14;
const MAX_PER = 6;

const sources = [
  { dir: "crates/hale-codegen/tests/fixtures/examples", kind: "fixture", weight: 3 },
  { dir: "tests/hale", kind: "test", weight: 2 },
  { dir: "dna/tests/onboarding/todo/api", kind: "app", weight: 2 },
  { dir: "docs/src", kind: "book", weight: 1 },
];

// Construct heads: a keyword at the head of a declaration, statement or
// block, matched as a word. Bare operators (`in`, `as`, `or`) are too
// common to index by themselves and are reached through their context
// (`or raise` and friends are listed as phrases).
const kwText = fs.readFileSync(path.join(root, "crates/hale-syntax/src/keywords.rs"), "utf8").replace(/\/\/[^\n]*/g, "");
const table = (name) => { const at = kwText.search(new RegExp(`${name}\\s*:`)); const open = kwText.indexOf("= &[", at) + 3; const close = kwText.indexOf("]", open + 1); return [...kwText.slice(open + 1, close).matchAll(/"([^"]+)"/g)].map((m) => m[1]); };
const skip = new Set(["in", "as", "or", "of", "on", "with", "where", "via", "self", "let", "mut", "if", "else", "return", "break", "continue", "while", "for", "match", "fn", "type", "const", "import", "export", "main", "trait", "impl", "async", "await", "macro", "cap", "core", "cores", "node", "l3", "pool", "role", "sum", "prod", "tier", "block", "drop", "wait", "fail", "raise", "discard", "default", "floor", "ceil", "trunc", "half_even", "half_up", "clamp", "wrap", "inline", "explicit", "approx", "within", "during", "avoiding", "edges", "seed", "domain", "cover", "count", "bound", "require", "forbid", "reaches", "may_be_empty", "payload", "subject", "listen", "connect", "slot_count", "unix", "shm_ring", "http", "serves", "includes", "requires", "roles", "principals", "captures", "epoch", "duration", "tick", "reserve", "replicas", "schedule", "fixed_cell", "shared_slab", "spillover", "summary_only", "rich", "chunked", "recognition", "projection", "stable_when", "serialize_as", "as_parent_for", "indexed_by", "ordered_by", "persists_through", "resets_on", "resets_per_epoch", "intra_process", "intra_machine", "cross_machine", "zero_copy", "reperspective", "ring_layout", "mode", "birth_check", "topology", "inferred", "consume", "expose", "extends", "adopt", "constitution", "group", "api", "rpc", "unit", "quantity", "point", "distinct", "range", "round", "origin", "yield", "terminate", "bubble", "until", "refuse", "on_full", "on_overflow", "heap"]);
const heads = [...new Set([...table("HARD_KEYWORDS"), ...table("CONTEXTUAL_KEYWORDS")])].filter((k) => !skip.has(k));
const phrases = {
  "set type": /\btype\s+\w+\s*=\s*[\w:]+\s*\|/,
  "seam": /\bseam\s*(?:\{|\w+\s*\()/,
  "or end": /\bor\s+end\s*;/,
  "fleet locus": /\bfleet\s+locus\b/,
  "host": /\bhost\s*\(/,
  "REST route": /\brpc\s+[\w:]+\s+at\s*"/,
  "consumed api": /\bapi\s+\w+\s+from\s+(?:openapi|mcp)\s*"/,
  "wire": /\bwire\s*:\s*"/,
  "three-way field": /\bclear_\w+\s*:\s*Bool\b/,
  "wire map": /\bbounded\[[^\]]+\]\s+indexed_by\b/,
  "block string": /"{3,}\s*$/,
  "avoiding": /\bavoiding\s+[\w:]+/,
  "require separate_domains": /\brequire\s+separate_domains\s*\(/,
  "require no_silent_loss": /\brequire\s+no_silent_loss\s*\(/,
  "cover keys": /\bcover\s+keys\s*\(\s*topic\b/,
  "api::client": /\bapi::client\s*\(/,
  "reads(T)": /\breads\s*\(/, "writes(T)": /\bwrites\s*\(/,
  "creates(T)": /\bcreates\s*\(/, "deletes(T)": /\bdeletes\s*\(/,
  "mutates(T)": /\bmutates\s*\(/,
  "main locus": /\bmain\s+locus\b/, "or raise": /\bor\s+raise\b/, "or discard": /\bor\s+discard\b/, "or self.": /\bor\s+self\.\w+\(err\)/,
  "fallible": /\bfallible\s*\(/, "keyed_by": /\bkeyed_by\b/, "where key": /\bwhere\s+key\s*==/, "subscribe": /\bsubscribe\b/, "publish": /\bpublish\b/, "topic": /\btopic\s+\w+\s*\{/, "api": /\bapi\s+\w+\s*\{/, "rpc": /\brpc\s+\w+::\w+/, "role": /\brole\s+\w+/, "requires": /\brequires:\s*\[/,
  "group": /\bgroup\s+\w+\s*=/, "claims": /\bclaims\s*\{/, "constitution": /\bconstitution\s+\w+/, "adopt": /\badopt\s+\w+;/, "forbid reaches": /\bforbid\s+reaches\b/, "require subscribes": /\brequire\s+subscribes\b/, "require publishes": /\brequire\s+publishes\b/, "count publishers": /\bcount\s+publishers\b/, "bound": /^\s*\w+:\s*bound\s+\w+\s*<=/m,
  "unit": /^\s*unit\s+\w+/m, "quantity": /\bquantity\s+\w+\s+in\b/, "point": /=\s*point\s+\w+/, "distinct": /=\s*distinct\s+\w+/, "range": /\brange:\s*[\d_]+\.\./, "round": /\bround:\s*\w+/,
  "placement": /\bplacement\s*\{/, "pinned": /\bpinned\s*\(/, "cooperative": /\bcooperative\s*\(/, "replicas": /\breplicas\s*(?:=|\()/, "where async_io": /\bwhere\s+async_io\b/, "bindings": /\bbindings\s*\{/,
  "closure": /\bclosure\s+\w+\s*\{/, "violate": /\bviolate\s+\w+/, "epoch inline": /\bepoch\s+inline\b/, "captures": /\bcaptures:/, "on_failure": /\bon_failure\s*\(/, "restart": /\brestart\s*\(/, "restart_in_place": /\brestart_in_place\s*\(/, "quarantine": /\bquarantine\s*\(/, "bubble": /\bbubble\s*[;(]/, "terminate": /\bterminate;/, "self.draining": /\bself\.draining\b/,
  "accept": /\baccept\s*\(\s*\w+:\s*\w+\s*\)/, "release": /\brelease\s*\(\s*\w+:\s*\w+\s*\)/, "birth": /\bbirth\s*\(\s*\)/, "run": /\brun\s*\(\s*\)/, "drain": /\bdrain\s*\(\s*\)/, "dissolve": /\bdissolve\s*\(\s*\)/, "tick": /\btick\s*\(/,
  "capacity": /\bcapacity\s*\{/, "pool": /\bpool\s+\w+\s+of\b/, "heap": /\bheap\s+\w+\s+of\b/, "indexed_by": /\bindexed_by\s+\w+/, "ordered_by": /\bordered_by\b/, "bounded[T; N]": /\bbounded\[/,
  "perspective": /\bperspective\s+\w+/, "interface": /\binterface\s+\w+\s*\{/, "serves": /\bserves\s+\w+/, "expose": /\bexpose\b/, "consume": /\bconsume\b/, "reperspective": /\breperspective\b/, "module": /\bmodule\s+\w+\s*\{/, "import": /^\s*import\s+"/m,
  "match": /\bmatch\s+[\w.]+\s*\{/, "f-string": /\bf"/, "enum": /\btype\s+\w+\s*=\s*enum\b|\btype\s+\w+\s*\{\s*[A-Z]\w*\s*[,}|]/, "yield": /\byield;/, "mode": /\bmode\s+\w+/, "@export": /@export\b/, "@ffi": /@ffi\s*\(/, "target wasm": /\btarget\s+wasm\b/,
  "std::test": /\bstd::test::\w+/, "codec: json": /\bcodec:\s*json\b/, "codec(": /\bcodec\s*\(/,
};
for (const h of heads) if (!(h in phrases)) phrases[h] = new RegExp(`\\b${h.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`);

const index = {};
const add = (key, file, line, text, weight, title) => {
  (index[key] ??= []).push({ file, line, text, weight, title });
};
const walk = (dir) => { const out = []; for (const e of fs.readdirSync(dir, { withFileTypes: true })) { const p = path.join(dir, e.name); if (e.isDirectory()) { if (e.name === "vendor" || e.name === "target" || e.name.startsWith(".")) continue; out.push(...walk(p)); } else if (/\.(hl|md)$/.test(e.name)) out.push(p); } return out; };
const titleOf = (rel, text) => { const first = text.split("\n").find((l) => l.startsWith("//")); return first ? first.replace(/^\/\/+\s*/, "").slice(0, 100) : rel; };

for (const src of sources) {
  const dir = path.join(root, src.dir); if (!fs.existsSync(dir)) continue;
  for (const f of walk(dir)) {
    const rel = path.relative(root, f); const raw = fs.readFileSync(f, "utf8");
    // A book chapter contributes its hale code blocks, each as its own window; a .hl file is one window source.
    const blocks = f.endsWith(".md") ? [...raw.matchAll(/```hale[^\n]*\n([\s\S]*?)```/g)].map((m) => ({ text: m[1], offset: raw.slice(0, m.index).split("\n").length })) : [{ text: raw, offset: 1 }];
    for (const b of blocks) {
      const lines = b.text.split("\n");
      const seen = new Set();
      lines.forEach((l, i) => {
        for (const [key, re] of Object.entries(phrases)) {
          if (seen.has(key) || !re.test(l)) continue;
          seen.add(key);
          const lo = Math.max(0, i - 3); const hi = Math.min(lines.length, lo + WINDOW);
          add(key, rel, b.offset + i, lines.slice(lo, hi).join("\n"), src.weight + (rel.includes(key.replace(/[^a-z]/g, "")) ? 2 : 0), titleOf(rel, b.text));
        }
      });
      // annotations and stdlib namespaces, by what the text spells
      for (const m of b.text.matchAll(/@(form|effects|budget|sealed|hot|supervised|unbounded|bounded_by|phase_effects|rpc|locality|no_syscall|no_block|no_ffi|no_publish|no_spawn|no_recursion|deterministic|no_panic|secret|gated|repo|idempotent|not_idempotent|not_found|conflict|invalid|forbidden|unavailable)\b(\(([a-z_]+)[^)]*\))?/g)) {
        const key = m[1] === "form" && m[3] ? `@form(${m[3]})` : `@${m[1]}`;
        if (seen.has(key)) continue; seen.add(key);
        const i = b.text.slice(0, m.index).split("\n").length - 1; const lo = Math.max(0, i - 2);
        add(key, rel, b.offset + i, lines.slice(lo, lo + WINDOW).join("\n"), src.weight, titleOf(rel, b.text));
      }
      for (const m of b.text.matchAll(/\bstd::([a-z_]+)(?:::([a-z_]+))?::[a-zA-Z_]/g)) {
        const key = m[2] && /^(io|api|bus|net)$/.test(m[1]) ? `std::${m[1]}::${m[2]}` : `std::${m[1]}`;
        if (seen.has(key)) continue; seen.add(key);
        const i = b.text.slice(0, m.index).split("\n").length - 1; const lo = Math.max(0, i - 3);
        add(key, rel, b.offset + i, lines.slice(lo, lo + WINDOW).join("\n"), src.weight, titleOf(rel, b.text));
      }
      for (const m of b.text.matchAll(/\b(unix|http|mcp|grpc|ws|test)::(Rpc|Hub|Rest|Client)\s*\{/g)) {
        const key = `${m[1]}::${m[2]}`; if (seen.has(key)) continue; seen.add(key);
        const i = b.text.slice(0, m.index).split("\n").length - 1; const lo = Math.max(0, i - 2);
        add(key, rel, b.offset + i, lines.slice(lo, lo + WINDOW).join("\n"), src.weight, titleOf(rel, b.text));
      }
    }
  }
}
for (const k of Object.keys(index)) {
  index[k].sort((a, b) => b.weight - a.weight || a.text.length - b.text.length);
  index[k] = index[k].slice(0, MAX_PER).map(({ weight, ...e }) => e);
}
const keys = Object.keys(index).sort();
fs.writeFileSync(out, JSON.stringify({ generatedFrom: path.basename(root), constructs: Object.fromEntries(keys.map((k) => [k, index[k]])) }));
const empty = Object.keys(phrases).filter((k) => !index[k]);
console.log(`examples index: ${keys.length} constructs, ${keys.reduce((n, k) => n + index[k].length, 0)} examples, ${(fs.statSync(out).size / 1024).toFixed(0)} KB${empty.length ? `; no example found for: ${empty.join(", ")}` : ""}`);
