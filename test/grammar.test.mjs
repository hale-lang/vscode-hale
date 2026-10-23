// Tokenizes a real Hale file with the generated grammar and checks a
// handful of scopes land where the language puts them.
import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
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

// A scope must cover the requested position in the actual source line:
// matching a word in a comment or an unrelated occurrence cannot pass.
const fixtureRoot = "test/fixtures/v0.28";
const sources = JSON.parse(fs.readFileSync(`${fixtureRoot}/sources.json`, "utf8"));
for (const [file, fixture] of Object.entries(sources.files)) {
  const raw = fs.readFileSync(`${fixtureRoot}/${file}`);
  assert.equal(createHash("sha256").update(raw).digest("hex"), fixture.sha256, `${file}: upstream copy changed`);
  const sourceLines = raw.toString("utf8").split("\n");
  let stack = vsctm.INITIAL;
  const tokens = sourceLines.map((line) => {
    const result = grammar.tokenizeLine(line, stack);
    stack = result.ruleStack;
    return result.tokens;
  });
  assert.equal(stack.depth, vsctm.INITIAL.depth, `${file}: unterminated grammar region`);
  for (const a of fixture.assertions) {
    const lineNumber = sourceLines.indexOf(a.line);
    assert.notEqual(lineNumber, -1, `${file}: missing source line ${a.line}`);
    let start = -1;
    for (let i = 0; i <= (a.occurrence ?? 0); i++) start = a.line.indexOf(a.token, start + 1);
    assert.notEqual(start, -1, `${file}: missing token ${a.token}`);
    for (let offset = start; offset < start + a.token.length; offset++) {
      const token = tokens[lineNumber].find((t) => t.startIndex <= offset && offset < t.endIndex);
      assert.equal(token?.scopes.at(-1), a.scope, `${file}:${lineNumber + 1} ${a.token}`);
    }
  }
  console.log(`ok   ${file}: ${fixture.assertions.length} position-specific scope assertions`);
}
assert.deepEqual(JSON.parse(fs.readFileSync("syntaxes/hale.tmLanguage.json", "utf8"))["x-unclassified"], []);
console.log("upstream fixture grammar tests passed");
