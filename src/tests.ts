import * as vscode from "vscode";
import { run, testJson } from "./hale";
import { relative } from "./commands";

/** `*_test.hl` files in the test explorer, each run through `hale test --json`; `*_bench.hl` files beside them, run through `hale bench`. */
export function setupTests(ctx: vscode.ExtensionContext): void {
  const controller = vscode.tests.createTestController("hale", "Hale tests");
  ctx.subscriptions.push(controller);

  const exclude = "{**/vendor/**,**/target/**,**/node_modules/**,**/.git/**}";
  const add = (uri: vscode.Uri) => {
    const id = uri.fsPath;
    if (controller.items.get(id)) return;
    const item = controller.createTestItem(id, relative(uri.fsPath), uri);
    item.canResolveChildren = false;
    controller.items.add(item);
  };
  const benchTag = new vscode.TestTag("bench");
  const addBench = (uri: vscode.Uri) => {
    const id = uri.fsPath;
    if (controller.items.get(id)) return;
    const item = controller.createTestItem(id, `${relative(uri.fsPath)} (bench)`, uri);
    item.tags = [benchTag];
    controller.items.add(item);
  };
  const discover = async () => {
    for (const uri of await vscode.workspace.findFiles("**/*_test.hl", exclude)) add(uri);
    for (const uri of await vscode.workspace.findFiles("**/*_bench.hl", exclude)) addBench(uri);
  };
  void discover();
  const watcher = vscode.workspace.createFileSystemWatcher("**/*_test.hl");
  watcher.onDidCreate(add);
  watcher.onDidDelete((uri) => controller.items.delete(uri.fsPath));
  const bwatcher = vscode.workspace.createFileSystemWatcher("**/*_bench.hl");
  bwatcher.onDidCreate(addBench);
  bwatcher.onDidDelete((uri) => controller.items.delete(uri.fsPath));
  ctx.subscriptions.push(watcher, bwatcher);
  controller.refreshHandler = discover;

  const benchProfile = controller.createRunProfile("Bench", vscode.TestRunProfileKind.Run, async (request, token) => {
    const runner = controller.createTestRun(request);
    const items: vscode.TestItem[] = [];
    if (request.include) request.include.forEach((i) => items.push(i)); else controller.items.forEach((i) => items.push(i));
    for (const item of items.filter((i) => i.tags.includes(benchTag))) {
      if (token.isCancellationRequested) break;
      runner.started(item);
      const t0 = Date.now();
      const r = await run(["bench", item.id]);
      runner.appendOutput((r.stdout + r.stderr).replace(/\n/g, "\r\n") + "\r\n", undefined, item);
      if (r.code === 0) runner.passed(item, Date.now() - t0); else runner.failed(item, new vscode.TestMessage(r.stderr || `exit ${r.code}`), Date.now() - t0);
    }
    runner.end();
  }, false, benchTag);
  void benchProfile;

  controller.createRunProfile("Run", vscode.TestRunProfileKind.Run, async (request, token) => {
    const run = controller.createTestRun(request);
    const queue: vscode.TestItem[] = [];
    if (request.include) request.include.forEach((i) => { if (!i.tags.includes(benchTag)) queue.push(i); });
    else controller.items.forEach((i) => { if (!i.tags.includes(benchTag)) queue.push(i); });
    for (const i of queue) run.enqueued(i);
    const workers = Math.min(4, queue.length);
    const next = async (): Promise<void> => {
      const item = queue.shift();
      if (!item || token.isCancellationRequested) return;
      run.started(item);
      const t0 = Date.now();
      try {
        const r = await testJson(item.id);
        const row = r.rows.find((x) => x.file === item.id) ?? r.rows[0];
        const ms = row?.elapsed_ms ?? Date.now() - t0;
        if (row?.status === "pass") run.passed(item, ms);
        else run.failed(item, new vscode.TestMessage(row?.message ?? r.stderr ?? `exit ${r.code}`), ms);
        if (r.stderr.trim()) run.appendOutput(r.stderr.replace(/\n/g, "\r\n") + "\r\n", undefined, item);
      } catch (e) {
        run.errored(item, new vscode.TestMessage(String((e as Error).message ?? e)));
      }
      await next();
    };
    await Promise.all(Array.from({ length: workers }, next));
    run.end();
  }, true);
}
