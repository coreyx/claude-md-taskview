import type { BracketRange, HeadingNode, SpecGroup, TaskNode, TaskStats } from './types';
import type { StateTemplate } from './templates';
import { getState } from './templates';

// Regular expressions for ATX headings and checklist items
const HEADING_REGEX = /^(\#{1,6})\s+(.+)$/;
const TASK_REGEX = /^(\s*)[-*+]\s+\[(.*?)\]\s*(.*)$/;

/**
 * Parses markdown text into a structured SpecGroup model.
 *
 * @param content Full text content of the markdown file.
 * @param specName Name of the spec folder/group.
 * @param filePath Path of the task markdown file.
 * @param folderPath Path of the parent spec folder.
 * @param template State template that decides which bracket characters count as completed.
 */
export function parseTasks(
  content: string,
  specName: string,
  filePath: string,
  folderPath: string,
  template: StateTemplate
): SpecGroup {
  const lines = content.split(/\r?\n/);
  const rootTasks: TaskNode[] = [];
  const headings: HeadingNode[] = [];

  // Heading stack to manage depth hierarchy (levels 1-6)
  const headingStack: HeadingNode[] = [];

  // Task stack within the current heading to manage indented sub-tasks
  let taskStack: TaskNode[] = [];
  let currentHeading: HeadingNode | undefined = undefined;

  const addTask = (lineIndex: number, lineStr: string, indentLevel: number, char: string, text: string): void => {
    const cleanText = stripMarkdownFormatting(text.trim());

    // Calculate bracket range columns
    const openBracketCol = lineStr.indexOf('[');
    const closeBracketCol = lineStr.indexOf(']', openBracketCol);
    const bracketRange: BracketRange = {
      line: lineIndex,
      openBracketCol,
      charCol: openBracketCol + 1,
      closeBracketCol,
    };

    const stateDef = getState(template, char);
    const isCompleted = stateDef.countsAsCompleted ?? (char.toLowerCase() === 'x');

    const taskNode: TaskNode = {
      type: 'task',
      id: `${filePath}#T${lineIndex}`,
      filePath,
      rawText: lineStr,
      cleanText: cleanText || '(Empty task)',
      char,
      bracketRange,
      line: lineIndex,
      indentation: indentLevel,
      subTasks: [],
      isCompleted,
      parentHeadingId: currentHeading?.id,
    };

    // Find parent task in taskStack with lower indentation
    while ((taskStack.at(-1)?.indentation ?? -Infinity) >= indentLevel) {
      taskStack.pop();
    }

    const parentTask = taskStack.at(-1);
    if (parentTask) {
      // Indented subtask
      parentTask.subTasks.push(taskNode);
    } else {
      // Top-level task in current heading scope
      attachTaskToScope(taskNode, currentHeading, rootTasks);
    }

    taskStack.push(taskNode);
  };

  for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
    const lineStr = lines[lineIndex] ?? '';

    // 1. Check for ATX Heading (# ... ######)
    const headingMatch = lineStr.match(HEADING_REGEX);
    if (headingMatch) {
      const level = (headingMatch[1] ?? '').length;
      const headingText = (headingMatch[2] ?? '').trim();
      const label = stripMarkdownFormatting(headingText);

      // Pop headingStack until we find a parent with a strictly lower level
      while ((headingStack.at(-1)?.level ?? 0) >= level) {
        headingStack.pop();
      }

      // Heading written as a checklist item (### - [x] Task 1.1) is a task, not a section
      const headingTaskMatch = headingText.match(TASK_REGEX);
      if (headingTaskMatch) {
        currentHeading = headingStack.at(-1);
        // Negative indentation: list items below nest under it, deeper heading tasks nest under shallower ones
        addTask(lineIndex, lineStr, level - 7, headingTaskMatch[2] ?? '', headingTaskMatch[3] ?? '');
        continue;
      }

      const newHeading: HeadingNode = {
        type: 'heading',
        id: `${filePath}#H${lineIndex}_L${level}`,
        filePath,
        label,
        level,
        line: lineIndex,
        children: [],
        tasks: [],
        stats: { totalCountable: 0, completedCount: 0, inProgressCount: 0, cancelledCount: 0 },
      };

      // Reset task stack for the new heading
      taskStack = [];
      currentHeading = newHeading;

      const parentHeading = headingStack.at(-1);
      if (parentHeading) {
        // Child heading of the top of the stack
        parentHeading.children.push(newHeading);
      } else {
        // Top-level heading within this spec document
        headings.push(newHeading);
      }

      headingStack.push(newHeading);
      continue;
    }

    // 2. Check for Checklist Item (- [ ] ...)
    const taskMatch = lineStr.match(TASK_REGEX);
    if (taskMatch) {
      const indentLevel = calculateIndentation(taskMatch[1] ?? '');
      addTask(lineIndex, lineStr, indentLevel, taskMatch[2] ?? '', taskMatch[3] ?? '');
    }
  }

  // Calculate recursive statistics
  const stats = calculateAggregateStats(rootTasks, headings, template);
  const h1Label = headings.find((heading) => heading.level === 1)?.label;

  return {
    type: 'specGroup',
    id: filePath,
    name: specName,
    folderPath,
    taskFilePath: filePath,
    headings,
    rootTasks,
    stats,
    ...(h1Label === undefined ? {} : { h1Label }),
  };
}

function calculateIndentation(indentStr: string): number {
  let count = 0;
  for (const ch of indentStr) {
    if (ch === '\t') {
      count += 2;
    } else {
      count += 1;
    }
  }
  return count;
}

function attachTaskToScope(
  task: TaskNode,
  heading: HeadingNode | undefined,
  rootTasks: TaskNode[]
): void {
  if (heading) {
    heading.tasks.push(task);
  } else {
    rootTasks.push(task);
  }
}

function calculateAggregateStats(
  rootTasks: TaskNode[],
  headings: HeadingNode[],
  template: StateTemplate
): TaskStats {
  const totalStats: TaskStats = {
    totalCountable: 0,
    completedCount: 0,
    inProgressCount: 0,
    cancelledCount: 0,
  };

  // Count root tasks
  const rootTaskStats = computeTasksStats(rootTasks, template);
  addStats(totalStats, rootTaskStats);

  // Count heading trees recursively
  for (const heading of headings) {
    const headingStats = computeHeadingStats(heading, template);
    addStats(totalStats, headingStats);
  }

  return totalStats;
}

function computeHeadingStats(heading: HeadingNode, template: StateTemplate): TaskStats {
  const headingStats = computeTasksStats(heading.tasks, template);

  for (const child of heading.children) {
    const childStats = computeHeadingStats(child, template);
    addStats(headingStats, childStats);
  }

  heading.stats = { ...headingStats };
  return headingStats;
}

function computeTasksStats(tasks: TaskNode[], template: StateTemplate): TaskStats {
  const stats: TaskStats = {
    totalCountable: 0,
    completedCount: 0,
    inProgressCount: 0,
    cancelledCount: 0,
  };

  for (const task of tasks) {
    stats.totalCountable++;
    const state = getState(template, task.char);
    if (state.countsAsCompleted) {
      stats.completedCount++;
    } else if (state.id === 'in_progress') {
      stats.inProgressCount++;
    } else if (state.id === 'cancelled') {
      stats.cancelledCount++;
    }

    if (task.subTasks.length > 0) {
      const subStats = computeTasksStats(task.subTasks, template);
      addStats(stats, subStats);
    }
  }

  return stats;
}

function addStats(target: TaskStats, source: TaskStats): void {
  target.totalCountable += source.totalCountable;
  target.completedCount += source.completedCount;
  target.inProgressCount += source.inProgressCount;
  target.cancelledCount += source.cancelledCount;
}

/**
 * Strips bold and italic markdown delimiters from text (e.g. `**text**`, `*text*`, `__text__`, `_text_`)
 * and the backticks of inline code spans, keeping the code itself exactly as written.
 * Preserves identifiers containing underscores (snake_case) and math operators.
 */
export function stripMarkdownFormatting(text: string): string {
  if (!text) return '';

  // Code spans are set aside behind placeholders first, so emphasis stripping never touches the
  // '*' and '_' inside them (`__init__` keeps its underscores). A span is a run of backticks, some
  // content, and a closing run of the same length; an unmatched backtick stays as written.
  const codeSpans: string[] = [];
  let clean = text.replace(/(?<!`)(`+)(?!`)(.+?)(?<!`)\1(?!`)/g, (_match, _ticks: string, content: string) => {
    // As in CommonMark, one space is trimmed from each side when both are present, so `` `a` `` reads `a`
    const code =
      content.length > 2 && content.startsWith(' ') && content.endsWith(' ') && content.trim()
        ? content.slice(1, -1)
        : content;
    codeSpans.push(code);
    return `\uE000${codeSpans.length - 1}\uE001`;
  });

  // Underscore emphasis must start and end at a word edge: whitespace, a symbol, or punctuation other than
  // '_' itself, so underscores doubled inside a word (Mile__stone__) stay literal as in CommonMark.

  // 1. Triple delimiters: ***text*** or ___text___ (bold + italic)
  clean = clean.replace(/\*\*\*([^\*\s](?:.*?[^\*\s])?)\*\*\*/g, '$1');
  clean = clean.replace(/(?:^|(?<=[\s\p{S}]|[^\P{P}_]))___([^_\s](?:.*?[^_\s])?)___(?=$|[\s\p{S}]|[^\P{P}_])/gu, '$1');

  // 2. Double delimiters: **text** or __text__ (bold)
  clean = clean.replace(/\*\*([^\*\s](?:.*?[^\*\s])?)\*\*/g, '$1');
  clean = clean.replace(/(?:^|(?<=[\s\p{S}]|[^\P{P}_]))__([^_\s](?:.*?[^_\s])?)__(?=$|[\s\p{S}]|[^\P{P}_])/gu, '$1');

  // 3. Single delimiter: *text* (italic with asterisks)
  clean = clean.replace(/(?<!\*)\*([^\*\s](?:.*?[^\*\s])?)\*(?!\*)/g, '$1');

  // 4. Single delimiter: _text_ (italic with underscores - CommonMark word boundary rules)
  clean = clean.replace(/(?:^|(?<=[\s\p{S}]|[^\P{P}_]))_([^_\s](?:.*?[^_\s])?)_(?=$|[\s\p{S}]|[^\P{P}_])/gu, '$1');

  // 5. Put the code spans back, without their backticks
  clean = clean.replace(/\uE000(\d+)\uE001/g, (_match, index: string) => codeSpans[Number(index)] ?? '');

  return clean.trim();
}
