/** Source edits for incomplete programs. Templates follow spec/api.md and
 * tests/hale/repo_memory_test.hl; the compiler remains the semantic authority. */
export interface Source { id: string; text: string }
export interface Insertion { source: string; at: number; text: string }
export interface Block { source: Source; name: string; kind: string; start: number; open: number; close: number; repo?: string; annotation?: number }
export interface Method { name: string; owner: string; params: string; header: string; start: number }
export const snake = (s: string) => s.replace(/([a-z0-9])([A-Z])/g, "$1_$2").toLowerCase();

/** Keep offsets and newlines, hide comments, quoted strings, raw fences and tags. */
export function mask(text: string): string {
  const out = text.split("");
  const hide = (a: number, b: number) => { for (let j = a; j < b; j++) if (out[j] !== "\n" && out[j] !== "\r") out[j] = " "; };
  for (let i = 0; i < text.length;) {
    const start = i;
    if (text.startsWith("//", i)) { i = text.indexOf("\n", i); if (i < 0) i = text.length; }
    else if (text.startsWith("/*", i)) {
      let depth = 1; i += 2;
      while (i < text.length && depth) { if (text.startsWith("/*", i)) { depth++; i += 2; } else if (text.startsWith("*/", i)) { depth--; i += 2; } else i++; }
    } else if (text[i] === '"') {
      const n = /^"+/.exec(text.slice(i))![0].length;
      if (n >= 3) {
        const end = new RegExp(`^[ \\t]*"{${n}}(?!")`, "gm"); end.lastIndex = i + n;
        const match = end.exec(text); i = match ? match.index + match[0].length : text.length;
      } else {
        i++; while (i < text.length) { if (text[i] === "\\") i += 2; else if (text[i++] === '"') break; }
      }
    } else if (text[i] === "`") { i = text.indexOf("`", i + 1); i = i < 0 ? text.length : i + 1; }
    else { i++; continue; }
    hide(start, Math.min(i, text.length));
  }
  return out.join("");
}
export function closing(src: string, open: number): number {
  const pair: Record<string, string> = { "{": "}", "(": ")", "[": "]" };
  const end = pair[src[open]]; if (!end) return -1;
  let n = 0;
  for (let i = open; i < src.length; i++) { if (src[i] === src[open]) n++; else if (src[i] === end && --n === 0) return i; }
  return -1;
}
function direct(src: string, re: RegExp, from = 0, to = src.length): RegExpMatchArray[] {
  const depths: number[] = []; let n = 0;
  for (let i = from; i < to; i++) { depths[i] = n; if (src[i] === "{") n++; else if (src[i] === "}") n--; }
  return [...src.matchAll(re)].filter(m => m.index! >= from && m.index! < to && depths[m.index!] === 0);
}
export function blocks(source: Source): Block[] {
  const src = mask(source.text);
  return direct(src, /\b(main\s+locus|fleet\s+locus|locus|api|type)\s+([A-Za-z_]\w*)\s*(?:=\s*enum\s*|requires\s*:\s*\[[^\]]*\]\s*|:[^{};]*)?\{/g).flatMap(m => {
    const open = m.index! + m[0].length - 1, close = closing(src, open);
    if (close < 0) return [];
    const before = src.slice(0, m.index);
    const ann = /@repo\(\s*([A-Za-z_]\w*)\s*\)(?:\s|@\w+(?:\([^{};]*?\))?)*$/.exec(before);
    return [{ source, name: m[2], kind: m[1].replace(/\s+/g, " "), start: m.index!, open, close, repo: ann?.[1], annotation: ann?.index }];
  });
}
export function methods(b: Block): Method[] {
  const src = mask(b.source.text);
  return direct(src, /\bfn\s+([A-Za-z_]\w*)\s*\(/g, b.open + 1, b.close).flatMap(m => {
    const open = m.index! + m[0].length - 1, end = closing(src, open);
    const body = src.indexOf("{", end); if (end < 0 || body < 0 || body > b.close) return [];
    return [{ name: m[1], owner: b.name, params: src.slice(open + 1, end), header: src.slice(m.index, body), start: m.index! }];
  });
}
function memberBlock(b: Block, name: string): { open: number; close: number } | undefined {
  const src = mask(b.source.text);
  const m = direct(src, new RegExp(`\\b${name}\\s*(?:\\(\\s*\\))?\\s*\\{`, "g"), b.open + 1, b.close)[0];
  if (!m) return;
  const open = m.index! + m[0].length - 1, close = closing(src, open);
  if (close >= 0) return { open, close };
}
function fields(source: Source, open: number, close: number) {
  const src = mask(source.text);
  return direct(src, /\b([A-Za-z_]\w*)\s*:\s*([A-Za-z_][\w:]*)/g, open + 1, close).map(m => {
    const end = src.indexOf(";", m.index!);
    return { name: m[1], type: m[2], text: source.text.slice(m.index, end), start: m.index! };
  });
}
const CRUD = ["get", "create", "put", "remove"];
export function missingMethods(b: Block): string[] { const have = methods(b).map(m => m.name); return CRUD.filter(n => !have.includes(n)); }
function unique(base: string, sources: Source[]): string {
  const names = new Set(sources.flatMap(s => mask(s.text).match(/\b[A-Za-z_]\w*\b/g) ?? []));
  let n = base, i = 2; while (names.has(n)) n = base + i++; return n;
}
export function repoErrors(b: Block, sources: Source[]): { type?: string; variants: string[] } {
  const types = [...new Set(methods(b).filter(m => CRUD.includes(m.name)).map(m => /\bfallible\(\s*([\w:]+)\s*\)/.exec(m.header)?.[1]))];
  if (types.length > 1 || (types.length === 1 && !types[0])) throw new Error("Existing CRUD methods must share one fallible(E) type before generating the remaining methods.");
  const type = types[0]; if (!type) return { variants: [] };
  const decl = sources.flatMap(blocks).find(d => d.kind === "type" && d.name === type);
  if (!decl || !/=\s*enum/.test(decl.source.text.slice(decl.start, decl.open))) throw new Error(`Cannot resolve ${type} to a local enum. Add a nullary error variant locally before generating stubs.`);
  const body = mask(decl.source.text).slice(decl.open + 1, decl.close);
  const variants = body.split(",").map(v => v.replace(/@\w+(?:\([^)]*\))?/g, "").trim()).filter(v => /^[A-Za-z_]\w*$/.test(v)).map(v => `${type}::${v}`);
  if (!variants.length) throw new Error(`${type} has no nullary variant to use for unimplemented storage methods.`);
  return { type, variants };
}
export function generateRepo(b: Block, sources: Source[], failure?: string): Insertion[] {
  if (!b.repo) throw new Error("Add @repo(RecordType) to this locus first.");
  const missing = missingMethods(b); if (!missing.length) return [];
  const record = sources.flatMap(blocks).find(d => d.kind === "type" && d.name === b.repo);
  if (!record) throw new Error(`Cannot find local record ${b.repo}. Put its declaration in this seed.`);
  const keys = fields(record.source, record.open, record.close).filter(f => /`[^`]*\bdb:\s*"[^"\n]*,\s*key(?:\s*,[^"\n]*)?"[^`]*`/.test(f.text));
  if (keys.length !== 1) throw new Error(`${b.repo} needs exactly one field tagged db:"column,key" before generating methods.`);
  // Reject field shapes that this small scanner cannot preserve exactly.
  const keyText = mask(keys[0].text).split(":").slice(1).join(":").trim();
  if (!new RegExp(`^${keys[0].type}\\s*(?:=|$)`).test(keyText)) throw new Error("The repository key must have a named scalar type or alias.");
  const errors = repoErrors(b, sources), errorType = errors.type ?? unique(`${b.name}Error`, sources);
  if (errors.type && (!failure || !errors.variants.includes(failure))) throw new Error("Choose the existing error variant the generated stubs should return.");
  const fail = failure ?? `${errorType}::NotImplemented`;
  const signatures: Record<string, [string, string]> = {
    get: [`id: ${keys[0].type}) -> ${b.repo}`, "reads"], create: [`o: ${b.repo}) -> ${b.repo}`, "creates"],
    put: [`id: ${keys[0].type}, o: ${b.repo}) -> ${b.repo}`, "writes"], remove: [`id: ${keys[0].type})`, "deletes"],
  };
  const body = missing.map(name => {
    const [sig, effect] = signatures[name];
    return `\n    @effects(is: { ${effect}(${b.repo}) })${name === "get" ? "" : " @not_idempotent"}\n    fn ${name}(${sig} fallible(${errorType}) {\n        // TODO: implement ${name} in your storage driver.${name === "get" ? "" : " Review retry safety before using @idempotent."}\n        fail ${fail};\n    }\n`;
  }).join("");
  const edits: Insertion[] = [{ source: b.source.id, at: b.close, text: body }];
  if (!errors.type) edits.push({ source: b.source.id, at: b.source.text.length, text: `\ntype ${errorType} = enum { @unavailable NotImplemented };\n\n` });
  return edits;
}
export function apiMethods(sources: Source[]): Method[] {
  return sources.flatMap(blocks).filter(b => b.kind === "locus").flatMap(methods).filter(m => {
    const params = m.params.split(",").map(p => p.trim()).filter(Boolean);
    if (/^\w+\s*:\s*std::api::Context$/.test(params.at(-1) ?? "")) params.pop();
    return params.length <= 1 && params.every(p => /^\w+\s*:\s*[\w:]+$/.test(p));
  });
}
export type Transport = "unix" | "http" | "rest" | "mcp" | "grpc";
export interface ApiSetup { surface: string; members?: string[]; transports: { kind: Transport; endpoint: string }[] }
export function generateApi(target: Source, sources: Source[], setup: ApiSetup): Insertion[] {
  const all = sources.flatMap(blocks);
  if (!/^[A-Za-z_]\w*$/.test(setup.surface)) throw new Error("Use a Hale identifier for the surface name.");
  if (!setup.transports.length) return [];
  const surface = all.find(b => b.kind === "api" && b.name === setup.surface);
  if (!surface && !setup.members?.length) throw new Error("Select at least one handler method.");
  if (!surface && new RegExp(`\\b${setup.surface}\\b`).test(sources.map(s => mask(s.text)).join("\n"))) throw new Error(`${setup.surface} is already used in this seed.`);
  const rows = surface ? [...mask(surface.source.text).slice(surface.open, surface.close).matchAll(/\brpc\s+(\w+::\w+)/g)].map(m => m[1]) : setup.members!;
  if (!rows.length) throw new Error("This setup needs a local surface with RPC rows.");
  const owners = [...new Set(rows.map(r => r.split("::")[0]))];
  if (owners.some(o => !all.some(b => b.kind === "locus" && b.name === o))) throw new Error("Receiver loci must be declared in this seed for automatic setup.");
  const mains = all.filter(b => b.kind === "main locus");
  if (mains.length > 1) throw new Error("Choose a seed with one main locus before setting up its API.");
  const main = mains[0], mainSource = main?.source ?? target;
  const params = main && memberBlock(main, "params");
  const existing = params ? fields(mainSource, params.open, params.close) : [];
  const reserved = [...sources];
  const fresh = (base: string) => { const name = unique(base, reserved); reserved.push({ id: "", text: name }); return name; };
  const lines: string[] = [], edits: Insertion[] = [];
  const receiver = owners.map(o => {
    const have = existing.find(p => p.type === o);
    const name = have?.name ?? fresh(snake(o));
    if (!have) lines.push(`${name}: ${o} = ${o} { };`);
    return `${o}: self.${name}`;
  }).join(", ");
  const network = setup.transports.some(t => t.kind !== "unix");
  let principals: string | undefined;
  if (network) {
    const type = fresh(`${setup.surface}Tokens`); principals = fresh(`${snake(setup.surface)}_tokens`);
    lines.push(`${principals}: ${type} = ${type} { };`);
    edits.push({ source: mainSource.id, at: mainSource.text.length, text: `\n// Set HALE_API_TOKEN before starting this service. Empty/unset rejects all callers.\nlocus ${type} {\n    params { credential: std::secret::Credential = std::secret::Credential { env_var: "HALE_API_TOKEN" }; }\n    fn principal(token: String) -> std::api::Principal {\n        if self.credential.matches(std::bytes::from_string(token)) {\n            return std::api::Principal { mode: "bearer", name: "api-client" };\n        }\n        return std::api::Principal { mode: "bearer", name: "" };\n    }\n    fn refused() -> String { return "a valid HALE_API_TOKEN bearer is required"; }\n}\n\n` });
  }
  const roleNames = [...new Set(sources.flatMap(s => [...mask(s.text).matchAll(/\brole\s+(\w+)/g)].map(m => m[1])))];
  let roles = existing.find(p => p.type === "std::api::StaticRoles")?.name;
  if (roleNames.length && !roles) { roles = fresh("api_roles"); lines.push(`// Configure LOTUS_API_ROLES with role=api-client mappings.`, `${roles}: std::api::StaticRoles = std::api::StaticRoles { known: "${roleNames.join(" ")}" };`); }
  if (setup.transports.some(t => t.kind === "rest")) {
    if (surface) {
      const src = mask(surface.source.text);
      for (const m of src.slice(surface.open + 1, surface.close).matchAll(/\brpc\s+(\w+::\w+)([^;]*);/g)) {
        if (/\bat\b/.test(m[2])) continue;
        const at = surface.open + 1 + m.index! + m[0].indexOf(m[1]) + m[1].length;
        edits.push({ source: surface.source.id, at, text: ` at "POST /${snake(setup.surface)}/${m[1].replace("::", "/")}"` });
      }
    }
  }
  if (!surface) edits.push({ source: target.id, at: target.text.length, text: `\napi ${setup.surface} {\n${rows.map(r => `    rpc ${r}${setup.transports.some(t => t.kind === "rest") ? ` at "POST /${snake(setup.surface)}/${r.replace("::", "/")}"` : ""};`).join("\n")}\n}\n` });
  const stops: string[] = [];
  for (const transport of setup.transports) {
    const name = fresh(`${snake(setup.surface)}_${transport.kind}`);
    const kind = transport.kind === "rest" ? "http::Rest" : `${transport.kind}::Rpc`;
    const config = transport.kind === "unix" ? `path: ${JSON.stringify(transport.endpoint)}` : `bind: ${JSON.stringify(transport.endpoint)}${transport.kind === "mcp" ? "" : ", codec: json"}, principals: self.${principals}`;
    lines.push(`${name}: api::Exposure = api::serve(${setup.surface}, ${kind} { ${config}${roles ? `, roles: self.${roles}` : ""} }, as: "${name}", receivers: { ${receiver} }, bound: 64, on_full: refuse);`);
    stops.push(`        self.${name}.stop();`);
  }
  const run = `    run() {\n        while !self.draining { std::time::sleep(100ms); }\n${stops.join("\n")}\n    }\n`;
  if (main) {
    if (params) edits.push({ source: mainSource.id, at: params.close, text: `\n${lines.map(l => `        ${l}`).join("\n")}\n    ` });
    else edits.push({ source: mainSource.id, at: main.open + 1, text: `\n    params {\n${lines.map(l => `        ${l}`).join("\n")}\n    }\n` });
    if (!memberBlock(main, "run")) edits.push({ source: mainSource.id, at: main.close, text: `\n${run}` });
    // Existing run/drain hooks are application logic. Exposure teardown follows ownership.
  } else {
    const name = fresh("App");
    edits.push({ source: mainSource.id, at: mainSource.text.length, text: `\nmain locus ${name} {\n    params {\n${lines.map(l => `        ${l}`).join("\n")}\n    }\n${run}}\n` });
    const entry = sources.flatMap(s => direct(mask(s.text), /\bfn\s+main\s*\(\s*\)\s*\{/g).map(m => ({ s, open: m.index! + m[0].length - 1 })));
    if (entry.length > 1) throw new Error("This seed has more than one fn main().");
    if (entry.length) {
      const at = closing(mask(entry[0].s.text), entry[0].open);
      if (at < 0) throw new Error("Finish the closing brace of fn main() first.");
      edits.push({ source: entry[0].s.id, at, text: `\n    ${name} { };\n` });
    } else edits.push({ source: mainSource.id, at: mainSource.text.length, text: `\nfn main() { ${name} { }; }\n` });
  }
  return edits;
}
/** Combine insertions at identical offsets deterministically, in caller order. */
export function applyInsertions(source: Source, edits: Insertion[]): string {
  const byOffset = new Map<number, string>();
  for (const e of edits.filter(e => e.source === source.id)) byOffset.set(e.at, (byOffset.get(e.at) ?? "") + e.text);
  let out = source.text;
  for (const [at, text] of [...byOffset].sort((a, b) => b[0] - a[0])) out = out.slice(0, at) + text + out.slice(at);
  return out;
}
