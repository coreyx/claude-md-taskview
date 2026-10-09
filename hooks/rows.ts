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
      glyph: GLYPH_BY_ICON[state.icon] ?? (state.char.trim() || '•'),
      color: state.color === undefined ? undefined : THEME_KEY_BY_COLOR[state.color],
      isStruck: state.strikethrough === true && options.settings.strikeThroughCompleted,
    });
    addTasks(rows, task.subTasks, groupIndex, depth + 1, options);
  }
}

function groupTitle(group: SpecGroup, options: RowOptions): string {
  if (options.settings.useH1AsGroupName) {
    const firstH1 = group.headings.find((heading) => heading.level === 1);
    if (firstH1) return firstH1.label;
  }
  return group.name;
}

function countText(stats: TaskStats, options: RowOptions, saysWhenEmpty: boolean): string {
  if (stats.totalCountable === 0) return saysWhenEmpty ? '(No tasks)' : '';
  return options.settings.showProgressCount ? `(${stats.completedCount}/${stats.totalCountable})` : '';
}
