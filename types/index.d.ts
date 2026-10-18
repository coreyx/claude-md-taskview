// The mod's state contract. Claude Code requires this file to be
// self-contained (no imports), so it repeats the task tree types of
// core/types.ts; hooks/state.ts fails to compile if the two drift apart.

export interface BracketRange {
  line: number;
  openBracketCol: number;
  charCol: number;
  closeBracketCol: number;
}

export interface TaskStats {
  totalCountable: number;
  completedCount: number;
  inProgressCount: number;
  cancelledCount: number;
}

export interface TaskNode {
  type: 'task';
  id: string;
  filePath: string;
  rawText: string;
  cleanText: string;
  char: string;
  bracketRange: BracketRange;
  line: number;
  indentation: number;
  subTasks: TaskNode[];
  isCompleted: boolean;
  parentHeadingId?: string;
}

export interface HeadingNode {
  type: 'heading';
  id: string;
  filePath: string;
  label: string;
  level: number;
  line: number;
  children: HeadingNode[];
  tasks: TaskNode[];
  stats: TaskStats;
}

export interface SpecGroup {
  type: 'specGroup';
  id: string;
  name: string;
  folderPath: string;
  taskFilePath: string;
  headings: HeadingNode[];
  rootTasks: TaskNode[];
  stats: TaskStats;
  /** First top-level '#' heading, kept for useH1AsGroupName after a plan's headings are trimmed. */
  h1Label?: string;
}

declare module 'claude-code' {
  interface PluginState {
    'md-taskview': {
      /** One parsed task file per spec folder, in the order drawn. */
      groups: SpecGroup[];
      /** Ids of the collapsed spec groups and headings. */
      collapsed: string[];
      hideCompleted: boolean;
      /** Why the last refresh failed, or null when it did not. */
      error: string | null;
      /** Element key of the task row whose state picker is open, or null when none is. */
      picker: string | null;
    };
  }
}
