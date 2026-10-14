export interface BracketRange {
  line: number;            // Zero-indexed line in document
  openBracketCol: number;  // Column index of '['
  charCol: number;         // Column index of the character inside '[ ]'
  closeBracketCol: number; // Column index of ']'
}

export interface StateDefinition {
  char: string;
  id: string;
  label: string;
  icon: string;
  animatedIcon?: string;   // Shown instead of `icon` when motion is enabled (e.g. 'loading~spin')
  color?: string;
  strikethrough?: boolean;
  countsAsCompleted?: boolean;
  nextState?: string;
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
}

export type TaskTreeNode = SpecGroup | HeadingNode | TaskNode;
