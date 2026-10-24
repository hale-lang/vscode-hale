# Hale for VS Code

Hale support for VS Code: diagnostics, navigation and formatting from
the compiler's language server, and the whole program visible beside
the source: the tower of loci, the bus, placement, effects, the law,
the API surfaces, and a guide that follows your cursor and tells you
what the block you are in is for and what you can write there.

## Install

1. **Install hale** (0.28 or newer), if you have not:

   ```sh
   curl -fsSL https://hale-lang.org/install.sh | sh
   ```

   The extension runs `hale` for everything: it must be on your `PATH`,
   or set `hale.path` in VS Code settings to the binary.

2. **Install the extension**: take `vscode-hale-<version>.vsix` from the
   [releases page](https://github.com/hale-lang/vscode-hale/releases) and run

   ```sh
   code --install-extension vscode-hale-<version>.vsix
   ```

   (A Marketplace listing is coming; until then the vsix is the way.)

3. **Open a `.hl` file.** Errors appear as you type. Click the Hale
   icon in the activity bar for the views. Save, and every view
   re-reads the program.

That is all. The rest of this page is what you get and how it works.

## The first five minutes

- **Here** (top of the Hale sidebar) follows your cursor. Inside a
  `bus { }` it explains what a bus block is, lists this locus's
  subscriptions and whether their handler fns exist, offers every topic
  of the seed as a `subscribe` or `publish` line (click to insert), and
  states the rules. Inside `main locus` it shows the tower with each
  child's thread, and offers `placement`, `bindings`, `claims`, each
  hook. Every block of the language has a guide.
- **Hover** any keyword, annotation or `std::` path for what it is, its
  chapter in the book, and examples. `Cmd+Shift+H` does the same.
- **Code lenses** above each declaration: a locus's place in the tower,
  its bus, its hooks, its effects; a topic's publishers and
  subscribers; whether a surface is served; a claim's verdict. Each
  opens the view with the rest.
- **Program** is the overview: the entry, the surfaces and where each
  is served, the hubs, the topics, what leaves the process, the loci by
  role, the files, the environments, the law.
- **Next steps** lists edits the book's examples show from where your
  program is (serve a surface over HTTP, supervise a child, state a
  claim, …). Each row applies the edit.
- **Language** lists every construct of the language under its chapter,
  marking the ones your seed uses. Dim rows open their chapter and
  examples, or insert a snippet.
- The other views each read one part of the compiler's output:
  **Tower**, **Lifecycle**, **Bus**, **Placement**, **Effects**, **Law**,
  **Units**, **Advice** (what could be sealed, what is a flow, what
  `hale verify` would fail on), **Changes** (what your last save did to
  the program's shape), **Holes**.
- The command palette has the toolchain: check, verify, build, run,
  test, bench, observe with iris, record and replay, API docs and
  export, environments and targets. The test explorer runs `*_test.hl`
  and `*_bench.hl`.

## Settings

| setting | what it does |
| --- | --- |
| `hale.path` | the binary; empty means `hale` on `PATH`, then a `target/release/hale` in or beside the workspace |
| `hale.env` | environment variables for every hale process the extension starts |
| `hale.checkOnSave` | refresh the views on save (default on) |
| `hale.codeLens` | the rows above declarations (default on) |
| `hale.observePort` | the port the Observe command opens iris on (default 8787) |

The graph views read compiler output: every row is a line of `hale check --dump-topology`, `hale check
--api`, a report flag, or `hale model diff`. A compiler older than the
extension expects gets a warning on activation; diagnostics still work.

---

# How it works

## Every construct, somewhere on screen

`src/language.ts` is the language as a table: every construct the spec
names (234 rows, grouped as `spec/tokens.md` groups the keywords and the
book groups its chapters), each with how it is spelled, the chapter that
teaches it, and the view that shows what the compiler derives from it.
The table is held to the compiler by `test/language.test.mjs`: every one
of the keyword table's 172 words maps to a row, every row's pattern hits
a real program in the checkout (the fixtures, the test programs, the
onboarding app, the book's code blocks), and the six constructs the spec
names but no program spells yet are flagged so the flag flips when one
appears.

The table drives:

- **Language view**: every construct under its part of the book, filled
  when the open seed spells it (with each use, click to go), dim when it
  does not (with its chapter, its examples in the checkout, the view
  that would show it, and a snippet that writes it). The title row
  counts how much of the language the seed uses; a filter shows only
  what it uses.
- **Hover**: the construct under the cursor, its gloss, its chapter,
  its view and its examples. `Cmd+Shift+H` ("What is this?") does the
  same from the keyboard, with a quick pick when the cursor is on
  nothing.
- **Completion**: at the head of a line, the constructs that have a
  snippet.
- **CodeLens**: the compiler's rows written above the declarations they
  describe. A locus gets its place in the tower, its bus ends, its hooks
  and what it supervises, its effect classes, the surfaces it serves. A
  topic gets its publishers and subscribers and the hub that streams it.
  A surface gets where it is served, or a one-click serve. A claim gets
  its verdict and the adequacy of its family. Each lens opens the view
  that holds the rest. `hale.codeLens` turns them off.

## Here: the guide that follows the cursor

`src/contexts.ts` is a guide per block the cursor can be in: the top
level, `main locus`, `locus`, `perspective`, `params`, `contract`,
`bus`, `capacity`, `closure`, `claims`, `constitution`, `placement`,
`bindings`, `topology`, `api`, `topic`, each lifecycle hook,
`on_failure`, `mode`, `fn`, `match`, a statement block, a literal. For
the block the cursor is in, the **Here** view shows what the block is
(two or three sentences, for someone who has not read the book, with
the chapter and the examples), what this seed already has there (a
bus block's subscriptions with whether their handler fns exist; the
main locus's tower with each child's thread and whether its `run()`
blocks; a surface's exposures; a closure's captured fields), what can
be written there (every row inserts it at the cursor; what is already
present is marked), and what must hold (the rules the book states).
The enclosing blocks follow, collapsed. Completion inside a block
offers the same rows. `test/contexts.test.mjs` holds the guides to the
language: every construct's pattern from `src/language.ts` must be
spelled by some guide's offer.

## Views

Each view is one lens over the compiler's rows, one file under
`src/families/` naming the artifact sections it reads, so a new
compiler family lands in "Other sections" raw until it has a lens.

- **Here**: the cursor's block, explained, with what it has, what fits and what must hold (above).
- **Program**: the entry, the api surfaces with their members and where
  each is served, the hubs and their streams, the topics (the compiler's
  own grouped apart), what crosses the process boundary, the loci by
  role, the files and imported seeds, the environments of `hale.toml`
  (each a one-click `check --env`, and the matrix), and the law.
- **Tower**: every locus instance under the entry, by ownership, with
  its thread domain.
- **Lifecycle**: each locus as a lifecycle: the seven hooks in the order
  they run, declared ones marked and missing ones named; its modes
  (`bulk`, `harmonic`, `resolution`), methods, subscriptions with their
  capacity and shed policy, what it supervises and how (`restart`,
  `quarantine`, `bubble`), who supervises it, its params and instances.
  The supervision tree at the bottom.
- **Bus**: every topic with its publishers (and how many sites send),
  its subscribers, who declares the publish, and a flag when one side is
  missing in this seed.
- **Placement**: instances by domain (`main`, `pinned:…`, pools), and
  the bindings.
- **Effects**: what every fn reaches as the compiler inferred it, by
  class and by locus; the classes the program declared itself
  (`effect money;`) with their sources; the effect laws
  (`@effects(only:)`, `@phase_effects`, `forbid reaches(…, effects(…))`)
  with their verdicts.
- **Law**: each claim with its verdict, every law in its lowered form,
  the groups, the adequacy of each judgment family, the capabilities.
- **Units**: `hale check --units`: every quantity, point and identity,
  its denomination and where it was fixed, its rounding policy, its
  range and headroom.
- **Advice**: what the compiler advises beyond the check: which loci
  could be `@sealed` (one click seals one), which locus types are flows
  and the `release` clauses that make them, the threads and pools the
  placement implies, and the findings `hale verify` would fail on.
- **Changes**: `hale model diff` between the previous check and this
  one: identical, source-only, a contract moved, or the model changed,
  with every declaration added, removed, renamed or moved. Pin a check
  to diff against it instead.
- **Holes**: what the compiler could not resolve, and the topics
  one-sided in this seed (the other side may be another binary).
- **Other sections**: artifact sections no view reads yet, raw. Today:
  none.

The Units and Advice views ask the compiler only while they are open.
Every row jumps to the span the artifact names.

## Next steps: the walk

The **Next steps** view lists, for the open file, every step the
examples show from where the program is: serve a surface, also serve
it over HTTP, MCP or gRPC, let a handler know its caller, require a
role, allow a browser origin, stream a topic over a hub, supervise a
child, read `self.draining`, state the law the rows satisfy, instantiate
a stranded locus, subscribe to or publish a one-sided topic, seal a
locus that holds secret material, assert a handler never blocks, give a
price a unit, declare `release`, add a first test. Each row applies the
edit; its child opens the fixture or chapter the edit is copied from.
The same tips are code actions where they apply, and the compiler's
unbounded-allocation warning gets `@bounded_by` / `@unbounded` fixes.
`test/host/walk.js` applies every edit-kind tip in turn and holds each
stage to `hale check`.

**Examples of any construct.** Hover a keyword, an annotation or a
`std::` path for the fixtures and chapters that use it, or run "Hale:
Examples of a construct". The index (`src/examples-index.json`) is
generated from a hale checkout by `scripts/gen-examples-index.mjs`.

## Graph completion and docs

- **Generate repository methods.** Add `@repo(Order)` above a locus, then
  click **Generate get, create, put, remove** above it, use the lightbulb,
  or run **Hale: Generate repository methods**. The record must declare
  exactly one key, for example ``id: OrderId `db:"id,key"`;``. The action
  reads that key's type,
  adds only missing CRUD methods, and writes their state-effect annotations.
  New write methods use `@not_idempotent` until you review retry safety.
  The bodies are TODO stubs that fail explicitly: implement your storage
  driver before calling them. For a new repository it adds an
  `@unavailable NotImplemented` error; a partial repository keeps its shared
  error type and asks which existing nullary variant the stubs should return.
- **Create an API.** Right-click in a Hale file or run **Hale: Create API
  from methods**. Select handlers and name the surface, then choose one or
  more transports: Unix, HTTP RPC, REST, MCP or gRPC. The action generates
  the surface, receiver params and `api::Exposure` params, and creates a
  main locus and entry function when needed. REST gets editable POST routes;
  existing routes and role requirements are preserved.
- **Serve several APIs.** **Hale: Set up API transports** lets you select
  multiple existing surfaces in one pass. The same action is above each
  API declaration. Each listener has its own editable address. Network
  listeners get a bearer provider backed by `HALE_API_TOKEN`, rejecting
  callers when it is unset. The authenticated principal is `api-client`;
  configure `LOTUS_API_ROLES` when rows require roles. Existing main receiver
  params are reused and existing lifecycle hooks are preserved. If main
  already has a `run()`, keep it alive for as long as you want to serve.
- These actions read unsaved files in the current seed, including sibling
  declarations, and work before the whole program typechecks. Cancellation
  changes nothing; generated code is one undo step. Save and run **Hale:
  Check seed** to validate your program. Imported receiver loci and consumed
  surfaces need manual wiring; the setup supports local RPC surfaces.
- **Snippets from the rows.** Inside `bus { }` the seed's topics are
  offered as `subscribe` / `publish` lines; inside `placement { }` the
  main's params as `pinned` / `cooperative` entries; inside main's
  `params`, each surface as an `api::Exposure` param.
- **API docs.** "Hale: Show API docs" renders a surface's OpenAPI form
  as the compiler prints it, with the MCP tools and the JSON Schema a
  tab away. "Hale: Show this seed's reference" renders `hale doc`, the
  reference from the seed's `///` comments.

## Commands: the toolchain

Check, verify, build, run, test, bench and `fmt --check` run in a
terminal. Beyond those: check for an environment or the whole matrix
(constitutions), build for a target (`wasm32`, a triple from `hale
targets`), observe (run with iris beside it and open the session in the
editor; `hale.observePort`), run and record (`LOTUS_OBS_RECORD`), replay
a recording with `--diff`, hold a surface's exported bundle to `spec/`,
fleet check, the stdlib reference. The test explorer runs `*_test.hl`
through `hale test --json` and `*_bench.hl` through `hale bench`.

## Developing

```sh
npm install
npm run compile      # grammar from keywords.rs, typecheck, bundle
npm test             # lenses over real artifacts, parsers over real reports, the catalog against the corpus, the grammar over a real file
npm run package      # a .vsix
npm run test:host    # the installed VS Code on a seed: activation, views, lenses, hover, a live diagnostic
```

`scripts/gen-grammar.mjs [keywords.rs]` regenerates the TextMate
grammar from the compiler's keyword table (`../hale-main` or `../hale`)
and names any keyword it does not classify.

## How a language change reaches the extension

| the compiler adds | the extension adds |
| --- | --- |
| a diagnostic | nothing: it arrives through the LSP |
| an artifact section (a registry family) | one file under `src/families/` that names what it reads |
| a keyword | one row in `src/language.ts` (the test names the word until it has one); `npm run grammar` regenerates |
| a construct with examples | nothing: `node scripts/gen-examples-index.mjs <checkout>` indexes it |
| a report flag | a parser in `src/reports.ts` with a fixture under `test/fixtures/reports/`, and rows in a view |
| a next step worth offering | one entry in `src/tips.ts`: where it applies, the edit, the chapter and fixture it is copied from |
| a CLI verb or flag | one command in `src/commands.ts` |
