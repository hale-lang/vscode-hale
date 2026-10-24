# Changelog

## 0.2.0 — 2026-10-23

Refresh syntax highlighting and the examples index against Hale v0.28.0.
Existing scope names are retained; contextual rules and scopes are added.

- Set types (`type Inbound = A | B | C;`) and their `|` separators.
- Closed and callable `seam` blocks, arrow chains and `or end`.
- Repository annotations (`@repo(T)`), state-effect calls (`reads(T)`,
  `writes(T)`, `creates(T)`, `deletes(T)`, `mutates(T)`) and the existing
  annotation scope for `@idempotent` and `@not_idempotent`.
- `fleet locus`, `host("…")` and `replicas(n)` placement.
- REST route clauses (`at "GET /p/{id}"`, `status: 201`) on `rpc` rows.
- Consumed surfaces (`api X from openapi "…"`, also `from mcp`) and
  signature rows with `wire: "GET /items"`.
- Enum error annotations: `@not_found`, `@conflict`, `@invalid`,
  `@forbidden` and `@unavailable`, using the existing annotation scope.
- Raw multiline block strings with matching fences of three or more
  quotes, including nested shorter fences, without escapes or interpolation.
- Three-way presence fields (`x`, `has_x`, `clear_x`) as ordinary fields.
- Wire maps (`bounded[T; N] indexed_by key`, also `-> value`).
- Named claims: `avoiding`, `require separate_domains(...)`,
  `require no_silent_loss(...)` and `cover keys(topic …)`.
- Qualified ordinary expressions such as `api::client(...)` and
  `http::Rest { fallback: … }`.
- Real upstream fixtures with source revision, hashes and assertions at
  exact source positions. Fleet vocabulary is included in the language
  catalog; `@secret` is now marked as present in the upstream corpus.

- Repository method generation from `@repo(T)`, available as a CodeLens,
  quick fix and command. Reads the actual key field, preserves existing
  methods, and emits typed, explicitly failing storage stubs.
- Guided creation of API surfaces from handler methods, plus setup for
  multiple surfaces and Unix/HTTP RPC/REST/MCP/gRPC transports. Generates
  receivers, exposure params, REST routes and environment-backed bearer
  authentication; supports unsaved sibling files and a single undo step.
- Correct the existing serve snippets and next-step edits to use
  `api::Exposure` params instead of the retired `let … = api::serve(…)`
  form inside `run()`.

## 0.1.0 — 2026-10-14

First public version.

- **Here**: a guide that follows the cursor. For the block you are in (`main locus`, `locus`, `bus`, `params`, `placement`, `claims`, a hook, a fn, …) it says what the block is, what this seed already has there, what you can write there (each row inserts it) and what must hold. Completion inside a block offers the same rows.
- **Language**: every construct of the language under its chapter, marked used or unused in the open seed, with its uses, chapter, examples and the view that shows it. Hover any construct for the same.
- **CodeLens** above declarations: a locus's place in the tower, bus, hooks and effects; a topic's ends; a surface's exposures; a claim's verdict.
- Views over the compiler's rows: Program, Tower, Lifecycle, Bus, Placement, Effects, Law, Units, Advice, Changes (a semantic diff since the last check), Holes.
- Next steps: edits copied from the book's examples, applied where they fit.
- API docs (OpenAPI, MCP, JSON Schema) and the seed's own reference from `hale doc`.
- Commands for the toolchain: check, verify, build, run, test, bench, observe (iris), record and replay, environments and the matrix, targets, API export checks.
- Test explorer integration for `*_test.hl` and `*_bench.hl`.

## 0.0.1 – 0.0.6 — 2026-10-13

The spike: the language server client, the grammar generated from the compiler's keyword table, the first six views, the graph panel, the API docs panel, the serve-a-surface code action and the first tips.
