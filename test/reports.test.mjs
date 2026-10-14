// The report parsers over what the compiler actually prints (fixtures
// captured from hale-main), and the model diff's shape.
import fs from "node:fs";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { parseUnits, parseSections, parseFlows, parseBudget, parseTargets, parseEnvironments, parseModelDiff, parseDiagnostics } = require("../dist/reports.js");

let failures = 0;
const check = (what, ok, detail = "") => { console.log(`${ok ? "ok  " : "FAIL"} ${what}${detail ? " · " + detail : ""}`); if (!ok) failures++; };
const read = (n) => fs.readFileSync(`test/fixtures/reports/${n}`, "utf8");

const u = parseUnits(read("units.json"));
check("units: declarations parsed", u && u.declarations.length >= 4, `${u?.declarations.length}`);
const money = u.declarations.find((d) => d.name === "Money");
check("units: Money is a quantity in cent with headroom", money && money.kind === "quantity" && money.denomination === "cent" && money.headroom?.count, JSON.stringify(money).slice(0, 120));
const ledger = u.declarations.find((d) => d.name === "Ledger");
check("units: Ledger carries its rounding policy and its base", ledger && ledger.policy === "half_even" && ledger.of === "Money" && /main\.hl:\d+:\d+/.test(ledger.policy_from?.at ?? ""), JSON.stringify(ledger).slice(0, 160));
check("units: OrderId is an identity", u.declarations.some((d) => d.name === "OrderId" && d.kind === "identity"));

const s = parseSections(read("sealable.txt"));
check("sealable: summary and a free-to-seal section", /\d+ of \d+ loci/.test(s.summary) && s.sections.some((x) => /free to seal/.test(x.title)), `${s.summary} · ${s.sections.map((x) => x.title + "(" + x.items.length + ")").join(", ")}`);
check("sealable: the author's loci are items", s.sections.flatMap((x) => x.items).includes("Shop") && s.sections.flatMap((x) => x.items).includes("Tokens"));

const f = parseFlows(read("flows.txt"));
check("flows: four flow types with release clauses", f.flows.length === 4 && f.flows.every((x) => x.clauses.length >= 1), f.flows.map((x) => `${x.type}:${x.clauses.length}`).join(","));
check("flows: a clause names its owner and drops 'no seed location'", f.flows[0].clauses[0].text.startsWith("release(") && / in /.test(f.flows[0].clauses[0].text) && f.flows[0].clauses[0].at === undefined, JSON.stringify(f.flows[0].clauses[0]));
check("flows: the summary counts them", /4 locus type/.test(f.summary), f.summary);

const b = parseBudget(read("budget.txt"));
check("budget: top rows with nested counts", b.some((r) => /OS threads/.test(r.label) && r.children.some((c) => /adapters/.test(c.label))), b.map((r) => r.label).join(" | "));
check("budget: bus subjects list their items", b.some((r) => /bus subjects/.test(r.label) && r.children.some((c) => c.label === "Shipments")), JSON.stringify(b.find((r) => /bus subjects/.test(r.label))).slice(0, 200));
check("budget: pools are named", b.some((r) => /cooperative pools/.test(r.label) && /work/.test(r.value)));

const t = parseTargets(read("targets.txt"));
check("targets: triples with notes", t.length >= 2 && t.every((x) => /^[a-z0-9_]+-/.test(x.name) && x.note), t.map((x) => x.name).join(","));

const e = parseEnvironments(read("hale.toml"));
check("environments: local and org with their entrypoints", e.length === 2 && e[0].name === "local" && e[0].entrypoints.length === 3 && e[0].sourceOnly === true && e[1].entrypoints[0] === "dna/org", JSON.stringify(e));
const e2 = parseEnvironments('[claims]\nbase = "Shop"\n[environments.dev]\nconstitution = "ShopDev"\nentrypoints  = ["apps/front", "apps/pay"]\n[environments.prod]\nentrypoints = ["apps/front"]\nsource_only = true\n');
check("environments: a constitution is read", e2[0].constitution === "ShopDev" && e2[1].sourceOnly && !e2[0].sourceOnly, JSON.stringify(e2));

const d0 = parseModelDiff(read("modeldiff.json"));
check("model diff: a source-only edit is classified so", d0?.classification === "source-only" && d0.declarations.every((x) => x.change === "persisted"));
const d1 = parseModelDiff(read("modeldiff-shape.json"));
check("model diff: an added topic is a model-shape change naming it", d1?.classification === "model-shape" && d1.declarations.some((x) => x.change === "added" && x.kind === "topic" && x.name === "Probe"), d1?.declarations.filter((x) => x.change !== "persisted").map((x) => `${x.change} ${x.name}`).join(","));

const diag = parseDiagnostics('ok\n{"file":"a.hl","line":3,"col":1,"severity":"warning","kind":"advisory","message":"unbounded allocation"}\nnot json\n');
check("diagnostics: json lines only", diag.length === 1 && diag[0].kind === "advisory");

if (failures) { console.error(`${failures} check(s) failed`); process.exit(1); }
console.log("reports test passed");
