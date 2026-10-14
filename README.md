# Markdown Tasks for Claude Code (`claude-md-taskview`)

A Claude Code mod that draws the milestone and task tree of your `spec/*/tasks.md` files in a pane beside the transcript, in the terminal and in the Claude Desktop Code tab. It lets you follow an agent's progress through a task list, and tick tasks yourself, without opening an editor.

It is the same product as the [Markdown Tasks View extension for VS Code](https://github.com/coreyx/vscode-md-taskview), on a second host. The parser is a copy of the extension's, so both read a `tasks.md` the same way.

## Requirements

Claude Code v2.1.287 or newer. Mods are an early-access part of Claude Code and their API may change between releases.

## Install

Try it from a clone, for one session:

```bash
git clone https://github.com/coreyx/claude-md-taskview.git
claude --plugin-dir ./claude-md-taskview
```

Install it for every session:

```text
/plugin install md-taskview --marketplace coreyx/claude-md-taskview
```

The Desktop Code tab takes no `--plugin-dir` flag. To try a clone there, name its absolute path in `CLAUDE_CODE_PLUGIN_DIRS`, in the environment the app starts from or in the `env` block of `~/.claude/settings.json`, then restart the app.

## Use

Run `/md-tasks` in a folder that holds `spec/<name>/tasks.md` files. The pane opens beside the transcript; it never opens by itself.

- Each spec folder is a group, with its headings and tasks nested beneath it and a `(done/total)` count.
- Press a group or a heading to collapse or expand it.
- Press a task to move it to its next state. The file on disk changes by exactly one character.
  - With the **Standard (GFM)** template a press toggles not done `[ ]` and done `[x]`, and nothing else is ever written.
  - With the **Obsidian Tasks** template a press goes not started `[ ]`, in progress `[/]`, done `[x]`, then back to not started.
- An in-progress task shows a turning spinner, in blue. It is a static `◐` when `animateTaskIcons` is off or Claude Code's `prefersReducedMotion` setting is on.
- Press the `↗` at the end of a heading or task row to open the file at that line in VS Code. This needs the `code` command on your `PATH`.
- Headings that contain a milestone keyword show a flag, filled once every task beneath is done.
- The toolbar refreshes (`r`), hides or shows completed tasks (`f`), and expands or collapses everything (`e` / `c`).
- With a multi-state template, a picker beneath the focused task sets any state directly.

The pane re-reads a task file within about two seconds of it changing on disk, and at once after Claude edits one.

## Settings

The settings mirror the extension's settings of the same names. There are two ways to change one.

**In Claude Code.** Run `/config` and find the mod's rows. There is one per setting, labelled with its title: "State template" for `stateTemplate`, "Animate task icons" for `animateTaskIcons`, and so on. `stateTemplate` is a picker over its three values. A change made here reloads the mod with the new value, so no restart is needed.

**In the settings file.** Edit `~/.claude/settings.json` and set the value under `pluginConfigs`. This example switches to the Obsidian Tasks template:

```json
{
  "pluginConfigs": {
    "md-taskview@claude-md-taskview": {
      "options": {
        "stateTemplate": "Obsidian Tasks"
      }
    }
  }
}
```

The key is the mod's name and its marketplace. A mod loaded with `--plugin-dir` is keyed `md-taskview` instead. An edit to the file takes effect in the next session you start.

The dialog shown at install does not fill in the defaults of the text settings: those fields start empty. Leave one empty and its default applies; you do not have to type it.

| Setting | Default | Description |
| :--- | :--- | :--- |
| `specPathPattern` | `spec/*` | Where spec folders are, relative to the working directory. `*` matches one folder level. |
| `taskFileName` | `tasks.md` | The task file inside each spec folder. |
| `stateTemplate` | `Standard (GFM)` | `Standard (GFM)`: done and not done only. `Obsidian Tasks`: also in progress `[/]`, cancelled `[-]`, needs clarification `[?]` and important `[!]`. `Custom`: your own template. |
| `customTemplatePath` | (empty) | Path to a `*.jsonc` state template, used when `stateTemplate` is `Custom`. |
| `strikeThroughCompleted` | `true` | Strike through and dim completed and cancelled tasks. |
| `animateTaskIcons` | `true` | Show a turning spinner for in-progress tasks. When off, or when Claude Code's `prefersReducedMotion` is on, a static icon is shown instead. |
| `showProgressCount` | `true` | Show `(done/total)` beside groups and headings. |
| `hideCompletedByDefault` | `false` | Start with completed tasks hidden. |
| `useH1AsGroupName` | `false` | Name a group after the first level-1 heading in its task file instead of its folder. |
| `milestoneKeywords` | `Milestone, Release, Alpha, Beta` | Comma-separated keywords that mark a heading as a milestone. |

A custom template uses the same `*.jsonc` format as the extension; see [its README](https://github.com/coreyx/vscode-md-taskview#-custom-state-template-example-jsonc). Give a state an `animatedIcon` (any value, such as `"loading~spin"`) and it draws with the spinner. A press follows each state's own `nextState`.

## Differences from the VS Code extension

- **Toggling writes straight to disk, with no undo.** There is no editor buffer or undo stack. A toggle re-reads the file, checks the bracket is still where it was parsed, and writes the file back. If something else edits the same file in the milliseconds between that read and write, one of the two edits is lost.
- **Live sync is polling.** Mods have no file watcher, so the pane checks modification times about every 1.5 seconds.
- **No right-click menus.** The state picker replaces "Set Task State"; the toolbar replaces the section menus.
- **No editor task actions.** The extension's Start, Continue and Mark done actions are CodeLens in its text editor and entries in its tree menu. A pane has neither; pressing a task does the same job.
- **In-progress tasks are blue**, where the extension draws them yellow.
- **Reduced motion follows Claude Code**, through its `prefersReducedMotion` setting, not VS Code's `accessibility.reducedMotion`. The spinner needs the terminal or the Desktop Code tab; other surfaces show the static icon.
- **Jump-to-source opens VS Code only**, at the line, in its text editor. There are no Markdown-preview navigation modes and no "Create Sample Spec" command.
- **Spec folders are found one level per `*`.** `spec/*` finds `spec/<name>/tasks.md`; it does not search deeper folders, and there are no separate include and exclude patterns.
- **Strikethrough depends on the Claude Code build.** Older builds cannot strike through the label of a pressable row, so completed tasks are dimmed there instead.
- The pane exists only in Claude Code surfaces (terminal, Desktop Code tab), not in regular Claude chat.

## Develop

```bash
npm install
npm test            # parser, templates and mutation (vitest, core/*.spec.ts)
npm run validate    # claude plugin validate .
npm run test:mod    # the pane, under claude plugin test . (hooks/*.test.ts)
npm run typecheck   # needs the types Claude Code lays on first load
```

Claude Code writes its type definitions to `.claude-plugin/types/` the first time it loads the mod from this folder in an interactive session (`claude --plugin-dir .`), so run that once before `npm run typecheck`.

`claude plugin test .` runs every `*.test.ts` under the folder and cannot import vitest, which is why the vitest file is `core/core.spec.ts`.

`core/` holds the parser copied from the extension; `core/UPSTREAM.md` records the source commit and what was changed, so fixes can be ported between the two repositories by hand.

Two rules of the mods API shape `hooks/`: `$` may only be passed to functions declared at the top of `hooks/register.tsx`, never into another file, so `sync.ts` and `discover.ts` take closures; and `types/index.d.ts` must be self-contained, so it repeats the types in `core/types.ts`.

## License

MIT License.
