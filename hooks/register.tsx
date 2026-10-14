import { atom, read, update } from 'claude-code';
import type { Elements, EngineInterface, Register, RenderElement, RenderSurface } from 'claude-code';

import { replaceStateChar } from '../core/mutate';
import { getNextState } from '../core/templates';
import type { SpecGroup, TaskNode } from '../core/types';
import type { SpecGroup as ContractSpecGroup } from '../types';
import { buildRows, collapsibleIds, findTask } from './rows';
import type { Row, TaskRow } from './rows';
import { readSettings } from './settings';
import { createSession, loadTemplate, poll, refresh } from './sync';
import type { Host, Session } from './sync';

// types/index.d.ts has to repeat core's types; this line stops compiling if one changes without the other.
type Same<A, B> = [A] extends [B] ? ([B] extends [A] ? true : never) : never;
export const contractMatchesCore: Same<SpecGroup, ContractSpecGroup> = true;

const PANE = 'md-tasks';
const COMMAND = 'md-tasks';
const POLL_MS = 1500;
/**
 * Columns a row moves right per level of nesting. The indent is padding on
 * the row's Box, never spaces in its text: the Desktop Code tab drops the
 * spaces a Button's content starts with, which flattened the tree there.
 */
const INDENT_COLUMNS = 2;
const OPEN_TIMEOUT_MS = 15000;
/**
 * How many spinners one drawing of the pane may hold; in-progress tasks past
 * that draw the static glyph. The Desktop Code tab stops every spinner once
 * too many redraw at once (see FRAME_MS in spinner.tsx).
 */
const MAX_SPINNERS = 12;
/** Columns the open control takes at the end of a row: a space and the arrow. */
const OPEN_WIDTH = 2;
// `cmd /c` re-reads its arguments as a command line, so a path holding one of these could run something else.
const CMD_UNSAFE = /[&|<>^%!"]/;

const groups = atom({ plugin: 'md-taskview', key: 'groups' } as const, []);
const collapsed = atom({ plugin: 'md-taskview', key: 'collapsed' } as const, []);
const hideCompleted = atom({ plugin: 'md-taskview', key: 'hideCompleted' } as const, false);
const error = atom({ plugin: 'md-taskview', key: 'error' } as const, null);
const focused = atom({ plugin: 'md-taskview', key: 'focused' } as const, null);

/** One styled run of text in a row. */
interface Part {
  text: string;
  color?: string;
  bold?: boolean;
  dimColor?: boolean;
  strikethrough?: boolean;
}

/** A row the person can press: styled text before and after a label. */
export interface Pressable {
  key: string;
  before: Part[];
  label: Part;
  after: Part[];
  onPress: () => void;
}

/** The slice of a surface's element table the rows are built from. */
export type RowElements = Pick<Elements[RenderSurface], 'Box' | 'Button' | 'Text'>;

/**
 * Draws a pressable row, as one plain Button holding styled Text where the
 * build allows it.
 *
 * Builds before 2.1.294 refuse Text inside a Button, throwing as the element
 * is made; the row then falls back to Text, a string-label Button and Text
 * side by side. A Button's own label cannot be struck through, so there a
 * struck label is only dimmed.
 *
 * @param el The surface's Box, Button and Text.
 * @param row What to draw.
 * @param nesting Remembers whether the rich form was refused, so a long list tries it once.
 */
export function drawPressable(el: RowElements, row: Pressable, nesting: { isRefused: boolean }): RenderElement {
  const { Box, Button, Text } = el;
  const text = (part: Part): RenderElement => {
    // Only the props a part sets are passed: a surface may refuse one given as undefined.
    const { text: content, ...style } = part;
    return <Text {...style}>{content}</Text>;
  };
  const before = row.before.filter((part) => part.text !== '').map(text);
  const after = row.after.filter((part) => part.text !== '').map(text);

  if (!nesting.isRefused) {
    try {
      return (
        <Button key={row.key} plain onPress={row.onPress}>
          {before}
          {text(row.label)}
          {after}
        </Button>
      );
    } catch {
      nesting.isRefused = true;
    }
  }

  return (
    <Box>
      {before}
      <Button key={row.key} plain dimColor={row.label.dimColor === true} label={row.label.text} onPress={row.onPress} />
      {after}
    </Box>
  );
}

/** What the module keeps between events, beside the sync session. */
interface Mod {
  session: Session;
  /** True once `/md-tasks` registered as this mod's; until then a command of that name is someone else's. */
  hasCommand: boolean;
  /** The `$.store` key this folder's view is saved under. */
  viewKey: string;
  /** Per surface, whether the build refused Text inside a Button. */
  nestingBySurface: Map<string, { isRefused: boolean }>;
  /** Surfaces where the spinner's `Client` threw as it was made or failed once drawn; they get the static glyph from then on. */
  spinnerRefused: Set<string>;
}

// Claude Code follows `$` only into functions declared at the top of this
// file, never into a closure or across an import. So everything that takes
// `$` is declared here, and the files under hooks/ get closures instead.

/** What hooks/sync.ts and hooks/discover.ts need from Claude Code, as closures over `$`. */
function hostOf($: EngineInterface): Host {
  return {
    list: (path) => $.fs.list(path),
    stat: (path) => $.fs.stat(path),
    read: async (path) => {
      // `$.fs.read` also has a bytes form, which this mod never asks for.
      const content = await $.fs.read(path);
      return typeof content === 'string' ? content : '';
    },
    setGroups: (parsed) => update($, groups, () => parsed),
    setError: (message) => update($, error, () => message),
    toast: (text) => $.ui.toast(text),
  };
}

/**
 * Whether the in-progress spinner may turn: the mod's own setting is on and
 * Claude Code's `prefersReducedMotion` is not. The counterpart of the
 * extension's check of VS Code's `accessibility.reducedMotion`.
 */
async function isMotionAllowed($: EngineInterface, mod: Mod): Promise<boolean> {
  if (!mod.session.settings.animateTaskIcons) return false;

  // A settings read that fails says nothing about motion, so the spinner stays.
  const settings = await $.settings.read().catch(() => undefined);
  return settings?.prefersReducedMotion !== true;
}

/** Loads what a folder's pane was left showing: its collapsed rows and the completed filter. */
async function restoreView($: EngineInterface, mod: Mod, cwd: string): Promise<void> {
  mod.viewKey = `view:${cwd}`;
  const saved = ((await $.store.get(mod.viewKey)) ?? {}) as { collapsed?: unknown; hideCompleted?: unknown };
  const ids = Array.isArray(saved.collapsed) ? saved.collapsed.filter((id) => typeof id === 'string') : [];
  const isHidden =
    typeof saved.hideCompleted === 'boolean' ? saved.hideCompleted : mod.session.settings.hideCompletedByDefault;

  await update($, collapsed, () => ids);
  await update($, hideCompleted, () => isHidden);
}

async function saveView($: EngineInterface, mod: Mod): Promise<void> {
  await $.store.set(mod.viewKey, { collapsed: await read($, collapsed), hideCompleted: await read($, hideCompleted) });
}

async function setCollapsed($: EngineInterface, mod: Mod, change: (ids: string[]) => string[]): Promise<void> {
  await update($, collapsed, (ids) => change(ids));
  await saveView($, mod);
}

async function toggleHideCompleted($: EngineInterface, mod: Mod): Promise<void> {
  await update($, hideCompleted, (isHidden) => !isHidden);
  await saveView($, mod);
}

/**
 * Writes one task's new state character to its file.
 *
 * There is no editor buffer or undo: the file is re-read, the bracket is
 * checked against what the pane drew, and the whole file is written back.
 * When the bracket is no longer there the list is refreshed and nothing is
 * written.
 */
async function setTaskState($: EngineInterface, mod: Mod, task: TaskNode, nextChar: string): Promise<void> {
  const host = hostOf($);
  try {
    const content = await host.read(task.filePath);
    const changed = replaceStateChar(content, task.bracketRange, task.char, nextChar, task.rawText);
    if (changed === null) {
      await refresh(host, mod.session);
      $.ui.toast('Task moved on disk; list refreshed');
      return;
    }

    await $.fs.write(task.filePath, changed);
    await refresh(host, mod.session);
  } catch (failure) {
    $.ui.toast(`Markdown Tasks: could not update the task (${failure instanceof Error ? failure.message : failure})`);
  }
}

/**
 * Registers `/md-tasks`.
 *
 * Not `/tasks`: Claude Code has a command of that name, and registering it
 * again does not fail, it lists a second `/tasks` beside the built-in one.
 */
async function registerCommand($: EngineInterface, mod: Mod): Promise<void> {
  try {
    await $.command.register({
      name: COMMAND,
      description: 'Show the Markdown task tree of this folder in a pane',
      immediate: true,
    });
    mod.hasCommand = true;
  } catch (failure) {
    $.ui.log(`Markdown Tasks: /${COMMAND} could not be registered (${failure instanceof Error ? failure.message : failure})`);
  }
}

/**
 * Opens a task file at a line in VS Code, through its `code` command.
 *
 * `code` is tried by itself first. On Windows it is a script that some builds
 * cannot start without a shell, so `cmd /c code` is the fallback, and only
 * for a path `cmd` would not read as anything but a path.
 *
 * @param filePath The task file, relative to the session's working directory, which the command runs in.
 * @param line Zero-indexed line, as the parser counts.
 */
async function openSource($: EngineInterface, filePath: string, line: number): Promise<void> {
  const target = `${filePath}:${line + 1}`;
  const opens = (argv: string[]): Promise<boolean> =>
    $.process
      .run(argv, { timeoutMs: OPEN_TIMEOUT_MS })
      .then((ran) => ran.exitCode === 0)
      .catch(() => false);

  if (await opens(['code', '-g', target])) return;
  if (!CMD_UNSAFE.test(target) && (await opens(['cmd', '/c', 'code', '-g', target]))) return;

  $.ui.toast(`Markdown Tasks: could not open ${target} (is the VS Code "code" command on PATH?)`);
}

/** Answers the mod's command: opens the pane, and prints a line only when that failed. */
async function openPane($: EngineInterface, mod: Mod): Promise<{ text?: string }> {
  try {
    await refresh(hostOf($), mod.session);
    await $.ui.open({ id: PANE, title: 'Markdown Tasks', focus: true, closeOnEscape: true });
    return {};
  } catch (failure) {
    return { text: `Markdown Tasks: could not open the pane (${failure instanceof Error ? failure.message : failure})` };
  }
}

export const register: Register = (on, options) => {
  const mod: Mod = {
    session: createSession(readSettings(options)),
    hasCommand: false,
    viewKey: 'view',
    nestingBySurface: new Map(),
    spinnerRefused: new Set(),
  };
  const { session } = mod;

  // The mod's own work never fails a hook: a hook that throws is skipped, and these all sit on a chain.
  on('session.start', async ($, e, next) => {
    const host = hostOf($);
    await loadTemplate(host, session);
    await restoreView($, mod, e.cwd).catch(() => undefined);
    await refresh(host, session);
    $.clock.every(POLL_MS, () => void poll(host, session));
    // Last, so a name clash cannot keep the rest from being set up.
    await registerCommand($, mod);

    return next(e);
  });

  // /clear, /resume and a fork reset $.state without a session.start.
  on('classic.SessionStart', { source: ['clear', 'resume', 'fork'] }, async ($, e, next) => {
    await restoreView($, mod, e.cwd).catch(() => undefined);
    await refresh(hostOf($), session);

    return next(e);
  });

  on('command.run', { command: COMMAND }, async ($, e, next) => {
    // If the name could not be registered, a command called this is not the mod's to answer.
    if (!mod.hasCommand) return next(e);

    return openPane($, mod);
  });

  // Claude's own edit to a task file shows at once, not at the next poll.
  on('tool.call', { tool: ['Edit', 'Write'] }, async ($, e, next) => {
    const ran = await next(e);
    const fileName = e.file_path.replace(/\\/g, '/').split('/').at(-1) ?? '';
    if (fileName.toLowerCase() === session.settings.taskFileName.toLowerCase()) {
      await refresh(hostOf($), session).catch(() => undefined);
    }

    return ran;
  });

  // The state picker follows the focus ring, which only this event reports.
  on('ui.focus', { requestId: PANE }, async ($, e, next) => {
    const moved = await next(e);
    const key = e.element;
    const isPicker = key !== undefined && key.startsWith('s-');
    if (session.template.states.length > 2 && !isPicker) {
      const taskKey = key !== undefined && key.startsWith('t-') ? key : null;
      const held = await read($, focused).catch(() => taskKey);
      if (held !== taskKey) {
        await update($, focused, () => taskKey).catch(() => undefined);
      }
    }

    return moved;
  });

  // A spinner sits beside its row's Button, not inside it, so a click on the glyph arrives here instead.
  on('ui.message', { requestId: PANE }, async ($, e, next) => {
    const heard = await next(e);
    const isPress = typeof e.data === 'object' && e.data !== null && (e.data as { press?: unknown }).press === true;
    const task = isPress ? findTask(await read($, groups).catch(() => []), e.element) : undefined;
    if (task) {
      await setTaskState($, mod, task, getNextState(session.template, task.char).char);
    }

    return heard;
  });

  // A surface reports a spinner that failed there (in the Desktop Code tab, twenty at once did, and
  // each drew as a stray glyph). That surface gets the static glyph from then on; the engine redraws
  // the pane by itself after a fault, so nothing more is asked for here.
  on('ui.fault', { requestId: PANE }, async ($, e, next) => {
    mod.spinnerRefused.add(e.surface);

    return next(e);
  });

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const el = $.ui.resolve(e);
    const { Box, Button, Text } = el;
    const Select = 'Select' in el ? el.Select : undefined;
    // Asked by surface, not by `'Client' in el`: a table is completed with the elements its surface
    // lacks, and those draw nothing, so a spinner would vanish there instead of falling back.
    const hasClient = e.surface === 'terminal' || e.surface === 'desktop';
    const Client = hasClient && 'Client' in el && !mod.spinnerRefused.has(e.surface) ? el.Client : undefined;
    const isSpinning = Client !== undefined && (await isMotionAllowed($, mod));

    const list = await read($, groups);
    const collapsedIds = await read($, collapsed);
    const isHiding = await read($, hideCompleted);
    const failure = await read($, error);
    const focusedKey = await read($, focused);

    const { settings, template } = session;
    const rows = buildRows(list, { collapsed: new Set(collapsedIds), hideCompleted: isHiding, template, settings });
    const columns = Math.max(20, e.props.bodyColumns);
    const nesting = mod.nestingBySurface.get(e.surface) ?? { isRefused: false };
    mod.nestingBySurface.set(e.surface, nesting);

    /** Shortens a label so its row stays on one line of the pane. */
    const fit = (label: string, used: number): string => {
      const room = Math.max(8, columns - used);
      return label.length > room ? `${label.slice(0, room - 1)}…` : label;
    };

    /** Indents a row and adds the jump-to-source control after it; pressing the row itself still toggles it. */
    const withOpen = (
      rowElement: RenderElement,
      key: string,
      filePath: string,
      line: number,
      indent: number,
    ): RenderElement => (
      <Box paddingLeft={indent}>
        {rowElement}
        <Text> </Text>
        <Button key={`o-${key}`} plain dimColor label="↗" onPress={() => void openSource($, filePath, line)} />
      </Box>
    );

    let spinnersDrawn = 0;

    /**
     * Draws a task row with the spinner for its glyph. A `Client` cannot sit
     * inside a Button, so the row is the spinner and then the label as the
     * Button; the spinner posts its own clicks (see the `ui.message` hook).
     *
     * @returns The row; or undefined when the pane already holds MAX_SPINNERS, or this build threw on the `Client`, which is then not tried again here.
     */
    const drawSpinning = (row: TaskRow, indent: number, onPress: () => void): RenderElement | undefined => {
      if (Client === undefined || spinnersDrawn >= MAX_SPINNERS) return undefined;

      try {
        spinnersDrawn += 1;
        return (
          <Box>
            <Client
              key={`a-${row.key}`}
              module="./spinner.tsx"
              props={row.color === undefined ? {} : { color: row.color }}
              width={1}
            />
            <Text> </Text>
            <Button
              key={row.key}
              plain
              dimColor={row.isStruck}
              label={fit(row.task.cleanText, indent + 2 + OPEN_WIDTH)}
              onPress={onPress}
            />
          </Box>
        );
      } catch {
        mod.spinnerRefused.add(e.surface);
        return undefined;
      }
    };

    const drawRow = (row: Row): RenderElement | RenderElement[] => {
      const indent = row.depth * INDENT_COLUMNS;

      if (row.kind === 'task') {
        const lead = `${row.glyph} `;
        const press = (): void => void setTaskState($, mod, row.task, getNextState(template, row.task.char).char);
        const rowElement = withOpen(
          (row.isAnimated && isSpinning && drawSpinning(row, indent, press)) ||
          drawPressable(
            el,
            {
              key: row.key,
              before: [{ text: lead, ...(row.color === undefined ? {} : { color: row.color }) }],
              label: {
                text: fit(row.task.cleanText, indent + lead.length + OPEN_WIDTH),
                ...(row.isStruck ? { strikethrough: true, dimColor: true } : {}),
              },
              after: [],
              onPress: press,
            },
            nesting,
          ),
          row.key,
          row.task.filePath,
          row.task.line,
          indent,
        );
        if (Select === undefined || template.states.length <= 2 || row.key !== focusedKey) return rowElement;

        // Replaces the extension's right-click "Set Task State" menu.
        return [
          rowElement,
          <Box paddingLeft={indent + lead.length}>
            <Select
              key={`s-${row.key}`}
              label="State"
              options={template.states.map((state, index) => ({
                value: String(index),
                label: `[${state.char}] ${state.label}`,
              }))}
              value={String(template.states.indexOf(row.state))}
              onSelect={(value) => {
                const picked = template.states[Number(value)];
                if (picked) void setTaskState($, mod, row.task, picked.char);
              }}
            />
          </Box>,
        ];
      }

      const chevron = row.isCollapsed ? '▸ ' : '▾ ';
      const flag = row.kind === 'heading' && row.isMilestone ? (row.isComplete ? '⚑ ' : '⚐ ') : '';
      const count = row.count === '' ? '' : ` ${row.count}`;
      const used = indent + chevron.length + flag.length + count.length + OPEN_WIDTH;

      const rowElement = drawPressable(
        el,
        {
          key: row.key,
          before: [
            { text: chevron },
            { text: flag, ...(row.kind === 'heading' && row.isComplete ? { color: 'success' } : {}) },
          ],
          label: { text: fit(row.kind === 'group' ? row.title : row.label, used), bold: row.kind === 'group' },
          after: [{ text: count, dimColor: true }],
          onPress: () =>
            void setCollapsed($, mod, (ids) =>
              ids.includes(row.id) ? ids.filter((id) => id !== row.id) : [...ids, row.id],
            ),
        },
        nesting,
      );

      // A group is the outermost level, so it has no indent to carry.
      return row.kind === 'heading' ? withOpen(rowElement, row.key, row.filePath, row.line, indent) : rowElement;
    };

    return (
      <Box flexDirection="column" width={columns}>
        <Box columnGap={2} flexWrap="wrap">
          <Button key="refresh" plain hotkey="r" label="Refresh" onPress={() => void refresh(hostOf($), session)} />
          <Button
            key="filter"
            plain
            hotkey="f"
            label={isHiding ? 'Show completed' : 'Hide completed'}
            onPress={() => void toggleHideCompleted($, mod)}
          />
          <Button key="expand" plain hotkey="e" label="Expand all" onPress={() => void setCollapsed($, mod, () => [])} />
          <Button
            key="collapse"
            plain
            hotkey="c"
            label="Collapse all"
            onPress={() => void setCollapsed($, mod, () => collapsibleIds(list))}
          />
        </Box>
        {failure !== null && <Text dimColor>{failure}</Text>}
        {list.length === 0 && failure === null && (
          <Text dimColor>
            No {settings.specPathPattern}/{settings.taskFileName} found in this folder.
          </Text>
        )}
        {rows.map(drawRow)}
      </Box>
    );
  });
};
