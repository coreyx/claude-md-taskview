import { describe, it, expect } from 'vitest';
import obsidianJsonc from './fixtures/obsidian.jsonc?raw';
import { isMilestoneHeading } from './milestones';
import { replaceStateChar } from './mutate';
import { parseTasks, stripMarkdownFormatting } from './parse';
import {
  OBSIDIAN_TEMPLATE,
  STANDARD_TEMPLATE,
  getNextState,
  getState,
  parseJsonc,
  validateTemplate,
} from './templates';

const FILE = '/workspace/spec/auth/tasks.md';
const FOLDER = '/workspace/spec/auth';
const parse = (markdown: string, template = STANDARD_TEMPLATE) => parseTasks(markdown, 'auth', FILE, FOLDER, template);

// Ported from the extension's test/unit/parser.test.ts.
describe('parseTasks', () => {
  it('should parse top-level unheaded checklist items', () => {
    const spec = parse(`- [ ] Pre-task 1\n- [x] Pre-task 2`);

    expect(spec.name).toBe('auth');
    expect(spec.taskFilePath).toBe(FILE);
    expect(spec.folderPath).toBe(FOLDER);
    expect(spec.rootTasks.length).toBe(2);
    expect(spec.rootTasks[0]?.cleanText).toBe('Pre-task 1');
    expect(spec.rootTasks[0]?.isCompleted).toBe(false);
    expect(spec.rootTasks[1]?.cleanText).toBe('Pre-task 2');
    expect(spec.rootTasks[1]?.isCompleted).toBe(true);
    expect(spec.stats.totalCountable).toBe(2);
    expect(spec.stats.completedCount).toBe(1);
  });

  it('should parse hierarchical headings depth', () => {
    const spec = parse(`
# Section 1
- [ ] Task 1.1
## SubSection 1.1
- [x] Task 1.1.1
### SubSubSection 1.1.1
- [ ] Deep task
## SubSection 1.2
- [ ] Task 1.2.1
`);

    expect(spec.headings.length).toBe(1); // 1 top-level heading (# Section 1)
    const h1 = spec.headings[0]!;
    expect(h1.label).toBe('Section 1');
    expect(h1.tasks.length).toBe(1);
    expect(h1.children.length).toBe(2); // SubSection 1.1, SubSection 1.2

    const sub1 = h1.children[0]!;
    expect(sub1.label).toBe('SubSection 1.1');
    expect(sub1.tasks.length).toBe(1);
    expect(sub1.children.length).toBe(1); // SubSubSection 1.1.1

    const subSub1 = sub1.children[0]!;
    expect(subSub1.label).toBe('SubSubSection 1.1.1');
    expect(subSub1.tasks.length).toBe(1);

    const sub2 = h1.children[1]!;
    expect(sub2.label).toBe('SubSection 1.2');
    expect(sub2.tasks.length).toBe(1);

    // Total stats
    expect(spec.stats.totalCountable).toBe(4);
    expect(spec.stats.completedCount).toBe(1);
    expect(h1.stats.totalCountable).toBe(4);
    expect(h1.stats.completedCount).toBe(1);
  });

  it('should accurately calculate bracket column coordinates', () => {
    const task = parse('  - [x] Perform user authentication').rootTasks[0]!;

    expect(task.char).toBe('x');
    expect(task.bracketRange.line).toBe(0);
    expect(task.bracketRange.openBracketCol).toBe(4);
    expect(task.bracketRange.charCol).toBe(5);
    expect(task.bracketRange.closeBracketCol).toBe(6);
  });

  it('should parse indented sub-tasks', () => {
    const spec = parse(`
# Milestone 1
- [ ] Parent task
  - [x] Child task 1
  - [ ] Child task 2
    - [x] Grandchild task
`);
    const h1 = spec.headings[0]!;

    expect(h1.tasks.length).toBe(1);
    const parent = h1.tasks[0]!;
    expect(parent.cleanText).toBe('Parent task');
    expect(parent.subTasks.length).toBe(2);

    expect(parent.subTasks[0]?.cleanText).toBe('Child task 1');
    expect(parent.subTasks[0]?.isCompleted).toBe(true);

    expect(parent.subTasks[1]?.cleanText).toBe('Child task 2');
    expect(parent.subTasks[1]?.subTasks.length).toBe(1);
    expect(parent.subTasks[1]?.subTasks[0]?.cleanText).toBe('Grandchild task');
    expect(parent.subTasks[1]?.subTasks[0]?.isCompleted).toBe(true);

    expect(h1.stats.totalCountable).toBe(4);
    expect(h1.stats.completedCount).toBe(2);
  });

  it('should gracefully handle malformed lines and non-task markdown', () => {
    const spec = parse(`
# Valid Heading
Some introductory paragraph text without tasks.
- Regular bullet point
- [ unclosed bracket task
* [ ] Asterisk bullet task
`);
    const h1 = spec.headings[0]!;

    expect(h1.label).toBe('Valid Heading');
    expect(h1.tasks.length).toBe(1);
    expect(h1.tasks[0]?.cleanText).toBe('Asterisk bullet task');
  });

  it('should strip markdown bold and italic from task items and headings without literal asterisks or underscores', () => {
    const spec = parse(`
# **Milestone 1**: *Scaffolding*
- [x] **TASK-1.1: Extension Project Scaffolding & Build Tooling**
- [ ] *TASK-1.2: Italic task title*
- [ ] ***TASK-1.3: Bold and italic task title***
- [x] __TASK-1.4: Underscore bold task__
- [ ] _TASK-1.5: Underscore italic task_
- [ ] ___TASK-1.6: Underscore bold and italic task___
- [ ] **_TASK-1.7: Nested bold italic_**
- [ ] Combine **bold** with *italic* words in a single line
- [ ] Maintain snake_case_identifier and math 2 * 3 = 6 intact
`);
    const h1 = spec.headings[0]!;

    expect(h1.label).toBe('Milestone 1: Scaffolding');
    expect(h1.tasks.map((task) => task.cleanText)).toEqual([
      'TASK-1.1: Extension Project Scaffolding & Build Tooling',
      'TASK-1.2: Italic task title',
      'TASK-1.3: Bold and italic task title',
      'TASK-1.4: Underscore bold task',
      'TASK-1.5: Underscore italic task',
      'TASK-1.6: Underscore bold and italic task',
      'TASK-1.7: Nested bold italic',
      'Combine bold with italic words in a single line',
      'Maintain snake_case_identifier and math 2 * 3 = 6 intact',
    ]);
    expect(stripMarkdownFormatting('')).toBe('');
  });

  it('should parse checklist items written as headings as tasks', () => {
    const spec = parse(`
## Milestone 1: Setup
### - [x] Task 1.1: Scaffolding
- **Concrete Steps**:
  1. Initialize the project.
### - [ ] Task 1.2: Styling
- [x] Install dependencies
  - [ ] Configure theme
#### - [x] Task 1.2.1: Nested heading task
## Milestone 2: Done
### - [x] Task 2.1: Only task
`);

    expect(spec.headings.length).toBe(2);
    const m1 = spec.headings[0]!;
    expect(m1.children.length).toBe(0);
    expect(m1.tasks.length).toBe(2);

    const t11 = m1.tasks[0]!;
    expect(t11.cleanText).toBe('Task 1.1: Scaffolding');
    expect(t11.char).toBe('x');
    expect(t11.isCompleted).toBe(true);
    expect(t11.subTasks.length).toBe(0);
    expect(t11.line).toBe(2);
    expect(t11.bracketRange.openBracketCol).toBe(6);
    expect(t11.bracketRange.charCol).toBe(7);
    expect(t11.bracketRange.closeBracketCol).toBe(8);
    expect(t11.parentHeadingId).toBe(m1.id);

    const t12 = m1.tasks[1]!;
    expect(t12.cleanText).toBe('Task 1.2: Styling');
    expect(t12.isCompleted).toBe(false);
    expect(t12.subTasks.map((t) => t.cleanText)).toEqual(['Install dependencies', 'Task 1.2.1: Nested heading task']);
    expect(t12.subTasks[0]?.subTasks[0]?.cleanText).toBe('Configure theme');

    expect(m1.stats.totalCountable).toBe(5);
    expect(m1.stats.completedCount).toBe(3);

    const m2 = spec.headings[1]!;
    expect(m2.tasks.length).toBe(1);
    expect(m2.stats.totalCountable).toBe(1);
    expect(m2.stats.completedCount).toBe(1);
  });

  it('should count states by the template passed in', () => {
    const markdown = `- [/] Active\n- [-] Dropped\n- [x] Finished\n- [ ] Waiting`;

    const obsidian = parse(markdown, OBSIDIAN_TEMPLATE);
    expect(obsidian.stats).toEqual({ totalCountable: 4, completedCount: 1, inProgressCount: 1, cancelledCount: 1 });

    // The standard template has no in-progress or cancelled state to count.
    const standard = parse(markdown, STANDARD_TEMPLATE);
    expect(standard.stats).toEqual({ totalCountable: 4, completedCount: 1, inProgressCount: 0, cancelledCount: 0 });
  });
});

// Ported from the extension's test/unit/templates.test.ts.
describe('state templates', () => {
  it('should support Standard (GFM) template states and cycling', () => {
    const notStarted = getState(STANDARD_TEMPLATE, ' ');
    expect(notStarted.label).toBe('Not Started');
    expect(notStarted.countsAsCompleted).toBe(false);

    const nextFromNotStarted = getNextState(STANDARD_TEMPLATE, ' ');
    expect(nextFromNotStarted.char).toBe('x');
    expect(nextFromNotStarted.countsAsCompleted).toBe(true);

    expect(getNextState(STANDARD_TEMPLATE, 'x').char).toBe(' ');
  });

  it('should support Obsidian Tasks multi-state cycling and mappings', () => {
    const label = (char: string) => getState(OBSIDIAN_TEMPLATE, char).label;
    expect(label(' ')).toBe('Not Started');
    expect(label('/')).toBe('In Progress');
    expect(label('x')).toBe('Done');
    expect(label('X')).toBe('Done');
    expect(label('-')).toBe('Cancelled');
    expect(label('?')).toBe('Needs Clarification');
    expect(label('!')).toBe('Important');

    // Cycle transitions: [ ] -> [/] -> [x] -> [ ]
    expect(getNextState(OBSIDIAN_TEMPLATE, ' ').char).toBe('/');
    expect(getNextState(OBSIDIAN_TEMPLATE, '/').char).toBe('x');
    expect(getNextState(OBSIDIAN_TEMPLATE, 'x').char).toBe(' ');

    // Counts as completed
    expect(getState(OBSIDIAN_TEMPLATE, 'x').countsAsCompleted).toBe(true);
    expect(getState(OBSIDIAN_TEMPLATE, '/').countsAsCompleted).toBe(false);
    expect(getState(OBSIDIAN_TEMPLATE, '-').countsAsCompleted).toBe(false);
    expect(getState(OBSIDIAN_TEMPLATE, '!').countsAsCompleted).toBe(false);

    // Strikethrough
    expect(getState(OBSIDIAN_TEMPLATE, 'x').strikethrough).toBe(true);
    expect(getState(OBSIDIAN_TEMPLATE, '-').strikethrough).toBe(true);
    expect(getState(OBSIDIAN_TEMPLATE, '/').strikethrough).toBe(false);
  });

  it('should provide graceful fallback for unmapped bracket characters', () => {
    const unknown = getState(STANDARD_TEMPLATE, '>');

    expect(unknown.id).toBe('unknown');
    expect(unknown.icon).toBe('circle-small-filled');
    expect(unknown.countsAsCompleted).toBe(false);
    expect(unknown.strikethrough).toBe(false);
    expect(getNextState(STANDARD_TEMPLATE, '>').char).toBe(' ');
  });

  it('should mark only the Obsidian in-progress state as animated, and draw it blue', () => {
    const inProgress = getState(OBSIDIAN_TEMPLATE, '/');
    expect(inProgress.animatedIcon).toBe('loading~spin');
    expect(inProgress.color).toBe('charts.blue');

    const animated = OBSIDIAN_TEMPLATE.states.filter((state) => state.animatedIcon !== undefined);
    expect(animated.map((state) => state.id)).toEqual(['in_progress']);
    expect(STANDARD_TEMPLATE.states.some((state) => state.animatedIcon !== undefined)).toBe(false);

    // Standard stays pure GFM: `[/]` is no state of it, so it is neither in progress nor animated there.
    expect(getState(STANDARD_TEMPLATE, '/').id).toBe('unknown');
    expect(getState(STANDARD_TEMPLATE, '/').animatedIcon).toBeUndefined();
    expect(getNextState(STANDARD_TEMPLATE, ' ').char).toBe('x');
  });

  it('should keep animatedIcon on a custom template', () => {
    const custom = validateTemplate({
      states: [{ char: '/', id: 'progress', label: 'In Progress', icon: 'sync', animatedIcon: 'loading~spin' }],
    });
    expect(custom?.states[0]?.animatedIcon).toBe('loading~spin');
  });

  it('should reject templates a toggle could not write', () => {
    expect(validateTemplate(null)).toBeNull();
    expect(validateTemplate({ name: 'No states' })).toBeNull();
    expect(validateTemplate({ states: [] })).toBeNull();
    expect(validateTemplate({ states: [{ char: 'xx', id: 'done', label: 'Done' }] })).toBeNull();
    expect(validateTemplate({ states: [{ char: 'x', label: 'Done' }] })).toBeNull();

    const minimal = validateTemplate({ states: [{ char: 'x', id: 'done', label: 'Done' }] });
    expect(minimal).toMatchObject({ name: 'Custom', description: '', defaultState: ' ' });
  });
});

describe('parseJsonc', () => {
  it("should read the extension's obsidian.jsonc as the built-in Obsidian template", () => {
    const template = validateTemplate(parseJsonc(obsidianJsonc))!;
    const inProgress = template.states.find((state) => state.id === 'in_progress')!;

    // Two things differ on purpose. The file and the constant are worded differently upstream, and
    // this mod draws in-progress blue where the extension's file says yellow.
    expect(template.description).toBe('Supports Obsidian Tasks multi-state checklist conventions');
    expect(inProgress.color).toBe('charts.yellow');
    expect(inProgress.animatedIcon).toBe('loading~spin');

    const aligned = {
      ...template,
      description: OBSIDIAN_TEMPLATE.description,
      states: template.states.map((state) => (state === inProgress ? { ...state, color: 'charts.blue' } : state)),
    };
    expect(aligned).toEqual(OBSIDIAN_TEMPLATE);
  });

  it('should strip comments and trailing commas but leave strings alone', () => {
    const text = `﻿{
      // line comment
      "url": "http://example.com/a,]", /* block
      comment */ "list": [1, 2, ],
      "quote": "say \\"hi\\" // not a comment",
    }`;

    expect(parseJsonc(text)).toEqual({
      url: 'http://example.com/a,]',
      list: [1, 2],
      quote: 'say "hi" // not a comment',
    });
  });

  it('should throw on text that is still not JSON', () => {
    expect(() => parseJsonc('{ "a": }')).toThrow(SyntaxError);
  });
});

// Extends the extension's test/unit/mutation.test.ts, which simulated the edit by hand.
describe('replaceStateChar', () => {
  it('should change exactly one character at the parsed bracket', () => {
    const original = '# Heading\n  - [ ] Implement OAuth provider\n- [ ] Other';
    const task = parse(original).headings[0]!.tasks[0]!;

    const mutated = replaceStateChar(original, task.bracketRange, task.char, 'x');
    expect(mutated).toBe('# Heading\n  - [x] Implement OAuth provider\n- [ ] Other');

    const reparsed = parse(mutated!).headings[0]!.tasks[0]!;
    expect(reparsed.char).toBe('x');
    expect(reparsed.isCompleted).toBe(true);
  });

  it('should preserve multi-state Obsidian characters precisely', () => {
    const original = '- [/] Active feature in progress';
    const task = parse(original, OBSIDIAN_TEMPLATE).rootTasks[0]!;

    expect(task.char).toBe('/');
    expect(replaceStateChar(original, task.bracketRange, '/', 'x')).toBe('- [x] Active feature in progress');
  });

  it('should preserve CRLF line endings and every other byte', () => {
    const original = '# Title\r\n\r\n- [x] One\r\n\t- [ ] Two\twith a tab  \r\n';
    const task = parse(original).headings[0]!.tasks[0]!.subTasks[0]!;

    const mutated = replaceStateChar(original, task.bracketRange, ' ', 'x')!;
    expect(mutated).toBe('# Title\r\n\r\n- [x] One\r\n\t- [x] Two\twith a tab  \r\n');
    expect(mutated.length).toBe(original.length);
  });

  it('should toggle a checklist item written as a heading', () => {
    const original = '## Milestone\n### - [ ] Task 1.1';
    const task = parse(original).headings[0]!.tasks[0]!;

    expect(replaceStateChar(original, task.bracketRange, ' ', 'x')).toBe('## Milestone\n### - [x] Task 1.1');
  });

  it('should return null when the bracket has moved or the character differs', () => {
    const original = '- [ ] First\n- [ ] Second';
    const task = parse(original).rootTasks[1]!;

    // A blank line was inserted above: the parsed line now holds nothing.
    expect(replaceStateChar('- [ ] First\n\n- [ ] Second', task.bracketRange, ' ', 'x')).toBeNull();
    // The line was indented: the columns no longer point at brackets.
    expect(replaceStateChar('- [ ] First\n  - [ ] Second', task.bracketRange, ' ', 'x')).toBeNull();
    // Someone else already ticked it.
    expect(replaceStateChar('- [ ] First\n- [x] Second', task.bracketRange, ' ', 'x')).toBeNull();
    // The file was truncated.
    expect(replaceStateChar('- [ ] First', task.bracketRange, ' ', 'x')).toBeNull();
  });

  it('should not tick a different task that slid into the parsed position', () => {
    const original = '- [ ] First\n- [ ] Second';
    const task = parse(original).rootTasks[1]!;
    const shifted = 'intro\n- [ ] First\n- [ ] Second';

    // The columns alone cannot tell First from Second; the parsed line text can.
    expect(replaceStateChar(shifted, task.bracketRange, ' ', 'x')).toBe('intro\n- [x] First\n- [ ] Second');
    expect(replaceStateChar(shifted, task.bracketRange, ' ', 'x', task.rawText)).toBeNull();
    expect(replaceStateChar(original, task.bracketRange, ' ', 'x', task.rawText)).toBe('- [ ] First\n- [x] Second');

    const crlf = '- [ ] First\r\n- [ ] Second\r\n';
    const crlfTask = parse(crlf).rootTasks[1]!;
    expect(replaceStateChar(crlf, crlfTask.bracketRange, ' ', 'x', crlfTask.rawText)).toBe('- [ ] First\r\n- [x] Second\r\n');
  });

  it('should refuse brackets that do not hold exactly one character', () => {
    const empty = parse('- [] Empty').rootTasks[0]!;
    expect(replaceStateChar('- [] Empty', empty.bracketRange, empty.char, 'x')).toBeNull();

    const wide = parse('- [xx] Wide').rootTasks[0]!;
    expect(replaceStateChar('- [xx] Wide', wide.bracketRange, wide.char, ' ')).toBeNull();
  });
});

// Ported from the extension's test/unit/tree.test.ts.
describe('isMilestoneHeading', () => {
  const defaultKeywords = ['Milestone', 'Release', 'Alpha', 'Beta'];

  it('detects milestone keywords at the start of the heading, as whole words, in any case', () => {
    expect(isMilestoneHeading('Milestone 1: Project Setup', defaultKeywords)).toBe(true);
    expect(isMilestoneHeading('milestone 2', defaultKeywords)).toBe(true);
    expect(isMilestoneHeading('MILESTONE', defaultKeywords)).toBe(true);
    expect(isMilestoneHeading('Milestones', defaultKeywords)).toBe(true);
    expect(isMilestoneHeading('Release 1.0.0', defaultKeywords)).toBe(true);
    expect(isMilestoneHeading('Release-1 Checklist', defaultKeywords)).toBe(true);
    expect(isMilestoneHeading('Alpha 1', defaultKeywords)).toBe(true);
    expect(isMilestoneHeading('Beta Testing', defaultKeywords)).toBe(true);
    expect(isMilestoneHeading('  Milestone 3', defaultKeywords)).toBe(true);
  });

  it('does not match a keyword that appears later in the heading', () => {
    expect(isMilestoneHeading('Notes on Milestone 1', defaultKeywords)).toBe(false);
    expect(isMilestoneHeading('Phase 2 milestone', defaultKeywords)).toBe(false);
    expect(isMilestoneHeading('Pre-release Checklist', defaultKeywords)).toBe(false);
    expect(isMilestoneHeading('Bookmark: Release process', defaultKeywords)).toBe(false);
    expect(isMilestoneHeading('1. Milestone', defaultKeywords)).toBe(false);
  });

  // Not upstream: the label the parse hands over has its bold and italic markers stripped already.
  it('matches a keyword wrapped in bold or italic markers in the source heading', () => {
    const spec = parse('## **Milestone 1**: Setup\n## _Release_ 2\n');
    expect(spec.headings.map((heading) => isMilestoneHeading(heading.label, defaultKeywords))).toEqual([true, true]);
  });

  it('does not falsely match normal headings or partial words', () => {
    expect(isMilestoneHeading('Database Setup', defaultKeywords)).toBe(false);
    expect(isMilestoneHeading('Architecture & Design', defaultKeywords)).toBe(false);
    expect(isMilestoneHeading('Alphabetical Index', defaultKeywords)).toBe(false);
    expect(isMilestoneHeading('Betatron Device', defaultKeywords)).toBe(false);
    expect(isMilestoneHeading('Overview', defaultKeywords)).toBe(false);
  });

  it('supports custom configured milestone keywords', () => {
    const customKeywords = ['Sprint', 'Phase'];
    expect(isMilestoneHeading('Sprint 4', customKeywords)).toBe(true);
    expect(isMilestoneHeading('Phase 1', customKeywords)).toBe(true);
    expect(isMilestoneHeading('Milestone 1', customKeywords)).toBe(false);
  });
});
