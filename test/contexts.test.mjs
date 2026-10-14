// The cursor guides: frames are detected where the grammar puts them,
// every frame kind has a guide whose chapter exists, offers follow the
// seed, and every construct of the language is offered by some guide
// (or is expression-level, which the Language view covers).
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { framesAt, hereAt, GUIDES, guideOf, Here } = require("../dist/contexts.js");
const { CONSTRUCTS } = require("../dist/language.js");

let failures = 0;
const check = (what, ok, detail = "") => { console.log(`${ok ? "ok  " : "FAIL"} ${what}${detail ? " · " + detail : ""}`); if (!ok) failures++; };
const root = ["../hale-main", "../hale"].map((p) => path.resolve(p)).find((p) => fs.existsSync(path.join(p, "crates")));

const text = fs.readFileSync("test/fixtures/claims.hl", "utf8");
const artifact = JSON.parse(fs.readFileSync("test/fixtures/claims.topology.json", "utf8"));
const seed = { artifact, seedDir: path.resolve("test/fixtures") };
const at = (needle, extra = 0) => { const i = text.indexOf(needle); if (i < 0) throw new Error(`fixture lacks ${needle}`); return i + needle.length + extra; };

let fr = framesAt(text, at("bus {", 1));
check("frames: inside a bus block of a locus", fr.map((f) => f.kind).join(">") === "locus>bus" && fr[0].name, fr.map((f) => `${f.kind}:${f.name ?? ""}`).join(">"));
fr = framesAt(text, at("main locus Org {", 1));
check("frames: inside the main locus", fr.length === 1 && fr[0].kind === "main_locus" && fr[0].name === "Org", JSON.stringify(fr.map((f) => f.kind)));
fr = framesAt(text, at("claims {", 1));
check("frames: claims inside main", fr.map((f) => f.kind).join(">") === "main_locus>claims");
fr = framesAt(text, 0);
check("frames: top level is empty", fr.length === 0);
const sample = `locus A {\n    params { x: Int = 0; }\n    closure c { captures: x; epoch inline; }\n    on_failure(w: Worker, err: ClosureViolation) { restart(w); }\n    fn f(n: Int) -> Int { if n > 0 { return 1; } return 0; }\n    run() { let s = Shop { }; }\n}\n`;
const kinds = (needle) => framesAt(sample, sample.indexOf(needle) + needle.length).map((f) => f.kind).join(">");
check("frames: params, closure, on_failure, fn, if, run, literal", kinds("params {") === "locus>params" && kinds("closure c {") === "locus>closure" && kinds("on_failure(w: Worker, err: ClosureViolation) {") === "locus>on_failure" && kinds("if n > 0 {") === "locus>fn>block" && kinds("Shop {") === "locus>run>literal", [kinds("params {"), kinds("closure c {"), kinds("on_failure(w: Worker, err: ClosureViolation) {"), kinds("if n > 0 {"), kinds("Shop {")].join(" | "));
check("frames: on_failure carries its args", framesAt(sample, sample.indexOf("restart")).pop().args === "w: Worker, err: ClosureViolation");

for (const [kind, g] of Object.entries(GUIDES)) {
  const ok = g.gloss.length > 40 && typeof g.doc === "string" && Array.isArray(g.rules) && typeof g.offers === "function" && typeof g.derived === "function";
  if (!ok) check(`guide ${kind} is complete`, false);
  if (root) { const p = path.join(root, g.doc.split("#")[0]); if (!fs.existsSync(p)) check(`guide ${kind}: chapter exists`, false, g.doc); }
}
check(`every guide (${Object.keys(GUIDES).length}) has a gloss, a chapter, rules, offers and derived rows`, true);

// offers follow the seed
let h = hereAt(text, at("bus {", 1), seed);
let offers = guideOf("bus").offers(h);
check("bus offers: every topic of the seed, subscribe and publish", artifact.topics.filter((t) => !/^__/.test(t.name)).every((t) => offers.some((o) => o.label === `subscribe ${t.name}`) && offers.some((o) => o.label === `publish ${t.name}`)), offers.map((o) => o.label).join(", "));
const inBus = h.body().match(/\b(subscribe|publish)\s+(\w+)/g) || [];
check("bus offers: what the block already has is marked present", inBus.every((s) => offers.find((o) => o.label === s.replace(/\s+/, " "))?.present === true), `${inBus.join(", ")} vs ${offers.filter((o) => o.present).map((o) => o.label).join(", ")}`);
let derived = guideOf("bus").derived(h);
check("bus derived: each subscription says whether its handler fn exists", derived.some((n) => /^subscribe/.test(n.label) && /fn \w+ exists|is missing/.test(n.description)), derived.map((n) => n.label + " · " + n.description).join(" | "));
h = hereAt(text, at("main locus Org {", 1), seed);
offers = guideOf("main_locus").offers(h);
check("main offers: params present, placement/bindings/topology offered, hooks listed", offers.find((o) => o.label === "params { }")?.present === true && ["placement { }", "bindings { }", "topology { }", "run()", "on_failure(c: T, err)"].every((l) => offers.some((o) => o.label === l)), offers.map((o) => `${o.label}${o.present ? "*" : ""}`).join(", "));
derived = guideOf("main_locus").derived(h);
check("main derived: the tower names the children with their domains", derived.some((n) => /^tower/.test(n.label) && n.children.length === 2), derived.map((n) => n.label).join(" | "));
h = hereAt(text, at("claims {", 1), seed);
offers = guideOf("claims").offers(h);
check("claims offers: a one-writer claim per single-publisher topic, forbid/require/bound/cover", offers.some((o) => /count publishers\(topic/.test(o.label)) && ["forbid reaches", "bound", "cover", "group"].every((l) => offers.some((o) => o.label === l)), offers.map((o) => o.label).join(", "));
check("claims derived: the seed's claims with verdicts", guideOf("claims").derived(h).length === artifact.claims.length);
const locusName = framesAt(text, at("bus {", 1))[0].name;
h = hereAt(text, at("bus {", 1), seed);
const lh = new Here(text, h.frames.slice(0, 1), seed);
derived = guideOf("locus").derived(lh);
check(`locus derived (${locusName}): instances, hooks, bus, effects, supervisor`, derived.length >= 5 && /instance/.test(derived[0].label) && derived.some((n) => /^bus:/.test(n.label)), derived.map((n) => n.label).join(" | "));
check("top derived without a model says so", guideOf("top").derived(hereAt(text, 0)).length === 1);

// the whole language: every construct's own pattern (from the language table) is spelled by some guide's offer
const literalOnly = new Set(["list literal", "tuple", "Decimal", "Time", "Bytes", "nil", "string concat", "qualified path", "_test.hl", "bench_", "ClosureViolation", "self", "default param", "tier", "recognition sub-mode", "inferred", "reorganize", "only effects", "narrowing policy", "range", "type alias"]);
const seedAll = { artifact, inventory: JSON.parse(fs.readFileSync("test/fixtures/quotes.inventory.json", "utf8")), seedDir: seed.seedDir };
const allText = sample + text;
const plain = (sn) => sn.replace(/\$\{\d+:([^}]*)\}/g, "$1").replace(/\$\{\d+\|([^,|]*)[^}]*\}/g, "$1").replace(/\$\d/g, "");
const offeredText = Object.entries(GUIDES).map(([kind, g]) => {
  const outer = { kind: "main_locus", name: "Org", head: "main locus Org", open: 0, close: allText.length };
  const frames = kind === "top" ? [] : kind === "main_locus" ? [outer] : [outer, { kind, name: "X", args: "c: Worker, err: ClosureViolation", head: kind, open: 0, close: allText.length }];
  const hh = new Here(allText, frames, seedAll);
  try { return g.offers(hh).map((o) => plain(o.snippet)).join("\n"); } catch (e) { check(`guide ${kind} offers run`, false, e.message); return ""; }
}).join("\n");
const notOffered = CONSTRUCTS.filter((c) => !literalOnly.has(c.key) && !c.key.startsWith("std::")).filter((c) => !new RegExp(c.re.source, "m").test(offeredText)).map((c) => c.key);
check(`every construct's pattern is spelled by some guide's offer (${CONSTRUCTS.filter((c) => !literalOnly.has(c.key) && !c.key.startsWith("std::")).length} checked; ${literalOnly.size} literal-only skipped)`, notOffered.length === 0, notOffered.join(", "));
const stdOffered = CONSTRUCTS.filter((c) => c.key.startsWith("std::")).filter((c) => new RegExp(c.re.source, "m").test(offeredText)).length;
console.log(`    stdlib namespaces offered by a guide: ${stdOffered} of ${CONSTRUCTS.filter((c) => c.key.startsWith("std::")).length} (the Language view lists them all)`);

if (failures) { console.error(`${failures} check(s) failed`); process.exit(1); }
console.log("contexts test passed");
