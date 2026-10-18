import type { PluginOptions } from 'claude-code';

export type TemplateName = 'Standard (GFM)' | 'Obsidian Tasks' | 'Custom';

/** The mod's `userConfig` values, typed and with defaults filled in. */
export interface Settings {
  specPathPattern: string;
  /** The task file names looked for in each spec folder, in order, never empty. */
  taskFileNames: string[];
  stateTemplate: TemplateName;
  customTemplatePath: string;
  strikeThroughCompleted: boolean;
  animateTaskIcons: boolean;
  showProgressCount: boolean;
  hideCompletedByDefault: boolean;
  useH1AsGroupName: boolean;
  milestoneKeywords: string[];
}

export const DEFAULT_TASK_FILE_NAMES = ['tasks.md', 'implementation_plan.md'];

/**
 * The task file names to discover, as the extension resolves them: the
 * configured list, then the deprecated single `taskFileName` when it is set,
 * trimmed and de-duplicated case-insensitively, keeping the first spelling
 * seen. An empty result falls back to the defaults.
 *
 * @param list Comma-separated names, as the `taskFileNames` option holds them.
 * @param legacyName The deprecated `taskFileName` option, or empty.
 */
export function resolveTaskFileNames(list: string, legacyName: string): string[] {
  const resolved: string[] = [];
  const seen = new Set<string>();
  for (const raw of [...list.split(','), legacyName]) {
    const name = raw.trim();
    if (name !== '' && !seen.has(name.toLowerCase())) {
      seen.add(name.toLowerCase());
      resolved.push(name);
    }
  }
  return resolved.length > 0 ? resolved : [...DEFAULT_TASK_FILE_NAMES];
}

/**
 * Reads the options Claude Code hands `register` into typed settings.
 *
 * A value of the wrong type, or an empty path, falls back to the default the
 * manifest declares, so a hand-edited settings file cannot break the pane.
 *
 * @param options The `userConfig` values, as given to `register(on, options)`.
 */
export function readSettings(options: PluginOptions): Settings {
  const text = (key: string, fallback: string): string => {
    const value = options[key];
    return typeof value === 'string' && value.trim() !== '' ? value.trim() : fallback;
  };
  const flag = (key: string, fallback: boolean): boolean => {
    const value = options[key];
    return typeof value === 'boolean' ? value : fallback;
  };

  const template = text('stateTemplate', 'Standard (GFM)');

  return {
    specPathPattern: text('specPathPattern', 'spec/*'),
    taskFileNames: resolveTaskFileNames(text('taskFileNames', ''), text('taskFileName', '')),
    stateTemplate: template === 'Obsidian Tasks' || template === 'Custom' ? template : 'Standard (GFM)',
    customTemplatePath: text('customTemplatePath', ''),
    strikeThroughCompleted: flag('strikeThroughCompleted', true),
    animateTaskIcons: flag('animateTaskIcons', true),
    showProgressCount: flag('showProgressCount', true),
    hideCompletedByDefault: flag('hideCompletedByDefault', false),
    useH1AsGroupName: flag('useH1AsGroupName', false),
    milestoneKeywords: text('milestoneKeywords', 'Milestone')
      .split(',')
      .map((keyword) => keyword.trim())
      .filter((keyword) => keyword !== ''),
  };
}
