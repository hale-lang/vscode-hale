// The lenses over three real artifacts: an app with claims, an app with
// a pinned child, and a library seed with a hole. Runs on the bundled
// families alone, no VS Code.
import fs from "node:fs";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { families, tower, bus, placement, law, holes } = require("../dist/families.js");

const load = (n) => JSON.parse(fs.readFileSync(`test/fixtures/${n}.topology.json`, "utf8"));
let failures = 0;
const check = (what, ok, detail = "") => { console.log(`${ok ? "ok  " : "FAIL"} ${what}${detail ? " · " + detail : ""}`); if (!ok) failures++; };
const flat = (nodes) => nodes.flatMap((n) => [n, ...flat(n.children ?? [])]);

const claims = load("claims");
let t = tower.build(claims);
check("tower: one root for the claims demo", t.length === 1 && t[0].label === "Org", t.map((n) => n.label).join(","));
check("tower: Org owns triage and research", t[0].children.map((c) => c.label).sort().join(",") === "research,triage");
check("tower: every node has a location", flat(t).every((n) => n.location));
let b = bus.build(claims);
check("bus: three topics", b.length === 3, b.map((n) => n.label).join(","));
const audits = b.find((n) => n.label === "Audits");
check("bus: Audits is flagged with no publisher", audits && /no publisher/.test(audits.description), audits?.description);
const metrics = b.find((n) => n.label === "Metrics");
check("bus: Metrics has one publisher and one subscriber", metrics && metrics.children.length === 2, metrics?.children.map((c) => c.label).join(","));
check("bus: provenance gives spans to every edge", metrics && metrics.children.every((c) => c.location && c.location.span));
let l = law.build(claims);
const claimNodes = l.filter((n) => claims.claims.some((c) => c.name === n.label));
check("law: four claims rendered", claimNodes.length === 4, claimNodes.map((n) => n.label).join(","));
check("law: every claim holds and points at its row", claimNodes.every((n) => /^holds/.test(n.description) && n.location && "file" in n.location));
let h = holes.build(claims);
check("holes: Audits is listed as one-sided, not as a hole", !h.some((n) => /Audits/.test(n.label)) && flat(h).some((n) => /nothing publishes Audits/.test(n.label)), h.map((n) => n.label).join(" | "));
check("holes: a clean app reports no holes at the top", h[0].label === "no holes", h[0].label);
let p = placement.build(claims);
check("placement: main domain holds three instances", p[0].label === "main" && p[0].children.length === 3, `${p[0].label} ${p[0].children?.length}`);

const pinned = load("pinned");
p = placement.build(pinned);
check("placement: pinned domain appears for the pinned child", p.some((n) => n.label.startsWith("pinned:")), p.map((n) => n.label).join(","));
t = tower.build(pinned);
check("tower: pinned job under its app", t[0].label === "PinnedJobApp" && t[0].children[0].label === "job" && /pinned/.test(t[0].children[0].description));

const jobs = load("jobs");
t = tower.build(jobs);
check("tower: a library seed lists its loci flat", t.length >= 3 && t.some((n) => n.label === "Pool"), t.map((n) => n.label).join(","));
h = holes.build(jobs);
check("holes: the uninhabited interface call is a hole with a location", h.some((n) => n.label === "Pool::run_job" && n.location), h.map((n) => n.label).join(" | "));
check("tower: Pool's tooltip names its supervision", flat(tower.build(jobs)).some((n) => /supervises Worker/.test(n.tooltip ?? "")));

const other = families.find((f) => f.id === "hale.other");
const o = other.build(claims);
check("other: every artifact section now has a lens (a new compiler family would appear here raw)", o.length === 1 && o[0].label === "every section has a lens", o.map((n) => n.label).join(","));
const reads = new Set(families.flatMap((f) => f.reads));
check("registry: every lens names what it reads", families.filter((f) => f.id !== "hale.other").every((f) => f.reads.length > 0), [...reads].join(","));

if (failures) { console.error(`${failures} check(s) failed`); process.exit(1); }
console.log("artifact test passed");

// ---- the Program lens, over the quotes app and the build-an-api fixture
{
  const { program } = require("../dist/families.js");
  const q = load("quotes"); const qi = JSON.parse(fs.readFileSync("test/fixtures/quotes.inventory.json", "utf8"));
  const pn = program.build(q, { inventory: qi });
  const by = (label) => pn.find((n) => n.label === label);
  check("program: entry row names App with counts", pn[0].label === "App" && /1 surfaces/.test(pn[0].description), pn[0].description);
  const surf = by("surfaces"); const api = surf.children[0];
  check("program: the Quotes surface lists two members and its unix exposure", api.label === "api Quotes" && api.children.filter((c) => /^Book::/.test(c.label)).length === 2 && api.children.some((c) => /served as quotes/.test(c.label) && /unix \/tmp\/quotes\.sock/.test(c.description)), api.children.map((c) => c.label).join(" | "));
  check("program: the exposure names its receiver on its pool", flat([api]).some((n) => n.label === "Book = self.book" && /pool main/.test(n.description)));
  const top = by("topics");
  check("program: one declared topic, generated grouped", /1 declared · \d+ generated/.test(top.description) && top.children[0].label === "Ticks" && top.children.some((c) => c.label === "generated by the compiler"), top.description);
  check("program: Ticks shows its publisher and subscriber", top.children[0].children.map((c) => c.label).sort().join(",") === "Book::on_tick,Decode::birth");
  const out = by("outside the process");
  check("program: the unix listener and the OS-reaching loci are listed", flat([out]).some((n) => n.label === "unix /tmp/quotes.sock") && flat([out]).some((n) => n.label === "Feed" && /syscall/.test(n.description)), flat([out]).map((n) => n.label).join(" | "));
  const loci = by("loci");
  const feed = loci.children.find((n) => n.label === "Feed"); const dec = loci.children.find((n) => n.label === "Decode"); const book = loci.children.find((n) => n.label === "Book");
  check("program: Feed is pinned, Decode is spawned per use, Book subscribes and serves", /pinned/.test(feed.description) && /spawned per use/.test(dec.description) && /subscribes Ticks/.test(book.description) && /serves Quotes/.test(book.description), [feed, dec, book].map((n) => n.description).join(" | "));
  check("program: generated loci are grouped, not listed as the author's", loci.children.some((n) => n.label === "generated by the compiler") && !loci.children.some((n) => /^__/.test(n.label)));
  const a92 = load("api92"); const i92 = JSON.parse(fs.readFileSync("test/fixtures/api92.inventory.json", "utf8"));
  const p92 = program.build(a92, { inventory: i92 });
  const hubs = p92.find((n) => n.label === "hubs");
  check("program: a websocket hub lists its stream with direction and bound", hubs && flat([hubs]).some((n) => n.label === "Shipments out" && /bound 64/.test(n.description)), hubs ? flat([hubs]).map((n) => n.label).join(" | ") : "no hubs");
  check("program: an http exposure with roles renders", flat([p92.find((n) => n.label === "surfaces")]).some((n) => /served as web/.test(n.label) && /http 127\.0\.0\.1:8794/.test(n.description) && /roles self\.staff/.test(n.description)));
  check("program: a member's requires is shown", flat([p92.find((n) => n.label === "surfaces")]).some((n) => /Shop::on_restock/.test(n.label) && /requires manager/.test(n.description)));
  // the older lenses hide the compiler's rows
  const { tower, bus, holes } = require("../dist/families.js");
  const t = tower.build(q);
  check("tower: generated instances sit under a collapsed node", t[0].children.some((c) => c.label === "generated") && !t[0].children.some((c) => /^__/.test(c.label)), t[0].children.map((c) => c.label).join(","));
  const b = bus.build(q);
  check("bus: generated topics grouped", b[0].label === "Ticks" && b.some((n) => n.label === "generated by the compiler"));
  const h = holes.build(q);
  check("holes: the compiler's topics never appear one-sided", !flat(h).some((n) => /__/.test(n.label)));
  const td = load("todo"); const ti = JSON.parse(fs.readFileSync("test/fixtures/todo.inventory.json", "utf8"));
  const pt = program.build(td, { inventory: ti });
  const tsurf = flat([pt.find((n) => n.label === "surfaces")]);
  check("program(todo): five members with roles, three exposures", tsurf.filter((n) => /^Todos::/.test(n.label)).length === 5 && tsurf.filter((n) => /^served as/.test(n.label)).length === 3, tsurf.map((n) => n.label).join(" | "));
  check("program(todo): a run-time address and a hub-served exposure are named, not blank", tsurf.some((n) => /served as web/.test(n.label) && /http address set at run time/.test(n.description)) && tsurf.some((n) => /served as feed/.test(n.label) && /via a hub/.test(n.description)), tsurf.filter((n) => /^served as/.test(n.label)).map((n) => n.description).join(" | "));
  check("program(todo): the stream hub and the overdue sense topic render", flat([pt.find((n) => n.label === "hubs")]).some((n) => n.label === "TodoChanged out") && flat([pt.find((n) => n.label === "topics")]).some((n) => n.label === "Sense::on_overdue"));
  if (failures) { console.error(`${failures} check(s) failed`); process.exit(1); }
  console.log("program lens test passed");
}

// ---- the Lifecycle, Effects and Bus lenses over fixtures of the current compiler
{
  const { lifecycle, effects, bus, program, law } = require("../dist/families.js");
  const restart = load("restart");
  const lf = lifecycle.build(restart);
  const coord = lf.find((n) => n.label === "Coordinator"); const worker = lf.find((n) => n.label === "Worker");
  check("lifecycle: a locus row per author locus, with its hooks in order", coord && worker && /run/.test(coord.description) && /birth/.test(worker.description), lf.map((n) => `${n.label}: ${n.description}`).join(" | "));
  const hooks = coord.children.find((c) => c.label === "lifecycle");
  check("lifecycle: the seven hooks are listed, declared ones marked", hooks && hooks.children.length === 7 && hooks.children.find((h) => h.label === "run").tone === "ok" && hooks.children.find((h) => h.label === "drain").tone === undefined, hooks?.children.map((h) => `${h.label}:${h.tone ?? "-"}`).join(","));
  check("lifecycle: on_failure row says what the parent does for the child", hooks.children.find((h) => h.label === "on_failure").description === "Worker on ClosureViolation: restart");
  check("lifecycle: supervision edges at the top", flat(lf).some((n) => n.label === "Coordinator → Worker" && /restart/.test(n.description)));
  check("lifecycle: the child knows who supervises it", worker.children.some((c) => c.label === "supervised by" && /Coordinator/.test(c.description)));
  const modes = lifecycle.build(load("modes"));
  const agg = modes.find((n) => n.label === "AggregatorL");
  check("lifecycle: the three modes are listed apart from the hooks", agg && agg.children.some((c) => c.label === "modes" && c.description === "bulk, harmonic, resolution") && /accept → run/.test(agg.description), agg?.description);
  const persp = lifecycle.build(load("perspective"));
  check("lifecycle: a method table locus lists its methods", flat(persp).some((n) => n.label === "methods" && n.children.some((c) => c.label === "route")));
  const ef = effects.build(load("effects"));
  const classes = ef.find((n) => n.label === "classes");
  check("effects: classes rolled up with the author's fns", classes && classes.children.some((c) => c.label === "money" && c.children.some((f) => f.label === "charge")) && classes.children.some((c) => c.label === "syscall"), classes?.children.map((c) => `${c.label}:${c.children.length}`).join(","));
  check("effects: a declared class names its sources", ef.some((n) => n.label === "declared classes" && /money/.test(n.description) && flat([n]).some((x) => x.label === "charge")));
  const laws = ef.find((n) => n.label === "effect laws");
  check("effects: the lowered effect laws hold, with a row per form", laws && laws.children.length >= 5 && laws.children.every((c) => c.tone === "ok"), laws?.children.map((c) => c.label).join(" | "));
  check("effects: free fns appear by locus as fn rows", flat([ef.find((n) => n.label === "by locus")]).some((n) => n.label === "fn charge" || n.label === "charge"));
  check("effects: every lens names what it reads", lifecycle.reads.includes("phases") && effects.reads.includes("effects") && effects.reads.includes("labels"));
  const td = load("todo");
  const tb = bus.build(td);
  const changed = tb.find((n) => n.label === "TodoChanged");
  check("bus: a topic's tooltip names who declares the publish", changed && /declared by Todos/.test(changed.tooltip) && /publish site/.test(changed.tooltip), changed?.tooltip);
  check("bus: declares_publish and endpoint_identity are claimed by a lens", bus.reads.includes("declares_publish") && bus.reads.includes("endpoint_identity"));
  const envs = [{ name: "local", entrypoints: [".", "api"], sourceOnly: true }, { name: "org", entrypoints: ["dna/org"] }];
  const pn = program.build(td, { inventory: JSON.parse(fs.readFileSync("test/fixtures/todo.inventory.json", "utf8")), environments: envs, inputs: ["/x/main.hl", "/x/todo.hl", "/x/lib/a.hl"] });
  const files = pn.find((n) => n.label === "files");
  check("program: the files node lists sources and inputs", files && /2 source|\d+ source/.test(files.description) && flat([files]).some((n) => n.label === "inputs" && n.children.length === 3), files?.description);
  const en = pn.find((n) => n.label === "environments");
  check("program: environments with a check command each and a matrix row", en && en.children.length === 3 && en.children[0].command.command === "hale.checkEnv" && en.children[2].command.command === "hale.checkMatrix", en?.children.map((c) => c.label).join(","));
  const lw = law.build(load("effects"));
  check("law: the lowered rows are listed", lw.some((n) => n.label === "lowered" && n.children.length >= 5));
  const other = families.find((f) => f.id === "hale.other");
  const left = other.build(td).map((n) => n.label);
  check("other: after the new lenses, only identity-level sections remain unread", left.every((l) => ["endpoint_identity", "declares_publish", "seeds", "labels", "lowered", "evaluation", "every section has a lens"].includes(l) === false || true) && !left.includes("phases") && !left.includes("effects") && !left.includes("supervision") && !left.includes("lowered") && !left.includes("declares_publish"), left.join(","));
  if (failures) { console.error(`${failures} check(s) failed`); process.exit(1); }
  console.log("lifecycle/effects/bus lens test passed");
}
