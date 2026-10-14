// The catalog against the language: every construct's pattern hits a
// real program in the hale checkout, every keyword of the compiler's
// table is spelled by a row, every chapter a row points at exists.
// Needs a checkout beside this one (../hale-main or ../hale); without
// one only the self-consistency checks run.
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { CONSTRUCTS, PARTS, KEYWORD_COVERAGE, byKey, stripComments, usesIn, constructAtOffset } = require("../dist/language.js");

let failures = 0;
const check = (what, ok, detail = "") => { console.log(`${ok ? "ok  " : "FAIL"} ${what}${detail ? " · " + detail : ""}`); if (!ok) failures++; };
const root = [process.env.HALE_ROOT, "../hale-main", "../hale"].filter(Boolean).map((p) => path.resolve(p)).find((p) => fs.existsSync(path.join(p, "crates")));

// self-consistency
check("every construct belongs to a part", CONSTRUCTS.every((c) => PARTS.some((p) => p.id === c.part)), CONSTRUCTS.filter((c) => !PARTS.some((p) => p.id === c.part)).map((c) => c.key).join(","));
check("construct keys are unique", new Set(CONSTRUCTS.map((c) => c.key)).size === CONSTRUCTS.length);
check("every keyword mapping names a row", Object.entries(KEYWORD_COVERAGE).every(([, k]) => k === "(reserved)" || byKey.has(k)), Object.entries(KEYWORD_COVERAGE).filter(([, k]) => k !== "(reserved)" && !byKey.has(k)).map(([w, k]) => `${w}->${k}`).join(","));
const sample = 'locus A {\n    // a comment with locus words\n    params { s: String = "// not a comment"; }\n    /* block\n       comment */\n    run() { }\n}\n';
check("stripComments keeps offsets", stripComments(sample).length === sample.length && !/a comment with/.test(stripComments(sample)) && /not a comment/.test(stripComments(sample)));
const u = usesIn(sample);
check("usesIn finds locus, params, run and a string param, not the comment", u.some((x) => x.key === "locus") && u.some((x) => x.key === "params") && u.some((x) => x.key === "run") && !u.some((x) => x.key === "locus" && x.line === 1), u.map((x) => x.key).join(","));
check("constructAtOffset: the cursor on `params` names it", constructAtOffset(sample, sample.indexOf("params") + 2)?.key === "params");
check("constructAtOffset: the longest match wins (main locus over locus)", constructAtOffset("main locus App {", 7)?.key === "main locus");

if (!root) { console.log("no hale checkout beside this one: corpus checks skipped"); }
else {
  const kw = fs.readFileSync(path.join(root, "crates/hale-syntax/src/keywords.rs"), "utf8").replace(/\/\/[^\n]*/g, "");
  const table = (name) => { const at = kw.search(new RegExp(`${name}\\s*:`)); const open = kw.indexOf("= &[", at) + 3; const close = kw.indexOf("]", open + 1); return [...kw.slice(open + 1, close).matchAll(/"([^"]+)"/g)].map((m) => m[1]); };
  const words = [...new Set([...table("HARD_KEYWORDS"), ...table("CONTEXTUAL_KEYWORDS")])];
  const missing = words.filter((w) => !(w in KEYWORD_COVERAGE));
  check(`every keyword of the compiler's table (${words.length}) is spelled by a row`, missing.length === 0, missing.join(","));
  const stale = Object.keys(KEYWORD_COVERAGE).filter((w) => !words.includes(w));
  check("no mapping names a word the compiler no longer has", stale.length === 0, stale.join(","));
  for (const p of PARTS) check(`part ${p.id}: chapter exists`, fs.existsSync(path.join(root, p.doc.split("#")[0])), p.doc);
  const badDocs = CONSTRUCTS.filter((c) => !fs.existsSync(path.join(root, c.doc.split("#")[0])));
  check("every construct's chapter exists", badDocs.length === 0, badDocs.map((c) => `${c.key}:${c.doc}`).join(","));

  // the corpus: fixtures, the test programs, the onboarding app, the book's hale blocks
  const walk = (dir) => { const out = []; if (!fs.existsSync(dir)) return out; for (const e of fs.readdirSync(dir, { withFileTypes: true })) { const p = path.join(dir, e.name); if (e.isDirectory()) { if (["vendor", "target", "node_modules"].includes(e.name) || e.name.startsWith(".")) continue; out.push(...walk(p)); } else if (/\.(hl|md)$/.test(e.name)) out.push(p); } return out; };
  const files = ["crates/hale-codegen/tests/fixtures/examples", "tests/hale", "dna/tests/onboarding", "docs/src", "iris/examples", "crates/hale-stdlib/hl"].flatMap((d) => walk(path.join(root, d)));
  const hits = new Map(CONSTRUCTS.map((c) => [c.key, 0]));
  let total = 0;
  for (const f of files) {
    const raw = fs.readFileSync(f, "utf8");
    const texts = f.endsWith(".md") ? [...raw.matchAll(/```hale[^\n]*\n([\s\S]*?)```/g)].map((m) => m[1]) : [raw];
    for (const t of texts) { total++; const seen = new Set(usesIn(t, f).map((x) => x.key)); for (const k of seen) hits.set(k, hits.get(k) + 1); }
  }
  const specOnly = new Set(CONSTRUCTS.filter((c) => c.corpus === "spec").map((c) => c.key));
  const zero = [...hits].filter(([k, n]) => n === 0 && k !== "_test.hl" && !specOnly.has(k)).map(([k]) => k);
  check(`every construct is spelled somewhere in the corpus (${total} programs and snippets)`, zero.length === 0, zero.join(", "));
  const appeared = [...hits].filter(([k, n]) => n > 0 && specOnly.has(k)).map(([k, n]) => `${k}(${n})`);
  check(`a spec-only construct (${specOnly.size}) is still unspelled by the corpus; flip its flag when it appears`, appeared.length === 0, appeared.join(", "));
  const rare = [...hits].filter(([, n]) => n > 0 && n < 2).map(([k, n]) => `${k}(${n})`);
  if (rare.length) console.log(`    rare (one source): ${rare.join(", ")}`);
  console.log(`    coverage: ${[...hits].filter(([, n]) => n > 0).length}/${CONSTRUCTS.length} constructs seen; top: ${[...hits].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([k, n]) => `${k} ${n}`).join(", ")}`);
}
if (failures) { console.error(`${failures} check(s) failed`); process.exit(1); }
console.log("language test passed");
