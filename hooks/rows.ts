import { isMilestoneHeading } from '../core/milestones';
import type { StateTemplate } from '../core/templates';
import { getState } from '../core/templates';
import type { HeadingNode, SpecGroup, StateDefinition, TaskNode, TaskStats } from '../core/types';
import type { Settings } from './settings';

interface RowBase {
  /** Element key: short and free of path characters, unlike `id`. */
  key: string;
  /** The node's id from the parse, which the collapsed list is kept by. */
  id: string;
  /** Nesting depth; the pane indents two columns per level. */
  depth: number;
}

export interface GroupRow extends RowBase {
  kind: 'group';
  title: string;
  count: string;
  isCollapsed: boolean;
}

export interface HeadingRow extends RowBase {
  kind: 'heading';
  label: string;
  line: number;
  filePath: string;
  count: string;
  isCollapsed: boolean;
  isMilestone: boolean;
  /** True when the heading has tasks and all of them are completed. */
  isComplete: boolean;
}

export interface TaskRow extends RowBase {
  kind: 'task';
  task: TaskNode;
  state: StateDefinition;
  glyph: string;
  /** A theme key for the glyph, or undefined for the default text colour. */
  color: string | undefined;
  /** True when the label is drawn struck through and dimmed. */
  isStruck: boolean;
  /**
   * True when the state names an `animatedIcon`. The pane has one animation,
   * the spinner, so any value means that; whether it is shown is the pane's
   * call (the setting, reduced motion, the surface).
   */
  isAnimated: boolean;
}

export type Row = GroupRow | HeadingRow | TaskRow;

export interface RowOptions {
  collapsed: ReadonlySet<string>;
  hideCompleted: boolean;
  template: StateTemplate;
  settings: Pick<Settings, 'showProgressCount' | 'useH1AsGroupName' | 'milestoneKeywords' | 'strikeThroughCompleted'>;
}

// The extension names VS Code codicons and theme colours; the pane draws text, so each maps to a glyph and a theme key.
const GLYPH_BY_ICON: Record<string, string> = {
  'circle-large-outline': '○',
  sync: '◐',
  'pass-filled': '●',
  'circle-slash': '⊘',
  question: '?',
  warning: '!',
  'circle-small-filled': '•',
};

const THEME_KEY_BY_COLOR: Record<string, string> = {
  'charts.green': 'success',
  'charts.yellow': 'warning',
  'charts.red': 'error',
  'charts.purple': 'permission',
  'charts.blue': 'suggestion',
  'charts.orange': 'warning',
};

/**
 * Flattens the parsed groups into the rows the pane draws, top to bottom,
 * leaving out what a collapsed parent or the "hide completed" filter hides.
 *
 * Filtering never changes a count: counts come from the parse.
 */
export function buildRows(groups: readonly SpecGroup[], options: RowOptions): Row[] {
  const rows: Row[] = [];

  groups.forEach((group, groupIndex) => {
    const isCollapsed = options.collapsed.has(group.id);
    rows.push({
      kind: 'group',
      key: `g-${groupIndex}`,
      id: group.id,
      depth: 0,
      title: groupTitle(group, options),
      count: countText(group.stats, options, true),
      isCollapsed,
    });
    if (isCollapsed) return;

    // Top-level headings always show, as in the extension; only nested ones are filtered.
    for (const heading of group.headings) {
      addHeading(rows, heading, groupIndex, 1, options);
    }
    addTasks(rows, group.rootTasks, groupIndex, 1, options);
  });

  return rows;
}

/**
 * Finds the task a task row's key names, in the groups as they are now.
 *
 * A key is `t-<group index>-<line>`; the spinner of that row is keyed with an
 * `a-` in front, so either form is accepted.
 *
 * @returns The task, or undefined when the key is no task's or the file has since changed shape.
 */
export function findTask(groups: readonly SpecGroup[], key: string): TaskNode | undefined {
  const match = /^(?:a-)?t-(\d+)-(\d+)$/.exec(key);
  const group = match ? groups[Number(match[1])] : undefined;
  if (!match || !group) return undefined;

  const line = Number(match[2]);
  const among = (tasks: TaskNode[]): TaskNode | undefined => {
    for (const task of tasks) {
      const found = task.line === line ? task : among(task.subTasks);
      if (found) return found;
    }
    return undefined;
  };
  const under = (headings: HeadingNode[]): TaskNode | undefined => {
    for (const heading of headings) {
      const found = among(heading.tasks) ?? under(heading.children);
      if (found) return found;
    }
    return undefined;
  };

  return among(group.rootTasks) ?? under(group.headings);
}

/** The glyph a state draws with: its icon's, else its own character, else a dot. */
export function stateGlyph(state: StateDefinition): string {
  return GLYPH_BY_ICON[state.icon] ?? (state.char.trim() || '•');
}

/** Ids of everything that can collapse: every spec group and heading. */
export function collapsibleIds(groups: readonly SpecGroup[]): string[] {
  const ids: string[] = [];
  const visit = (heading: HeadingNode): void => {
    ids.push(heading.id);
    heading.children.forEach(visit);
  };

  for (const group of groups) {
    ids.push(group.id);
    group.headings.forEach(visit);
  }
  return ids;
}

function addHeading(rows: Row[], heading: HeadingNode, groupIndex: number, depth: number, options: RowOptions): void {
  const { totalCountable, completedCount } = heading.stats;
  const isComplete = totalCountable > 0 && completedCount === totalCountable;
  const isCollapsed = options.collapsed.has(heading.id);

  rows.push({
    kind: 'heading',
    key: `h-${groupIndex}-${heading.line}`,
    id: heading.id,
    depth,
    label: heading.label,
    line: heading.line,
    filePath: heading.filePath,
    count: countText(heading.stats, options, true),
    isCollapsed,
    isMilestone: isMilestoneHeading(heading.label, options.settings.milestoneKeywords),
    isComplete,
  });
  if (isCollapsed) return;

  for (const child of heading.children) {
    const childDone = child.stats.totalCountable > 0 && child.stats.completedCount === child.stats.totalCountable;
    if (options.hideCompleted && childDone) continue;
    addHeading(rows, child, groupIndex, depth + 1, options);
  }
  addTasks(rows, heading.tasks, groupIndex, depth + 1, options);
}

function addTasks(rows: Row[], tasks: TaskNode[], groupIndex: number, depth: number, options: RowOptions): void {
  for (const task of tasks) {
    if (options.hideCompleted && task.isCompleted) continue;

    const state = getState(options.template, task.char);
    rows.push({
      kind: 'task',
      key: `t-${groupIndex}-${task.line}`,
      id: task.id,
      depth,
      task,
      state,
      glyph: stateGlyph(state),
      color: state.color === undefined ? undefined : THEME_KEY_BY_COLOR[state.color],
      isStruck: state.strikethrough === true && options.settings.strikeThroughCompleted,
      isAnimated: state.animatedIcon !== undefined,
    });
    addTasks(rows, task.subTasks, groupIndex, depth + 1, options);
  }
}

function groupTitle(group: SpecGroup, options: RowOptions): string {
  // Recorded at parse time, since a plan's H1 is trimmed away with its other sections.
  if (options.settings.useH1AsGroupName && group.h1Label) return group.h1Label;
  return group.name;
}

function countText(stats: TaskStats, options: RowOptions, saysWhenEmpty: boolean): string {
  if (stats.totalCountable === 0) return saysWhenEmpty ? '(No tasks)' : '';
  return options.settings.showProgressCount ? `(${stats.completedCount}/${stats.totalCountable})` : '';
}
