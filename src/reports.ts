// The compiler's report flags, parsed: `hale check --units --json`,
// `--sealable`, `--flows`, `--dump-resource-budget`. Pure functions
// over the text the compiler prints, so they are testable without VS
// Code; reportViews.ts runs the compiler and shows the rows.

export interface UnitAt { at: string; text: string }
export interface UnitDecl {
  name: string;
  kind: string; // quantity | point | identity | range | unit
  declared?: UnitAt | null;
  denomination?: string | null;
  denomination_fixed_by?: UnitAt | null;
  of?: string | null;
  origin?: unknown;
  policy?: string | null;
  policy_from?: UnitAt | null;
  range?: unknown;
  fits_in?: unknown;
  headroom?: { count?: string; unit?: string; coarse?: { count: string; unit: string } | null } | null;
}
export interface UnitsReport { declarations: UnitDecl[]; narrowings?: unknown[]; [k: string]: unknown }

export function parseUnits(stdout: string): UnitsReport | undefined {
  const i = stdout.indexOf("{");
  if (i < 0) return undefined;
  try { return JSON.parse(stdout.slice(i)) as UnitsReport; } catch { return undefined; }
}

export interface Section { title: string; items: string[] }
export interface TextReport { summary: string; sections: Section[] }

/** A report of the shape `summary line` then `  title:` headings with `    item` lines under each. */
export function parseSections(text: string): TextReport {
  const lines = text.split("\n");
  const summary = lines.find((l) => l.trim() && !/^ok:/.test(l))?.trim() ?? "";
  const sections: Section[] = [];
  let cur: Section | undefined;
  for (const l of lines.slice(1)) {
    if (!l.trim() || /^ok:|^verified:/.test(l)) continue;
    const m = /^\s{1,3}(\S.*):\s*$/.exec(l);
    if (m) { cur = { title: m[1], items: [] }; sections.push(cur); continue; }
    if (/^\s{4,}\S/.test(l) && cur) { cur.items.push(l.trim()); continue; }
    if (/^\S/.test(l) && cur) { cur = undefined; }
  }
  return { summary, sections };
}

export interface Flow { type: string; clauses: { text: string; at?: string }[] }
export interface FlowsReport { summary: string; flows: Flow[]; note: string }

/** `--flows`: `T — a flow, by:` then `release(x: T) in Owner  (loc)` lines. */
export function parseFlows(text: string): FlowsReport {
  const lines = text.split("\n");
  const summary = lines.find((l) => /^flows:/.test(l))?.replace(/^flows:\s*/, "") ?? lines.find((l) => l.trim())?.trim() ?? "";
  const flows: Flow[] = [];
  let cur: Flow | undefined;
  const note: string[] = [];
  for (const l of lines) {
    const head = /^\s{2}(\S+)\s+[—-]+\s+a flow, by:/.exec(l);
    if (head) { cur = { type: head[1], clauses: [] }; flows.push(cur); continue; }
    const clause = /^\s{4}(release\([^)]*\)\s+in\s+\S+)\s*(?:\((.*)\))?\s*$/.exec(l);
    if (clause && cur) { cur.clauses.push({ text: clause[1], at: clause[2] && !/no seed location/.test(clause[2]) ? clause[2] : undefined }); continue; }
    if (/^[A-Z]/.test(l) && !/^ok:/.test(l) && !/^flows:/.test(l)) note.push(l.trim());
  }
  return { summary, flows, note: note.join(" ") };
}

export interface BudgetRow { label: string; value: string; children: BudgetRow[] }

/** `--dump-resource-budget`: `label: value` rows, the indented ones under the last flat row, `- x` items under those. */
export function parseBudget(text: string): BudgetRow[] {
  const rows: BudgetRow[] = [];
  let top: BudgetRow | undefined; let sub: BudgetRow | undefined;
  for (const l of text.split("\n")) {
    if (!l.trim() || l.startsWith("#")) continue;
    const item = /^\s{4,}-\s+(.*)$/.exec(l);
    if (item) { (sub ?? top)?.children.push({ label: item[1].trim(), value: "", children: [] }); continue; }
    const kv = /^(\s*)([^:]+?):\s+(.*)$/.exec(l);
    if (!kv) continue;
    const row: BudgetRow = { label: kv[2].trim(), value: kv[3].trim(), children: [] };
    if (kv[1].length === 0) { rows.push(row); top = row; sub = undefined; }
    else if (top) { top.children.push(row); sub = row; }
  }
  return rows;
}

/** One line of `hale check --json`: a diagnostic record. */
export interface JsonDiagnostic { file: string; line: number; col: number; severity?: string; kind: string; message: string }

export function parseDiagnostics(stdout: string): JsonDiagnostic[] {
  const out: JsonDiagnostic[] = [];
  for (const line of stdout.split("\n")) {
    const t = line.trim(); if (!t.startsWith("{")) continue;
    try { out.push(JSON.parse(t)); } catch { /* not a record */ }
  }
  return out;
}

/** `hale targets`: the triples, one per unindented line. */
export function parseTargets(stdout: string): { name: string; note: string }[] {
  const out: { name: string; note: string }[] = [];
  let cur: { name: string; note: string } | undefined;
  for (const l of stdout.split("\n")) {
    if (/^\S/.test(l)) { cur = { name: l.trim(), note: "" }; out.push(cur); }
    else if (cur && l.trim()) cur.note += (cur.note ? " · " : "") + l.trim();
  }
  return out;
}

/** The environments of a hale.toml: `[environments.<name>]` tables. */
export function parseEnvironments(toml: string): { name: string; entrypoints: string[]; constitution?: string; sourceOnly?: boolean }[] {
  const out: { name: string; entrypoints: string[]; constitution?: string; sourceOnly?: boolean }[] = [];
  const text = toml.replace(/#[^\n]*/g, "");
  const re = /^\s*\[environments\.([\w-]+)\]\s*$([\s\S]*?)(?=^\s*\[|(?![\s\S]))/gm;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    const body = m[2];
    const entry = /entrypoints\s*=\s*\[([^\]]*)\]/.exec(body);
    const constitution = /constitution\s*=\s*"([^"]*)"/.exec(body)?.[1];
    const sourceOnly = /source_only\s*=\s*true/.test(body);
    out.push({ name: m[1], entrypoints: entry ? [...entry[1].matchAll(/"([^"]*)"/g)].map((x) => x[1]) : [], constitution, sourceOnly });
  }
  return out;
}

/** `hale model diff --json a b`. */
export interface ModelDiff {
  a?: { path?: string; shape_hash?: string; artifact_digest?: string };
  b?: { path?: string; shape_hash?: string; artifact_digest?: string };
  classification: string;
  declarations?: { name: string; kind: string; change: string; a?: { unit: string; span: [number, number] } | null; b?: { unit: string; span: [number, number] } | null }[];
  contracts?: { name?: string; locus?: string; change?: string; [k: string]: unknown }[];
  [k: string]: unknown;
}

export function parseModelDiff(stdout: string): ModelDiff | undefined {
  const i = stdout.indexOf("{"); if (i < 0) return undefined;
  try { return JSON.parse(stdout.slice(i)) as ModelDiff; } catch { return undefined; }
}
