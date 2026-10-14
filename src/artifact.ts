// The topology artifact as `hale check --dump-topology` writes it
// (spec/model.md, schema 1.19). The extension reads these rows and
// derives nothing of its own: a section the compiler adds later is a
// new reader in `families/`, never a new rule here.

export type ByteSpan = [number, number];

export interface SourceRef { source: number; span: ByteSpan }
export interface FileRef { file: string; span: ByteSpan }
export type Loc = SourceRef | FileRef;

export interface Source { id: number; path: string; digest: string }

export interface Topic { name: string; subject: string; shape: string; payload_hash: string }

export interface Instance { path: string; owner: string | null; domain: string }

export interface Contract {
  locus: string;
  sealed: boolean;
  params: { name: string; type: string }[];
  methods: string[];
  publishes: unknown[];
  subscribes: { topic: string; handler: string; capacity: unknown; shed: string }[];
  supervises: unknown[];
  instances: Instance[];
  file: string;
  span: ByteSpan;
}

export interface Claim { name: string; form: string; result: string; ordinal: number }

export interface LawRow {
  ordinal: number;
  name: string;
  origin: string;
  family: string;
  verdict: string;
  law: Record<string, unknown>;
  file: string;
  span: ByteSpan;
  witness?: unknown;
}

export interface Unknown { fn: string; reasons: string[] }

export interface Supervision { locus: string; child: string; err: string; ops: string[] }

export interface Endpoint {
  verb: string; subject: string; via: string; locus: string; topic?: string; file: string; span: ByteSpan;
}

/** A publish a locus declares in its `bus { }`, with its wire subject. */
export interface DeclaredPublish { locus: string; subject: string; topic: string; file?: string; span?: ByteSpan }
/** One publish site of a fn and the wire subject it reaches. */
export interface EndpointIdentity { verb: string; fn: string; site: number; wire: string; topic: string }
/** A claim lowered to its canonical form, with its verdict. */
export interface Lowered { subject: string; form: string; result: string; ordinal: number; cert?: number }

export interface Artifact {
  schema: string;
  semantics: number;
  shape_hash: string;
  artifact_digest?: string;
  sorts: { loci: string[]; fns: string[]; topics: string[] };
  sealed: string[];
  /** Effect classes a program declared itself (`effect money;`), by the fn that is a source of each. */
  labels?: Record<string, string[]>;
  lowered?: Lowered[];
  declares_publish?: DeclaredPublish[];
  endpoint_identity?: EndpointIdentity[];
  /** Imported seeds, by alias. */
  seeds?: Record<string, unknown>;
  evaluation?: { roots: unknown[]; closure: unknown[] };
  relations: {
    calls: { from: string; to: string }[];
    calls_via_stdlib: unknown[];
    publishes: { fn: string; subject: string }[];
    subscribes: { subject: string; locus: string; handler: string }[];
  };
  groups: Record<string, string[]>;
  phases: Record<string, { phase: string; kind: string }>;
  effects: Record<string, string[]>;
  supervision: Supervision[];
  unknowns: Unknown[];
  sources: Source[];
  provenance: {
    decls: Record<string, SourceRef>;
    publishes: (SourceRef & { fn: string; subject: string })[];
    subscribes: (SourceRef & { subject: string; locus: string; handler: string })[];
    calls: (SourceRef & { from: string; to: string })[];
    supervision: (SourceRef & { locus: string; child: string })[];
  };
  topics: Topic[];
  endpoints: Endpoint[];
  contracts: Contract[];
  bindings: Record<string, unknown>[];
  claims: Claim[];
  law: { rows: LawRow[]; [k: string]: unknown };
  capabilities: Record<string, boolean>;
  adequacy: Record<string, string>;
  verdict: string;
}

/** A JSON-schema reference as the inventory writes it. */
export type SchemaRef = { $ref?: string; type?: string } | null;

/** `hale check --api`: the surfaces, exposures and hubs of the entry. */
export interface Inventory {
  inventory: number;
  app: string;
  surfaces: {
    name: string;
    digest: string;
    members: { name: string; request: SchemaRef; response: SchemaRef; error: SchemaRef; requires: string[] }[];
  }[];
  exposures: {
    exposure: string;
    name: string;
    surface: string;
    digest: string;
    listener: { transport: string; address: string };
    codec: string;
    principals: { source: string; type?: string };
    roles: { source: string; type?: string };
    receivers: { type: string; instance: string; binding: string; pool: string }[];
  }[];
  hubs: {
    exposure: string;
    name: string;
    digest: string;
    instance: string;
    listener: { transport: string; address: string };
    codec: string;
    principals: { source: string; type?: string };
    roles: { source: string; type?: string };
    streams: { topic: string; subject: string; direction: string; payload: SchemaRef; codec: string; bound?: number; on_full?: string; loss?: string }[];
  }[];
  schemas: Record<string, unknown>;
}

/** A deployment environment of hale.toml: `[environments.<name>]`. */
export interface Environment { name: string; entrypoints: string[]; constitution?: string; sourceOnly?: boolean }

/** What a lens may read beside the artifact. */
export interface BuildContext {
  inventory?: Inventory;
  /** The environments hale.toml declares, when the seed has one. */
  environments?: Environment[];
  /** `hale inputs`: every file a build of the seed reads. */
  inputs?: string[];
}

/** One checked seed: its artifact and where it came from. */
export interface Model {
  artifact: Artifact;
  seedDir: string;
  artifactPath: string;
  inventory?: Inventory;
  environments?: Environment[];
  inputs?: string[];
}

/** The lifecycle hooks, in the order the runtime calls them. */
export const HOOKS = ["birth", "accept", "release", "run", "drain", "dissolve", "on_failure"] as const;
export const MODES = ["bulk", "harmonic", "resolution"] as const;

/** The hooks, modes and methods a locus declares, from the phase table. */
export function phasesOf(a: Artifact, locus: string): { hooks: string[]; modes: string[]; methods: string[] } {
  const hooks: string[] = []; const modes: string[] = []; const methods: string[] = [];
  for (const [fn, p] of Object.entries(a.phases ?? {})) {
    if (ownerOf(fn) !== locus || fn === locus) continue;
    const name = fn.slice(locus.length + 2);
    if (isGenerated(name)) continue;
    if (p.kind === "hook") ((MODES as readonly string[]).includes(p.phase) ? modes : hooks).push(p.phase);
    else methods.push(name);
  }
  hooks.sort((x, y) => HOOKS.indexOf(x as typeof HOOKS[number]) - HOOKS.indexOf(y as typeof HOOKS[number]));
  return { hooks, modes, methods };
}

/** A name the compiler made rather than the author: `__StdApiExposure`, `App.__rpc_u_1`, `Book::__rpc_ev`. */
export function isGenerated(name: string): boolean {
  return /(^|\.|::)__/.test(name);
}

/** The type name a schema reference points at, for a signature line. */
export function refName(r: SchemaRef): string {
  if (!r) return "()";
  if (r.$ref) return r.$ref.split("/").pop() ?? r.$ref;
  return r.type ?? "…";
}

/** The byte offset `byteOff` into `text` as a UTF-16 code-unit offset. */
export function charOffsetOfByte(text: string, byteOff: number): number {
  const buf = Buffer.from(text, "utf8");
  if (byteOff >= buf.length) return text.length;
  return buf.subarray(0, byteOff).toString("utf8").length;
}

/** The locus a `Locus::method` name belongs to, or the name itself. */
export function ownerOf(fn: string): string {
  const i = fn.lastIndexOf("::");
  return i < 0 ? fn : fn.slice(0, i);
}

/** Where a declaration or a fn is written, if the artifact says. */
export function declLoc(a: Artifact, name: string): Loc | undefined {
  const d = a.provenance?.decls ?? {};
  if (d[name]) return d[name];
  const owner = ownerOf(name);
  if (d[owner]) return d[owner];
  const c = a.contracts?.find((c) => c.locus === name || c.locus === owner);
  return c ? { file: c.file, span: c.span } : undefined;
}

/** A node of a lens: plain data, so families are testable without VS Code. */
export interface Node {
  label: string;
  description?: string;
  tooltip?: string;
  /** A codicon id, e.g. "symbol-class". */
  icon?: string;
  /** "ok" | "warn" | "error" | undefined: tints the icon. */
  tone?: "ok" | "warn" | "error";
  children?: Node[];
  location?: Loc;
  expanded?: boolean;
  /** A command the row runs when clicked, instead of revealing a location. */
  command?: { command: string; title: string; arguments?: unknown[] };
  /** A context value for menus. */
  contextValue?: string;
}

/** A lens over the artifact: which sections it reads and what it shows. */
export interface Family {
  id: string;
  title: string;
  /** Artifact sections this lens reads (the registry's "consumer" line). */
  reads: (keyof Artifact)[];
  build(a: Artifact, ctx?: BuildContext): Node[];
}
