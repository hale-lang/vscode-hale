// Tokenizes a real Hale file with the generated grammar and checks a
// handful of scopes land where the language puts them.
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const vsctm = require("vscode-textmate");
const onig = require("vscode-oniguruma");

const wasm = fs.readFileSync(path.join(path.dirname(require.resolve("vscode-oniguruma")), "onig.wasm")).buffer;
const onigLib = onig.loadWASM(wasm).then(() => ({
  createOnigScanner: (s) => new onig.OnigScanner(s),
  createOnigString: (s) => new onig.OnigString(s),
}));
const registry = new vsctm.Registry({
  onigLib,
  loadGrammar: async () => vsctm.parseRawGrammar(fs.readFileSync("syntaxes/hale.tmLanguage.json", "utf8"), "hale.tmLanguage.json"),
});
const grammar = await registry.loadGrammar("source.hale");
const file = process.argv[2] || "test/fixtures/claims.hl";
const lines = fs.readFileSync(file, "utf8").split("\n");
let state = vsctm.INITIAL;
const found = new Map();
for (const line of lines) {
  const r = grammar.tokenizeLine(line, state);
  for (const t of r.tokens) {
    const txt = line.slice(t.startIndex, t.endIndex);
    const scope = t.scopes[t.scopes.length - 1];
    (found.get(txt) ?? found.set(txt, new Set()).get(txt)).add(scope);
  }
  state = r.ruleStack;
}
const expect = {
  "locus": "storage.type.hale",
  "topic": "storage.type.hale",
  "subscribe": "keyword.other.statement.hale",
  "params": "keyword.other.block.hale",
  "claims": "keyword.other.block.hale",
  "run": "entity.name.function.lifecycle.hale",
  "self": "variable.language.hale",
  "Metrics": "entity.name.type.topic.hale",
  "<-": "keyword.operator.send.hale",
  "ms": "keyword.other.unit.hale",
  "std::time::sleep": "support.function.std.hale",
  "while": "keyword.control.hale",
  "Int": "support.type.primitive.hale",
};
let bad = 0;
for (const [txt, scope] of Object.entries(expect)) {
  const got = found.get(txt);
  const ok = got?.has(scope) ?? false;
  if (!ok) bad++;
  console.log(`${ok ? "ok  " : "FAIL"} ${JSON.stringify(txt)} -> ${got ? [...got].join(" | ") : "(not tokenized)"}${ok ? "" : ` (want ${scope})`}`);
}
if (bad) { console.error(`${bad} scope(s) wrong`); process.exit(1); }
console.log("grammar test passed");
