import { parseTasks } from '../core/parse';
import { isPlanFile, toPlanTaskSection } from '../core/plan';
import type { StateTemplate } from '../core/templates';
import { OBSIDIAN_TEMPLATE, STANDARD_TEMPLATE, parseJsonc, validateTemplate } from '../core/templates';
import type { SpecGroup } from '../core/types';
import { discover, pathKey } from './discover';
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
  /** The shell's folder and those above it, nearest first (see `foldersUpward`). */
  shellFolders: () => Promise<string[]>;
  /** A folder and those above it up to the project root, nearest first (see `foldersUpward`). */
  foldersUpward: (start: string) => Promise<string[]>;
  /** The working folders the settings keep for every session (`permissions.additionalDirectories`), absolute. */
  rememberedFolders: () => Promise<string[]>;
  /** Whether the session's permissions let Claude read a file outright, without asking anyone. */
  mayRead: (path: string) => Promise<boolean>;
  /** Writes the parsed groups to state, which redraws the pane. */
  setGroups: (groups: SpecGroup[]) => Promise<unknown>;
  /** Writes to state the folder the groups were found in, or null when it is the project root. */
  setSource: (folder: string | null) => Promise<unknown>;
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
  /**
   * Folders Claude has worked in this session, most recent first: those added
   * with `/add-dir` and those it read or edited a file in. A module variable,
   * not `$.state`, so a `/clear` keeps it, as Claude Code keeps the session's
   * working folders.
   */
  workingFolders: string[];
  /** Whether the last refresh found task files in the project root, which then wins over every other folder. */
  isFromRoot: boolean;
}

/** How many of the folders Claude worked in are remembered; the oldest is dropped past this. */
const MAX_WORKING_FOLDERS = 5;

export function createSession(settings: Settings): Session {
  return {
    settings,
    template: STANDARD_TEMPLATE,
    specs: [],
    polls: 0,
    isPolling: false,
    shownError: undefined,
    workingFolders: [],
    isFromRoot: false,
  };
}

/**
 * Notes a folder Claude has just worked in, moving it to the front of the
 * session's working folders.
 *
 * @returns Whether the most recent folder changed, so a refresh could show something new.
 */
export function noteWorkingFolder(session: Session, folder: string): boolean {
  const key = pathKey(folder);
  if (session.workingFolders[0] !== undefined && pathKey(session.workingFolders[0]) === key) return false;

  const rest = session.workingFolders.filter((known) => pathKey(known) !== key);
  session.workingFolders = [folder, ...rest].slice(0, MAX_WORKING_FOLDERS);
  return true;
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
 * The places to look from when the project root has no spec folders, each
 * as a walk from where Claude is working up to the root, in order of
 * preference: the shell's folder, then the folders Claude worked in this
 * session (most recent first), then those the settings keep.
 */
async function walksFrom(host: Host, session: Session): Promise<string[][]> {
  const { settings } = session;
  const walks: string[][] = [];
  if (settings.followShellFolder) walks.push(await host.shellFolders());
  if (settings.followWorkingFolders) {
    for (const start of [...session.workingFolders, ...(await host.rememberedFolders())]) {
      walks.push(await host.foldersUpward(start));
    }
  }
  return walks;
}

/**
 * Finds the task files to show: the project root's, or, when it has none,
 * those of the first place Claude is working that has spec folders (see
 * `walksFrom`). In each walk, the nearest folder with spec folders is the
 * project there. That covers an agent working in another repository, while
 * the session's root stays where it started.
 *
 * With `requireReadPermission` on, a file found that way is kept only when
 * the session's permissions let Claude read it outright: it is under one of
 * the session's working folders, or a permission rule allows it. A project
 * with none kept gives way to the next place.
 *
 * @returns The task files, and the folder they were found in when it is not the project root.
 */
export async function findSpecs(
  host: Host,
  session: Session
): Promise<{ specs: DiscoveredSpec[]; source: string | null }> {
  const { settings } = session;
  const atRoot = await discover(host, settings);
  if (atRoot.length > 0) return { specs: atRoot, source: null };

  const looked = new Set<string>();
  for (const walk of await walksFrom(host, session)) {
    for (const folder of walk) {
      // Walks run upward, so one that reaches a folder an earlier walk looked in has nothing new above it.
      if (looked.has(pathKey(folder))) break;
      looked.add(pathKey(folder));

      const found = await discover(host, settings, folder);
      if (found.length === 0) continue;

      const specs: DiscoveredSpec[] = [];
      for (const spec of found) {
        if (!settings.requireReadPermission || (await host.mayRead(spec.taskFilePath))) specs.push(spec);
      }
      if (specs.length > 0) return { specs, source: folder };
      // The folders above this project are other projects, so a project Claude may not read ends this walk.
      break;
    }
  }
  return { specs: atRoot, source: null };
}

/**
 * Re-reads every task file and hands the parsed groups to the host. On a read
 * or parse error the previous groups stay and the error is shown instead.
 */
export async function refresh(host: Host, session: Session): Promise<void> {
  try {
    const { specs, source } = await findSpecs(host, session);
    const parsed: SpecGroup[] = [];
    for (const spec of specs) {
      const content = await host.read(spec.taskFilePath);
      const group = parseTasks(content, spec.name, spec.taskFilePath, spec.folderPath, session.template);
      // A plan shows only its task section, as in the extension's tree.
      parsed.push(isPlanFile(spec.taskFilePath) ? toPlanTaskSection(group) : group);
    }

    session.specs = specs;
    session.isFromRoot = source === null && specs.length > 0;
    await host.setGroups(parsed);
    await host.setSource(source);
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
      session.polls % REDISCOVER_EVERY === 0
        ? (await findSpecs(host, session)).specs
        : await restat(host, session.specs);
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
