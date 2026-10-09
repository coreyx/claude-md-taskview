# Handoff — 2026-10-08

## Current state
Repo: `claude-md-taskview` (new, not yet a git repo or on GitHub). Spec: `spec/claude-md-taskview/` (light tier). Phase: plan **`status: approved`** by the owner on 2026-10-08. Nothing is implemented. Product context: the extension's [product.md](https://github.com/coreyx/vscode-md-taskview/blob/main/spec/vscode-md-taskview/product.md).

## Progress
Section 0 (platform spike) of [implementation_plan.md](./implementation_plan.md) is in progress: the import item is done; the four items that need eyes on a real pane (text styles, row press, 150 rows, open-at-line) wait on the owner running `/spike` on both surfaces. The spike is in `scratch/mod-spike/` (untracked, throwaway).

## Key decisions & rationale
- **Light tier, with a spike first.** One pane on an understood product; the risk is the week-old mods API, so unknowns are tested before any real code. If relative imports *and* bundling both fail, or the pane is unusable in Desktop, stop and re-triage.
- **Separate repo, copied parser.** The owner does not want mod code or a refactor in `vscode-md-taskview`. `core/` is copied from it at commit `b591e0f` and adapted; drift is accepted. The upstream parser imports `vscode` (for `Uri`), `fs` and `jsonc-parser`, none of which exist in a hooks module, so each must be removed in the copy. A local clone of the extension normally sits beside this repo at `../vscode-md-taskview`; read from it, never write to it.
- **Pane opens on `/tasks` only.** Jump-to-source is a nice-to-have (section 3).

## Mods API facts already checked (Claude Code 2.1.295 type definitions)
- Requires Claude Code v2.1.287+. Load the built-in `plugin-authoring` skill before writing mod code; it lays down this build's `claude-code.d.ts` and worked examples (`pane.tsx`, `pane-state.d.ts`). Docs: https://code.claude.com/docs/en/plugins/mods/overview
- `Text` takes `strikethrough`, `underline`, `dimColor`, `bold`, `italic`, `color`.
- `$.fs` has only `read`, `write`, `list`, `exists`, `stat`. No glob, no watcher, `list` does not recurse. `stat`/`list` return `mtimeMs`.
- No `setTimeout`/`setInterval`; use `$.clock.every` / `$.clock.after`. A hook has 10 s of its own running time.
- A `Button` may hold strings and `Text` children only, so a whole tree row can be one plain `Button`.
- `Select` and `Input` exist on terminal and desktop; `Svg` is desktop-only; `Raster`/`Image` terminal-only. An element or prop the surface lacks makes the engine refuse the whole tree, so branch on `e.surface`.
- `$.state` values must be declared in `types/index.d.ts`; `/clear`, `/resume`, `/branch` reset them and fire `classic.SessionStart`, not `session.start`.
- `$.command.register` throws on a name a built-in holds; register last, inside `try/catch`.
- `userConfig` in `plugin.json` supplies settings; a string field with `options` becomes a picker.
- Check with `claude plugin validate .` and `claude plugin test .`; develop with `claude --plugin-dir .`.

## Spike results so far (2026-10-08, Claude Code 2.1.295, Windows)
- **Relative imports work; no bundling needed.** `hooks/register.tsx` imports `./sibling`, which imports `../core/label` (extensionless, outside `hooks/`). Confirmed by `claude plugin test` and by a real headless session (`claude -p --plugin-dir`) that wrote the imported values to disk. So `hooks.json` points at `./register.tsx` and `esbuild` is not a dependency.
- **The tree shape validates on `terminal` and `desktop`:** a `plain` `Button` holding three `Text` children (glyph, label, dim count), `strikethrough` + `dimColor`, `color="green"`, a `Markdown` with `onLinkPress`, and 150 such buttons in one `Box`. This is the test kit's validation, not either surface's paint.
- **A `Button` with `Text` children needs a newer build than 2.1.289.** A live 2.1.289 session threw while drawing: `JSX element <Button> needs a label: the label prop, or one string child`. A real 2.1.295 session accepts it on both surfaces (probed in `session.start`), as does 2.1.295's test kit. The first build that allows it, somewhere after 2.1.289 and no later than 2.1.295, is not pinned down. On the older build a row can only be `Text` glyph + `Button` with a string label + `Text` count, and a `Button` label cannot be struck through (it takes `dimColor` only). The throw is synchronous in `h()`, so a `try/catch` around the row's JSX can fall back; the spike does this and names the variant it drew. **Decided by the owner on 2026-10-08: keep the fallback**; the minimum version stays 2.1.287 (plan's Open Questions). The fallback is confirmed live: on 2.1.289 the pane drew and its "rows:" line read `fallback (string label): Error: JSX element <Button> needs a label: the label prop, or one string child`.
- **`$.process.run(['code', ...])` resolves on Windows with a bare argv** (no `cmd /c` needed): `code --version` exited 0 from a real session. Opening at a line (`code -g path:line`) is not yet tried.
- **Test kit:** a test must answer the nouns the mod calls. `mock.clock(on)` covers `$.clock`; `$.session.cwd` is answered with `on('session.cwd', () => ({ value: '...' }))` (a hook stub returns a result object, not a bare value). Use `$.clock.now()` for time.
- A headless run does not lay `.claude-plugin/types/`; type-checking then needs a `tsconfig.json` outside the mod that includes the skill's `claude-code.d.ts`.

- **Text styles paint as asked on 2.1.289** (owner's report, 2026-10-08; surface taken to be the terminal, not yet confirmed from the pane's first line): plain, `strikethrough`, `dimColor`, the two together, and `color="green"` each draw as named.

## Not yet verified (needs the owner's eyes on `/spike`, both surfaces)
- How `strikethrough` and `dimColor` render in the Desktop Code tab (and on 2.1.295).
- Whether click and Enter both press a plain `Button` row in the Desktop Code tab.
- Scrolling and redraw cost with 150 rows (the pane shows "redraw began N ms after press").
- Whether a `Markdown` `file:` link press reaches `onLinkPress`, and whether `code -g path:line` opens the file at the line.

## Open questions
None blocking; see the plan's Open Questions for the decisions made.

## Files touched this session
- `spec/claude-md-taskview/implementation_plan.md` (new)
- `spec/claude-md-taskview/HANDOFF.md` (new)

## Next steps
1. Owner approves the plan; set `status: approved`.
2. `git init`, commit the two spec files.
3. Run `implement-tasks` on `spec/claude-md-taskview/implementation_plan.md`, starting with section 0.
4. After the spike, update "Not yet verified" here, then continue with sections 1 to 4.
