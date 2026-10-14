---
status: approved
---

# Animated in-progress spinner in the task pane

Mirrors the spinner the VS Code extension gained in v0.1.13 (commit `059524e`): an in-progress task shows a rotating spinner in the pane instead of a static glyph, with a setting to turn it off and respect for reduced motion. Product context is in the extension's [product.md](https://github.com/coreyx/vscode-md-taskview/blob/main/spec/vscode-md-taskview/product.md); the mod itself is described in [spec/claude-md-taskview](../claude-md-taskview/implementation_plan.md).

## User Review Required

> [!NOTE]
> **Standard (GFM) is unchanged: a press stays `[ ]` ↔ `[x]`.** Decided on 2026-10-13. The mod never writes `[/]` under the Standard template, and a `[/]` already in such a file keeps drawing as an unknown state with no spinner, as in the extension. The three-step cycle (not started → in progress → done → not started) is what the Obsidian Tasks template already does; custom templates keep their own `nextState`. To see the spinner, set `stateTemplate` to `Obsidian Tasks` or use a custom template that gives a state an `animatedIcon`.

> [!NOTE]
> **An in-progress row is built differently from the others.** The spinner is a `Client` element, which cannot sit inside a `Button`. So a row with a spinner is glyph, then a pressable label, rather than one button holding both. Pressing the label works as now; pressing the spinner itself is wired up too, if the spike shows that is reliable.

> [!NOTE]
> **Reduced motion comes from Claude Code's own `prefersReducedMotion` setting**, the counterpart of VS Code's `accessibility.reducedMotion`. With it on, or with the new `animateTaskIcons` setting off, the static `◐` shows. Surfaces that have no `Client` element (the VS Code panel, mobile) always show the static glyph.

> [!NOTE]
> Not mirrored from v0.1.13: the editor CodeLens actions, the Start / Continue / Mark done commands and menu entries, the `showTaskActions` setting, and the extension's move to pnpm. The three helpers that only those actions use (`getDefaultChar`, `getInProgressChar`, `getDoneChar`) and `collectTasks` are not copied either.

## Open Questions

None blocking. The spike (section 0) decides one thing: whether the spinner is a `Client` element, or, if that draws badly on either surface, a redraw of the pane on a timer. Record the result here before starting section 2.

**Result, 2026-10-13: the spinner is a `Client` element.** In the terminal the spike's spinners turned, lined up with static rows, passed clicks on to the mod, stayed out of the Tab order, and twenty of them left the pane responsive. Section 2 was built on that, ahead of the Desktop Code tab check, because the pane falls back to the static glyph wherever a `Client` is missing or refused. If the Desktop check finds the `Client` draws badly there, the remedy is to leave Desktop on the static glyph or add the timed redraw for it; reopen this question then.

## Proposed Changes

### 0. Spike (do first; throwaway)

#### [NEW] `scratch/spinner-spike/` (plugin.json, hooks.json, register.tsx, spinner.tsx)
- [ ] Draw a row of `Text` indent, a one-column `Client` cycling braille frames on `surface.every`, and a plain `Button` label, on the terminal and in the Desktop Code tab; record whether the glyph lines up with a static `◐` row above and below it.
- [ ] Draw twenty such rows; record whether the pane stays responsive and whether scrolling and the focus ring behave (Tab should reach the label, not stop on the spinner).
- [ ] Have the module `post` on a pointer `down` and count the `ui.message` events in the hooks module; record whether a click on the glyph arrives on each surface.
- [ ] Write the results into `spec/claude-md-taskview/HANDOFF.md` and the decision into Open Questions above.

### 1. Core (re-copy from the extension at `059524e`)

#### [MODIFY] `core/types.ts`
- [x] Add `animatedIcon?: string` to `StateDefinition`, as upstream: shown instead of `icon` when motion is enabled.

#### [MODIFY] `core/templates.ts`
- [x] Add `animatedIcon: 'loading~spin'` to the in-progress state of `OBSIDIAN_TEMPLATE`. `STANDARD_TEMPLATE` is untouched.
- [x] Give that state `color: 'charts.blue'` in place of upstream's `charts.yellow`, so in-progress tasks and their spinner draw blue (the `suggestion` theme key). Added at the owner's request on 2026-10-13, after approval; it is a deliberate difference from the extension, to be recorded in `UPSTREAM.md`.

#### [MODIFY] `core/fixtures/obsidian.jsonc`
- [x] Re-copy from the extension's `resources/templates/obsidian.jsonc`, which gained the same field.

#### [MODIFY] `core/core.spec.ts`
- [x] Assert the Obsidian in-progress state carries `animatedIcon`, that no Standard state does, and that `validateTemplate` keeps the field on a custom template. The fixture comparison covers the re-copied file, now setting aside the in-progress colour as well as the description.

#### [MODIFY] `core/UPSTREAM.md`
- [x] Record the new source commit `059524e` (v0.1.13), what was taken from it, and what was left: the task action helpers, `collectTasks`, `TaskActionCommands.ts` and `TaskCodeLensProvider.ts`.

### 2. The mod

#### [MODIFY] `.claude-plugin/plugin.json`
- [x] Add the `userConfig` field `animateTaskIcons`: boolean, default `true`, titled "Animate task icons", described as showing a rotating spinner for in-progress tasks and a static icon when off or when Claude Code's `prefersReducedMotion` is on.

#### [MODIFY] `hooks/settings.ts`
- [x] Add `animateTaskIcons: boolean` to `Settings`, read with a default of `true`.

#### [MODIFY] `hooks/rows.ts`
- [x] Add `isAnimated: boolean` to `TaskRow`: true when the task's state has an `animatedIcon`. Any value means the one animation the pane has, the spinner.

#### [NEW] `hooks/spinner.tsx`
- [x] A surface module (default export) that draws one `Text` holding the current frame of `⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏`, in the colour passed in its props, and advances a frame every 80 ms with `surface.every`, started once while its state is still undefined.
- [x] On a pointer `down`, `post` a press, if the spike found that reliable. (Kept: the spike showed a click on the glyph arriving in the terminal.)

#### [MODIFY] `hooks/register.tsx`
- [ ] Add a top-level `isMotionAllowed($, mod)`: true when `animateTaskIcons` is on and `$.settings.read()` does not have `prefersReducedMotion: true`. A failed read counts as motion allowed.
- [ ] In the render hook, draw a task row whose `isAnimated` is set, when motion is allowed and the surface's table has `Client`, as: `Text` indent, `Client` keyed `a-<row key>` with `module: './spinner.tsx'` and a width of one column, a space, a plain `Button` under the row's key holding the label, then the `↗` control. If making the `Client` throws, fall back to the static row and remember that for the surface, as the rich-row fallback does.
- [ ] Otherwise draw the row as now, with the static glyph.
- [ ] If the spike found glyph presses reliable: an `on('ui.message', …)` hook for the pane that maps a spinner's key back to its task and moves it to its next state, as pressing the label does.

#### [MODIFY] `hooks/register.test.ts`
- [ ] Cover the cases under Automated Tests below, and answer `settings.read` in the test world.

### 3. Documentation

#### [MODIFY] `README.md`
- [ ] Add the spinner to "Use", `animateTaskIcons` to the settings table, and a line under the differences from the extension: reduced motion follows Claude Code's `prefersReducedMotion`, and the editor task actions are not part of the mod.
- [ ] State plainly in "Use" which template gives which press behaviour: Standard toggles done and not done; Obsidian Tasks cycles through in progress.
- [ ] In "Settings", spell out how to change a setting: the `/config` row, and the `pluginConfigs` entry in `~/.claude/settings.json` with a worked example that sets `stateTemplate` to `Obsidian Tasks`, and say when each takes effect.

#### [MODIFY] `CHANGELOG.md`
- [ ] Under `[Unreleased]`, `Added`: the spinner, the `animateTaskIcons` setting, and the `animatedIcon` field for custom templates.

## Verification Plan

### Automated Tests

`core/core.spec.ts` (vitest, `npm test`):
1. The Obsidian in-progress state has `animatedIcon: 'loading~spin'`; no Standard state has one.
2. `parseJsonc` plus `validateTemplate` reads the re-copied `obsidian.jsonc` to the Obsidian template, `animatedIcon` included.

`hooks/register.test.ts` (`npm run test:mod`), the pane cases looped over `terminal` and `desktop`:
1. With the Obsidian template, a `[/]` task draws a `Client` keyed `a-t-…` naming `./spinner.tsx`, and its label is still a `Button` under the row's key; a `[ ]` and a `[x]` task draw no `Client`.
2. Advancing the drawing's frame clock by 80 ms changes the glyph the spinner module drew.
3. With `animateTaskIcons` false, the same task draws the static `◐` and no `Client`.
4. With `settings.read` answering `prefersReducedMotion: true`, the same.
5. Pressing through the Obsidian cycle writes `[ ]` → `[/]` → `[x]` → `[ ]`, the middle press made on the spinner row's label.
6. With the Standard template, pressing `[ ]` writes `[x]` and pressing that writes `[ ]`; a `[/]` already in the file draws no `Client`.
7. On the `vscode` surface, whose table has no `Client`, the in-progress task draws the static glyph.
8. If glyph presses are kept: a `post` from the spinner moves the task to its next state.

Also `claude plugin validate .` reports no refusals and `npm run typecheck` passes.

### Manual Verification

1. Set `stateTemplate` to `Obsidian Tasks` in `/config`. In a folder with task files, run `/md-tasks`: a `[/]` task shows a spinner turning, in the terminal and in the Desktop Code tab.
2. Press a not-started task: it becomes in progress and starts spinning. Press it again: done. Again: not started. `git diff` shows one character changed each time.
3. Set `animateTaskIcons` off in `/config`: the spinner becomes a static `◐`. Turn it back on.
4. Set `prefersReducedMotion` to `true` in `~/.claude/settings.json` and reopen the pane: static `◐` again. Remove the setting.
5. Set `stateTemplate` back to `Standard (GFM)`: pressing a task toggles `[ ]` and `[x]` only.
6. With several tasks in progress, scroll the pane and walk the rows with Tab and the arrows: nothing stutters, and the focus lands on labels.
7. Leave the pane open on an in-progress task for a few minutes and check Claude Code's CPU use has not climbed.

## Visual design application

No `design-system.md` or `art-bible.md` exists for this product, so there is nothing to apply. The spinner takes the in-progress state's existing colour and sits where the static glyph does; no new visual language is introduced.
