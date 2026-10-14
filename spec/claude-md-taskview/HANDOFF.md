# Handoff — 2026-10-09

## Current state
Repo: `claude-md-taskview` (local git repo on `main`, not yet on GitHub). Spec: `spec/claude-md-taskview/` (light tier). Plan **`status: approved`** by the owner on 2026-10-08. Product context: the extension's [product.md](https://github.com/coreyx/vscode-md-taskview/blob/main/spec/vscode-md-taskview/product.md).

## Progress
Every item in [implementation_plan.md](./implementation_plan.md) is checked off, sections 0 to 4, and [walkthrough.md](./walkthrough.md) is written. Both test suites, `claude plugin validate .` and the type-check pass. The owner ran the walkthrough's manual steps on 2026-10-09 in the Desktop Code tab and in the terminal, and reported that both passed. The spike is still in `scratch/mod-spike/` (untracked, throwaway).

## Key decisions & rationale
- **Light tier, with a spike first.** One pane on an understood product; the risk was the week-old mods API, so unknowns were tested before any real code.
- **Separate repo, copied parser.** The owner does not want mod code or a refactor in `vscode-md-taskview`. `core/` is copied from it at commit `b591e0f` and adapted; drift is accepted. The upstream parser imports `vscode` (for `Uri`), `fs` and `jsonc-parser`, none of which exist in a hooks module, so each must be removed in the copy. A local clone of the extension normally sits beside this repo at `../vscode-md-taskview`; read from it, never write to it.
- **Pane opens on `/tasks` only.** Jump-to-source is a nice-to-have (section 4).
- **Rows keep a fallback** (owner, 2026-10-08): rich rows inside a `try/catch`, string-label rows when the engine refuses them. The minimum version stays 2.1.287. See "Row design by build" below.

## Mods API facts checked against the type definitions
- Requires Claude Code v2.1.287+. Load the built-in `plugin-authoring` skill before writing mod code; it lays down this build's `claude-code.d.ts` and worked examples (`pane.tsx`, `pane-state.d.ts`). Docs: https://code.claude.com/docs/en/plugins/mods/overview
- `Text` takes `strikethrough`, `underline`, `dimColor`, `bold`, `italic`, `color`. A `Button` label takes `dimColor` only.
- `$.fs` has only `read`, `write`, `list`, `exists`, `stat`. No glob, no watcher, `list` does not recurse. `stat`/`list` return `mtimeMs`.
- No `setTimeout`/`setInterval`; use `$.clock.every` / `$.clock.after`, and `$.clock.now()` for time. A hook has 10 s of its own running time.
- `Select` and `Input` exist on terminal and desktop; `Svg` is desktop-only; `Raster`/`Image` terminal-only. An element or prop the surface lacks makes the engine refuse the whole tree, so branch on `e.surface`.
- `$.state` values must be declared in `types/index.d.ts`; `/clear`, `/resume`, `/branch` reset them and fire `classic.SessionStart`, not `session.start`. A render hook may not write `$.state`.
- `$.command.register` throws on a name a built-in holds; register last, inside `try/catch`.
- `userConfig` in `plugin.json` supplies settings; a string field with `options` becomes a picker.
- **`$` is only followed inside the hooks module's own file.** `claude plugin validate` refuses a mod that passes `$` to an imported function, or to a function not declared at the top of that file (a closure inside `register` counts as not declared there). Hand other files closures over `$` instead. `update($, atom, fn)` and `read($, atom)` from `claude-code` are fine.
- **`types/index.d.ts` must be self-contained:** no `import`, `export … from`, `require` or reference.
- **A hook sees `$.fs` paths already resolved** to absolute paths with the platform's separators, whatever the mod passed. A test's `fs.*` stubs have to match on that.
- **`claude plugin test .` runs every `*.test.ts` under the folder**, `scratch/` included, and such a file may import only its own files and `claude-code`. Anything for vitest must be named otherwise.
- **Claude Code has a built-in `/tasks`, and registering the same name does not throw.** In the Desktop Code tab the mod's `/tasks` registered beside it: the list shows two `/tasks` entries and `/md-tasks` is never registered (owner's report, 2026-10-09). Headless, the built-in reports "isn't available in this environment" and the mod's own answers. So a fallback on a thrown registration never fired on any build tried, despite the type definitions saying a built-in's name throws. The mod therefore registers `/md-tasks` only (owner's decision, 2026-10-09).
- Check with `claude plugin validate .` and `claude plugin test .`; develop with `claude --plugin-dir .`. A Desktop Code tab session loads a folder named in `CLAUDE_CODE_PLUGIN_DIRS` (process environment or the `env` block of `~/.claude/settings.json`).

## Spike results (2026-10-08, Windows)

### Imports
- **Relative imports work; no bundling needed.** `hooks/register.tsx` imports `./sibling`, which imports `../core/label` (extensionless, outside `hooks/`). Confirmed by `claude plugin test` and by a real headless session (`claude -p --plugin-dir`, 2.1.295) that wrote the imported values to disk. So `hooks.json` points at `./register.tsx` and `esbuild` is not a dependency.

### Row design by build
- **A `Button` with `Text` children (the rich row) is accepted by 2.1.295 and refused by 2.1.289 and by the Desktop Code tab.** The refusal is a synchronous throw in `h()`: `JSX element <Button> needs a label: the label prop, or one string child`, so a `try/catch` around the row's JSX can fall back.
- **The desktop app bundles its own engine**, separate from the `claude` on PATH: its process ran from `%APPDATA%\Claude\claude-code\2.1.293\` while the CLI was 2.1.295. That 2.1.293 is the build that drew the Desktop pane is inferred from the process list, not read from the pane. If so, rich rows first work in 2.1.294 or 2.1.295.
- **So today the Desktop Code tab draws fallback rows:** a `Text` glyph, a `plain` `Button` with a string label, a `Text` count. A done task there is dimmed, not struck through. The terminal on 2.1.295 draws rich rows with strikethrough.
- 2.1.295's test kit accepts rich rows on both `terminal` and `desktop`, so `claude plugin test` on a current CLI does not exercise the fallback; a test has to force it.

### What the owner saw

| Check | Terminal 2.1.289 (fallback rows) | Terminal 2.1.295 (rich rows) | Desktop Code tab (fallback rows) |
| --- | --- | --- | --- |
| `strikethrough`, `dimColor`, both, `color="green"` on `Text` | as named | as designed | as expected |
| Pane placement | not reported | not reported | `dock`, 62 columns, 48 body rows, beside the transcript |
| Click presses a row | yes | not reported | yes |
| Tab then Enter presses a row | not tried | yes | yes |
| Scrolls with 150 rows | yes | not reported | yes |
| `Markdown` `file:` link reaches `onLinkPress` | yes, href with `#L14` intact | not tried | not tried |
| `cmd /c code -g path:line` opens at the line | yes, line 14 | not tried | not tried |

- **Redraw cost with 150 rows is small** (terminal, 2.1.289): the first draw began 6 ms after a press and a tree took 3 ms to build. These time the hook, not the surface's paint. An earlier 4160 ms reading was an artefact of recomputing the figure on every draw.
- **Jump-to-source has a working route in the terminal:** `onLinkPress` (or a Button) then `$.process.run` of `code -g path:line`. The surface opens nothing itself on a link press, so the mod decides. `['cmd', '/c', 'code', '-g', …]` is confirmed; the bare `['code', '-g', …]` argv was not reported, though `code --version` by bare argv exited 0 on 2.1.295. Try bare first and fall back to `cmd /c` on Windows.

### Sessions
- **A forked session starts without the pane.** During the Enter test a left arrow coincided with the conversation being forked into a new background session (`claude --session-id <new> --fork-session --resume <old>` in the process list; that the key caused it is inferred from timing). The pane was gone and `/spike` was missing, because hot reloading is granted per session id. For the installed mod a fork is a fresh process: `session.start` runs and `/tasks` registers again, the pane is closed and `$.state` is empty, which the plan's `$.store` restore covers.

### Test kit
- A test must answer the nouns the mod calls. `mock.clock(on)` covers `$.clock`; `$.session.cwd` is answered with `on('session.cwd', () => ({ value: '...' }))` (a hook stub returns a result object, not a bare value).
- A headless run does not lay `.claude-plugin/types/`. Once an interactive session has loaded the mod, `tsc -p <mod folder>` type-checks it against the laid types.

## Spinner spike (2026-10-13, for [spec/in-progress-spinner](../in-progress-spinner/implementation_plan.md))

A throwaway mod in `scratch/spinner-spike/` (`/spin`): rows of `Text` indent, a one-column `Client` running `hooks/spinner.tsx`, and a plain `Button` label.

- **Test kit, `terminal` and `desktop`:** the `Client` draws, `ui.advance(80)` moves it one frame, a pointer `down` posted from the module arrives as `ui.message`, and the label still presses. The module's tree is read with `ui.find({ type: 'Text', in: '<client key>' })`.
- **Terminal, owner's report** (dock, 49 columns; the CLI on PATH was 2.1.296): the spinners turn and line up with the static `◐` rows above and below; clicking a glyph raises the message count; Tab stops on the labels and the other Buttons only, never on a spinner; with twenty spinners the pane scrolls and responds normally.
- **Desktop Code tab, owner's report** (dock, 62 columns): three spinners turn and line up, and a click on a glyph arrives. The blue (`suggestion`) looks the same as in the terminal.
- **Twenty spinners fail in the Desktop Code tab.** They ran one cycle, then each turned into a dark brown "S" glyph. Three ran indefinitely. The app reported each one through `ui.fault`, in the `run` phase, with the reason `flooded the page with messages` (read from the extended spike's "faults:" line: `desktop run a-80-19: flooded the page with messages`, 57 faults counted). The limit between three and twenty, and whether a slower frame moves it, is what the extended spike measures (`m` steps 3, 5, 8, 12, 20 spinners; `s` switches 80 and 160 ms; a "faults:" line shows the last reason).
- **The limit, measured in the Desktop Code tab:** at 80 ms a frame, twelve spinners kept going and twenty did not; at 160 ms, twenty kept going. So about 150 redraws a second held and 250 did not. The pane therefore runs the spinner at 120 ms and draws at most twelve (`FRAME_MS` in `hooks/spinner.tsx`, `MAX_SPINNERS` in `hooks/register.tsx`), 100 redraws a second at most; in-progress tasks past the twelfth draw the static `◐`. The reason the app gave confirms it is a rate limit on what the spinners send the page.
- **In the Desktop Code tab `ui.focus` fired on clicks, not on Tab.** The trace read `engine > row-1 > engine` and did not change while tabbing. The state picker follows `ui.focus`, so there it would follow clicks only; not yet checked in the real pane.
- **The Desktop Code tab drops the spaces a Button's content starts with.** Reported on v0.2.0 on 2026-10-13: the tree drew flat there. The indent was leading spaces in the first `Text` of each row's Button. It had looked right on Desktop before because the app then bundled engine 2.1.293, which refused `Text` in a Button, so rows fell back to a sibling `Text` beside the Button, where the spaces survived; the app now bundles 2.1.295 and draws the rich rows. Fixed by indenting with `paddingLeft` on each row's `Box` (unreleased; not yet seen on Desktop, and whether Desktop honours `paddingLeft` is itself unverified). Spaces between runs inside a Button evidently survive, since only the indent was reported missing.
- **The Desktop Code tab ignores the styles of `Text` inside a Button.** On the working copy there (2026-10-13, engine 2.1.295) a completed task was neither struck through nor dimmed, though its `Text` had both. Outside the terminal the label now carries U+0336 after each character, as the extension does, and the Button gets `dimColor` (unreleased; not yet seen on Desktop).
- **Working copy in the Desktop Code tab, owner's report, 2026-10-13:** the padding indent fixed the flattened tree; glyph and count spacing is right; twelve spinners turn, the rest show the static glyph, and they keep turning; the state picker appears only after a task is pressed (click, Space or Enter), not on Tab.
- **The state picker no longer follows `ui.focus`.** The owner found it clumsy in the Desktop Code tab, where it only showed after a press, and asked for a small circle control at the end of the row, as the extension has. Each task row of a multi-state template now ends with `○` (key `p-<row key>`), which opens the picker beneath it and shows `◉` while open; a pick writes the state and closes it. The `focused` state value became `picker`, and the `ui.focus` hook is gone (unreleased; not yet seen on either surface).
- **A table from `$.ui.resolve(e)` is completed with the elements its surface lacks, and those draw nothing.** `'Client' in el` is therefore true on `vscode`, where a `Client` then vanishes. Ask by `e.surface` instead. Found by a test on the `vscode` surface.
- **The test kit cannot raise `ui.fault`.** It comes only from a real module failing, so the pane's fallback after a fault has no automated test.
- **A state contract must lead with an export.** `types/index.d.ts` written as `declare module … { }` followed by `export {}` made `claude plugin validate` report some of its keys as undeclared. With an `export type` first it passed.

## Not yet verified
- The link press and `code -g` in the Desktop Code tab; section 4 must check them there before it ships.
- Whether the bare `['code', '-g', 'path:line']` argv opens the file on Windows without `cmd /c`.
- Which build the Desktop pane ran on, read from the session itself (`$.session.version()`).

## Open questions
None blocking; see the plan's Open Questions for the decisions made.

## Left in place outside the repo
- `env.CLAUDE_CODE_PLUGIN_DIRS` was pointed at `scratch/spinner-spike` on 2026-10-13 for the Desktop half of the spinner spike, and removed the same day once it was done. The owner's `stateTemplate` was also set to `Obsidian Tasks` that day, at their request, and stays.
- The owner installed `md-taskview` from the GitHub marketplace on 2026-10-09 (`/plugin install md-taskview --marketplace coreyx/claude-md-taskview`), which worked. `env.CLAUDE_CODE_PLUGIN_DIRS` was then removed from `~/.claude/settings.json`, so the mod loads once, from the install. To develop against the working copy again, use `claude --plugin-dir .`.
- **The install dialog does not pre-fill a text setting's `default`.** The docs define `default` as the "value used when the user provides nothing", and the fields start empty. The owner typed `/spec/*` and `Milestone` into two of them, and those are what `pluginConfigs` now holds. Both work (a leading slash is ignored), but only "Milestone" marks a milestone there. The descriptions now name each default, released as v0.1.1.
- **A manifest `version` pins installs to it.** A fix reaches an installed copy only when `version` changes, so anything after v0.1.0 needs a new release to be seen.

## Next steps for the spinner (spec/in-progress-spinner)
Every item in its plan is checked off and its [walkthrough](../in-progress-spinner/walkthrough.md) is written (2026-10-13). Released as v0.2.0 on 2026-10-13 on the owner's word, before the walkthrough's manual steps were run on the real pane: the owner chose to check the released build. The owner then ran the seven checks in `scratch/pane-test/README.md` on it in the terminal and all passed. Reduced motion, set in `/config`, also passed, taking effect in the same session. Still open from the walkthrough: the Desktop Code tab on the real pane (the twelve-spinner limit and the state picker above all), and CPU use over time.

## Next steps (first release, done)
1. Done on 2026-10-09: the command is `/md-tasks` only, by the owner's decision. Worth one live run to see it open the pane; the manual checks used the earlier `/tasks`.
2. Owner's decision, open: install the mod from a marketplace (the folder, or GitHub once pushed) and remove `env.CLAUDE_CODE_PLUGIN_DIRS` from `~/.claude/settings.json`.
3. Release v0.1.0 is prepared (2026-10-09): changelog finalised, `RELEASE_NOTES.md` written, versions already at 0.1.0. Tagged `v0.1.0` at `0a04fc2` and pushed, with `main`, to `origin` (`coreyx/claude-md-taskview`) on the owner's go-ahead. No GitHub release has been created from the tag. The marketplace install line in the README has not been tried yet.
