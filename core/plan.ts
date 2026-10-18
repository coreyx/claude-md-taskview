import type { HeadingNode, SpecGroup } from './types';

/** File name of a light-tier spec's plan, whose checklist lives under one section. */
export const PLAN_FILE_NAME = 'implementation_plan.md';

/** Heading of the plan section that holds its checklist. */
export const PLAN_TASK_SECTION = 'Proposed Changes';

/**
 * Whether a task file is an implementation plan, by its base name (case-insensitive).
 *
 * @param filePath The task file's path, with `/` or `\` separators.
 */
export function isPlanFile(filePath: string): boolean {
  return (filePath.split(/[\\/]/).at(-1) ?? '').toLowerCase() === PLAN_FILE_NAME;
}

/**
 * Narrows a parsed plan to its task section: the headings and tasks under its "Proposed Changes"
 * heading, without that heading itself, counted on their own. A plan without that heading keeps the
 * whole document. Either way, headings with no tasks at any depth are dropped, since a plan's other
 * sections are document scaffolding rather than dividers. The input is not modified.
 */
export function toPlanTaskSection(spec: SpecGroup): SpecGroup {
  const section = findSection(spec.headings);
  return {
    ...spec,
    headings: dropHeadingsWithoutTasks(section ? section.children : spec.headings),
    rootTasks: section ? section.tasks : spec.rootTasks,
    stats: { ...(section ? section.stats : spec.stats) },
  };
}

/** The first heading, depth-first in document order, whose label is the task section's. */
function findSection(headings: HeadingNode[]): HeadingNode | undefined {
  for (const heading of headings) {
    if (heading.label.trim().toLowerCase() === PLAN_TASK_SECTION.toLowerCase()) {
      return heading;
    }
    const nested = findSection(heading.children);
    if (nested) {
      return nested;
    }
  }
  return undefined;
}

/** Copies the headings that contain at least one task, recursively, leaving the originals untouched. */
function dropHeadingsWithoutTasks(headings: HeadingNode[]): HeadingNode[] {
  return headings
    .filter((heading) => heading.stats.totalCountable > 0)
    .map((heading) => ({ ...heading, children: dropHeadingsWithoutTasks(heading.children) }));
}
