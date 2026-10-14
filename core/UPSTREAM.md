# Upstream

`core/` is a copy of the parser and state templates from the VS Code extension, adapted to run inside a Claude Code hooks module, which has no `vscode` API, no Node APIs and no npm dependencies.

- **Source repository:** https://github.com/coreyx/vscode-md-taskview
- **Commit:** `059524e` (v0.1.13, "feat: add clickable task actions and in-progress spinner, switch to pnpm"). First copied at `b591e0f` (v0.1.12).
- **Copied on:** 2026-10-09, brought up to `059524e` on 2026-10-13

The two copies are kept in step by hand. A parser fix made in either repository has to be ported to the other; the table below says where each piece came from and what differs, so a diff against upstream shows only real changes.

## Files

| File here | Upstream file | What changed |
| :--- | :--- | :--- |
| `types.ts` | `src/models/types.ts` | No `vscode` import. `fileUri`, `folderUri` and `taskFileUri` (`vscode.Uri`) became the string paths `filePath`, `folderPath` and `taskFilePath`. `HeadingNode.slug` and `TaskNode.parentHeadingSlug` are removed. `StateDefinition.animatedIcon` is as upstream. |
| `parse.ts` | `src/parser/MarkdownASTParser.ts` | The static class became module functions: `MarkdownASTParser.parse` is `parseTasks`, and `stripMarkdownFormatting` is exported beside it. The state template is a fifth parameter instead of the `StateTemplateEngine` singleton, and is passed down to the stats helpers. Paths are strings, so ids are built from `filePath` rather than `fileUri.fsPath`. Heading slugs (`Slugifier`, `currentSlug`) are dropped: they only served Markdown-preview navigation. Array and match-group reads are written for `noUncheckedIndexedAccess` (`.at(-1)`, `?? ''`), with the same behaviour. `collectTasks`, added upstream at `059524e` for the task actions, is not copied. |
| `templates.ts` | `src/templates/StateTemplateEngine.ts` | `STANDARD_TEMPLATE` is copied unchanged. `OBSIDIAN_TEMPLATE` is too, `animatedIcon` on its in-progress state included, except that state's `color`, which is `charts.blue` here and `charts.yellow` upstream. The `StateTemplateEngine` class is replaced by pure functions that take the template: `getState`, `getNextState`. Loading from configuration and disk is not here (the mod does it through `$.fs`). `getDefaultChar`, `getInProgressChar` and `getDoneChar`, added upstream at `059524e`, are not copied: only the task actions use them. `validateTemplate` replaces the inline check in `loadCustomTemplate` and is stricter: every state needs a one-character `char` and a string `id` and `label`. `parseJsonc` is new and replaces the `jsonc-parser` dependency. |
| `milestones.ts` | `src/views/TaskTreeDataProvider.ts` | `isMilestoneHeading` only, at `c50a212` (v0.1.17): a keyword must start the heading and is not matched in the plural. Copied unchanged. The default keyword list (`Milestone` since v0.1.17) lives in `hooks/settings.ts` and `plugin.json`, not here. |
| `mutate.ts` | `src/services/SurgicalMutationService.ts` | Rewritten, not copied. Upstream applies a `vscode.WorkspaceEdit` to the open document; `replaceStateChar` works on the file's text and first checks that the bracket is still where it was parsed, because the mod reads and writes the file itself. |
| `fixtures/obsidian.jsonc` | `resources/templates/obsidian.jsonc` | Copied unchanged, as a test fixture, so it still says `charts.yellow`. |
| `core.spec.ts` | `test/unit/parser.test.ts`, `templates.test.ts`, `mutation.test.ts`, `tree.test.ts` | Cases ported to the functions above. The slug test is dropped with the slugs. Cases for the template parameter, `validateTemplate`, `parseJsonc` and `replaceStateChar` are new. |

## Not copied

`Slugifier.ts`, `ConfigurationManager.ts`, `SpecDiscoveryService.ts`, `FileSystemWatcherService.ts`, `DebounceDispatcher.ts`, the commands and `TaskTreeDataProvider` itself: each is tied to the VS Code API, and the mod has its own equivalents under `hooks/`.

From v0.1.13, `TaskActionCommands.ts` and `TaskCodeLensProvider.ts` are left out on purpose: the Start, Continue and Mark done actions are editor CodeLens and tree menu entries, which a pane has no place for. Pressing a task already moves it to its next state. The `showTaskActions` setting goes with them. The `animateTaskIcons` setting and the reduced-motion check are mirrored in `hooks/`, not here.

## Known differences in behaviour

- `getState` matches a bracket character case-insensitively against every state, where upstream indexed states by lower-cased character and added an upper-case entry only for `x`. For the built-in templates the results are the same.
- `replaceStateChar` refuses brackets that do not hold exactly one character (`[]`, `[xx]`). Upstream replaces the character after `[` regardless, which for `[]` overwrites the closing bracket.
- Upstream's `obsidian.jsonc` and its `OBSIDIAN_TEMPLATE` constant carry different `description` strings. The test compares everything else but the colour below.
- **In-progress tasks are blue here and yellow upstream.** The Obsidian template's in-progress state has `color: 'charts.blue'`, by the owner's choice on 2026-10-13. A fix ported from upstream must not carry `charts.yellow` back in.
