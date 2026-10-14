// The walk: apply every applicable edit-kind tip, one at a time, and
// hold each stage to `hale check`. Runs inside the extension host with
// HALE_HOST_TEST_FILE pointing at a seed's main.hl.
const vscode = require("vscode");
const assert = require("node:assert");
const cp = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const body = async () => {
  const ext = vscode.extensions.getExtension("hale-lang.vscode-hale");
  // The walk saves after each step, so it works on a copy of the seed, never the fixture itself.
  const original = process.env.HALE_HOST_TEST_FILE;
  const copyDir = fs.mkdtempSync(path.join(require("node:os").tmpdir(), "hale-walk-seed-"));
  for (const f of fs.readdirSync(path.dirname(original))) if (f.endsWith(".hl") || f === "hale.toml") fs.copyFileSync(path.join(path.dirname(original), f), path.join(copyDir, f));
  const file = path.join(copyDir, path.basename(original));
  const doc = await vscode.workspace.openTextDocument(file);
  await vscode.window.showTextDocument(doc);
  const api = await ext.activate();
  await api.refresh(file);
  const cfg = vscode.workspace.getConfiguration("hale");
  const hale = cfg.get("path"); const env = { ...process.env, ...cfg.get("env") };
  const stage = fs.mkdtempSync(path.join(require("node:os").tmpdir(), "hale-walk-"));
  const check = (label) => {
    fs.writeFileSync(path.join(stage, "main.hl"), doc.getText());
    const r = cp.spawnSync(hale, ["check", stage], { env, encoding: "utf8" });
    const errors = (r.stdout + r.stderr).split("\n").filter((l) => /error/.test(l)).slice(0, 3).join("\n");
    assert.strictEqual(r.status, 0, `after "${label}" the program still typechecks:\n${errors}\n---\n${doc.getText()}`);
  };
  check("start");
  const applied = [];
  const skip = new Set();
  for (let round = 0; round < 40; round++) {
    const full = new vscode.Range(new vscode.Position(0, 0), doc.positionAt(doc.getText().length));
    const actions = (await vscode.commands.executeCommand("vscode.executeCodeActionProvider", doc.uri, full)) || [];
    const next = actions.find((a) => a.edit && /^Hale: /.test(a.title) && !/examples of/.test(a.title) && !skip.has(a.title) && !/add a first test/.test(a.title));
    if (!next) break;
    const before = doc.getText();
    await vscode.workspace.applyEdit(next.edit);
    if (doc.getText() === before) { skip.add(next.title); continue; }
    applied.push(next.title.replace(/^Hale: /, ""));
    check(next.title);
    // the model is derived from the seed on disk: save so the rows follow the edit
    await doc.save();
    await api.refresh(file);
  }
  if (process.env.HALE_HOST_DUMP) fs.writeFileSync(process.env.HALE_HOST_DUMP, doc.getText());
  console.log(`walk: ${applied.length} steps applied, every stage typechecked:\n  - ${applied.join("\n  - ")}`);
  await vscode.commands.executeCommand("workbench.action.closeActiveEditor");
};
exports.run = () => Promise.race([body(), new Promise((_, reject) => setTimeout(() => reject(new Error("walk timed out")), 150000))]);
