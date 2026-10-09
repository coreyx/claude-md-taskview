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

Run `/tasks` in a folder that holds `spec/<name>/tasks.md` files. The pane opens beside the transcript; it never opens by itself. If a built-in command already holds the name `/tasks`, the mod registers `/md-tasks` instead.

- Each spec folder is a group, with its headings and tasks nested beneath it and a `(done/total)` count.
- Press a group or a heading to collapse or expand it.
- Press a task to move it to its next state. The file on disk changes by exactly one character.
- Headings that contain a milestone keyword show a flag, filled once every task beneath is done.
- The toolbar refreshes (`r`), hides or shows completed tasks (`f`), and expands or collapses everything (`e` / `c`).
- With a multi-state template, a picker beside the task sets any state directly.

The pane re-reads a task file within about two seconds of it changing on disk, and at once after Claude edits one.

## Settings

Set these in the mod's configuration (`/config`, or `pluginConfigs` in settings). They mirror the extension's settings of the same names.

| Setting | Default | Description |
| :--- | :--- | :--- |
| `specPathPattern` | `spec/*` | Where spec folders are, relative to the working directory. `*` matches one folder level. |
| `taskFileName` | `tasks.md` | The task file inside each spec folder. |
| `stateTemplate` | `Standard (GFM)` | `Standard (GFM)`, `Obsidian Tasks`, or `Custom`. |
| `customTemplatePath` | (empty) | Path to a `*.jsonc` state template, used when `stateTemplate` is `Custom`. |
| `strikeThroughCompleted` | `true` | Strike through and dim completed and cancelled tasks. |
| `showProgressCount` | `true` | Show `(done/total)` beside groups and headings. |
| `hideCompletedByDefault` | `false` | Start with completed tasks hidden. |
| `useH1AsGroupName` | `false` | Name a group after the first level-1 heading in its task file instead of its folder. |
| `milestoneKeywords` | `Milestone, Release, Alpha, Beta` | Comma-separated keywords that mark a heading as a milestone. |

A custom template uses the same `*.jsonc` format as the extension; see [its README](https://github.com/coreyx/vscode-md-taskview#-custom-state-template-example-jsonc).

## Differences from the VS Code extension

- **Toggling writes straight to disk, with no undo.** There is no editor buffer or undo stack. A toggle re-reads the file, checks the bracket is still where it was parsed, and writes the file back. If something else edits the same file in the milliseconds between that read and write, one of the two edits is lost.
- **Live sync is polling.** Mods have no file watcher, so the pane checks modification times about every 1.5 seconds.
- **No right-click menus.** The state picker replaces "Set Task State"; the toolbar replaces the section menus.
- **No Markdown-preview navigation modes and no "Create Sample Spec" command.**
- **Strikethrough depends on the Claude Code build.** Older builds cannot strike through the label of a pressable row, so completed tasks are dimmed there instead.
- The pane exists only in Claude Code surfaces (terminal, Desktop Code tab), not in regular Claude chat.

## Develop

```bash
npm install
npm test            # parser, templates and mutation (vitest)
npm run validate    # claude plugin validate .
npm run test:mod    # the pane, under claude plugin test .
npm run typecheck   # needs the types Claude Code lays on first load
```

Claude Code writes its type definitions to `.claude-plugin/types/` the first time it loads the mod from this folder (`claude --plugin-dir .`), so run that once before `npm run typecheck`.

`core/` holds the parser copied from the extension; `core/UPSTREAM.md` records the source commit and what was changed, so fixes can be ported between the two repositories by hand.

## License

MIT License.
