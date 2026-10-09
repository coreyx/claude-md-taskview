import { parseTasks } from '../core/parse';
import type { StateTemplate } from '../core/templates';
import { OBSIDIAN_TEMPLATE, STANDARD_TEMPLATE, parseJsonc, validateTemplate } from '../core/templates';
import type { SpecGroup } from '../core/types';
import { discover } from './discover';
import type { DiscoveredSpec, Disk } from './discover';
import type { Settings } from './settings';

/** How often the poll looks for new spec folders, in polls. Between those it only stats the known files. */
const REDISCOVER_EVERY = 10;

/**
 * What syncing needs from Claude Code. The hooks module builds one per event
 * as closures over `$`, because `$` itself may not cross an import.
 */
export interface Host extends Disk {
  read: (path: string) => Promise<string>;
  /** Writes the parsed groups to state, which redraws the pane. */
  setGroups: (groups: SpecGroup[]) => Promise<unknown>;
  /** Writes the error line to state; null clears it. */
  setError: (message: string | null) => Promise<unknown>;
  toast: (text: string) => void;
}

/**
 * What the module keeps between events. These are module variables, so a hot
 * reload starts them over; everything a drawing reads is in `$.state` instead.
 */
export interface Session {
  settings: Settings;
  template: StateTemplate;
  /** The task files as last read, with the modification times they had then. */
  specs: DiscoveredSpec[];
  polls: number;
  isPolling: boolean;
  /** The error last written to state, so an unchanged one does not redraw the pane. */
  shownError: string | null | undefined;
}

export function createSession(settings: Settings): Session {
  return { settings, template: STANDARD_TEMPLATE, specs: [], polls: 0, isPolling: false, shownError: undefined };
}

/**
 * Picks the session's state template from the settings, reading a custom one
 * from disk. An unreadable or invalid custom template falls back to Standard.
 */
export async function loadTemplate(host: Host, session: Session): Promise<void> {
  const { stateTemplate, customTemplatePath } = session.settings;
  session.template = STANDARD_TEMPLATE;

  if (stateTemplate === 'Obsidian Tasks') {
    session.template = OBSIDIAN_TEMPLATE;
  } else if (stateTemplate === 'Custom' && customTemplatePath !== '') {
    const custom = await host
      .read(customTemplatePath)
      .then((text) => validateTemplate(parseJsonc(text)))
      .catch(() => null);
    if (custom) {
      session.template = custom;
    } else {
      host.toast('Markdown Tasks: invalid custom template, using Standard (GFM)');
    }
  }
}

/**
 * Re-reads every task file and hands the parsed groups to the host. On a read
 * or parse error the previous groups stay and the error is shown instead.
 */
export async function refresh(host: Host, session: Session): Promise<void> {
  try {
    const specs = await discover(host, session.settings);
    const parsed: SpecGroup[] = [];
    for (const spec of specs) {
      const content = await host.read(spec.taskFilePath);
      parsed.push(parseTasks(content, spec.name, spec.taskFilePath, spec.folderPath, session.template));
    }

    session.specs = specs;
    await host.setGroups(parsed);
    await showError(host, session, null);
  } catch (failure) {
    await showError(host, session, `Could not read the task files: ${describe(failure)}`);
  }
}

/**
 * One tick of the live sync: refreshes only when a known task file's
 * modification time changed, or, every tenth tick, when discovery finds a
 * different set of spec folders. The mods API has no file watcher.
 */
export async function poll(host: Host, session: Session): Promise<void> {
  // A slow disk must not stack ticks up behind one another.
  if (session.isPolling) return;
  session.isPolling = true;

  try {
    session.polls += 1;
    const current =
      session.polls % REDISCOVER_EVERY === 0 ? await discover(host, session.settings) : await restat(host, session.specs);
    if (signature(current) !== signature(session.specs)) {
      await refresh(host, session);
    }
  } catch (failure) {
    await showError(host, session, `Could not check the task files: ${describe(failure)}`);
  } finally {
    session.isPolling = false;
  }
}

/** The known task files with their modification times now; a file that has gone is left out. */
async function restat(disk: Disk, specs: DiscoveredSpec[]): Promise<DiscoveredSpec[]> {
  const current: DiscoveredSpec[] = [];
  for (const spec of specs) {
    const stat = await disk.stat(spec.taskFilePath).catch(() => undefined);
    if (stat?.kind === 'file') {
      current.push({ ...spec, mtimeMs: stat.mtimeMs });
    }
  }
  return current;
}

function signature(specs: DiscoveredSpec[]): string {
  return specs.map((spec) => `${spec.taskFilePath}@${spec.mtimeMs}`).join('|');
}

async function showError(host: Host, session: Session, message: string | null): Promise<void> {
  if (session.shownError === message) return;
  session.shownError = message;
  await host.setError(message);
}

function describe(failure: unknown): string {
  return failure instanceof Error ? failure.message : String(failure);
}
