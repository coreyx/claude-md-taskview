# Handoff — 2026-10-08

## Current state
Repo: `claude-md-taskview` (new, not yet a git repo or on GitHub). Spec: `spec/claude-md-taskview/` (light tier). Phase: plan **`status: approved`** by the owner on 2026-10-08. Nothing is implemented. Product context: the extension's [product.md](https://github.com/coreyx/vscode-md-taskview/blob/main/spec/vscode-md-taskview/product.md).

## Progress
No checklist items done. Next is section 0 (platform spike) of [implementation_plan.md](./implementation_plan.md).

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

## Not yet verified (the spike's job)
- Whether a hooks module can import sibling `.ts` files, or needs bundling.
- How `strikethrough` actually renders in the Desktop Code tab.
- Scrolling and redraw cost with 150+ rows.
- Any workable "open file at line" route.

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
