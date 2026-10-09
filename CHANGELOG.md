# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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
