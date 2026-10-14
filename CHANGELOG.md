# Changelog

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
