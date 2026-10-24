// Run with HALE_HOST_SUITE=scaffold.js npm run test:host -- <scratch directory>.
const vscode = require('vscode');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { blocks, methods, mask, closing } = require('../../dist/scaffold.js');
exports.run = async () => {
  const ext = vscode.extensions.getExtension('hale-lang.vscode-hale');
  await ext.activate();
  const dir = path.dirname(process.env.HALE_HOST_TEST_FILE);
  // Derive an incomplete repository from the unchanged upstream file.
  let text = fs.readFileSync(path.join(__dirname, '../fixtures/v0.28/repo_memory_test.hl'), 'utf8');
  const b = blocks({ id: 'repo', text }).find(b => b.repo);
  const spans = methods(b).filter(m => ['get', 'create', 'put', 'remove'].includes(m.name)).map(m => [text.lastIndexOf('@effects', m.start), closing(mask(text), mask(text).indexOf('{', m.start)) + 1]);
  for (const [start, end] of spans.sort((a,b) => b[0]-a[0])) text = text.slice(0,start) + text.slice(end);
  const file = path.join(dir, 'repository_test.hl'); fs.writeFileSync(file, text);
  const doc = await vscode.workspace.openTextDocument(file);
  await vscode.window.showTextDocument(doc);
  const at = doc.positionAt(text.indexOf('@repo(Order)'));
  const actions = await vscode.commands.executeCommand('vscode.executeCodeActionProvider', doc.uri, new vscode.Range(at, at));
  const action = actions.find(a => a.command?.command === 'hale.generateRepoMethods');
  assert(action, 'repository quick fix works before the program checks');
  const lenses = await vscode.commands.executeCommand('vscode.executeCodeLensProvider', doc.uri);
  assert(lenses.some(l => l.command?.command === 'hale.generateRepoMethods'));
  await vscode.commands.executeCommand(action.command.command, ...action.command.arguments);
  assert.match(doc.getText(), /fn put\(id: OrderId, o: Order\)/);
  assert.match(doc.getText(), /@unavailable NotImplemented/);
  const completed = doc.getText();
  await vscode.commands.executeCommand('hale.generateRepoMethods', doc.uri, 'MemOrders');
  assert.equal(doc.getText(), completed, 'repeat generation does not duplicate methods');
  await vscode.commands.executeCommand('undo');
  assert.equal(doc.getText(), text, 'one undo removes all generated repository code');
  console.log('host: incomplete @repo quick fix, lens, actual edit, repeat, undo');

  const book = fs.readFileSync(path.join(__dirname, '../fixtures/v0.28/build-an-api.hl'), 'utf8');
  const main = blocks({ id: 'book', text: book }).find(b => b.kind === 'main locus');
  const apiFile = path.join(dir, 'api_test.hl'); fs.writeFileSync(apiFile, book.slice(0, main.start));
  const apiDoc = await vscode.workspace.openTextDocument(apiFile); await vscode.window.showTextDocument(apiDoc);
  const before = apiDoc.getText();
  const originalQuickPick = vscode.window.showQuickPick, originalInput = vscode.window.showInputBox;
  try {
    // Stub only prompts; the registered commands and VS Code documents/edits are real.
    vscode.window.showQuickPick = async () => undefined;
    await vscode.commands.executeCommand('hale.serveSurface', 'Counter', apiDoc.uri);
    assert.equal(apiDoc.getText(), before, 'cancel transport selection leaves source unchanged');
    vscode.window.showQuickPick = async items => items.filter(x => ['unix', 'http', 'rest'].includes(x.transport));
    vscode.window.showInputBox = async () => undefined;
    await vscode.commands.executeCommand('hale.serveSurface', 'Counter', apiDoc.uri);
    assert.equal(apiDoc.getText(), before, 'cancel endpoint leaves source unchanged');
    let changed = false;
    vscode.window.showInputBox = async options => {
      if (!changed) { changed = true; const e = new vscode.WorkspaceEdit(); e.insert(apiDoc.uri, new vscode.Position(0,0), '// concurrent edit\n'); await vscode.workspace.applyEdit(e); }
      return options.value;
    };
    await vscode.commands.executeCommand('hale.serveSurface', 'Counter', apiDoc.uri);
    assert.equal(apiDoc.getText(), '// concurrent edit\n' + before, 'stale setup preserves concurrent edit and applies nothing');
    vscode.window.showInputBox = async options => options.value;
    await vscode.commands.executeCommand('hale.serveSurface', 'Counter', apiDoc.uri);
    assert.equal((apiDoc.getText().match(/: api::Exposure = api::serve/g) || []).length, 3);
    assert.match(apiDoc.getText(), /http::Rest/);
    assert.match(apiDoc.getText(), /HALE_API_TOKEN/);
    await apiDoc.save();
    const compiler = vscode.workspace.getConfiguration('hale').get('path');
    execFileSync(compiler, ['check', apiFile], { env: { ...process.env, DEVELOPER_DIR: '/Library/Developer/CommandLineTools' } });
    await vscode.commands.executeCommand('undo');
    assert.equal(apiDoc.getText(), '// concurrent edit\n' + before, 'multi-transport setup is one undo');
    // Create a second surface from selected methods through the palette command.
    vscode.window.showQuickPick = async (items, options) => options.title.startsWith('Create API:') ? items.filter(x => x.label === 'Shop::stock_now') : items.filter(x => x.transport === 'unix');
    vscode.window.showInputBox = async options => options.title.includes('surface name') ? 'StockApi' : options.value;
    await vscode.commands.executeCommand('hale.createApi', apiDoc.uri);
    assert.match(apiDoc.getText(), /api StockApi/);
    await apiDoc.save();
    execFileSync(compiler, ['check', apiFile], { env: { ...process.env, DEVELOPER_DIR: '/Library/Developer/CommandLineTools' } });
    // Select both existing APIs and add a distinct socket to each, in one command.
    vscode.window.showQuickPick = async (items, options) => options.title.startsWith('Serve APIs:') ? items : items.filter(x => x.transport === 'unix');
    vscode.window.showInputBox = async options => options.value;
    await vscode.commands.executeCommand('hale.serveSurface', apiDoc.uri);
    assert.equal((apiDoc.getText().match(/: api::Exposure = api::serve/g) || []).length, 3);
    assert.equal((apiDoc.getText().match(/main locus /g) || []).length, 1);
    await apiDoc.save();
    execFileSync(compiler, ['check', apiFile], { env: { ...process.env, DEVELOPER_DIR: '/Library/Developer/CommandLineTools' } });
    console.log('host: API prompts/cancellation, concurrent edits, three transports, compiler check, undo, create surface');
  } finally {
    vscode.window.showQuickPick = originalQuickPick; vscode.window.showInputBox = originalInput;
    await vscode.commands.executeCommand('workbench.action.closeAllEditors');
  }
};
