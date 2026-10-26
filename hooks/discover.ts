import type { FsEntry, FsStat } from 'claude-code';

import type { Settings } from './settings';

/**
 * The file calls discovery needs. Claude Code only follows `$` inside the
 * hooks module's own file, so the module hands these in as closures over
 * `$.fs` rather than passing `$` itself.
 */
export interface Disk {
  list: (path: string) => Promise<FsEntry[]>;
  stat: (path: string) => Promise<FsStat>;
}

/**
 * A spec folder that holds a task file. Paths use `/` separators and are
 * relative to the project root, or absolute when found from another folder.
 */
export interface DiscoveredSpec {
  name: string;
  folderPath: string;
  taskFilePath: string;
  mtimeMs: number;
}

const SKIPPED_FOLDERS = new Set(['node_modules', 'dist', '.git']);

/**
 * Finds every task file in the spec folders: each of the configured names, in
 * each folder.
 *
 * `$.fs` has no glob and `list` does not recurse, so the pattern is expanded
 * one path segment at a time: a segment with `*` lists the folders found so
 * far and keeps the names it matches, any other segment is appended as is.
 *
 * A folder holding more than one task file (both `tasks.md` and
 * `implementation_plan.md`, say) gives one group per file, each named
 * `<folder> (<file name>)` so they can be told apart, as in the extension.
 *
 * @param disk Lists a folder and stats a path.
 * @param settings Supplies `specPathPattern` and `taskFileNames`.
 * @param base The folder the pattern starts from: `.` for the project root, or an absolute folder, which the paths found then start with.
 * @returns The task files, sorted by name.
 */
export async function discover(
  disk: Disk,
  settings: Pick<Settings, 'specPathPattern' | 'taskFileNames'>,
  base = '.'
): Promise<DiscoveredSpec[]> {
  const segments = settings.specPathPattern
    .replace(/\\/g, '/')
    .split('/')
    .filter((segment) => segment !== '' && segment !== '.');

  let folders = [base];
  for (const segment of segments) {
    if (!segment.includes('*')) {
      folders = folders.map((folder) => join(folder, segment));
      continue;
    }

    const matches = segmentMatcher(segment);
    const expanded: string[] = [];
    for (const folder of folders) {
      // A folder named by the pattern but absent on disk is not an error: it holds no specs.
      const entries = await disk.list(folder).catch(() => []);
      for (const entry of entries) {
        if (entry.kind === 'dir' && !SKIPPED_FOLDERS.has(entry.name) && matches(entry.name)) {
          expanded.push(join(folder, entry.name));
        }
      }
    }
    folders = expanded;
  }

  const specs: DiscoveredSpec[] = [];
  for (const folder of folders) {
    const found: DiscoveredSpec[] = [];
    for (const fileName of settings.taskFileNames) {
      const taskFilePath = join(folder, fileName);
      const stat = await disk.stat(taskFilePath).catch(() => undefined);
      if (stat?.kind === 'file') {
        found.push({ name: baseName(folder), folderPath: folder, taskFilePath, mtimeMs: stat.mtimeMs });
      }
    }
    for (const spec of found) {
      specs.push(found.length > 1 ? { ...spec, name: `${spec.name} (${baseName(spec.taskFilePath)})` } : spec);
    }
  }

  return specs.sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * The folders to look in when the project root holds no spec folders: the
 * shell's folder and each folder above it, nearest first.
 *
 * An agent's shell wanders below the project it works on (into `packages/app/src`,
 * or deep into `node_modules`), so the project is the nearest of these with spec
 * folders, not the shell's folder itself. A walk that starts inside `node_modules`,
 * `.git` or `dist` starts above it, as those never hold a project's specs. It stops
 * at the project root, which was looked in already, and below the top of the drive.
 *
 * @param shell The session's working directory, which a shell `cd` moves.
 * @param root The session's project root, if known.
 * @returns Absolute folders with `/` separators; empty when the shell is at the root.
 */
export function shellFolders(shell: string, root: string | undefined): string[] {
  const parts = normalize(shell).split('/');
  const skipped = parts.findIndex((part) => SKIPPED_FOLDERS.has(part));
  let folder = (skipped === -1 ? parts : parts.slice(0, skipped)).join('/');
  const stop = root === undefined ? undefined : normalize(root);

  const folders: string[] = [];
  // A path with no separator after its first character is a drive or the top of the file system.
  while (folder.lastIndexOf('/') > 0) {
    if (stop !== undefined && isSamePath(folder, stop)) break;
    folders.push(folder);
    folder = folder.slice(0, folder.lastIndexOf('/'));
  }
  return folders;
}

function normalize(path: string): string {
  return path.replace(/\\/g, '/').replace(/\/+$/, '');
}

/** Compares two normalized paths, ignoring case on a Windows drive, where case does not tell paths apart. */
function isSamePath(a: string, b: string): boolean {
  return /^[a-zA-Z]:/.test(a) ? a.toLowerCase() === b.toLowerCase() : a === b;
}

/** Turns one pattern segment into a whole-name test; any run of `*` matches any characters. */
function segmentMatcher(segment: string): (name: string) => boolean {
  const source = segment
    .split(/\*+/)
    .map((literal) => literal.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    .join('.*');
  const pattern = new RegExp(`^${source}$`, 'i');
  return (name) => pattern.test(name);
}

function join(folder: string, name: string): string {
  return folder === '.' ? name : `${folder}/${name}`;
}

function baseName(folder: string): string {
  return folder.split('/').at(-1) ?? folder;
}
