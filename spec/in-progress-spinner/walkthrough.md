# Walkthrough: Animated in-progress spinner

An in-progress task now shows a turning blue spinner in the task pane, mirroring the spinner the VS Code extension gained in v0.1.13. A setting and Claude Code's reduced-motion setting turn it off. The Standard (GFM) template is unchanged: a press there is still only done and not done.

Everything automated passes. The spinner has been seen running only in the throwaway spike, not yet in the real pane; that is the manual verification below.

## What Was Implemented

### 0. Spike (throwaway, `scratch/spinner-spike/`, untracked)
- Showed that a `Client` element, a region that redraws itself on the surface's own clock, works as the spinner on both surfaces: it turns, lines up with static rows, and passes a click on the glyph to the mod.
- Found that the Desktop Code tab stops spinners when too many redraw at once: twenty at 80 ms a frame failed, each turning into a stray glyph, while twelve kept going, and twenty kept going at 160 ms. The app's reason for stopping them was `flooded the page with messages`.
- Found that in the Desktop Code tab the focus event fires on clicks, not on Tab.
- Results are in [HANDOFF.md](../claude-md-taskview/HANDOFF.md).

### 1. Core (re-copied from the extension at `059524e`)
- **`core/types.ts`**: `StateDefinition.animatedIcon`, as upstream.
- **`core/templates.ts`**: the Obsidian in-progress state has `animatedIcon: 'loading~spin'`, and its colour is `charts.blue` where upstream has `charts.yellow`.
- **`core/fixtures/obsidian.jsonc`**: re-copied unchanged from the extension.
- **`core/UPSTREAM.md`**: the new source commit, what was taken, what was left, and the blue colour as a deliberate difference.

### 2. The mod
- **`.claude-plugin/plugin.json`, `hooks/settings.ts`**: the `animateTaskIcons` setting, default on.
- **`hooks/rows.ts`**: `TaskRow.isAnimated`, and `findTask`, which maps a row's key back to its task.
- **`hooks/spinner.tsx`** (new): the surface module. One cell stepping through ten braille frames every 120 ms; a click on it is posted to the hooks module.
- **`hooks/register.tsx`**:
  - `isMotionAllowed`: the setting is on and Claude Code's `prefersReducedMotion` is not.
  - An animated task row is drawn as indent, spinner, then the label as the row's Button, because a `Client` cannot sit inside a Button.
  - A `ui.message` hook treats a click on a spinner as a press on its row.
  - A `ui.fault` hook puts a surface back on the static glyph if a spinner fails there.
  - At most twelve spinners are drawn in one pane.

### 3. Documentation
- **`README.md`**: what a press does under each template, the spinner, `animateTaskIcons`, the two ways to change a setting with a worked `pluginConfigs` example, and three new differences from the extension.
- **`CHANGELOG.md`**: entries under Unreleased.

### Where the result differs from the plan as written
- **In-progress is blue, not yellow.** Asked for by the owner after approval and added to the plan as an item.
- **The frame is 120 ms and at most twelve spinners turn**, not 80 ms and unlimited. This follows from the Desktop Code tab's limit: about 150 redraws a second held there and 250 did not, and twelve at 120 ms is 100.
- **The surface is asked by name, not by whether its element table has `Client`.** Claude Code completes every surface's table with the elements it lacks, and those draw nothing; a test on the `vscode` surface caught that an in-progress task would have had no glyph there at all.
- **A `ui.fault` fallback** was added; the plan only anticipated a `Client` that throws as it is made.
- **Not copied from v0.1.13:** the task action helpers and `collectTasks`, since only the left-out editor actions use them.

## Verification & Test Results

### Automated Tests
`npm test` (vitest, `core/core.spec.ts`), 27 tests:
- The Obsidian in-progress state has `animatedIcon` and is blue; no Standard state is animated; `[/]` is not a state of Standard: **Passed**
- The re-copied `obsidian.jsonc` reads to the Obsidian template, setting aside its description and the in-progress colour, which differ on purpose: **Passed**
- `validateTemplate` keeps `animatedIcon` on a custom template: **Passed**

`npm run test:mod` (`claude plugin test .`), 43 tests, the pane cases run on both `terminal` and `desktop`:
1. With the Obsidian template a `[/]` task draws a `Client` naming the spinner module, in the blue theme colour, beside a Button holding the label: **Passed**
2. Advancing the frame clock by 120 ms moves the spinner one frame: **Passed**
3. `animateTaskIcons` off draws the static `◐` and no `Client`: **Passed**
4. `prefersReducedMotion: true` does the same: **Passed**
5. Pressing through the Obsidian cycle writes `[ ]` → `[/]` → `[x]` → `[ ]`: **Passed**
6. With the Standard template a press writes only `[x]` and `[ ]`, never `[/]`, and a `[/]` in the file draws no spinner: **Passed**
7. On the `vscode` surface the in-progress task draws the static glyph: **Passed**, after the fix described above
8. A click on the spinner moves the task to its next state: **Passed**
9. Fourteen in-progress tasks draw twelve spinners; the thirteenth draws `◐` and is still pressable: **Passed**

Also `claude plugin validate .` reports no refusals, and `npm run typecheck` passes.

**Not covered:** the `ui.fault` fallback. The test kit raises that event only when a real surface module fails and gives a test no way to raise it, so a test written for it had to be removed.

### Regression Testing
The 26 mod tests and 25 core tests from v0.1.1 still pass, with one updated: the state-picker test used to find `◐` in an in-progress row and now finds the spinner there. The extension repo was only read; its `git status` is clean.

## Manual Verification
None of these has been done on the real pane. They need the new build loaded, either released and updated, or run from the working copy with the installed copy disabled.

1. With `stateTemplate` set to `Obsidian Tasks`, run `/md-tasks` in a folder with task files: a `[/]` task shows a blue spinner turning, in the terminal and in the Desktop Code tab.
2. Press a not-started task: it becomes in progress and starts spinning. Press it again: done. Again: not started. `git diff` shows one character changed each time.
3. Click directly on a spinner: the task moves to done.
4. Set `animateTaskIcons` off in `/config`: the spinner becomes a static `◐`. Turn it back on.
5. Set `prefersReducedMotion` to `true` in `~/.claude/settings.json` and start a new session: static `◐` again. Remove the setting.
6. Set `stateTemplate` to `Standard (GFM)`: pressing a task toggles `[ ]` and `[x]` only. Set it back.
7. In the Desktop Code tab, put more than twelve tasks in progress: twelve spin, the rest show `◐`, and none turns into a stray glyph.
8. In the Desktop Code tab with the Obsidian template, check how the state picker behaves: it follows the focus event, which fired there on clicks and not on Tab.
9. Leave the pane open on an in-progress task for a few minutes and check Claude Code's CPU use has not climbed.

## Follow-ups
- **State picker in the Desktop Code tab.** If step 8 shows the picker cannot be reached by keyboard there, it needs another trigger on that surface.
- **The Desktop limit is the app's, and may move.** The app stopped the twenty spinners with the reason `flooded the page with messages`, so it is a rate limit on what the spinners send the page. Where exactly it sits between 150 and 250 redraws a second is not known. If it changes, `FRAME_MS` and `MAX_SPINNERS` are the two numbers to revisit.
- **In-progress stays yellow in the extension.** The blue is this mod's alone unless the extension follows.
- **Release.** This is unreleased; it would be 0.2.0. Installed copies stay on 0.1.1 until then.
- **The spikes** are still in `scratch/` (`mod-spike`, `spinner-spike`), untracked. Copies also sit in this session's hot-reload folder. They can be deleted.
