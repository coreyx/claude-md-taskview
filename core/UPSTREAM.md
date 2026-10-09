# Upstream

`core/` is a copy of the parser and state templates from the VS Code extension, adapted to run inside a Claude Code hooks module, which has no `vscode` API, no Node APIs and no npm dependencies.

- **Source repository:** https://github.com/coreyx/vscode-md-taskview
- **Commit:** `b591e0f` (v0.1.12, "fix: parse checklist items written as headings as tasks")
- **Copied on:** 2026-10-09

The two copies are kept in step by hand. A parser fix made in either repository has to be ported to the other; the table below says where each piece came from and what differs, so a diff against upstream shows only real changes.

## Files

| File here | Upstream file | What changed |
| :--- | :--- | :--- |
| `types.ts` | `src/models/types.ts` | No `vscode` import. `fileUri`, `folderUri` and `taskFileUri` (`vscode.Uri`) became the string paths `filePath`, `folderPath` and `taskFilePath`. `HeadingNode.slug` and `TaskNode.parentHeadingSlug` are removed. |
| `parse.ts` | `src/parser/MarkdownASTParser.ts` | The static class became module functions: `MarkdownASTParser.parse` is `parseTasks`, and `stripMarkdownFormatting` is exported beside it. The state template is a fifth parameter instead of the `StateTemplateEngine` singleton, and is passed down to the stats helpers. Paths are strings, so ids are built from `filePath` rather than `fileUri.fsPath`. Heading slugs (`Slugifier`, `currentSlug`) are dropped: they only served Markdown-preview navigation. Array and match-group reads are written for `noUncheckedIndexedAccess` (`.at(-1)`, `?? ''`), with the same behaviour. |
| `templates.ts` | `src/templates/StateTemplateEngine.ts` | `STANDARD_TEMPLATE` and `OBSIDIAN_TEMPLATE` are copied unchanged. The `StateTemplateEngine` class is replaced by pure functions that take the template: `getState`, `getNextState`. Loading from configuration and disk is not here (the mod does it through `$.fs`). `validateTemplate` replaces the inline check in `loadCustomTemplate` and is stricter: every state needs a one-character `char` and a string `id` and `label`. `parseJsonc` is new and replaces the `jsonc-parser` dependency. |
| `milestones.ts` | `src/views/TaskTreeDataProvider.ts` | `isMilestoneHeading` only, copied unchanged. |
| `mutate.ts` | `src/services/SurgicalMutationService.ts` | Rewritten, not copied. Upstream applies a `vscode.WorkspaceEdit` to the open document; `replaceStateChar` works on the file's text and first checks that the bracket is still where it was parsed, because the mod reads and writes the file itself. |
| `fixtures/obsidian.jsonc` | `resources/templates/obsidian.jsonc` | Copied unchanged, as a test fixture. |
| `core.test.ts` | `test/unit/parser.test.ts`, `templates.test.ts`, `mutation.test.ts`, `tree.test.ts` | Cases ported to the functions above. The slug test is dropped with the slugs. Cases for the template parameter, `validateTemplate`, `parseJsonc` and `replaceStateChar` are new. |

## Not copied

`Slugifier.ts`, `ConfigurationManager.ts`, `SpecDiscoveryService.ts`, `FileSystemWatcherService.ts`, `DebounceDispatcher.ts`, the commands and `TaskTreeDataProvider` itself: each is tied to the VS Code API, and the mod has its own equivalents under `hooks/`.

## Known differences in behaviour

- `getState` matches a bracket character case-insensitively against every state, where upstream indexed states by lower-cased character and added an upper-case entry only for `x`. For the built-in templates the results are the same.
- `replaceStateChar` refuses brackets that do not hold exactly one character (`[]`, `[xx]`). Upstream replaces the character after `[` regardless, which for `[]` overwrites the closing bracket.
- Upstream's `obsidian.jsonc` and its `OBSIDIAN_TEMPLATE` constant carry different `description` strings. The test compares everything else.
