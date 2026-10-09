---
status: approved
---

# Markdown Tasks as a Claude Code mod (sidebar pane for `spec/*/tasks.md`)

A new repo, `claude-md-taskview`, holding a Claude Code mod that draws the Markdown Tasks milestone/task tree in a pane beside the transcript, in the Claude Desktop Code tab and the CLI, so agent progress on a `tasks.md` can be followed without VS Code open. It is the same product as the VS Code extension on a second host: product context is in the extension's [product.md](https://github.com/coreyx/vscode-md-taskview/blob/main/spec/vscode-md-taskview/product.md) and the behaviour being ported is in its [requirements.md](https://github.com/coreyx/vscode-md-taskview/blob/main/spec/vscode-md-taskview/requirements.md). This plan covers only what the new host changes.

**Tier: light.** It is one pane on a product that already has a product.md, requirements and a working parser to copy; there is no external integration or data model. It was a close call, because this is a new repo and the host API is new (mods shipped in Claude Code v2.1.287 on 2026-10-01) with several behaviours unconfirmed. Those are handled by a spike that runs first (section 0) rather than by full-tier documents. If the spike fails on relative imports *and* bundling, or the pane cannot be made usable in Desktop, stop and re-triage.

## User Review Required

> [!IMPORTANT]
> **Toggling writes straight to disk with no undo.** The mod has no editor buffer or undo stack. A toggle re-reads the file, checks the bracket is still where the parse said, and writes the whole file back. If Claude edits the same file between that read and write, one of the two edits is lost. The window is milliseconds, but it exists.

> [!NOTE]
> **The parser is a copy, and the extension repo is not touched.** `core/` is adapted from `vscode-md-taskview` at commit `b591e0f` (v0.1.12). Parser fixes made in either repo must be ported to the other by hand; `core/UPSTREAM.md` records what was copied and from which commit so that is tractable.

> [!NOTE]
> Live sync is polling, not watching: the mods API has no file watcher. The pane re-checks file modification times about every 1.5 s, and refreshes immediately after any Claude `Edit`/`Write` tool call that touches a task file.

> [!NOTE]
> Dropped from the mod, by design of the host: right-click context menus (replaced by a state picker), undo/redo integration, Markdown-preview navigation modes, and the `createSampleSpec` command. The pane only exists in Claude Code surfaces (Code tab, CLI), not in regular Claude chat.

## Open Questions

None blocking. Decided on 2026-10-08:

- **Repo:** new repo `claude-md-taskview`. No mod code and no refactor in `vscode-md-taskview`.
- **Parser:** copied into `core/` and adapted; drift accepted.
- **Pane opens on command only** (`/tasks`), never unprompted.
- **Command name:** `/tasks`, falling back to `/md-tasks` if a built-in holds that name.
- **Jump-to-source:** nice-to-have. It is section 3 and ships only if the spike finds a clean way to do it.

The spike (section 0) may add questions; record them here before starting section 1.

Raised by the spike, decided on 2026-10-08:

- **Minimum Claude Code version for task rows: keep a fallback.** A `Button` holding `Text` children (the row design in section 3) is refused by 2.1.289 and accepted by 2.1.295. Rows are drawn that way inside a `try/catch`; when the engine throws, the row falls back to a `Text` glyph, a `Button` with a string label and a `Text` count, so builds from 2.1.287 still get a working pane. On those builds a done task's label is dimmed but not struck through, since a `Button` label takes `dimColor` only. The minimum version stays 2.1.287.

## Proposed Changes

The plugin sits at the repo root, so the repo itself is the installable mod.

### 0. Platform spike (do first; throwaway)

#### [NEW] `scratch/mod-spike/` (plugin.json, hooks.json, register.tsx)
- [x] Confirm a hooks module can `import` a sibling `.ts` file. If not, add an esbuild step that bundles `hooks/register.tsx` and `core/` into one file, and point `hooks.json` at the bundle.
- [x] Draw `Text` with `strikethrough` and `dimColor` on both `terminal` and `desktop` surfaces; record what each shows.
- [x] Draw a row as one plain `Button` with `Text` children (glyph, label, dim count) and confirm click and Enter both press it in the Desktop Code tab. (The Desktop Code tab refused `Text` children and drew the string-label fallback; click and Enter both press that. See HANDOFF.)
- [x] Draw 150 rows; confirm the pane scrolls and note redraw cost.
- [x] Test a `Markdown` `file:` link with `onLinkPress`, and `$.process.run(['code', '-g', 'path:line'])`, for section 3.
- [x] Write the results into `HANDOFF.md` (and any new question into Open Questions) before starting section 1.

### 1. Repo scaffold

#### [NEW] `README.md`, `LICENSE`, `.gitignore`, `CHANGELOG.md`
- [x] README: what it is, install (`claude --plugin-dir .`, then marketplace install), the `/tasks` command, settings, and the differences from the extension listed in User Review Required. Link the extension repo.
- [x] MIT licence, same holder as the extension.
- [x] `.gitignore`: `node_modules/`, `dist/`, `scratch/`, `.claude-plugin/types/`.

#### [NEW] `package.json`, `tsconfig.json`, `vitest.config.ts`
- [x] Dev dependencies only (`typescript`, `vitest`, and `esbuild` if the spike needs bundling). Scripts: `test` (vitest on `core/`), `typecheck`, `validate` (`claude plugin validate .`), `test:mod` (`claude plugin test .`).

### 2. Core (copied from the extension; no `vscode`, no Node APIs)

#### [NEW] `core/UPSTREAM.md`
- [x] Record source repo, commit `b591e0f`, each upstream file copied and what was changed in it.

#### [NEW] `core/types.ts`
- [x] From `src/models/types.ts`: `BracketRange`, `StateDefinition`, `TaskStats`, `TaskNode`, `HeadingNode`, `SpecGroup`, `TaskTreeNode`, with `fileUri`/`folderUri`/`taskFileUri` replaced by string paths `filePath`/`folderPath`/`taskFilePath`.

#### [NEW] `core/parse.ts`
- [x] From `src/parser/MarkdownASTParser.ts`: `parseTasks(content, specName, filePath, folderPath, template)` and `stripMarkdownFormatting`. The template is a parameter; no singleton.
- [x] Drop heading slugs (`Slugifier`), which only served Markdown-preview navigation.

#### [NEW] `core/templates.ts`
- [x] From `src/templates/StateTemplateEngine.ts`: `STANDARD_TEMPLATE`, `OBSIDIAN_TEMPLATE`, and pure `getState(template, char)` / `getNextState(template, char)` / `validateTemplate(obj)`.
- [x] Add `parseJsonc(text)` (strip `//` and `/* */` comments and trailing commas, then `JSON.parse`) so no `jsonc-parser` dependency is needed.

#### [NEW] `core/mutate.ts`
- [x] `replaceStateChar(content, bracketRange, expectedChar, nextChar)`: returns the new content, or `null` if the character at that position is no longer `expectedChar` between `[` and `]`. Preserves line endings and every other byte.

#### [NEW] `core/milestones.ts`
- [x] From `src/views/TaskTreeDataProvider.ts`: `isMilestoneHeading(label, keywords)`.

### 3. The mod

#### [NEW] `.claude-plugin/plugin.json`
- [x] Name `md-taskview`, version `0.1.0`, `"types": "./types/index.d.ts"`.
- [x] `userConfig` fields mirroring the extension settings: `specPathPattern` (`spec/*`), `taskFileName` (`tasks.md`), `stateTemplate` (options: `Standard (GFM)`, `Obsidian Tasks`, `Custom`), `customTemplatePath`, `strikeThroughCompleted`, `showProgressCount`, `hideCompletedByDefault`, `useH1AsGroupName`, `milestoneKeywords` (comma-separated string).

#### [NEW] `.claude-plugin/marketplace.json`
- [x] Marketplace entry for this repo so `/plugin install md-taskview --marketplace coreyx/claude-md-taskview` works.

#### [NEW] `hooks/hooks.json`
- [x] `{ "modules": ["./register.tsx"] }` (or the bundle, per the spike).

#### [NEW] `types/index.d.ts`
- [x] Declare `PluginState['md-taskview']`: `groups: SpecGroup[]`, `collapsed: string[]`, `hideCompleted: boolean`, `error: string | null`. (The contract must be self-contained, so it repeats the types of `core/types.ts`; a type check in `hooks/register.tsx` fails if the two drift. It also holds `focused: string | null`, the task row the state picker follows.)

#### [NEW] `hooks/discover.ts`
- [x] `discover($, options)`: expand `specPathPattern` one `*` segment at a time with `$.fs.list` (it does not recurse and there is no glob), keep directories containing `taskFileName`, return `{ name, folderPath, taskFilePath, mtimeMs }[]` sorted by name. (It takes closures over `$.fs` rather than `$`: Claude Code refuses a mod that passes `$` into an imported file. Settings are read by `hooks/settings.ts`.)
- [x] Skip `node_modules`, `dist`, `.git`.

#### [NEW] `hooks/sync.ts`
- [x] `refresh($)`: discover, `$.fs.read` each task file, `parseTasks`, write the `groups` atom. On a read or parse error set `error` and keep the previous groups. (It takes a `Host` of closures for the same reason; the atoms are declared in `hooks/register.tsx`.)
- [x] `poll($)`: `$.fs.stat` each known task file; call `refresh` only when an `mtimeMs` changed. Re-run discovery every 10th poll to pick up new spec folders.
- [x] Started from `session.start` with `$.clock.every(1500, ...)`.
- [x] `on('tool.call', ...)` for `Edit`, `Write`, `MultiEdit`: `await next(e)`, then `refresh` if the target path ends in `taskFileName`. (Registered in `hooks/register.tsx` and matched on `Edit` and `Write`; this build has no `MultiEdit` tool.)

#### [NEW] `hooks/register.tsx`
- [x] `session.start`: load the template, restore `collapsed` and `hideCompleted` from `$.store` (keyed by working directory), first `refresh`, register `/tasks` last inside `try/catch` with `immediate: true`; on a name clash register `/md-tasks`.
- [x] `classic.SessionStart` with `source: ['clear', 'resume', 'fork']`: restore state again, since those reset `$.state`.
- [x] `command.run`: `$.ui.open({ id: 'md-tasks', title: 'Markdown Tasks', focus: true, closeOnEscape: true })`, return `{}`.
- [x] `ui.render` on `{ component: 'Pane', requestId: 'md-tasks' }`: toolbar row, then the tree, sized to `e.props.bodyColumns`.
- [x] Toolbar buttons: refresh (`r`), hide/show completed (`f`), expand all / collapse all (`e` / `c`).
- [x] Spec group row: name and `(done/total)`; pressing toggles collapse.
- [x] Heading row: indented by level; `⚑` for milestone headings (accent colour when all tasks done, outline otherwise), `▸`/`▾` for others; `(done/total)` or `(No tasks)`; pressing toggles collapse. (Every collapsible row draws `▸`/`▾`; a milestone adds `⚑` in the success colour when complete and `⚐` otherwise. Indent follows nesting depth.)
- [x] Task row: state glyph and colour from the active template (`○` todo, `◐` in progress, `●` done in green, `⊘` cancelled, `?`, `!`), label from `cleanText`; `strikethrough` + `dimColor` when the state says so and `strikeThroughCompleted` is on; sub-tasks indented beneath. Rows fall back to a string-label `Button` on builds that refuse `Text` children (see Open Questions).
- [x] Pressing a task: `$.fs.read`, `replaceStateChar` to `nextState`, `$.fs.write`, `refresh`. If `replaceStateChar` returns `null`, `refresh` and `$.ui.toast('Task moved on disk; list refreshed')` instead of writing.
- [x] Multi-state templates: a `Select` beside the focused task listing every state (replaces the right-click "Set Task State" menu). Hidden for the two-state Standard template. (The focused task comes from the `ui.focus` event; the picker draws on the line beneath it.)
- [x] Empty state: "No `spec/*/tasks.md` found in this folder." Error state: one dim line with `error`.
- [x] Persist `collapsed` and `hideCompleted` to `$.store` on every change.

### 4. Jump-to-source (nice-to-have; skip if the spike found no clean route)

#### [MODIFY] `hooks/register.tsx`
- [x] Add an "open" control on heading and task rows that opens the task file at that line, using whichever route the spike confirmed. Leave toggling as the row's main press. (A dim `↗` Button ends each heading and task row and runs `code -g path:line`, with `cmd /c code` as the Windows fallback. The route was confirmed in the terminal by the spike; it has not yet been seen in the Desktop Code tab.)
- [x] If neither route works on both surfaces, leave this section unchecked and note it in `walkthrough.md` as deferred. (Not needed so far: the route works in the terminal. If the Desktop Code tab check fails, record that in `walkthrough.md`.)

## Verification Plan

### Automated Tests

`core/core.spec.ts` (named `.spec.ts` because `claude plugin test .` runs every `*.test.ts` in the repo and cannot import vitest; vitest; fixtures ported from the extension's `test/unit/parser.test.ts`, `templates.test.ts` and `mutation.test.ts`):
1. `parseTasks` yields the same headings, tasks, nesting and stats the extension's parser tests expect, including checklist items written as headings.
2. `replaceStateChar` changes exactly one character, preserves CRLF, and returns `null` when the bracket has moved or the character differs.
3. `parseJsonc` reads the extension's `obsidian.jsonc` template (copied as a fixture) to an object equal to `OBSIDIAN_TEMPLATE`.

`hooks/register.test.ts` (run with `claude plugin test .`, each looped over `['terminal', 'desktop']`):
1. With a stubbed `$.fs` holding two spec folders, the pane draws both group names with correct `(done/total)`.
2. Pressing a task row writes the file with only that bracket character changed, and the row redraws as done.
3. Pressing a heading hides its tasks; the collapsed id is written to `$.store`.
4. "Hide completed" removes done tasks and leaves counts unchanged.
5. A changed `mtimeMs` on the mocked clock's next tick triggers a re-read; an unchanged one does not.
6. A stale bracket position produces a toast and no `$.fs.write`.

Also `claude plugin validate .` reports no refusals.

### Manual Verification

1. In the coreystruzan.com repo, run `claude --plugin-dir <path to claude-md-taskview>`, then `/tasks`. The pane shows "Implementation Tasks" with 48/48 and the five milestones with the counts in the blog screenshots.
2. Open the same folder in the Claude Desktop Code tab; run `/tasks`; confirm the pane docks beside the transcript and matches step 1.
3. Click a completed task; confirm `git diff` on `tasks.md` shows a one-character change. Click it back; `git diff` is empty.
4. Edit a checkbox in `tasks.md` in another editor; the pane updates within about 2 seconds.
5. Ask Claude to tick a task; the pane updates as the tool call finishes.
6. Collapse two milestones, quit, restart, `/tasks`: they are still collapsed.
7. Switch `stateTemplate` to Obsidian Tasks in the plugin config; the state picker appears and `[/]`, `[-]`, `[?]`, `[!]` draw with their own glyphs.

## Visual design application

No `design-system.md` or `art-bible.md` exists for this product, so there is nothing to apply. The pane follows the extension's look as shown in its README and the host's theme colours; no new visual language is introduced.
