# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- **Implementation plans:** `spec/<name>/implementation_plan.md` files show in the pane beside `tasks.md` files, as in the VS Code extension. A plan shows only the tasks under its `## Proposed Changes` heading, with its areas as the top level and its other sections left out and uncounted; a plan without that heading is shown whole, minus headings with no tasks. A folder holding both files gets a group for each, named `<folder> (tasks.md)` and `<folder> (implementation_plan.md)`.
- **`taskFileNames` setting:** comma-separated task file names, default `tasks.md, implementation_plan.md`.

### Changed
- **Inline code in labels:** backticks are stripped from labels in every task file, and the code inside is kept exactly as written, so `` `__init__` `` shows as `__init__`.
- **`useH1AsGroupName`** names a plan after its H1, though a plan's H1 is not drawn.

### Deprecated
- **`taskFileName`:** use `taskFileNames`. A name set in `taskFileName` is added to that list rather than replacing it.

## [0.4.1] - 2026-10-17

### Fixed
- **The pane emptied after a `cd`:** once Claude's shell changed folder during a session, for example with `cd spec/<name>`, the pane showed "No spec/*/tasks.md found in this folder." and Refresh did not bring the tasks back. Ticking a task and `↗` were affected the same way. Every path is now read from the session's project root, which a shell `cd` does not move.

## [0.4.0] - 2026-10-14

### Changed
- **Milestone detection:** a heading is a milestone only when it starts with a milestone keyword, in the singular. A keyword later in the heading or in the plural no longer counts, so headings such as `Notes on Milestone 1`, `Pre-release Checklist` or `Milestones` stay plain headings. An underscore counts as part of a word, so `Milestone_notes` is not a milestone either. Mirrors the VS Code extension's v0.1.17.
- **Default milestone keywords:** `milestoneKeywords` now defaults to `Milestone` only; `Release`, `Alpha` and `Beta` are no longer defaults. A list you set yourself is unchanged.

### Fixed
- **Underscores inside a word:** a heading or task label such as `Mile__stone__` lost its doubled underscores, read as bold markers. Underscores inside a word are now kept as typed. Paired emphasis markers at word edges (`_Milestone_`, `__Milestone__`) and asterisk pairs anywhere (`Mile**stone**`) are still removed.

## [0.3.1] - 2026-10-13

### Changed
- **State picker control:** the control at the end of a task row is now a dropdown arrow, `▾`, pointing up (`▴`) while the picker is open, instead of a circle.

### Fixed
- **State picker in the terminal:** its states could not be picked with the mouse, and while it was open a click on its control copied text instead of closing it. The picker is now a row of buttons, one per state, with the task's current state marked, which mouse and keyboard both reach on every surface.

## [0.3.0] - 2026-10-13

### Changed
- **State picker:** with a multi-state template, each task row now ends with a `○` control that opens the picker of every state beneath the task. It used to appear under whichever task had the keyboard focus, which the Desktop Code tab only reported after the task had been pressed, and a press also changes the task.

### Fixed
- **Flattened tree in the Desktop Code tab:** headings and tasks drew at one level there instead of indented under their parents. The indent was spaces at the start of each row's Button, which the Desktop Code tab drops. Rows are now indented by padding.
- **Completed tasks in the Desktop Code tab:** they drew like any other task there, neither struck through nor dimmed, because the Desktop Code tab ignores the styles of text inside a row's Button. Outside the terminal a completed task's label is now struck through in its characters, as the VS Code extension does, and dimmed.
- **Colours in the Desktop Code tab:** the green done glyph, the filled milestone flag and the other state colours drew in the plain text colour there, for the same reason. Outside the terminal each row is now drawn as its glyph and count beside a Button holding the label, so the colours show.

## [0.2.0] - 2026-10-13

### Added
- **Animated in-progress spinner:** an in-progress task shows a turning spinner in the pane, in the terminal and the Desktop Code tab. It mirrors the spinner in the VS Code extension's v0.1.13.
- **`animateTaskIcons` setting:** turns the spinner off (default: on). The spinner is also off when Claude Code's `prefersReducedMotion` setting is on. Either way a static `◐` is shown.
- **Spinner limits:** at most twelve spinners turn at once, and a surface where a spinner fails goes back to the static `◐`. The Desktop Code tab stops spinners that redraw too often in total.
- **Pressing the spinner** moves its task on, as pressing the task's label does.
- **`animatedIcon` state template field:** a custom `*.jsonc` template can give any state an `animatedIcon`, and that state draws with the spinner.

### Changed
- **In-progress tasks are blue**, not yellow, in the Obsidian Tasks template.
- **Parser copy** brought up to `vscode-md-taskview` `059524e` (v0.1.13); see `core/UPSTREAM.md`.

## [0.1.1] - 2026-10-09

### Changed
- **Settings help text:** each text setting's description now names its default and says to leave the field empty to use it. The install dialog starts those fields empty rather than filling the default in, which read as if a value had to be typed.

## [0.1.0] - 2026-10-09

### Added
- **Task pane:** `/md-tasks` opens a pane beside the transcript showing each `spec/*/tasks.md` as a group, with its headings, tasks and sub-tasks nested beneath and `(done/total)` counts.
- **Toggling:** pressing a task writes its next state to the file, changing one character. The bracket is checked against what the pane drew first; if the file moved on, the list refreshes and nothing is written.
- **Live sync:** the pane re-reads a task file within about two seconds of a change on disk, and at once after Claude's own edit to one.
- **Milestones:** headings matching a milestone keyword show a flag, filled when every task beneath is done.
- **View controls:** collapse and expand groups and headings, hide completed tasks, expand or collapse everything, and refresh. The collapsed rows and the filter are remembered per folder.
- **State templates:** Standard (GFM), Obsidian Tasks, and custom `*.jsonc` templates in the VS Code extension's format, with a state picker for multi-state templates.
- **Jump-to-source:** `↗` on a heading or task row opens the file at that line in VS Code.
- **Settings** mirroring the extension's: `specPathPattern`, `taskFileName`, `stateTemplate`, `customTemplatePath`, `strikeThroughCompleted`, `showProgressCount`, `hideCompletedByDefault`, `useH1AsGroupName`, `milestoneKeywords`.
- **Parser** copied from `vscode-md-taskview` at `b591e0f` (v0.1.12); see `core/UPSTREAM.md`.
