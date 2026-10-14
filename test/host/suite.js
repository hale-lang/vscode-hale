// Runs inside the extension host: activates the extension on a real
// seed, refreshes it and checks the model and views are live.
const vscode = require("vscode");
const assert = require("node:assert");

const body = async () => {
  const ext = vscode.extensions.getExtension("hale-lang.vscode-hale");
  assert.ok(ext, "extension is installed in the host");
  const file = process.env.HALE_HOST_TEST_FILE;
  const doc = await vscode.workspace.openTextDocument(file);
  await vscode.window.showTextDocument(doc);
  const api = await ext.activate();
  assert.ok(api && typeof api.refresh === "function", "activate returns the api");
  await api.refresh(file);
  const m = api.current();
  assert.ok(m, "a model was built for the seed");
  const expect = JSON.parse(process.env.HALE_HOST_EXPECT || "{}");
  if (expect.loci !== undefined) assert.strictEqual(m.artifact.sorts.loci.length, expect.loci, "locus count");
  else assert.ok(m.artifact.sorts.loci.length >= 1, "at least one locus");
  if (expect.claims !== undefined) assert.strictEqual(m.artifact.claims.length, expect.claims, "claim count");
  console.log(`host suite: ${m.artifact.sorts.loci.length} loci, ${m.artifact.topics.length} topics, ${m.artifact.claims.length} claims, ${m.artifact.unknowns.length} unknowns, schema ${m.artifact.schema}`);
  assert.deepStrictEqual(api.families().sort(), ["hale.advice", "hale.bus", "hale.changes", "hale.effects", "hale.here", "hale.holes", "hale.language", "hale.law", "hale.lifecycle", "hale.next", "hale.other", "hale.placement", "hale.program", "hale.tower", "hale.units"]);
  assert.ok(api.constructs() > 200, "the construct catalog is bundled");
  await vscode.commands.executeCommand("hale.showGraph");
  await vscode.commands.executeCommand("hale.showApiDocs");
  // The rows above the declarations: a lens on the main locus and on every topic.
  const lenses = await vscode.commands.executeCommand("vscode.executeCodeLensProvider", doc.uri);
  const titles = (lenses || []).map((l) => l.command?.title || "");
  assert.ok(titles.some((t) => /main locus/.test(t)), `a main-locus lens: ${titles.join(" | ")}`);
  assert.ok(titles.some((t) => /publisher\(s\)/.test(t)), `a topic lens: ${titles.join(" | ")}`);
  console.log(`host suite: ${titles.length} code lenses`);
  // The language hover: a construct under the cursor explains itself.
  const text = doc.getText(); const at = text.indexOf("main locus");
  if (at >= 0) {
    const hovers = await vscode.commands.executeCommand("vscode.executeHoverProvider", doc.uri, doc.positionAt(at + 2));
    const md = (hovers || []).flatMap((h) => h.contents.map((c) => (typeof c === "string" ? c : c.value))).join("\n");
    assert.ok(/main locus/.test(md) && /chapter/.test(md), `the construct hover names the construct and its chapter: ${md.slice(0, 200)}`);
  }
  // Every view has rows for the seed.
  const rows = (v) => api.rows(v);
  const flatRows = (ns) => ns.flatMap((n) => [n, ...flatRows(n.children || [])]);
  const locusName = m.artifact.sorts.loci.find((l) => !/__/.test(l));
  assert.ok(rows("hale.lifecycle").some((n) => n.label === locusName), `lifecycle lists ${locusName}: ${rows("hale.lifecycle").map((n) => n.label).join(",")}`);
  assert.ok(flatRows(rows("hale.lifecycle")).some((n) => n.label === "run"), "lifecycle lists the run hook");
  assert.ok(rows("hale.effects").some((n) => n.label === "classes" && n.children.length), "effects rolls up classes");
  assert.ok(/uses \d+ of \d+ constructs/.test(rows("hale.language")[0]?.label || ""), `language counts uses: ${rows("hale.language")[0]?.label}`);
  assert.ok(flatRows(rows("hale.language")).some((n) => n.label === "main locus" && /\d+ use/.test(n.description || "")), "language marks main locus as used");
  assert.ok(rows("hale.program").some((n) => n.label === "files"), "program lists the files");
  assert.ok(rows("hale.changes").length >= 1, "changes has a row after the first check");
  await api.refresh(file);
  assert.ok(rows("hale.changes")[0] && /identical|source-only|contract|model-shape/.test(rows("hale.changes")[0].label), `changes classifies the second check: ${rows("hale.changes")[0]?.label}`);
  // Here: the cursor inside a bus block gets the bus guide, with the seed's topics offered.
  const busAt = doc.getText().indexOf("bus {");
  if (busAt >= 0) {
    const editor = await vscode.window.showTextDocument(doc);
    const p = doc.positionAt(busAt + 5);
    editor.selection = new vscode.Selection(p, p);
    const untilHere = Date.now() + 5000;
    while (Date.now() < untilHere && !/^in bus/.test(rows("hale.here")[0]?.label || "")) await new Promise((r) => setTimeout(r, 150));
    const here = rows("hale.here");
    assert.ok(/^in bus/.test(here[0]?.label || ""), `here follows the cursor into the bus block: ${here[0]?.label}`);
    const offers = flatRows(here).filter((n) => /^(subscribe|publish) /.test(n.label));
    assert.ok(offers.length >= 2, `here offers the seed's topics: ${offers.map((n) => n.label).join(",")}`);
    assert.ok(flatRows(here).some((n) => n.label === "what must hold" && n.children.length), "here states the bus rules");
    const comps = await vscode.commands.executeCommand("vscode.executeCompletionItemProvider", doc.uri, p);
    const labels = (comps?.items || []).map((i) => (typeof i.label === "string" ? i.label : i.label.label));
    assert.ok(labels.some((l) => /^subscribe /.test(l)), `completion inside bus offers subscribe lines: ${labels.slice(0, 12).join(",")}`);
    console.log(`host suite: here · ${here[0].label} · ${offers.length} topic offers · ${labels.length} completions`);
  }
  // The report views ask the compiler once they are visible.
  await vscode.commands.executeCommand("hale.focusView", "hale.advice");
  await vscode.commands.executeCommand("hale.focusView", "hale.units");
  const until = Date.now() + 40000;
  while (Date.now() < until && !(rows("hale.advice").some((n) => n.label === "sealability") && rows("hale.units").length && !/asking/.test(rows("hale.units")[0].label))) await new Promise((r) => setTimeout(r, 300));
  assert.ok(rows("hale.advice").some((n) => n.label === "sealability" && n.children.length), `advice shows sealability: ${rows("hale.advice").map((n) => n.label).join(",")}`);
  assert.ok(rows("hale.advice").some((n) => n.label === "verify"), "advice shows the verify verdict");
  assert.ok(rows("hale.units").length && !/asking|failed/.test(rows("hale.units")[0].label), `units answered: ${rows("hale.units")[0]?.label}`);
  console.log(`host suite: views ${api.families().length}, language ${rows("hale.language")[0].label}, changes ${rows("hale.changes")[0].label}, advice ${rows("hale.advice").map((n) => n.label + ":" + (n.description || "")).join(" | ")}`);
  // Graph completion: a declared surface nothing serves gets a code action
  // whose edit writes the serve line, and a main locus when there is none.
  const unserved = (m.inventory?.surfaces ?? []).filter((s) => !(m.inventory?.exposures ?? []).some((e) => e.surface === s.name));
  if (unserved.length) {
    const full = new vscode.Range(new vscode.Position(0, 0), doc.positionAt(doc.getText().length));
    const actions = await vscode.commands.executeCommand("vscode.executeCodeActionProvider", doc.uri, full);
    const serve = (actions || []).find((a) => /^Hale: serve /.test(a.title));
    assert.ok(serve, `a serve action is offered for ${unserved[0].name}: ${(actions || []).map((a) => a.title).join(" | ")}`);
    await vscode.workspace.applyEdit(serve.edit);
    const after = doc.getText();
    if (process.env.HALE_HOST_DUMP) require("node:fs").writeFileSync(process.env.HALE_HOST_DUMP, after);
    assert.ok(new RegExp(`api::serve\\(${unserved[0].name},`).test(after), "the edit writes the serve line");
    assert.ok(/main locus \w+ \{/.test(after), "a main locus exists after the edit");
    assert.ok(/receivers: \{ [A-Za-z_]+: self\.[a-z_]+ \}/.test(after), "the receivers map names a main param");
    await vscode.commands.executeCommand("undo");
    console.log(`host suite: serve action applied for ${unserved[0].name}`);
  }
  // Diagnostics from the language server: introduce an error and wait for a squiggle.
  const edit = new vscode.WorkspaceEdit();
  edit.insert(doc.uri, doc.positionAt(doc.getText().length), "\nfn __probe() -> Int { return \"x\"; }\n");
  await vscode.workspace.applyEdit(edit);
  const deadline = Date.now() + 30000;
  let diags = [];
  while (Date.now() < deadline) {
    diags = vscode.languages.getDiagnostics(doc.uri);
    if (diags.some((d) => /expected `Int`/.test(d.message))) break;
    await new Promise((r) => setTimeout(r, 250));
  }
  assert.ok(diags.some((d) => /expected `Int`/.test(d.message)), `the language server reported the type error; got: ${diags.map((d) => d.message).join(" | ")}`);
  // Undo so the fixture on disk is untouched (the buffer was never saved).
  await vscode.commands.executeCommand("workbench.action.revertAndCloseActiveEditor");
  console.log("host suite: model, views, graph and diagnostics verified");
};

exports.run = () => Promise.race([
  body(),
  new Promise((_, reject) => setTimeout(() => reject(new Error("host suite timed out after 90s")), 90000)),
]);
