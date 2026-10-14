import * as vscode from "vscode";
import * as cp from "child_process";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { Artifact, Inventory } from "./artifact";

function cfg<T>(key: string, def: T): T {
  return vscode.workspace.getConfiguration("hale").get<T>(key, def);
}

/** The environment every hale process the extension starts gets. */
export function haleEnv(): NodeJS.ProcessEnv {
  const extra = cfg<Record<string, string>>("env", {});
  return { ...process.env, HALE_SKIP_STALE_CHECK: "1", ...extra };
}

function isExec(p: string): boolean {
  try { fs.accessSync(p, fs.constants.X_OK); return fs.statSync(p).isFile(); } catch { return false; }
}

let cached: string | undefined;

/** The hale binary: the setting, then PATH, then a build in or beside the workspace. */
export function findHale(): string | undefined {
  const setting = cfg<string>("path", "").trim();
  if (setting) return isExec(setting) ? setting : undefined;
  if (cached && isExec(cached)) return cached;
  for (const d of (process.env.PATH ?? "").split(path.delimiter)) {
    const p = path.join(d, "hale");
    if (isExec(p)) return (cached = p);
  }
  // A build in the workspace, or in a `hale` checkout beside any ancestor
  // of it: covers a program inside the compiler repo and a sibling project.
  for (const f of vscode.workspace.workspaceFolders ?? []) {
    let dir = f.uri.fsPath;
    for (let i = 0; i < 8; i++) {
      for (const cand of [path.join(dir, "target", "release", "hale"), path.join(dir, "hale", "target", "release", "hale")]) {
        if (isExec(cand)) return (cached = cand);
      }
      const up = path.dirname(dir);
      if (up === dir) break;
      dir = up;
    }
  }
  return undefined;
}

export interface Run { code: number; stdout: string; stderr: string }

export function run(args: string[], cwd?: string): Promise<Run> {
  const bin = findHale();
  if (!bin) return Promise.reject(new Error("hale binary not found (set hale.path)"));
  return new Promise((resolve) => {
    cp.execFile(bin, args, { cwd, env: haleEnv(), maxBuffer: 64 * 1024 * 1024 }, (err, stdout, stderr) => {
      const code = err && typeof (err as cp.ExecFileException).code === "number" ? ((err as cp.ExecFileException).code as number) : err ? 1 : 0;
      resolve({ code, stdout: String(stdout), stderr: String(stderr) });
    });
  });
}

/** The seed a file belongs to: its directory, or the file itself for a test or bench program. */
export function seedOf(file: string): string {
  const base = path.basename(file);
  if (base.endsWith("_test.hl") || base.endsWith("_bench.hl")) return file;
  return path.dirname(file);
}

export interface Diagnostic {
  file: string; line: number; col: number; severity: string; kind: string; message: string;
}

export interface CheckResult {
  ok: boolean;
  artifact?: Artifact;
  inventory?: Inventory;
  artifactPath?: string;
  diagnostics: Diagnostic[];
  stderr: string;
}

function artifactPathFor(seed: string, storage: string): string {
  const key = Buffer.from(seed).toString("base64url").slice(-48);
  return path.join(storage, `${key}.topology.json`);
}

/** `hale check --json --dump-topology` over one seed. The artifact is only written when the seed typechecks. */
export async function checkSeed(seed: string, storage: string): Promise<CheckResult> {
  fs.mkdirSync(storage, { recursive: true });
  const out = artifactPathFor(seed, storage);
  try { fs.unlinkSync(out); } catch { /* none */ }
  const r = await run(["check", "--json", `--dump-topology=${out}`, seed]);
  const diagnostics: Diagnostic[] = [];
  for (const line of r.stdout.split("\n")) {
    const t = line.trim();
    if (!t.startsWith("{")) continue;
    try { diagnostics.push(JSON.parse(t)); } catch { /* not a diagnostic line */ }
  }
  let artifact: Artifact | undefined;
  if (fs.existsSync(out)) {
    try { artifact = JSON.parse(fs.readFileSync(out, "utf8")); } catch { artifact = undefined; }
  }
  // The inventory (`--api`) is a second, equally fast run: its JSON
  // and `--json`'s diagnostic lines would share stdout otherwise.
  let inventory: Inventory | undefined;
  if (artifact) {
    const inv = await run(["check", "--api", seed]);
    const i = inv.stdout.indexOf("{");
    if (inv.code === 0 && i >= 0) { try { inventory = JSON.parse(inv.stdout.slice(i)); } catch { inventory = undefined; } }
  }
  return { ok: r.code === 0, artifact, inventory, artifactPath: artifact ? out : undefined, diagnostics, stderr: r.stderr };
}

/** The deterministic SVG of an artifact's view (`hale topology graph`). */
export async function graphSvg(artifactPath: string, view: string, claim?: string): Promise<string> {
  const args = ["topology", "graph", "--format", "svg", "--view", view];
  if (claim) args.push("--claim", claim);
  args.push(artifactPath);
  const r = await run(args);
  if (r.code !== 0 || !r.stdout.startsWith("<svg")) throw new Error(r.stderr || r.stdout || "render failed");
  return r.stdout;
}

export interface TestRow { file: string; status: string; message?: string; elapsed_ms?: number }

/** `hale test --json` over a file or directory. */
export async function testJson(target: string): Promise<{ rows: TestRow[]; stderr: string; code: number }> {
  const r = await run(["test", "--json", target]);
  const i = r.stdout.indexOf("[");
  let rows: TestRow[] = [];
  if (i >= 0) { try { rows = JSON.parse(r.stdout.slice(i)); } catch { rows = []; } }
  return { rows, stderr: r.stderr, code: r.code };
}

/** The nearest hale.toml at or above `dir`, and the environments it declares. */
export function manifestOf(dir: string): { path: string; text: string } | undefined {
  let d = dir;
  for (let i = 0; i < 8; i++) {
    const p = path.join(d, "hale.toml");
    if (fs.existsSync(p)) { try { return { path: p, text: fs.readFileSync(p, "utf8") }; } catch { return undefined; } }
    const up = path.dirname(d); if (up === d) break; d = up;
  }
  return undefined;
}

/** `hale inputs <seed>`: every file a build reads, imports followed. */
export async function inputsOf(seed: string): Promise<string[]> {
  const r = await run(["inputs", seed]);
  return r.code === 0 ? r.stdout.split("\n").map((l) => l.trim()).filter((l) => l.startsWith("/")) : [];
}

export function tmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "vscode-hale-"));
}
