# Walkthrough: Markdown Tasks as a Claude Code mod

A Claude Code mod, `md-taskview`, that draws the `spec/*/tasks.md` milestone and task tree in a pane beside the transcript. Pressing a task writes its next state to disk; the pane follows the files as they change. The parser is a copy of the VS Code extension's, at commit `b591e0f`.

Everything automated passes. Nothing has yet been seen running as the finished mod in a live pane: the manual steps below are still to do.

## What Was Implemented

### 0. Platform spike (throwaway, `scratch/mod-spike/`, untracked)
- Confirmed a hooks module can import sibling files without bundling, so there is no `esbuild` step.
- Found that a `Button` holding `Text` children, the planned row design, is refused by Claude Code 2.1.289 and by the Desktop Code tab's bundled engine, and accepted by 2.1.295. The owner chose to keep a fallback rather than raise the minimum version.
- Confirmed in the terminal: text styles, click and Enter on a row, scrolling with 150 rows (a redraw begins about 6 ms after a press), a `Markdown` link press, and `cmd /c code -g path:line`. Confirmed in the Desktop Code tab: styles, docking, click and Enter, scrolling.
- Full results are in [HANDOFF.md](./HANDOFF.md).

### 1. Repo scaffold
- **`README.md`, `LICENSE`, `.gitignore`, `CHANGELOG.md`**: install, use, settings, and the differences from the extension.
- **`package.json`, `tsconfig.json`, `vitest.config.ts`**: `typescript` and `vitest` as the only dependencies, both for development.

### 2. Core (`core/`, copied from the extension)
- **`types.ts`**: the task tree types, with string paths in place of `vscode.Uri`.
- **`parse.ts`**: `parseTasks` and `stripMarkdownFormatting`. The state template is a parameter; heading slugs are dropped.
- **`templates.ts`**: the Standard and Obsidian templates, `getState`, `getNextState`, `validateTemplate`, and `parseJsonc`, which replaces the `jsonc-parser` dependency.
- **`mutate.ts`**: `replaceStateChar`, which changes one character only if the bracket is still where it was parsed.
- **`milestones.ts`**: `isMilestoneHeading`.
- **`UPSTREAM.md`**: source commit, what each file came from and what changed.

### 3. The mod
- **`.claude-plugin/plugin.json`, `marketplace.json`**: the manifest with nine settings, and the marketplace entry for this repo.
- **`types/index.d.ts`**: the state contract.
- **`hooks/discover.ts`**: expands `specPathPattern` one `*` segment at a time and keeps folders holding the task file.
- **`hooks/sync.ts`**: `refresh`, `poll` (every 1.5 s, re-reading only on a changed modification time, rediscovering every tenth tick) and `loadTemplate`.
- **`hooks/rows.ts`**: flattens the parsed groups into the rows drawn, applying collapse and the completed filter.
- **`hooks/settings.ts`**: reads the settings with defaults.
- **`hooks/register.tsx`**: the command, the pane, toggling, the state picker, persistence of the view to `$.store`, and the refresh after Claude's own `Edit` or `Write` to a task file.

### 4. Jump-to-source
- **`hooks/register.tsx`**: a dim `↗` at the end of each heading and task row runs `code -g path:line`, falling back to `cmd /c code` on Windows.

### Where the result differs from the plan as written
Each of these was forced by the platform or is a small correction; the plan's checklist carries a note on the affected lines.

- **`$` cannot cross an import, or enter a closure.** `claude plugin validate` refuses a mod that passes `$` to an imported function or to one not declared at the top of the hooks module. So `discover` and `refresh` take closures over `$` (`Disk`, `Host`) instead of `$`, the atoms live in `hooks/register.tsx`, and every helper that takes `$` is a top-level function there.
- **The state contract must be self-contained.** `types/index.d.ts` may not import, so it repeats the types in `core/types.ts`. A type-level check in `hooks/register.tsx` stops compiling if the two drift.
- **The vitest file is `core/core.spec.ts`, not `core/core.test.ts`.** `claude plugin test .` runs every `*.test.ts` under the folder and cannot import vitest.
- **The command is `/tasks`, listed beside Claude Code's own `/tasks`.** In the Desktop Code tab the mod's `/tasks` registered even though a built-in of that name exists: the command list shows two `/tasks` entries, and `/md-tasks` is not registered (owner's report, 2026-10-09). So registering a name a built-in holds did not throw there, and the planned fallback did not apply. The mod's hook answers only its own entry. Whether the terminal behaves the same is not yet reported.
- **`replaceStateChar` takes an optional fifth argument, the parsed line.** Columns alone cannot tell two tasks apart when a line is inserted above: the second task's bracket would slide to where the first was parsed, and the wrong task would be ticked. The mod passes the line and refuses the write when it differs.
- **Extra files and state:** `hooks/rows.ts` and `hooks/settings.ts`, and a `focused` state value the state picker follows.
- **No `MultiEdit` hook:** this build has no such tool; `Edit` and `Write` are matched.
- **The Obsidian fixture test compares all but `description`.** The extension's `obsidian.jsonc` and its `OBSIDIAN_TEMPLATE` constant are worded differently there.
- **Rows:** every collapsible row draws `▸`/`▾`, with the milestone flag beside it, and a long label is cut with `…` to stay on one line.

## Verification & Test Results

### Automated Tests
The plan's verification is two suites rather than one scratch script.

`npm test` (vitest, `core/core.spec.ts`), 25 tests:
- `parseTasks` gives the headings, tasks, nesting and stats the extension's parser tests expect, including checklist items written as headings: **Passed**
- `replaceStateChar` changes exactly one character, preserves CRLF, and returns `null` when the bracket moved, the character differs, a different task slid into place, or the bracket does not hold exactly one character: **Passed**
- `parseJsonc` reads the extension's `obsidian.jsonc` to the Obsidian template: **Passed**, comparing every field but `description` (see above)
- State templates, `validateTemplate` and `isMilestoneHeading`: **Passed**

`npm run test:mod` (`claude plugin test .`, `hooks/register.test.ts`), 24 tests, the pane tests run once per surface on `terminal` and `desktop`:
- Two spec folders draw as two groups with correct `(done/total)`: **Passed**
- Pressing a task writes the file with one bracket character changed, and the row redraws done: **Passed**
- Pressing a heading hides its tasks and writes the collapsed id to `$.store`: **Passed**
- "Hide completed" removes done tasks and leaves the counts: **Passed**
- A changed modification time on the next tick triggers a re-read; an unchanged one does not: **Passed**
- A stale bracket position produces a toast and no write: **Passed**
- The saved view returns after `/clear`; the empty state; the state picker with the Obsidian template; the open control; the `cmd /c` fallback and its refusal of a path `cmd` could misread; Claude's own edit refreshing at once; the fallback to `/md-tasks`; the string-label row fallback: **Passed**

Also:
- `claude plugin validate .`: **Passed**, no refusals.
- Type-check against Claude Code 2.1.295's type definitions: **Passed**. This used a `tsconfig` under `scratch/` that names the skill's copy of the definitions, because `npm run typecheck` needs `.claude-plugin/types/`, which only an interactive load of the mod lays down. `npm run typecheck` itself has not been run.
- The mod loads in a real headless session (`claude -p --plugin-dir .`) with no load error: **Passed**.

What the automated tests do not show: the test kit checks the tree each surface is handed, not what it paints, and 2.1.295's kit accepts the rich rows, so the fallback is exercised only through `drawPressable` with a stand-in element table.

### Regression Testing
There was no earlier code in this repo. The extension repo at `../vscode-md-taskview` was only read: `git status` there is clean and its head is still `b591e0f`.

## Manual Verification
**Desktop Code tab: done.** On 2026-10-09 the owner ran these there, with the mod loaded through `CLAUDE_CODE_PLUGIN_DIRS`, and reported that all of them passed; the pane opened from the mod's `/tasks` entry. The terminal run has not been reported.

In each, pick the mod's entry if two `/tasks` are listed, or use `/md-tasks` if that is what registered.

1. In the coreystruzan.com repo, run `claude --plugin-dir <path to claude-md-taskview>`, then `/md-tasks`. The pane should show "Implementation Tasks" with 48/48 and the five milestones with the counts in the blog screenshots. Note which command name worked.
2. Open the same folder in the Claude Desktop Code tab, with `CLAUDE_CODE_PLUGIN_DIRS` set to the repo's absolute path, and run the command. The pane should dock beside the transcript and match step 1. Expect dimmed, not struck-through, completed tasks there until the app bundles a newer engine.
3. Click a completed task; `git diff` on `tasks.md` should show a one-character change. Click it back; `git diff` should be empty.
4. Edit a checkbox in `tasks.md` in another editor; the pane should update within about 2 seconds.
5. Ask Claude to tick a task; the pane should update as the tool call finishes.
6. Collapse two milestones, quit, restart, run the command: they should still be collapsed.
7. Switch `stateTemplate` to Obsidian Tasks in the mod's configuration; move the focus onto a task and the state picker should appear beneath it, and `[/]`, `[-]`, `[?]`, `[!]` should draw with their own glyphs.
8. Press `↗` on a task row, in the terminal and in the Desktop Code tab: VS Code should open the file at that line and the task should not change.
9. Walk the rows with Tab and the arrow keys. Each heading and task row now has two stops, the row and its `↗`; say whether that is tolerable.
10. Run `npm run typecheck` after step 1 has laid `.claude-plugin/types/`.

## Follow-ups
- **Command name.** Two `/tasks` entries in one list is easy to mis-pick. Registering `/md-tasks` only would give the mod a name of its own in every kind of session; that reverses the plan's decision, so it is the owner's call.
- **Open control and keyboard use.** One `↗` per row doubles the stops in the focus ring. If step 9 is awkward, alternatives are one toolbar "Open" acting on the focused row, or showing the control only on the focused row.
- **Strikethrough on older builds.** The fallback dims a completed task. The extension strikes labels through with the combining character U+0336, which would also work in a string label; it was not tried here.
- **Editor.** Jump-to-source opens VS Code only. A setting for another editor's command is the natural extension.
- **Discovery is one level per `*`.** The extension also searches `spec/tasks.md` and deeper folders and has include and exclude patterns.
- **Polling runs in every session** the mod is loaded in, whether or not the pane is open. The cost is one `stat` per task file every 1.5 s.
- **Not on GitHub yet.** The marketplace install line in the README needs the repo pushed to `coreyx/claude-md-taskview`.
- **Line endings.** Git warns that LF will become CRLF on checkout here; a `.gitattributes` would settle it.
- **The spike** is still in `scratch/mod-spike/`, with its test file renamed so the test runner skips it. It can be deleted.
