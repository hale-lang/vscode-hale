import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { blocks, mask, closing, methods, missingMethods, repoErrors, generateRepo, generateApi, apiMethods, applyInsertions } = require('../dist/scaffold.js');
const source = (text, id = 'main.hl') => ({ id, text });
const apply = (s, edits) => source(applyInsertions(s, edits), s.id);
const repoFile = source(fs.readFileSync(new URL('fixtures/v0.28/repo_memory_test.hl', import.meta.url), 'utf8'));
const repo = blocks(repoFile).find(b => b.repo);
assert.deepEqual(missingMethods(repo), []);
assert.deepEqual(generateRepo(repo, [repoFile]), []);
// Remove implementations from a real upstream fixture to simulate adding @repo.
function withoutCrud(keep = []) {
  let text = repoFile.text;
  const spans = methods(repo).filter(m => ['get', 'create', 'put', 'remove'].includes(m.name) && !keep.includes(m.name)).map(m => {
    const start = text.lastIndexOf('@effects', m.start), open = mask(text).indexOf('{', m.start);
    return [start, closing(mask(text), open) + 1];
  });
  for (const [start, end] of spans.sort((a, b) => b[0] - a[0])) text = text.slice(0, start) + text.slice(end);
  return source(text);
}
const checks = [];
const empty = withoutCrud();
const filled = apply(empty, generateRepo(blocks(empty).find(b => b.repo), [empty]));
assert.match(filled.text, /fn get\(id: OrderId\) -> Order fallible\(MemOrdersError\)/);
assert.equal((filled.text.match(/@not_idempotent/g) || []).length, 3);
assert.deepEqual(missingMethods(blocks(filled).find(b => b.repo)), []);
assert.deepEqual(generateRepo(blocks(filled).find(b => b.repo), [filled]), []);
checks.push(['repo', filled]);
const partial = withoutCrud(['get']);
const partialBlock = blocks(partial).find(b => b.repo);
assert.deepEqual(repoErrors(partialBlock, [partial]).variants, ['OrderError::Missing', 'OrderError::Exists']);
assert.throws(() => generateRepo(partialBlock, [partial]), /Choose/);
const partialFilled = apply(partial, generateRepo(partialBlock, [partial], 'OrderError::Missing'));
assert.equal((partialFilled.text.match(/fn get\(/g) || []).length, 1);
assert.match(partialFilled.text, /fn put\(id: OrderId, o: Order\) -> Order fallible\(OrderError\)/);
checks.push(['partial', partialFilled]);
const noKey = source(empty.text.replace('db:"id,key"', 'db:"id"'));
assert.throws(() => generateRepo(blocks(noKey).find(b => b.repo), [noKey]), /exactly one/);
// Brace-like declarations in raw strings/comments must not produce edits.
const raw = source('/* locus Fake { } */\n' + 'fn raw() -> String { return """"\n@repo(Order) locus Fake {\n"""\n}"text\n""""; }\n' + empty.text);
assert.equal(blocks(raw).filter(b => b.repo).length, 1);
const splitAt = empty.text.indexOf('@repo(Order)');
const types = source(empty.text.slice(0, splitAt), 'types.hl');
const local = source(empty.text.slice(splitAt));
assert.match(apply(local, generateRepo(blocks(local).find(b => b.repo), [types, local])).text, /id: OrderId/);
const sealed = source(empty.text.replace('@repo(Order)', '@sealed @repo(Order)'));
const sealedFilled = apply(sealed, generateRepo(blocks(sealed).find(b => b.repo), [sealed]));
assert.match(sealedFilled.text, /@sealed @repo\(Order\)\s+locus MemOrders/);
// The upstream test reads the repo's params externally, so only test its declarations.
const deskAt = sealedFilled.text.indexOf('locus Desk');
checks.push(['sealed', source(sealedFilled.text.slice(0, deskAt) + sealedFilled.text.slice(sealedFilled.text.lastIndexOf('type MemOrdersError')) + '\nfn main() { }\n')]);
console.log('repo generation: key alias, shared errors, partial/idempotent edits, comments/raw strings, sibling types');

{
  const book = source(fs.readFileSync(new URL('fixtures/v0.28/build-an-api.hl', import.meta.url), 'utf8'));
  const main = blocks(book).find(b => b.kind === 'main locus');
  const bare = source(book.text.slice(0, main.start));
  assert.deepEqual(apiMethods([bare]).filter(m => m.owner === 'Shop').map(m => m.name), ['on_order', 'on_restock', 'stock_now']);
  assert(!apiMethods([repoFile]).some(m => m.owner === 'MemOrders' && m.name === 'put'));
  const transports = ['unix', 'http', 'rest', 'mcp', 'grpc'].map((kind, i) => ({ kind, endpoint: kind === 'unix' ? '/tmp/hale-scaffold.sock' : `127.0.0.1:${18980 + i}` }));
  const served = apply(bare, generateApi(bare, [bare], { surface: 'Counter', transports }));
  assert.equal((served.text.match(/: api::Exposure = api::serve/g) || []).length, 5);
  assert.match(served.text, /rpc Shop::stock_now at "POST \/counter\/Shop\/stock_now" requires: \[clerk\]/);
  assert(!/let \w+ = api::serve/.test(served.text));
  checks.push(['transports', served]);
  const second = apply(served, generateApi(served, [served], { surface: 'StockApi', members: ['Shop::stock_now'], transports: [{ kind: 'unix', endpoint: '/tmp/stock-scaffold.sock' }] }));
  assert.equal((second.text.match(/main locus /g) || []).length, 1);
  assert.equal((second.text.match(/shop\d*: Shop =/g) || []).length, 1);
  assert.equal((second.text.match(/fn main\(/g) || []).length, 1);
  checks.push(['multiple', second]);
  // Preserve an existing main's run(), receiver params, routes and authority.
  const expanded = apply(book, generateApi(book, [book], { surface: 'StockApi', members: ['Shop::stock_now'], transports: [{ kind: 'rest', endpoint: '127.0.0.1:18990' }] }));
  const oldRun = book.text.slice(book.text.indexOf('    run()'), main.close);
  assert(expanded.text.includes(oldRun));
  assert.equal((expanded.text.match(/shop: Shop =/g) || []).length, 1);
  checks.push(['existing-main', expanded]);
  const gated = source(bare.text.replace('api Counter {', 'api Counter requires: [clerk] {'));
  const gatedServed = apply(gated, generateApi(gated, [gated], { surface: 'Counter', transports: [{ kind: 'unix', endpoint: '/tmp/gated.sock' }] }));
  assert.match(gatedServed.text, /api Counter requires: \[clerk\]/);
  checks.push(['surface-roles', gatedServed]);
  // Target may be a handlers file; main wiring belongs in the sibling main file.
  const handler = source(bare.text, 'handlers.hl');
  const entry = source(book.text.slice(main.start), 'entry.hl');
  const edits = generateApi(handler, [handler, entry], { surface: 'Counter', transports: [{ kind: 'unix', endpoint: '/tmp/sibling.sock' }] });
  assert(edits.every(e => e.source === 'entry.hl'));
  console.log('API generation: all five transports, roles/REST, multiple surfaces, existing main, sibling main');
}

if (process.env.HALE_BIN) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hale-scaffolding-'));
  try {
    for (const [name, s] of checks) {
      const file = path.join(dir, `${name}_test.hl`); fs.writeFileSync(file, s.text);
      try { execFileSync(process.env.HALE_BIN, ['check', file], { encoding: 'utf8', env: { ...process.env, DEVELOPER_DIR: process.env.DEVELOPER_DIR || '/Library/Developer/CommandLineTools' } }); }
      catch (e) { console.error(name, e.stdout, e.stderr, '\nsource:', file); throw e; }
      console.log(`compiler accepted ${name}`);
    }
  } finally { if (!process.env.KEEP_SCAFFOLD_TESTS) fs.rmSync(dir, { recursive: true, force: true }); else console.log('generated fixtures:', dir); }
} else console.log('compiler integration skipped: set HALE_BIN to enable');
