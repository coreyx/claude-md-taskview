import type { PluginOptions } from 'claude-code';

export type TemplateName = 'Standard (GFM)' | 'Obsidian Tasks' | 'Custom';

/** The mod's `userConfig` values, typed and with defaults filled in. */
export interface Settings {
  specPathPattern: string;
  taskFileName: string;
  stateTemplate: TemplateName;
  customTemplatePath: string;
  strikeThroughCompleted: boolean;
  animateTaskIcons: boolean;
  showProgressCount: boolean;
  hideCompletedByDefault: boolean;
  useH1AsGroupName: boolean;
  milestoneKeywords: string[];
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
    taskFileName: text('taskFileName', 'tasks.md'),
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
