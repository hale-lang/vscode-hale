import * as vscode from "vscode";
import { Model, ownerOf } from "./artifact";

/**
 * The walk: each tip is one step of docs/src/services/build-an-api.md
 * (or a fixture's form), offered where it applies and written as the
 * example writes it. A tip never invents syntax: `source` names the
 * chapter section and the example file its shape is copied from.
 */
export interface TipSource { doc: string; section: string; example: string }
export interface Site { range: vscode.Range; detail: Record<string, string> }
export interface Tip {
  id: string;
  title: (site: Site) => string;
  kind: "edit" | "command" | "info";
  source: TipSource;
  sites: (c: Ctx) => Site[];
  edit?: (c: Ctx, site: Site) => vscode.WorkspaceEdit | undefined;
  command?: (c: Ctx, site: Site) => { command: string; arguments?: unknown[] };
  note?: string;
}

const DOC = "docs/src/services/build-an-api.md";
const FIX = "crates/hale-codegen/tests/fixtures/examples/92-build-an-api/main.hl";
const TODO = "dna/tests/onboarding/todo/api/main.hl";
const ind = (n: number) => " ".repeat(n);
const lower = (s: string) => s.replace(/([a-z0-9])([A-Z])/g, "$1_$2").toLowerCase();

/** What the text says, found once per request and shared by every tip. */
export class Ctx {
  readonly text: string;
  constructor(readonly doc: vscode.TextDocument, readonly model: Model) { this.text = doc.getText(); }
  at(off: number): vscode.Position { return this.doc.positionAt(off); }
  range(start: number, end: number): vscode.Range { return new vscode.Range(this.at(start), this.at(end)); }

  /** `}` closing the `{` at `open`, skipping strings and line comments; -1 if none. */
  closeOf(open: number): number {
    const t = this.text; let depth = 0;
    for (let i = open; i < t.length; i++) {
      const c = t[i];
      if (c === '"') { i++; while (i < t.length && t[i] !== '"') { if (t[i] === "\\") i++; i++; } continue; }
      if (c === "/" && t[i + 1] === "/") { while (i < t.length && t[i] !== "\n") i++; continue; }
      if (c === "{") depth++; else if (c === "}") { depth--; if (depth === 0) return i; }
    }
    return -1;
  }
  get main(): { name: string; open: number; close: number } | undefined {
    const m = /\bmain\s+locus\s+([A-Za-z_][A-Za-z0-9_]*)\s*\{/.exec(this.text);
    if (!m) return undefined;
    const open = m.index + m[0].length - 1; const close = this.closeOf(open);
    return close < 0 ? undefined : { name: m[1], open, close };
  }
  /** A block `<head> {` inside [from, to): its brace offsets. */
  block(head: RegExp, from: number, to: number): { open: number; close: number } | undefined {
    const slice = this.text.slice(from, to); const m = head.exec(slice);
    if (!m) return undefined;
    const open = from + m.index + m[0].length - 1; const close = this.closeOf(open);
    return close < 0 ? undefined : { open, close };
  }
  get params() { const m = this.main; return m ? this.block(/\bparams\s*\{/, m.open + 1, m.close) : undefined; }
  get run() { const m = this.main; return m ? this.block(/\brun\s*\(\s*\)\s*\{/, m.open + 1, m.close) : undefined; }
  get bindings() { const m = this.main; return m ? this.block(/\bbindings\s*\{/, m.open + 1, m.close) : undefined; }
  get placement() { const m = this.main; return m ? this.block(/\bplacement\s*\{/, m.open + 1, m.close) : undefined; }
  /** Every `api::serve(...)` line: its surface, transport and the struct body. */
  get serves(): { surface: string; transport: string; body: string; start: number; end: number; varName: string; asName: string }[] {
    const out = [];
    const re = /([A-Za-z_]\w*)\s*:\s*api::Exposure\s*=\s*api::serve\(\s*([A-Za-z_]\w*)\s*,\s*(?:([a-z]+)::Rpc\s*\{([^}]*)\}|self\.([a-z_]\w*))\s*,\s*as:\s*"([^"]*)"[^;]*;/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(this.text))) out.push({ varName: m[1], surface: m[2], transport: m[3] ?? `hub ${m[5]}`, body: m[4] ?? "", start: m.index, end: m.index + m[0].length, asName: m[6] });
    return out;
  }
  get rpcRows(): { surface: string; member: string; requires: boolean; start: number; end: number }[] {
    const out = []; const re = /\bapi\s+([A-Za-z_]\w*)\s*\{/g; let m: RegExpExecArray | null;
    while ((m = re.exec(this.text))) {
      const open = m.index + m[0].length - 1; const close = this.closeOf(open); if (close < 0) continue;
      const rr = /\brpc\s+([A-Za-z_]\w*::[A-Za-z_]\w*)([^;]*);/g; const body = this.text.slice(open, close); let r: RegExpExecArray | null;
      while ((r = rr.exec(body))) out.push({ surface: m[1], member: r[1], requires: /requires\s*:/.test(r[2]), start: open + r.index, end: open + r.index + r[0].length });
    }
    return out;
  }
  get roles(): string[] { return [...this.text.matchAll(/\brole\s+([A-Za-z_]\w*)/g)].map((m) => m[1]); }
  get topics(): { name: string; start: number; end: number }[] {
    return [...this.text.matchAll(/\btopic\s+([A-Za-z_]\w*)\s*\{[^}]*\}/g)].map((m) => ({ name: m[1], start: m.index!, end: m.index! + m[0].length }));
  }
  /** A main param by predicate on its declared type. */
  param(pred: (type: string) => boolean): { name: string; type: string } | undefined {
    const p = this.params; if (!p) return undefined;
    for (const m of this.text.slice(p.open, p.close).matchAll(/([a-z_]\w*)\s*:\s*([A-Za-z_][\w:]*)\s*=/g)) if (pred(m[2])) return { name: m[1], type: m[2] };
    return undefined;
  }
  get tokensParam() { return this.param((t) => this.hasFn(t, "principal")); }
  get rolesParam() { return this.param((t) => t === "std::api::StaticRoles" || this.hasFn(t, "holds")); }
  get hubParam() { return this.param((t) => t === "ws::Hub"); }
  /** Does locus `type` declare `fn <name>(`? */
  hasFn(type: string, name: string): boolean {
    const m = new RegExp(`\\blocus\\s+${type.replace(/::/g, "::")}\\s*\\{`).exec(this.text);
    if (!m) return false;
    const open = m.index + m[0].length - 1; const close = this.closeOf(open);
    return close > 0 && new RegExp(`\\bfn\\s+${name}\\s*\\(`).test(this.text.slice(open, close));
  }
  /** The author's loci: the artifact's minus the compiler's. */
  get userLoci(): string[] { return (this.model.artifact.sorts?.loci ?? []).filter((l) => !/(^|\.|::)__/.test(l)); }
  locusBlock(name: string): { open: number; close: number; isMain: boolean } | undefined {
    const m = new RegExp(`\\b(main\\s+)?locus\\s+${name}\\s*\\{`).exec(this.text); if (!m) return undefined;
    const open = m.index + m[0].length - 1; const close = this.closeOf(open);
    return close < 0 ? undefined : { open, close, isMain: !!m[1] };
  }
  busBlock(name: string) { const b = this.locusBlock(name); return b ? this.block(/\bbus\s*\{/, b.open + 1, b.close) : undefined; }
  /** The payload type a topic declares. */
  payloadOf(topic: string): string | undefined { return new RegExp(`\\btopic\\s+${topic}\\s*\\{[^}]*\\bpayload:\\s*([A-Za-z_][\\w:]*)`).exec(this.text)?.[1]; }
  /** Rows of the main's `bindings { }` that name a transport (a hub row, `self.hub`, is a stream, not a wire). */
  get bindingRows(): { topic: string; transportEnd: number; hasCodec: boolean; start: number; end: number }[] {
    const b = this.bindings; if (!b) return [];
    const out = [];
    const re = /(^|[\n{;])\s*([A-Za-z_][\w:]*)\s*:\s*(unix\s*\([^)]*\)|[A-Za-z_][\w:]*\s*\{[^}]*\})([^;]*);/g;
    const body = this.text.slice(b.open, b.close); let m: RegExpExecArray | null;
    while ((m = re.exec(body))) {
      const rowStart = b.open + m.index + m[1].length;
      const transportEnd = b.open + m.index + m[0].length - m[4].length - 1;
      out.push({ topic: m[2], transportEnd, hasCodec: /\bcodec\s*\(/.test(m[4]), start: rowStart, end: b.open + m.index + m[0].length });
    }
    return out;
  }
  fnDecl(member: string): { start: number; paramsEnd: number; params: string } | undefined {
    const [locus, fn] = member.split("::"); if (!fn) return undefined;
    const lm = new RegExp(`\\blocus\\s+${locus}\\s*\\{`).exec(this.text); if (!lm) return undefined;
    const open = lm.index + lm[0].length - 1; const close = this.closeOf(open);
    const fm = new RegExp(`\\bfn\\s+${fn}\\s*\\(([^)]*)\\)`).exec(this.text.slice(open, close)); if (!fm) return undefined;
    return { start: open + fm.index, paramsEnd: open + fm.index + fm[0].length - 1, params: fm[1] };
  }
}

/** Where a field is appended inside a serve line's transport struct: after its last non-space character. */
function fieldSlot(c: Ctx, serveStart: number, varName: string): number {
  const open = c.text.indexOf("{", serveStart + varName.length); let k = c.text.indexOf("}", open);
  while (k > open + 1 && /\s/.test(c.text[k - 1])) k--;
  return k;
}

/** Insert text just inside a block's opening brace, on its own line. */
function insertInto(edit: vscode.WorkspaceEdit, c: Ctx, open: number, lines: string[], indentBy: number): void {
  edit.insert(c.doc.uri, c.at(open + 1), "\n" + lines.map((l) => (l ? ind(indentBy) + l : "")).join("\n"));
}
/** Insert a whole member before a block's closing brace. */
function appendMember(edit: vscode.WorkspaceEdit, c: Ctx, close: number, lines: string[], indentBy: number): void {
  edit.insert(c.doc.uri, c.at(close), lines.map((l) => (l ? ind(indentBy) + l : "")).join("\n") + "\n");
}
/** The param lines that make `self.tokens` and `self.roles` exist, and the locus that backs the tokens. */
function ensureTokens(edit: vscode.WorkspaceEdit, c: Ctx): string {
  const have = c.tokensParam; if (have) return have.name;
  const p = c.params; const m = c.main!;
  if (!/\blocus\s+Tokens\s*\{/.test(c.text)) {
    edit.insert(c.doc.uri, c.at(m.open - `main locus ${m.name} {`.length - 0 > 0 ? c.text.lastIndexOf("main locus", m.open) : 0), [
      "// Who a bearer token is: a std::api::BearerSource (docs § 6).",
      "locus Tokens {",
      `${ind(4)}fn principal(token: String) -> std::api::Principal {`,
      `${ind(8)}if token == "t-dev" {`,
      `${ind(12)}return std::api::Principal { mode: "bearer", name: "dev" };`,
      `${ind(8)}}`,
      `${ind(8)}return std::api::Principal { mode: "bearer", name: "" };`,
      `${ind(4)}}`,
      `${ind(4)}fn refused() -> String { return "no such token"; }`,
      "}",
      "", "",
    ].join("\n"));
  }
  const line = "tokens: Tokens = Tokens { };";
  if (p) insertInto(edit, c, p.open, [line], 8); else insertInto(edit, c, m.open, [`params {`, `${ind(4)}${line}`, `}`], 4);
  return "tokens";
}
function ensureRoles(edit: vscode.WorkspaceEdit, c: Ctx, role: string): string {
  const have = c.rolesParam; if (have) return have.name;
  const p = c.params; const m = c.main!;
  const known = [...new Set([...c.roles, role])].join(" ");
  const line = `roles: std::api::StaticRoles = std::api::StaticRoles { known: "${known}" };`;
  if (p) insertInto(edit, c, p.open, [line], 8); else insertInto(edit, c, m.open, [`params {`, `${ind(4)}${line}`, `}`], 4);
  return "roles";
}
function ensureRoleDecl(edit: vscode.WorkspaceEdit, c: Ctx, role: string): void {
  if (c.roles.includes(role)) return;
  const api = /\bapi\s+[A-Za-z_]\w*\s*\{/.exec(c.text);
  edit.insert(c.doc.uri, c.at(api ? api.index : 0), `role ${role};\n\n`);
}
/** A second serve line after an existing one, with its stop before the run's close. */
function addServe(edit: vscode.WorkspaceEdit, c: Ctx, after: { end: number; surface: string }, varName: string, transport: string, asName: string): void {
  const recv = receiversOf(c, after.surface);
  edit.insert(c.doc.uri, c.at(after.end), `\n${ind(8)}${varName}: api::Exposure = api::serve(${after.surface}, ${transport}, as: "${asName}", receivers: { ${recv} }, bound: 64, on_full: refuse);`);
  const r = c.run; if (r) edit.insert(c.doc.uri, c.at(r.close), `${ind(4)}self.${varName}.stop();\n${ind(4)}`);
}
function receiversOf(c: Ctx, surface: string): string {
  const s = c.model.inventory?.surfaces.find((x) => x.name === surface);
  const owners = [...new Set((s?.members ?? []).map((m) => ownerOf(m.name)))];
  const mainC = c.model.artifact.contracts.find((x) => x.instances.some((i) => i.owner === null));
  return owners.map((o) => { const p = mainC?.params.find((pp) => pp.type === o); return `${o}: self.${p ? p.name : lower(o)}`; }).join(", ");
}
const withRoles = (c: Ctx, extra: string) => { const r = c.rolesParam; return r ? `${extra}, roles: self.${r.name}` : extra; };

export const TIPS: Tip[] = [
  {
    id: "ctx", kind: "edit",
    title: (s) => `Hale: let ${s.detail.member} know who is calling (ctx: std::api::Context)`,
    source: { doc: DOC, section: "4. Who is calling", example: FIX },
    sites: (c) => c.rpcRows.map((r) => ({ r, d: c.fnDecl(r.member) })).filter((x) => x.d && !/std::api::Context/.test(x.d.params)).map((x) => ({ range: c.range(x.d!.start, x.d!.paramsEnd), detail: { member: x.r.member, paramsEnd: String(x.d!.paramsEnd), params: x.d!.params } })),
    edit: (c, s) => { const e = new vscode.WorkspaceEdit(); e.insert(c.doc.uri, c.at(Number(s.detail.paramsEnd)), `${s.detail.params.trim() ? ", " : ""}ctx: std::api::Context`); return e; },
    note: "ctx.caller.name is who, ctx.via the door (unix, http, ws, mcp), ctx.role the row's role.",
  },
  {
    id: "require-role", kind: "edit",
    title: (s) => `Hale: require a role to call ${s.detail.member}`,
    source: { doc: DOC, section: "5. Roles", example: FIX },
    sites: (c) => c.main ? c.rpcRows.filter((r) => !r.requires).map((r) => ({ range: c.range(r.start, r.end), detail: { member: r.member, end: String(r.end - 1), surface: r.surface } })) : [],
    edit: (c, s) => {
      const role = c.roles[0] ?? "operator"; const e = new vscode.WorkspaceEdit();
      ensureRoleDecl(e, c, role);
      const rp = ensureRoles(e, c, role);
      e.insert(c.doc.uri, c.at(Number(s.detail.end)), ` requires: [${role}]`);
      for (const sv of c.serves) if (sv.surface === s.detail.surface && !/roles\s*:/.test(sv.body) && !sv.transport.startsWith("hub")) {
        e.insert(c.doc.uri, c.at(fieldSlot(c, sv.start, sv.varName)), `, roles: self.${rp}`);
      }
      return e;
    },
    note: "Who holds the role at run time: LOTUS_API_ROLES='role=uid:1000;…' for std::api::StaticRoles, or a locus with fn holds(p, r) -> Bool.",
  },
  {
    id: "http", kind: "edit",
    title: (s) => `Hale: also serve ${s.detail.surface} over HTTP (bearer tokens)`,
    source: { doc: DOC, section: "6. HTTP", example: FIX },
    sites: (c) => c.serves.filter((sv) => sv.transport !== "http" && !c.serves.some((o) => o.surface === sv.surface && o.transport === "http")).map((sv) => ({ range: c.range(sv.start, sv.end), detail: { surface: sv.surface, end: String(sv.end) } })),
    edit: (c, s) => { const e = new vscode.WorkspaceEdit(); const t = ensureTokens(e, c); addServe(e, c, { end: Number(s.detail.end), surface: s.detail.surface }, `${lower(s.detail.surface)}_web`, `http::Rpc { bind: "127.0.0.1:8080", codec: json, principals: self.${t}${withRoles(c, "")} }`, "web"); return e; },
    note: "POST /call/<member> with Authorization: Bearer <token>; hale describe http://127.0.0.1:8080 --bearer t-dev.",
  },
  {
    id: "mcp", kind: "edit",
    title: (s) => `Hale: also serve ${s.detail.surface} over MCP (agent tools)`,
    source: { doc: DOC, section: "8. Tools", example: TODO },
    sites: (c) => c.serves.filter((sv) => sv.transport !== "mcp" && !c.serves.some((o) => o.surface === sv.surface && o.transport === "mcp")).map((sv) => ({ range: c.range(sv.start, sv.end), detail: { surface: sv.surface, end: String(sv.end) } })),
    edit: (c, s) => { const e = new vscode.WorkspaceEdit(); const t = ensureTokens(e, c); addServe(e, c, { end: Number(s.detail.end), surface: s.detail.surface }, `${lower(s.detail.surface)}_agent`, `mcp::Rpc { bind: "127.0.0.1:8090", principals: self.${t}${withRoles(c, "")} }`, "agent"); return e; },
    note: "claude mcp add app -- hale mcp --app http://127.0.0.1:8090 makes every member a tool.",
  },
  {
    id: "grpc", kind: "edit",
    title: (s) => `Hale: also serve ${s.detail.surface} over gRPC`,
    source: { doc: "spec/api.md", section: "gRPC", example: "tests/hale/api/pb_lists_test.hl" },
    sites: (c) => c.serves.filter((sv) => sv.transport !== "grpc" && !c.serves.some((o) => o.surface === sv.surface && o.transport === "grpc")).map((sv) => ({ range: c.range(sv.start, sv.end), detail: { surface: sv.surface, end: String(sv.end) } })),
    edit: (c, s) => { const e = new vscode.WorkspaceEdit(); const t = ensureTokens(e, c); addServe(e, c, { end: Number(s.detail.end), surface: s.detail.surface }, `${lower(s.detail.surface)}_grpc`, `grpc::Rpc { bind: "127.0.0.1:8070", codec: json, principals: self.${t}${withRoles(c, "")} }`, "grpc"); return e; },
    note: "hale check --api --surface S --proto prints the messages and the service the transport speaks.",
  },
  {
    id: "cors", kind: "edit",
    title: () => "Hale: allow a browser origin on this HTTP exposure (cors)",
    source: { doc: "spec/api.md", section: "The HTTP transport", example: "tests/hale/api/client_test.hl" },
    sites: (c) => c.serves.filter((sv) => sv.transport === "http" && !/\bcors\s*:/.test(sv.body)).map((sv) => ({ range: c.range(sv.start, sv.end), detail: { start: String(sv.start), varName: sv.varName } })),
    edit: (c, s) => { const e = new vscode.WorkspaceEdit(); e.insert(c.doc.uri, c.at(fieldSlot(c, Number(s.detail.start), s.detail.varName)), `, cors: "http://localhost:5173"`); return e; },
  },
  {
    id: "stream", kind: "edit",
    title: (s) => `Hale: stream ${s.detail.topic} to browsers over a WebSocket hub`,
    source: { doc: DOC, section: "7. A stream", example: FIX },
    // A topic has one binding: one already on a transport or a hub is not a candidate.
    sites: (c) => c.main ? c.topics.filter((t) => !new RegExp(`\\b${t.name}\\s*:\\s*self\\.`).test(c.text) && !c.bindingRows.some((r) => r.topic === t.name) && c.model.artifact.relations.publishes.some((x) => x.subject === t.name)).map((t) => ({ range: c.range(t.start, t.end), detail: { topic: t.name } })) : [],
    edit: (c, s) => {
      const e = new vscode.WorkspaceEdit(); const role = c.roles[0] ?? "reader";
      ensureRoleDecl(e, c, role); const t = ensureTokens(e, c); const r = ensureRoles(e, c, role);
      let hub = c.hubParam?.name;
      if (!hub) { hub = "hub"; const line = `hub: ws::Hub = ws::Hub { bind: "127.0.0.1:8081", principals: self.${t}, roles: self.${r}, as: "stream" };`; const p = c.params; if (p) insertInto(e, c, p.open, [line], 8); else insertInto(e, c, c.main!.open, [`params {`, `${ind(4)}${line}`, `}`], 4); }
      const row = `${s.detail.topic}: self.${hub} requires: [${role}], bound: 64, on_full: drop_old;`;
      const b = c.bindings; if (b) insertInto(e, c, b.open, [row], 8); else { const p = c.params; appendMember(e, c, p ? c.closeOf(p.open) + 1 : c.main!.open + 1, [``, `bindings {`, `${ind(4)}${row}`, `}`], 4); }
      return e;
    },
    note: "hale watch ws://127.0.0.1:8081 <Topic> --token t-dev prints the frames; a slow subscriber sheds frames (seq gaps), never the subscription.",
  },
  {
    id: "binding-codec", kind: "edit",
    title: (s) => `Hale: give the ${s.detail.topic} binding a JSON codec (so another language can read the wire)`,
    source: { doc: "docs/src/services/multi-binary.md", section: "Talking to other languages: codecs", example: "docs/src/dna/heart.md" },
    sites: (c) => c.bindingRows.filter((r) => !r.hasCodec).map((r) => ({ range: c.range(r.start, r.end), detail: { topic: r.topic, transportEnd: String(r.transportEnd) } })),
    edit: (c, s) => {
      const e = new vscode.WorkspaceEdit();
      const topic = s.detail.topic; const codec = `${topic}JsonCodec`;
      e.insert(c.doc.uri, c.at(Number(s.detail.transportEnd)), ` codec(${codec} { })`);
      if (new RegExp(`\\blocus\\s+${codec}\\b`).test(c.text)) return e;
      const t = c.model.artifact.topics.find((x) => x.name === topic);
      const payload = c.payloadOf(topic) ?? "Payload";
      const fields = (t?.shape ?? "").split(";").filter(Boolean).map((f) => { const [name, kind] = f.split(":"); return { name, kind }; });
      const enc = fields.map((f) => {
        const v = `v.${f.name}`;
        const val = f.kind === "s" ? `quoted(${v})` : f.kind === "i" || f.kind === "b" || f.kind === "f" ? `to_string(${v})` : f.kind === "d" ? `quoted(to_string(${v}))` : `"null"`;
        return `"\\"${f.name}\\":" + ${val}`;
      });
      const dec = fields.map((f) => {
        const key = `"${f.name}"`;
        const val = f.kind === "s" ? `std::json::find_string_field(t, ${key})` : f.kind === "i" ? `std::json::find_int_field(t, ${key})` : f.kind === "b" ? `std::json::find_bool_field(t, ${key})` : f.kind === "d" ? `std::str::parse_decimal(std::json::find_string_field(t, ${key})) or 0d` : `/* ${f.kind}: write the read */ ${f.name}`;
        return `${f.name}: ${val}`;
      });
      const unsupported = fields.filter((f) => !/^[sibfd]$/.test(f.kind)).map((f) => `${f.name} (${f.kind})`);
      const lines = [
        ...(/\btype\s+CodecError\b/.test(c.text) ? [] : [`type CodecError { kind: String = ""; }`, ``]),
        ...(/\bfn\s+quoted\s*\(/.test(c.text) ? [] : [`/// A JSON string: quotes and backslashes escaped.`, `fn quoted(s: String) -> String {`, `${ind(4)}return "\\"" + std::str::replace(std::str::replace(s, "\\\\", "\\\\\\\\"), "\\"", "\\\\\\"") + "\\"";`, `}`, ``]),
        `/// ${topic} on the wire as one JSON object; both ways pure, so it may run on a transport thread.`,
        ...(unsupported.length ? [`// TODO: ${unsupported.join(", ")} need a hand-written read and write.`] : []),
        `locus ${codec} {`,
        `${ind(4)}fn encode(v: ${payload}) -> Bytes fallible(CodecError) {`,
        `${ind(8)}return std::bytes::from_string("{" + ${enc.join(' + "," + ') || '""'} + "}");`,
        `${ind(4)}}`,
        `${ind(4)}fn decode(b: Bytes) -> ${payload} fallible(CodecError) {`,
        `${ind(8)}let t = std::str::from_bytes(b);`,
        `${ind(8)}return ${payload} { ${dec.join(", ")} };`,
        `${ind(4)}}`,
        `}`,
        ``, ``,
      ];
      const at = c.text.lastIndexOf("main locus", c.main!.open);
      e.insert(c.doc.uri, c.at(at), lines.join("\n"));
      return e;
    },
    note: "Without a codec the bus speaks Hale's internal format, fine Hale-to-Hale and opaque to anything else. The codec is structurally typed against the payload and must be pure.",
  },
  {
    id: "pin", kind: "edit",
    title: (s) => `Hale: pin ${s.detail.field} to its own thread (its run() blocks)`,
    source: { doc: "docs/src/services/concurrency.md", section: "pinned", example: "crates/hale-codegen/tests/fixtures/examples/18-pinned-lifecycle/main.hl" },
    sites: (c) => {
      const m = c.main; if (!m) return [];
      const mainC = c.model.artifact.contracts.find((x) => x.instances.some((i) => i.owner === null));
      const pl = c.placement ? c.text.slice(c.placement.open, c.placement.close) : "";
      // The author's params only: the api binding's listeners are placed by the compiler.
      return (mainC?.params ?? []).filter((p) => !/^__/.test(p.name) && c.userLoci.includes(p.type)).filter((p) => { const eff = c.model.artifact.effects[`${p.type}::run`] ?? []; return eff.includes("block") && !new RegExp(`\\b${p.name}\\s*:`).test(pl); }).map((p) => ({ range: c.range(m.open, m.open + 1), detail: { field: p.name, type: p.type } }));
    },
    edit: (c, s) => { const e = new vscode.WorkspaceEdit(); const line = `${s.detail.field}: pinned(core = 1);`; const pl = c.placement; if (pl) insertInto(e, c, pl.open, [line], 8); else { const p = c.params; appendMember(e, c, p ? c.closeOf(p.open) + 1 : c.main!.open + 1, [``, `placement { ${line} }`], 4); } return e; },
    note: "An inline child whose run() never returns blocks every later param's birth; pinned gives it a thread of its own.",
  },
  {
    id: "export", kind: "command",
    title: (s) => `Hale: export ${s.detail.surface}'s bundle (OpenAPI, JSON Schema, MCP, proto) to spec/`,
    source: { doc: DOC, section: "8. Tools", example: "dna/tests/onboarding/todo/spec" },
    sites: (c) => (c.model.inventory?.surfaces ?? []).map((s) => ({ range: c.range(0, 0), detail: { surface: s.name } })),
    // `--out` makes no directories (unlike `hale build -o`), so the shell does.
    command: (c, s) => ({ command: "hale.runInTerminal", arguments: [["api", "export", "--surface", s.detail.surface, "--out", "spec"], c.model.seedDir, "mkdir -p spec"] }),
  },
  {
    id: "client", kind: "command",
    title: (s) => `Hale: generate a TypeScript client for ${s.detail.surface}`,
    source: { doc: DOC, section: "8. Tools", example: "dna/tests/onboarding/todo/ui/client/todo.ts" },
    sites: (c) => (c.model.inventory?.surfaces ?? []).map((s) => ({ range: c.range(0, 0), detail: { surface: s.name } })),
    command: (c, s) => ({ command: "hale.runInTerminal", arguments: [["api", "client", "--surface", s.detail.surface, "--lang", "ts", "--out", `client/${lower(s.detail.surface)}.ts`], c.model.seedDir, "mkdir -p client"] }),
  },
  {
    id: "codec", kind: "info",
    title: () => "Hale: about codecs: json is the one codec; it is generated from your types",
    source: { doc: "spec/api.md", section: "Codecs", example: FIX },
    sites: (c) => c.serves.filter((sv) => /\bcodec\s*:/.test(sv.body)).map((sv) => ({ range: c.range(sv.start, sv.end), detail: {} })),
    note: "A serve site has the one codec, generated from the row's types (Int, Float, Bool, String, nested structs, bounded lists, Time, quantities; not Decimal, Bytes or unbounded lists). gRPC adds protobuf from the same declarations, chosen per request by content type. A codec of your own goes on a bus binding: `Topic: unix(\"…\") codec(MyCodec { })`, a locus with fn encode(v: T) -> Bytes and fn decode(b: Bytes) -> T.",
  },
  // ---- the rest of the language ---------------------------------------
  {
    id: "supervise", kind: "edit",
    title: (s) => `Hale: supervise ${s.detail.field} (on_failure restarts ${s.detail.type})`,
    source: { doc: "docs/src/services/failure.md", section: "on_failure", example: "crates/hale-codegen/tests/fixtures/examples/32-restart/main.hl" },
    sites: (c) => {
      const out: Site[] = [];
      for (const parent of c.model.artifact.contracts) {
        if (/(^|\.|::)__/.test(parent.locus)) continue;
        const b = c.locusBlock(parent.locus); if (!b) continue;
        const body = c.text.slice(b.open, b.close);
        for (const p of parent.params) {
          if (!c.userLoci.includes(p.type)) continue;
          // A child worth supervising has a lifecycle of its own or handles traffic; a table of fns and a form do not.
          const lives = Object.keys(c.model.artifact.phases ?? {}).some((k) => new RegExp(`^${p.type}::(birth|run|drain|dissolve|accept|release)$`).test(k)) || c.model.artifact.relations.subscribes.some((x) => x.locus === p.type);
          if (!lives) continue;
          if (new RegExp(`\\bon_failure\\s*\\(\\s*\\w+\\s*:\\s*${p.type}\\b`).test(body)) continue;
          out.push({ range: c.range(b.open, b.open + 1), detail: { parent: parent.locus, field: p.name, type: p.type, close: String(b.close) } });
        }
      }
      return out;
    },
    edit: (c, s) => { const e = new vscode.WorkspaceEdit(); appendMember(e, c, Number(s.detail.close), [``, `on_failure(c: ${s.detail.type}, err: ClosureViolation) {`, `${ind(4)}println("${s.detail.parent}: ", err.closure, " on ", err.locus, ", restarting");`, `${ind(4)}restart(c);`, `}`], 4); return e; },
    note: "A child's closure violation reaches its owner's on_failure; restart(c) re-runs birth on the same memory, within the retry cap. Without a handler the failure bubbles up the tower.",
  },
  {
    id: "fuse", kind: "command",
    title: (s) => `Hale: on error, shut ${s.detail.locus} down structurally (closure + violate instead of or raise)`,
    source: { doc: "spec/design-rationale.md", section: "F.27", example: "crates/hale-codegen/tests/fixtures/examples/75-collapsed-child-adapter-hop/main.hl" },
    sites: (c) => c.userLoci.map((l) => ({ l, b: c.locusBlock(l) })).filter((x) => x.b && /\bor\s+raise\b/.test(c.text.slice(x.b.open, x.b.close)) && !/\bclosure\s+fuse\b/.test(c.text.slice(x.b.open, x.b.close))).map((x) => ({ range: c.range(x.b!.open, x.b!.open + 1), detail: { locus: x.l, close: String(x.b!.close), open: String(x.b!.open) } })),
    command: (c, s) => ({ command: "hale.applyFuse", arguments: [s.detail.locus, Number(s.detail.open), Number(s.detail.close)] }),
    note: "The error-check fn bridges the value channel into the structural one: `or self.failed(err)` runs the handler, which violates the closure, which drains this locus.",
  },
  {
    id: "draining", kind: "edit",
    title: () => "Hale: read self.draining so a drain can end this loop",
    source: { doc: DOC, section: "2. A surface, served", example: FIX },
    sites: (c) => [...c.text.matchAll(/\bwhile\s+true\s*\{/g)].map((m) => ({ range: c.range(m.index!, m.index! + m[0].length), detail: { start: String(m.index), end: String(m.index! + m[0].length) } })),
    edit: (c, s) => { const e = new vscode.WorkspaceEdit(); e.replace(c.doc.uri, c.range(Number(s.detail.start), Number(s.detail.end)), "while !self.draining {"); return e; },
    note: "A run() that never reads draining holds the process open past Ctrl-C until the 5 s grace expires.",
  },
  {
    id: "claims", kind: "edit",
    title: (s) => `Hale: state the law the rows already satisfy (one writer per topic: ${s.detail.topics})`,
    source: { doc: "docs/src/claims.md", section: "claims", example: "iris/examples/claims-demo/app/main.hl" },
    sites: (c) => {
      const m = c.main; if (!m || /\bclaims\s*\{/.test(c.text.slice(m.open, m.close))) return [];
      const pubs = c.model.artifact.relations.publishes;
      const one = (c.model.artifact.topics ?? []).filter((t) => !/^__/.test(t.name) && new Set(pubs.filter((p) => p.subject === t.name || p.subject === t.subject).map((p) => ownerOf(p.fn))).size === 1).map((t) => t.name);
      return one.length ? [{ range: c.range(m.open, m.open + 1), detail: { topics: one.join(", "), close: String(m.close) } }] : [];
    },
    edit: (c, s) => { const e = new vscode.WorkspaceEdit(); const rows = s.detail.topics.split(", ").map((t) => `${ind(4)}one_writer_${lower(t)}: count publishers(topic ${t}) == 1;`); appendMember(e, c, Number(s.detail.close), [``, `claims {`, ...rows, `}`], 4); return e; },
    note: "A claim is checked by hale check as an error with zero run-time cost; a failing one returns the witness path.",
  },
  {
    id: "instantiate", kind: "edit",
    title: (s) => `Hale: instantiate ${s.detail.locus} as a param of the main locus (it is declared but never born)`,
    source: { doc: "AGENTS.md", section: "The pattern catalog", example: "crates/hale-codegen/tests/fixtures/examples/02-parent-child/main.hl" },
    sites: (c) => {
      const m = c.main; if (!m) return [];
      const inst = new Set(c.model.artifact.contracts.flatMap((x) => x.instances.map((i) => x.locus)));
      return c.userLoci.filter((l) => !inst.has(l) && !new RegExp(`\\b${l}\\s*\\{`).test(c.text.replace(new RegExp(`\\blocus\\s+${l}\\s*\\{`), ""))).map((l) => ({ range: c.range(m.open, m.open + 1), detail: { locus: l } }));
    },
    edit: (c, s) => { const e = new vscode.WorkspaceEdit(); const line = `${lower(s.detail.locus)}: ${s.detail.locus} = ${s.detail.locus} { };`; const p = c.params; if (p) insertInto(e, c, p.open, [line], 8); else insertInto(e, c, c.main!.open, [`params {`, `${ind(4)}${line}`, `}`], 4); return e; },
  },
  {
    id: "subscribe", kind: "command",
    title: (s) => `Hale: subscribe a locus to ${s.detail.topic} (nothing consumes it in this seed)`,
    source: { doc: "docs/src/services/bus.md", section: "subscribe", example: "crates/hale-codegen/tests/fixtures/examples/05-bus/main.hl" },
    sites: (c) => c.topics.filter((t) => !c.model.artifact.relations.subscribes.some((x) => x.subject === t.name)).map((t) => ({ range: c.range(t.start, t.end), detail: { topic: t.name } })),
    command: (c, s) => ({ command: "hale.applyBus", arguments: ["subscribe", s.detail.topic] }),
  },
  {
    id: "publish", kind: "command",
    title: (s) => `Hale: publish ${s.detail.topic} from a locus (nothing publishes it in this seed)`,
    source: { doc: "docs/src/services/bus.md", section: "publish", example: "crates/hale-codegen/tests/fixtures/examples/05-bus/main.hl" },
    sites: (c) => c.topics.filter((t) => !c.model.artifact.relations.publishes.some((x) => x.subject === t.name)).map((t) => ({ range: c.range(t.start, t.end), detail: { topic: t.name } })),
    command: (c, s) => ({ command: "hale.applyBus", arguments: ["publish", s.detail.topic] }),
  },
  {
    id: "sealed", kind: "edit",
    title: (s) => `Hale: seal ${s.detail.locus} (its ${s.detail.field} reads only from inside)`,
    source: { doc: "AGENTS.md", section: "@sealed", example: "crates/hale-codegen/tests/fixtures/examples/secrets-sealed-handler.hl" },
    sites: (c) => c.model.artifact.contracts.filter((x) => c.userLoci.includes(x.locus) && !x.sealed && !x.instances.some((i) => i.owner === null)).flatMap((x) => { const f = x.params.find((p) => /secret|token|key|password|credential/i.test(p.name) && /^(String|Bytes)$/.test(p.type)); const b = f ? c.locusBlock(x.locus) : undefined; return f && b ? [{ range: c.range(b.open, b.open + 1), detail: { locus: x.locus, field: f.name, at: String(c.text.lastIndexOf("locus", b.open)) } }] : []; }),
    edit: (c, s) => { const e = new vscode.WorkspaceEdit(); const at = Number(s.detail.at); const lineStart = c.text.lastIndexOf("\n", at) + 1; e.insert(c.doc.uri, c.at(lineStart), "@sealed\n"); return e; },
    note: "Loci are not field-encapsulated by default: self.child.key typechecks. @sealed is the confinement a secret rests on; `require sealed(all vaults)` makes it law.",
  },
  {
    id: "no_block", kind: "edit",
    title: (s) => `Hale: assert ${s.detail.handler} never blocks (@no_block)`,
    source: { doc: "docs/src/effects.md", section: "@no_block", example: "crates/hale-codegen/tests/fixtures/examples/74-effect-contracts/main.hl" },
    sites: (c) => c.model.artifact.relations.subscribes.filter((x) => c.userLoci.includes(x.locus)).flatMap((x) => { const d = c.fnDecl(`${x.locus}::${x.handler}`); if (!d) return []; const before = c.text.slice(Math.max(0, d.start - 80), d.start); return /@no_block|@effects/.test(before) ? [] : [{ range: c.range(d.start, d.paramsEnd), detail: { handler: `${x.locus}::${x.handler}`, start: String(d.start) } }]; }),
    edit: (c, s) => { const e = new vscode.WorkspaceEdit(); const at = Number(s.detail.start); const lineStart = c.text.lastIndexOf("\n", at) + 1; e.insert(c.doc.uri, c.at(lineStart), `${c.text.slice(lineStart, at)}@no_block\n`); return e; },
    note: "Checked transitively: a call chain that can block is reported with the chain. A handler on a `where async_io` pool is checked without the annotation.",
  },
  {
    id: "release", kind: "edit",
    title: (s) => `Hale: declare release(c: ${s.detail.type}) so accepted children are reclaimed when their run ends`,
    source: { doc: "spec/semantics.md", section: "release(c)", example: "tests/hale/accept_interface_release_test.hl" },
    sites: (c) => c.userLoci.flatMap((l) => { const b = c.locusBlock(l); if (!b) return []; const body = c.text.slice(b.open, b.close); const m = /\baccept\s*\(\s*\w+\s*:\s*([A-Za-z_][\w:]*)\s*\)/.exec(body); return m && !new RegExp(`\\brelease\\s*\\(\\s*\\w+\\s*:\\s*${m[1].replace(/::/g, "::")}\\b`).test(body) ? [{ range: c.range(b.open, b.open + 1), detail: { locus: l, type: m[1], close: String(b.close) } }] : []; }),
    edit: (c, s) => { const e = new vscode.WorkspaceEdit(); appendMember(e, c, Number(s.detail.close), [`release(c: ${s.detail.type}) { }`], 4); return e; },
    note: "Without release an accepted child is a resident and lives until the parent dissolves: on a daemon, unbounded growth.",
  },
  {
    id: "unit", kind: "command",
    title: (s) => `Hale: give ${s.detail.field} a unit (a quantity type instead of a bare Decimal)`,
    source: { doc: "docs/src/units.md", section: "units", example: "crates/hale-codegen/tests/fixtures/examples/93-units/main.hl" },
    sites: (c) => /\bunit\s+\w+/.test(c.text) ? [] : [...c.text.matchAll(/\b(price|px|amount|total|cost|fee|balance|qty|quantity)\s*:\s*Decimal\b/g)].slice(0, 1).map((m) => ({ range: c.range(m.index!, m.index! + m[0].length), detail: { field: m[1] } })),
    command: () => ({ command: "hale.insertSnippetAtTop", arguments: ["unit ${1:cent};\nunit ${2:USD} = 100 ${1:cent};\ntype ${3:Money} = quantity Int in ${1:cent};\n\n"] }),
    note: "A quantity carries its unit through arithmetic; mixing units is a check error, and the JSON codec carries it as its count.",
  },
  {
    id: "test", kind: "edit",
    title: () => "Hale: add a first test (tests/<seed>_test.hl, run by hale test)",
    source: { doc: "docs/src/getting-started/first-run.md", section: "tests", example: "crates/hale-cli/src/verbs/init.rs" },
    sites: (c) => c.main && !require("fs").existsSync(require("path").join(c.model.seedDir, "tests")) ? [{ range: c.range(0, 0), detail: {} }] : [],
    edit: (c) => { const e = new vscode.WorkspaceEdit(); const name = require("path").basename(c.model.seedDir); const uri = vscode.Uri.file(require("path").join(c.model.seedDir, "tests", `${name}_test.hl`)); e.createFile(uri, { ignoreIfExists: true }); e.insert(uri, new vscode.Position(0, 0), `// hale test discovers *_test.hl recursively. Each test file is its own\n// program: it imports the seed under test and asserts.\n\nimport ".." as app;\n\nfn main() {\n    std::test::assert(true, "${name}: the seed imports");\n}\n`); return e; },
  },
];

/** The tips whose sites touch `range`, as code actions. */
export function tipActions(c: Ctx, range: vscode.Range): vscode.CodeAction[] {
  const out: vscode.CodeAction[] = [];
  for (const tip of TIPS) {
    for (const site of tip.sites(c)) {
      if (!site.range.intersection(range) && !(site.range.isEmpty && tip.kind === "command")) continue;
      if (tip.kind === "command" && !site.range.isEmpty) continue;
      const a = new vscode.CodeAction(tip.title(site), tip.kind === "edit" ? vscode.CodeActionKind.Refactor : vscode.CodeActionKind.Empty);
      if (tip.kind === "edit") a.edit = tip.edit?.(c, site);
      else if (tip.kind === "command") a.command = { title: tip.title(site), ...tip.command!(c, site) };
      else a.command = { title: tip.title(site), command: "hale.showTip", arguments: [tip.id] };
      if (tip.kind === "edit" && !a.edit) continue;
      out.push(a);
    }
  }
  return out;
}

/** Every applicable tip for a document, for the Program view and the palette. */
export function allTips(c: Ctx): { tip: Tip; site: Site }[] {
  const out: { tip: Tip; site: Site }[] = [];
  for (const tip of TIPS) for (const site of tip.sites(c)) out.push({ tip, site });
  return out;
}
