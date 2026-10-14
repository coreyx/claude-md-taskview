# Release Notes

## v0.3.0 - 2026-10-13

A clearer way to set a task's state, and fixes for how the pane looks in the Claude Desktop Code tab.

### A control for the state picker

With the Obsidian Tasks template (or any template with more than two states), each task row now ends with a small `○`. Press it to open a picker of every state beneath the task, then pick one: that is how to reach cancelled `[-]`, needs clarification `[?]` and important `[!]`, which pressing the task does not cycle through. Nothing is written until you pick, and pressing `○` again closes the picker.

Before, the picker appeared under whichever task had the keyboard focus. The Desktop Code tab only reported that after the task had been pressed, and pressing a task also moves it to its next state, so reaching the picker meant changing the task first.

Pressing the task itself still moves it on, as before. The Standard (GFM) template has only two states, so it has no picker.

### The Desktop Code tab draws the pane properly again

The desktop app's Claude Code engine has been updated, and it draws the content of a pressable row as plain text. The pane relied on styling there, so in the Code tab:

- **The tree was flat.** Headings and tasks drew at one level instead of indented under their parents. Rows are now indented by layout, not by spaces.
- **Colours were missing.** The green done glyph, the filled milestone flag and the other state colours drew in the plain text colour. Each row's glyph and count are now drawn beside the pressable label, where colour shows.
- **Completed tasks looked like any other.** They are now struck through and dimmed. In the Code tab the strike is drawn on each character, as the VS Code extension draws it in its tree, so the line may sit a little low depending on the font.

The terminal was not affected and looks as it did.

### Good to know

- **In the Desktop Code tab, press a task by its label.** Its glyph and a heading's arrow are drawn beside the pressable part there, so clicking them does nothing; an in-progress spinner still takes clicks. In the terminal the whole row is pressable, as before.

### Updating

From a shell:

```bash
claude plugin update md-taskview@claude-md-taskview
```

Then start a new session.

## v0.2.0 - 2026-10-13

In-progress tasks now show a turning spinner, following the same addition in the [VS Code extension's v0.1.13](https://github.com/coreyx/vscode-md-taskview/releases/tag/v0.1.13).

### A spinner for tasks in progress

A task marked in progress (`[/]`) shows a small blue spinner turning where its static `◐` used to be, in the terminal and in the Claude Desktop Code tab. You can press the spinner or the task's label to move the task on.

In-progress tasks are now blue rather than yellow.

### You need the Obsidian Tasks template to see it

The spinner belongs to the in-progress state, and only the **Obsidian Tasks** template has one. With it, pressing a task goes not started `[ ]`, in progress `[/]`, done `[x]`, then back to not started.

The default **Standard (GFM)** template is unchanged and stays pure GitHub checkboxes: a press toggles `[ ]` and `[x]` and nothing else is ever written.

To switch, run `/config` and set the mod's "State template" to `Obsidian Tasks`. The [README](./README.md#settings) also shows how to set it in `~/.claude/settings.json`.

A custom template can give any state an `animatedIcon` to draw it with the spinner.

### Turning the motion off

- Set **Animate task icons** (`animateTaskIcons`) off in `/config`.
- Or turn on Claude Code's own `prefersReducedMotion` setting, which the mod respects.

Either way the static `◐` is shown.

### Good to know

- **At most twelve spinners turn at once.** In-progress tasks past the twelfth show the static `◐`. The Desktop Code tab stops spinners when too many redraw together, and this keeps the pane within what it allows.
- **The spinner needs the terminal or the Desktop Code tab.** Other surfaces show the static `◐`.
- The extension's new editor task actions (Start, Continue, Mark done) are not part of the mod. They are CodeLens in a text editor, which a pane does not have; pressing a task does the same job.

### Updating

From a shell:

```bash
claude plugin update md-taskview@claude-md-taskview
```

Then start a new session.

## v0.1.1 - 2026-10-09

A small follow-up to the first release that makes the settings easier to fill in. Nothing about the pane itself changes.

### Clearer settings at install

When you install the mod, Claude Code asks for its settings, and the text settings start out empty. That looked as though each one needed a value typed in. It does not: an empty field uses the default.

Each text setting's help text now says so and names its default:

- **Spec path pattern:** `spec/*`
- **Task file name:** `tasks.md`
- **Milestone keywords:** `Milestone, Release, Alpha, Beta`

If you typed something into these fields when you installed v0.1.0, it was saved and is still in effect. To go back to a default, clear the field in `/config`.

### Updating

From a shell:

```bash
claude plugin update md-taskview@claude-md-taskview
```

Then start a new session.

## v0.1.0 - 2026-10-09

### Markdown Tasks for Claude Code (`claude-md-taskview`)

The first release. **v0.1.0** brings the Markdown Tasks tree from the [VS Code extension](https://github.com/coreyx/vscode-md-taskview) into Claude Code itself: a pane beside the transcript, in the terminal and in the Claude Desktop Code tab, that shows your `spec/*/tasks.md` files as milestones and tasks. You can watch an agent work through a task list, and tick tasks yourself, without opening an editor.

### What's in it

#### The task pane
- Run `/md-tasks` in a folder that holds `spec/<name>/tasks.md` files. The pane opens only when you ask for it.
- Each spec folder is a group, with its headings, tasks and sub-tasks nested beneath it and a `(done/total)` count.
- Headings that contain a milestone keyword show a flag, which fills in once every task beneath is done.
- It reads a `tasks.md` exactly as the extension does: the parser is a copy of the extension's, including checklist items written as headings.

#### Ticking tasks
- Press a task to move it to its next state. Exactly one character changes in the file.
- Before writing, the mod re-reads the file and checks the task is still where the pane showed it. If the file has moved on, it refreshes the list and writes nothing.

#### Staying in step with the files
- The pane picks up a change on disk within about two seconds, whoever made it.
- When Claude edits a task file, the pane updates as the edit finishes.

#### Finding your way around
- Collapse and expand groups and headings, hide completed tasks, or expand and collapse everything from the toolbar (`r`, `f`, `e`, `c`).
- The pane remembers what you collapsed and whether completed tasks are hidden, per folder, across sessions.
- Press `↗` at the end of a heading or task row to open the file at that line in VS Code.

#### State templates
- Standard (GFM) checkboxes, Obsidian Tasks' six states, or your own `*.jsonc` template in the extension's format.
- With a multi-state template, a picker beneath the focused task sets any state directly.

### Good to know
- **There is no undo.** A toggle writes straight to the file; there is no editor buffer behind the pane. Git is your undo.
- **Strikethrough depends on your Claude Code build.** On builds that cannot strike through a pressable row, which at the time of writing includes the Desktop Code tab, completed tasks are dimmed instead.
- **Jump-to-source opens VS Code only**, and needs its `code` command on your `PATH`.
- **Spec folders are found one level per `*`.** `spec/*` finds `spec/<name>/tasks.md` and does not search deeper.
- Mods are an early-access part of Claude Code, and their API may change between releases.

The full list of differences from the extension is in the [README](./README.md#differences-from-the-vs-code-extension).

### Requirements

Claude Code v2.1.287 or newer.

### Installation

From a terminal session of Claude Code:

```text
/plugin install md-taskview --marketplace coreyx/claude-md-taskview
```

Answer `y` to add the marketplace, then choose a scope. A user-scope install also loads in the Desktop Code tab.

To try it for one session without installing:

```bash
git clone https://github.com/coreyx/claude-md-taskview.git
claude --plugin-dir ./claude-md-taskview
```

### License

MIT License.
