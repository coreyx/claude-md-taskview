import type { On, RenderElement } from 'claude-code';
import { expect, mock, test } from 'claude-code/testing';
import type { Engine } from 'claude-code/testing';

import { foldersUpward } from './discover';
import { drawPressable, strikeThrough } from './register';
import type { RowElements } from './register';
import { readSettings, resolveTaskFileNames } from './settings';

const SURFACES = ['terminal', 'desktop'] as const;
const CWD = 'C:\\work';
const AUTH_PATH = 'spec/auth/tasks.md';

const AUTH = `# Milestone 1: Setup
- [x] **Scaffold** the project
- [ ] Write tests
## Details
- [x] Sub item
`;
const BILLING = `- [ ] Invoices
- [ ] Refunds
`;

const PANE = {
  title: 'Markdown Tasks',
  isFocused: true,
  bodyColumns: 60,
  placement: 'dock',
  scroll: { offset: 0, bodyRows: 40 },
  view: {},
} as const;

/** Where the session's shell is, and which files the session's permissions let Claude read outright. */
interface Shell {
  /** The session's working directory; the project root when left out. */
  cwd?: string;
  /** Answers a Read check for a path with `/` separators; every path is readable when left out. */
  isReadable?: (path: string) => boolean;
}

/**
 * Answers everything the mod asks of Claude Code from memory: a disk of
 * files with modification times, the store, the clock, and the commands and
 * toasts it raises, each recorded for the test to read.
 *
 * A file's key is its path relative to the project root, C:\work, or an
 * absolute path for a file outside it.
 */
function world(on: On, files: Record<string, string>, takenCommands: string[] = [], shell: Shell = {}) {
  const state = {
    files: { ...files },
    mtimes: Object.fromEntries(Object.keys(files).map((path) => [path, 1000])) as Record<string, number>,
    reads: [] as string[],
    /** Every path the mod handed `$.fs`, as the hook saw it. */
    asked: [] as string[],
    /** Every path the mod asked a Read permission check for. */
    checked: [] as string[],
    writes: [] as { path: string; text: string }[],
    toasts: [] as string[],
    commands: [] as string[],
    opened: [] as string[],
    store: {} as Record<string, unknown>,
    /** Claude Code's own settings, as `$.settings.read()` answers them. */
    settings: {} as Record<string, unknown>,
    clock: mock.clock(on, { now: 5000 }),
    /** Changes a file as another editor would: new text, newer modification time. */
    edit(path: string, text: string) {
      state.files[path] = text;
      state.mtimes[path] = (state.mtimes[path] ?? 1000) + 1000;
    },
  };

  // The mod anchors every path it asks for, so a path under C:\work maps to its relative key and any
  // other to itself. A path left relative would be read from this process's folder and found nowhere.
  const root = CWD.replace(/\\/g, '/');
  const isAbsoluteKey = (key: string) => /^[a-zA-Z]:\//.test(key);
  const relative = (asked: string): string => {
    const path = asked.replace(/\\/g, '/').replace(/\/+$/, '');
    if (path.toLowerCase() === root.toLowerCase()) return '';
    return path.toLowerCase().startsWith(`${root.toLowerCase()}/`) ? path.slice(root.length + 1) : path;
  };

  on('fs.list', (_$, e) => {
    state.asked.push(e.path);
    const folder = relative(e.path);
    const prefix = folder === '' ? '' : `${folder}/`;
    const names = new Map<string, 'file' | 'dir'>();
    for (const path of Object.keys(state.files)) {
      if (!path.startsWith(prefix) || (prefix === '' && isAbsoluteKey(path))) continue;
      const [name = '', ...deeper] = path.slice(prefix.length).split('/');
      names.set(name, deeper.length > 0 ? 'dir' : 'file');
    }
    return { value: [...names].map(([name, kind]) => ({ name, kind, size: 0, mtimeMs: 0, isLink: false })) };
  });
  on('fs.stat', (_$, e) => {
    state.asked.push(e.path);
    const path = relative(e.path);
    const text = state.files[path];
    if (text === undefined) return { deny: `ENOENT: ${e.path}` };
    return { value: { kind: 'file' as const, size: text.length, mtimeMs: state.mtimes[path] ?? 0, isLink: false } };
  });
  on('fs.read', (_$, e) => {
    state.asked.push(e.path);
    const path = relative(e.path);
    const text = state.files[path];
    if (text === undefined) return { deny: `ENOENT: ${e.path}` };
    state.reads.push(path);
    return { value: text };
  });
  on('fs.write', (_$, e) => {
    state.asked.push(e.path);
    const path = relative(e.path);
    state.writes.push({ path, text: e.text });
    state.edit(path, e.text);
    return { value: undefined };
  });
  on('store.get', (_$, e) => ({ value: state.store[e.key] }));
  on('store.set', (_$, e) => {
    state.store[e.key] = e.value;
    return { value: undefined };
  });
  on('command.register', (_$, e) => {
    if (takenCommands.includes(e.name)) return { deny: `/${e.name} is a built-in command` };
    state.commands.push(e.name);
    return { value: { command: e.name } };
  });
  on('command.run', (_$, e) => ({ text: `built-in /${e.command}` }));
  on('ui.open', (_$, e) => {
    state.opened.push(e.id);
    return { value: { isPlaced: true as const } };
  });
  on('ui.toast', (_$, e) => {
    state.toasts.push(e.text);
    return { value: undefined };
  });
  on('settings.read', () => ({ value: state.settings }));
  on('ui.log', () => ({ value: undefined }));
  on('ui.focus', () => ({}));
  on('session.start', (_$, e) => ({ cwd: e.cwd }));
  // The project root, which a shell `cd` does not move. Without it a relative path would be read from this process's folder.
  on('session.root', () => ({ value: CWD }));
  // The shell's folder, which a `cd` moves; without it the kit would answer with this process's folder.
  on('session.cwd', () => ({ value: shell.cwd ?? CWD }));
  on('tool.check', (_$, e) => {
    const path = String((e.input as { file_path?: unknown }).file_path ?? '').replace(/\\/g, '/');
    state.checked.push(path);
    return { decision: (shell.isReadable?.(path) ?? true) ? ('allow' as const) : ('ask' as const) };
  });
  on('classic.SessionStart', () => ({}));
  on('classic.DirectoryAdded', () => ({}));

  return state;
}

for (const surface of SURFACES) {
  // How a completed task's label reads: the terminal strikes it through with a Text style, the
  // Desktop Code tab ignores that style inside a Button, so there the characters carry the stroke.
  const done = (label: string) => (surface === 'terminal' ? label : strikeThrough(label));

  const start = async ($: Engine) => {
    await $.session.start({ cwd: CWD, surface, isInteractive: true });
    return $.ui.mount({ plugin: 'md-taskview', surface, component: 'Pane', requestId: 'md-tasks', props: PANE });
  };

  test(`${surface}: draws each spec folder as a group with its count`, async ($, on) => {
    const disk = world(on, { [AUTH_PATH]: AUTH, 'spec/billing/tasks.md': BILLING, 'spec/notes.md': 'not a spec' });
    const ui = await start($);

    expect((await ui.find({ key: 'r-g-0' }))?.text).toContain('auth (2/3)');
    expect((await ui.find({ key: 'r-g-1' }))?.text).toContain('billing (0/2)');
    expect((await ui.find({ key: 'r-h-0-0' }))?.text).toContain('Milestone 1: Setup (2/3)');
    // Bold markers are stripped by the copied parser, whose lookbehind patterns must run in this engine.
    expect((await ui.find({ key: 'r-t-0-1' }))?.text).toContain(done('Scaffold the project'));
    expect(disk.commands).toEqual(['md-tasks']);
    await ui.unmount();
  });

  test(`${surface}: rows are indented by padding, never by spaces a surface may drop`, async ($, on) => {
    world(on, { [AUTH_PATH]: AUTH });
    const ui = await start($);

    /** Padding of the innermost indented Box around the row showing `label`. */
    const indentOf = async (label: string) => {
      const boxes = (await ui.findAll({ type: 'Box', text: label })).filter(
        (box) => typeof box.props.paddingLeft === 'number',
      );
      return boxes.sort((a, b) => a.text.length - b.text.length)[0]?.props.paddingLeft;
    };

    // "# Milestone 1" holds two tasks and "## Details", which holds one more.
    expect(await indentOf('Milestone 1: Setup')).toBe(2);
    expect(await indentOf('Write tests')).toBe(4);
    expect(await indentOf('Details')).toBe(4);
    expect(await indentOf(done('Sub item'))).toBe(6);

    // The Desktop Code tab drops spaces at the start of a Button's content, so none may carry meaning.
    for (const button of await ui.findAll({ type: 'Button' })) {
      expect(button.text.startsWith(' ')).toBe(false);
    }
    await ui.unmount();
  });

  test(`${surface}: glyph colours sit where the surface draws them`, async ($, on) => {
    world(on, { [AUTH_PATH]: AUTH });
    const ui = await start($);

    const button = await ui.find({ type: 'Button', key: 't-0-1' });
    const glyph = await ui.find({ type: 'Text', text: '●' });
    expect(glyph?.props).toMatchObject({ color: 'success' });
    if (surface === 'terminal') {
      // One Button holding the styled Text: the terminal draws its colours.
      expect(button?.text).toContain('●');
    } else {
      // The Desktop Code tab ignores colour inside a Button, so the glyph is drawn beside it.
      expect(button?.props.label).toBe(done('Scaffold the project'));
      expect(button?.text).not.toContain('●');
    }
    await ui.unmount();
  });

  test(`${surface}: pressing a task changes one character on disk and redraws it done`, async ($, on) => {
    const disk = world(on, { [AUTH_PATH]: AUTH });
    const ui = await start($);

    await ui.press({ key: 't-0-2' });

    expect(disk.writes).toEqual([{ path: AUTH_PATH, text: AUTH.replace('- [ ] Write tests', '- [x] Write tests') }]);
    expect((await ui.find({ key: 'r-g-0' }))?.text).toContain('auth (3/3)');
    if (surface === 'terminal') {
      expect((await ui.find({ type: 'Text', text: 'Write tests' }))?.props).toMatchObject({ strikethrough: true, dimColor: true });
    } else {
      // The Desktop Code tab draws a Button's content as plain text, so the label is the Button's own,
      // struck in its characters and dimmed on the Button.
      expect((await ui.find({ type: 'Button', key: 't-0-2' }))?.props).toMatchObject({ label: done('Write tests'), dimColor: true });
    }
    // The milestone's flag fills once every task beneath it is done.
    expect((await ui.find({ type: 'Text', text: '⚑' }))?.props).toMatchObject({ color: 'success' });
    await ui.unmount();
  });

  test(`${surface}: pressing a heading hides its tasks and saves the collapse`, async ($, on) => {
    const disk = world(on, { [AUTH_PATH]: AUTH });
    const ui = await start($);

    await ui.press({ key: 'h-0-0' });

    expect(await ui.find({ key: 't-0-1' })).toBeUndefined();
    expect(await ui.find({ key: 'h-0-3' })).toBeUndefined();
    expect((await ui.find({ key: 'r-h-0-0' }))?.text).toContain('▸');
    expect(disk.store[`view:${CWD}`]).toEqual({ collapsed: [`${AUTH_PATH}#H0_L1`], hideCompleted: false });

    await ui.press({ key: 'h-0-0' });
    expect(await ui.find({ key: 't-0-1' })).toBeDefined();
    await ui.unmount();
  });

  test(`${surface}: "hide completed" removes done tasks and leaves the counts`, async ($, on) => {
    const disk = world(on, { [AUTH_PATH]: AUTH });
    const ui = await start($);

    await ui.press({ key: 'filter' });

    expect(await ui.find({ key: 't-0-1' })).toBeUndefined();
    expect(await ui.find({ key: 't-0-2' })).toBeDefined();
    // A nested heading whose tasks are all done goes too.
    expect(await ui.find({ key: 'h-0-3' })).toBeUndefined();
    expect((await ui.find({ key: 'r-g-0' }))?.text).toContain('auth (2/3)');
    expect((await ui.find({ key: 'filter' }))?.props).toMatchObject({ label: 'Show completed' });
    expect(disk.store[`view:${CWD}`]).toEqual({ collapsed: [], hideCompleted: true });
    await ui.unmount();
  });

  test(`${surface}: a poll re-reads a file only when its modification time changed`, async ($, on) => {
    const disk = world(on, { [AUTH_PATH]: AUTH });
    const ui = await start($);
    const readsAtStart = disk.reads.length;

    await disk.clock.advance(1500);
    expect(disk.reads.length).toBe(readsAtStart);

    disk.edit(AUTH_PATH, AUTH.replace('- [ ] Write tests', '- [x] Write tests'));
    await disk.clock.advance(1500);

    expect(disk.reads.length).toBe(readsAtStart + 1);
    expect((await ui.find({ key: 'r-g-0' }))?.text).toContain('auth (3/3)');
    await ui.unmount();
  });

  test(`${surface}: a task that moved on disk is not written, and the list refreshes`, async ($, on) => {
    const disk = world(on, { [AUTH_PATH]: AUTH });
    const ui = await start($);

    // Another editor inserts a line above; no poll has run, so the pane still holds the old positions.
    disk.edit(AUTH_PATH, `Intro\n${AUTH}`);
    await ui.press({ key: 't-0-2' });

    expect(disk.writes).toEqual([]);
    expect(disk.toasts).toEqual(['Task moved on disk; list refreshed']);
    expect((await ui.find({ key: 'r-t-0-3' }))?.text).toContain('Write tests');
    await ui.unmount();
  });

  test(`${surface}: the saved view comes back after /clear`, async ($, on) => {
    const disk = world(on, { [AUTH_PATH]: AUTH });
    disk.store[`view:${CWD}`] = { collapsed: [`${AUTH_PATH}#H0_L1`], hideCompleted: false };
    const ui = await start($);
    expect(await ui.find({ key: 't-0-1' })).toBeUndefined();

    await ui.press({ key: 'expand' });
    expect(await ui.find({ key: 't-0-1' })).toBeDefined();

    disk.store[`view:${CWD}`] = { collapsed: [AUTH_PATH], hideCompleted: false };
    await $.classic.SessionStart({ source: 'clear', cwd: CWD });
    expect(await ui.find({ key: 'h-0-0' })).toBeUndefined();
    expect((await ui.find({ key: 'r-g-0' }))?.text).toContain('▸');
    await ui.unmount();
  });

  test(`${surface}: says so when the folder holds no task files`, async ($, on) => {
    world(on, { 'README.md': 'nothing here' });
    const ui = await start($);

    expect(
      await ui.find({ type: 'Text', text: 'No spec/*/tasks.md or spec/*/implementation_plan.md found in this folder.' }),
    ).toBeDefined();
    await ui.unmount();
  });

  test(
    `${surface}: a control at the end of a task row opens a picker of every state`,
    { options: { stateTemplate: 'Obsidian Tasks' } },
    async ($, on) => {
      const disk = world(on, { [AUTH_PATH]: '- [/] Draft the plan\n- [-] Dropped idea\n' });
      const ui = await start($);

      // Pressing the row still cycles through the template: in progress -> done.
      expect(await ui.find({ type: 'Client', key: 'a-t-0-0' })).toBeDefined();
      await ui.press({ key: 't-0-0' });
      expect(disk.files[AUTH_PATH]).toBe('- [x] Draft the plan\n- [-] Dropped idea\n');

      /** Keys of the state buttons the picker shows; none while it is closed. */
      const stateButtons = async () =>
        (await ui.findAll({ type: 'Button' })).map((button) => button.key ?? '').filter((key) => key.startsWith('s-'));

      // The picker is closed until asked for, and opening it changes nothing on disk.
      expect(await stateButtons()).toEqual([]);
      expect((await ui.find({ key: 'p-t-0-1' }))?.props).toMatchObject({ label: '▾' });
      await ui.press({ key: 'p-t-0-1' });
      expect(await stateButtons()).toEqual(['s-t-0-1-0', 's-t-0-1-1', 's-t-0-1-2', 's-t-0-1-3', 's-t-0-1-4', 's-t-0-1-5']);
      // The task's current state is the marked one.
      expect((await ui.find({ key: 's-t-0-1-3' }))?.props).toMatchObject({ label: '⊘ Cancelled', variant: 'primary' });
      expect((await ui.find({ key: 's-t-0-1-5' }))?.props.variant).toBeUndefined();
      expect((await ui.find({ key: 'p-t-0-1' }))?.props).toMatchObject({ label: '▴' });
      expect(disk.writes).toHaveLength(1);

      // One picker at a time: opening another row's closes this one.
      await ui.press({ key: 'p-t-0-0' });
      expect((await stateButtons()).every((key) => key.startsWith('s-t-0-0-'))).toBe(true);
      await ui.press({ key: 'p-t-0-1' });

      // A pick, by a plain press that the terminal's mouse reaches too, writes the state and closes the picker.
      await ui.press({ key: 's-t-0-1-5' });
      expect(disk.files[AUTH_PATH]).toBe('- [x] Draft the plan\n- [!] Dropped idea\n');
      expect(await stateButtons()).toEqual([]);

      // Pressing the control again closes it without a pick.
      await ui.press({ key: 'p-t-0-0' });
      await ui.press({ key: 'p-t-0-0' });
      expect(await stateButtons()).toEqual([]);
      expect(disk.writes).toHaveLength(2);
      await ui.unmount();
    },
  );

  test(`${surface}: a two-state template has no picker control`, async ($, on) => {
    world(on, { [AUTH_PATH]: AUTH });
    const ui = await start($);

    expect((await ui.findAll({ type: 'Button' })).filter((button) => button.key?.startsWith('p-'))).toEqual([]);
    // Jump-to-source is still there.
    expect(await ui.find({ key: 'o-t-0-1' })).toBeDefined();
    await ui.unmount();
  });
}

test("Claude's own edit to a task file shows without waiting for a poll", async ($, on) => {
  const disk = world(on, { [AUTH_PATH]: AUTH });
  // Stands for the Edit tool: the file changes on disk as the call is answered.
  on('tool.call', { tool: 'Edit' }, () => {
    disk.edit(AUTH_PATH, AUTH.replace('- [ ] Write tests', '- [x] Write tests'));
    return { result: {}, text: 'edited' };
  });
  await $.session.start({ cwd: CWD, surface: 'terminal', isInteractive: true });
  const ui = await $.ui.mount({
    plugin: 'md-taskview',
    surface: 'terminal',
    component: 'Pane',
    requestId: 'md-tasks',
    props: PANE,
  });

  await $.tool.call({
    tool: 'Edit',
    file_path: `${CWD}\\spec\\auth\\tasks.md`,
    old_string: '- [ ] Write tests',
    new_string: '- [x] Write tests',
  });

  expect((await ui.find({ key: 'r-g-0' }))?.text).toContain('auth (3/3)');
  await ui.unmount();
});

test('every path is read from the project root, not a working directory a shell cd moved', async ($, on) => {
  // The test kit reads a relative path from its own process's folder, never C:\work, so it stands for a
  // working directory an agent's `cd spec/<name>` moved: there, before 0.4.1, `spec/*` named nothing.
  const disk = world(on, { [AUTH_PATH]: AUTH });
  await $.session.start({ cwd: CWD, surface: 'terminal', isInteractive: true });
  const ui = await $.ui.mount({ plugin: 'md-taskview', surface: 'terminal', component: 'Pane', requestId: 'md-tasks', props: PANE });

  await ui.press({ key: 't-0-2' });
  disk.edit(AUTH_PATH, AUTH);
  await disk.clock.advance(1500);
  await ui.press({ key: 'refresh' });

  const underRoot = (path: string) => path.replace(/\\/g, '/').toLowerCase().startsWith('c:/work/');
  expect(disk.asked.length).toBeGreaterThan(0);
  expect(disk.asked.filter((path) => !underRoot(path))).toEqual([]);
  expect(disk.writes.map((write) => write.path)).toEqual([AUTH_PATH]);
  expect((await ui.find({ key: 'r-g-0' }))?.text).toContain('auth (2/3)');
  await ui.unmount();
});

test("folders are walked upward to the project root, skipping tool folders", () => {
  expect(foldersUpward('C:\\other\\packages\\app', 'C:\\work')).toEqual([
    'C:/other/packages/app',
    'C:/other/packages',
    'C:/other',
  ]);
  expect(foldersUpward('C:\\work', 'C:\\work')).toEqual([]);
  // Below the root the walk stops at it, whatever the case of the drive path.
  expect(foldersUpward('c:\\Work\\spec\\auth\\', 'C:\\work')).toEqual(['c:/Work/spec/auth', 'c:/Work/spec']);
  // A package's own folders never stand for the project.
  expect(foldersUpward('C:\\other\\node_modules\\.pnpm\\x\\node_modules\\x', 'C:\\work')).toEqual(['C:/other']);
  expect(foldersUpward('/home/u/proj/src', '/srv/root')).toEqual(['/home/u/proj/src', '/home/u/proj', '/home/u']);
});

/** Where an agent's shell went: a subfolder of another repository, whose specs are at its top. */
const OTHER_SHELL = 'C:\\other\\packages\\app\\src';
const OTHER_PATH = 'C:/other/spec/gamma/tasks.md';

const openTerminal = async ($: Engine) => {
  await $.session.start({ cwd: CWD, surface: 'terminal', isInteractive: true });
  return $.ui.mount({ plugin: 'md-taskview', surface: 'terminal', component: 'Pane', requestId: 'md-tasks', props: PANE });
};

test("a project root without specs shows the nearest specs above the shell's folder", async ($, on) => {
  const disk = world(on, { 'README.md': 'no specs', [OTHER_PATH]: BILLING }, [], { cwd: OTHER_SHELL });
  const ui = await openTerminal($);

  expect((await ui.find({ key: 'r-g-0' }))?.text).toContain('gamma (0/2)');
  expect(await ui.find({ type: 'Text', text: "From other, where Claude is working" })).toBeDefined();
  // Shown only once a Read of it is allowed outright.
  expect(disk.checked).toContain(OTHER_PATH);

  await ui.press({ key: 't-0-0' });
  expect(disk.writes).toEqual([{ path: OTHER_PATH, text: BILLING.replace('- [ ] Invoices', '- [x] Invoices') }]);

  disk.edit(OTHER_PATH, '- [x] Invoices\n- [x] Refunds\n');
  await disk.clock.advance(1500);
  expect((await ui.find({ key: 'r-g-0' }))?.text).toContain('gamma (2/2)');
  await ui.unmount();
});

test("the project root's specs win over the shell's folder", async ($, on) => {
  const disk = world(on, { [AUTH_PATH]: AUTH, [OTHER_PATH]: BILLING }, [], { cwd: OTHER_SHELL });
  const ui = await openTerminal($);

  expect((await ui.find({ key: 'r-g-0' }))?.text).toContain('auth (2/3)');
  expect(await ui.find({ key: 'r-g-1' })).toBeUndefined();
  expect(await ui.find({ type: 'Text', text: "From other, where Claude is working" })).toBeUndefined();
  expect(disk.checked).toEqual([]);
  await ui.unmount();
});

test("a folder Claude may not read outright is not shown", async ($, on) => {
  const disk = world(on, { 'README.md': 'no specs', [OTHER_PATH]: BILLING }, [], {
    cwd: OTHER_SHELL,
    isReadable: (path) => !path.startsWith('C:/other/'),
  });
  const ui = await openTerminal($);

  expect(disk.checked).toContain(OTHER_PATH);
  expect(await ui.find({ key: 'r-g-0' })).toBeUndefined();
  expect(
    await ui.find({ type: 'Text', text: 'No spec/*/tasks.md or spec/*/implementation_plan.md found in this folder.' }),
  ).toBeDefined();
  await ui.unmount();
});

test(
  'with requireReadPermission off, the permission is not asked',
  { options: { requireReadPermission: false } },
  async ($, on) => {
    const disk = world(on, { 'README.md': 'no specs', [OTHER_PATH]: BILLING }, [], {
      cwd: OTHER_SHELL,
      isReadable: () => false,
    });
    const ui = await openTerminal($);

    expect((await ui.find({ key: 'r-g-0' }))?.text).toContain('gamma (0/2)');
    expect(disk.checked).toEqual([]);
    await ui.unmount();
  },
);

test(
  "with followShellFolder off, the pane keeps to the project root",
  { options: { followShellFolder: false } },
  async ($, on) => {
    const disk = world(on, { 'README.md': 'no specs', [OTHER_PATH]: BILLING }, [], { cwd: OTHER_SHELL });
    const ui = await openTerminal($);

    expect(await ui.find({ key: 'r-g-0' })).toBeUndefined();
    expect(disk.asked.filter((path) => path.replace(/\\/g, '/').startsWith('C:/other'))).toEqual([]);
    await ui.unmount();
  },
);

/** Stands for the Read tool: every read succeeds. */
const answerReads = (on: On) => on('tool.call', { tool: 'Read' }, () => ({ result: {}, text: 'read' }));

test('a file Claude reads in another folder shows that project\'s specs at once', async ($, on) => {
  const disk = world(on, { 'README.md': 'no specs', [OTHER_PATH]: BILLING });
  answerReads(on);
  const ui = await openTerminal($);
  expect(await ui.find({ key: 'r-g-0' })).toBeUndefined();

  // The shell is still at the project root, as after a restart; only the file read says where Claude works.
  await $.tool.call({ tool: 'Read', file_path: 'C:\\other\\packages\\app\\src\\index.ts' });

  expect((await ui.find({ key: 'r-g-0' }))?.text).toContain('gamma (0/2)');
  expect(await ui.find({ type: 'Text', text: 'From other, where Claude is working' })).toBeDefined();
  expect(disk.checked).toContain(OTHER_PATH);
  await ui.unmount();
});

test('a folder added with /add-dir shows its specs at once', async ($, on) => {
  world(on, { 'README.md': 'no specs', [OTHER_PATH]: BILLING });
  const ui = await openTerminal($);

  await $.classic.DirectoryAdded({ directory: 'C:\\other', source: 'slash_command' });

  expect((await ui.find({ key: 'r-g-0' }))?.text).toContain('gamma (0/2)');
  await ui.unmount();
});

test('a working folder the settings keep shows from the start', async ($, on) => {
  const disk = world(on, { 'README.md': 'no specs', [OTHER_PATH]: BILLING });
  disk.settings.permissions = { additionalDirectories: ['C:\\other', '~/elsewhere'] };
  const ui = await openTerminal($);

  expect((await ui.find({ key: 'r-g-0' }))?.text).toContain('gamma (0/2)');
  await ui.unmount();
});

test("the shell's folder comes before a folder Claude read in, and the root before both", async ($, on) => {
  const third = 'C:/third/spec/delta/tasks.md';
  const disk = world(on, { 'README.md': 'no specs', [OTHER_PATH]: BILLING, [third]: '- [ ] One\n' }, [], {
    cwd: 'C:\\third\\src',
  });
  answerReads(on);
  const ui = await openTerminal($);

  await $.tool.call({ tool: 'Read', file_path: 'C:\\other\\README.md' });
  expect((await ui.find({ key: 'r-g-0' }))?.text).toContain('delta (0/1)');

  // Once the root has specs of its own, they win.
  disk.files[AUTH_PATH] = AUTH;
  disk.mtimes[AUTH_PATH] = 1000;
  await ui.press({ key: 'refresh' });
  expect((await ui.find({ key: 'r-g-0' }))?.text).toContain('auth (2/3)');
  expect(await ui.find({ type: 'Text', text: 'From third, where Claude is working' })).toBeUndefined();
  await ui.unmount();
});

test('a project Claude may not read gives way to the next place Claude works', async ($, on) => {
  const third = 'C:/third/spec/delta/tasks.md';
  world(on, { 'README.md': 'no specs', [OTHER_PATH]: BILLING, [third]: '- [ ] One\n' }, [], {
    cwd: 'C:\\third\\src',
    isReadable: (path) => !path.startsWith('C:/third/'),
  });
  answerReads(on);
  const ui = await openTerminal($);

  await $.tool.call({ tool: 'Read', file_path: 'C:\\other\\README.md' });
  expect((await ui.find({ key: 'r-g-0' }))?.text).toContain('gamma (0/2)');
  await ui.unmount();
});

test(
  'with followWorkingFolders off, files Claude reads elsewhere change nothing',
  { options: { followWorkingFolders: false } },
  async ($, on) => {
    const disk = world(on, { 'README.md': 'no specs', [OTHER_PATH]: BILLING });
    disk.settings.permissions = { additionalDirectories: ['C:\\other'] };
    answerReads(on);
    const ui = await openTerminal($);

    await $.tool.call({ tool: 'Read', file_path: 'C:\\other\\packages\\app\\src\\index.ts' });
    expect(await ui.find({ key: 'r-g-0' })).toBeUndefined();
    await ui.unmount();
  },
);

for (const surface of SURFACES) {
  test(`${surface}: the open control runs "code -g" at the row's line and leaves the task alone`, async ($, on) => {
    const disk = world(on, { [AUTH_PATH]: AUTH });
    const ran: string[][] = [];
    const ranIn: (string | undefined)[] = [];
    on('process.run', (_$, e) => {
      ran.push([...e.argv]);
      ranIn.push(e.init?.cwd);
      return { value: { exitCode: 0, stdout: '', stderr: '', isStdoutTruncated: false, isStderrTruncated: false } };
    });
    await $.session.start({ cwd: CWD, surface, isInteractive: true });
    const ui = await $.ui.mount({ plugin: 'md-taskview', surface, component: 'Pane', requestId: 'md-tasks', props: PANE });

    await ui.press({ key: 'o-t-0-2' });
    await ui.press({ key: 'o-h-0-3' });

    // Lines are one-based for the editor; the parser counts from zero.
    expect(ran).toEqual([
      ['code', '-g', `${AUTH_PATH}:3`],
      ['code', '-g', `${AUTH_PATH}:4`],
    ]);
    // The path is relative to the project root, so that is where it runs, wherever the shell has moved to.
    expect(ranIn).toEqual([CWD, CWD]);
    expect(disk.writes).toEqual([]);
    expect(await ui.find({ key: 'o-g-0' })).toBeUndefined();
    await ui.unmount();
  });
}

test('opening falls back to "cmd /c code", but never for a path cmd could misread', async ($, on) => {
  const risky = 'spec/a&b/tasks.md';
  const disk = world(on, { [AUTH_PATH]: AUTH, [risky]: BILLING });
  const ran: string[][] = [];
  on('process.run', (_$, e) => {
    ran.push([...e.argv]);
    // As a build that cannot start the `code` script without a shell.
    if (e.argv[0] === 'code') return { deny: 'spawn code ENOENT' };
    return { value: { exitCode: 0, stdout: '', stderr: '', isStdoutTruncated: false, isStderrTruncated: false } };
  });
  await $.session.start({ cwd: CWD, surface: 'terminal', isInteractive: true });
  const ui = await $.ui.mount({
    plugin: 'md-taskview',
    surface: 'terminal',
    component: 'Pane',
    requestId: 'md-tasks',
    props: PANE,
  });

  // Groups sort by name: "a&b" is g-0, "auth" is g-1.
  await ui.press({ key: 'o-t-1-2' });
  expect(ran).toEqual([
    ['code', '-g', `${AUTH_PATH}:3`],
    ['cmd', '/c', 'code', '-g', `${AUTH_PATH}:3`],
  ]);
  expect(disk.toasts).toEqual([]);

  ran.length = 0;
  await ui.press({ key: 'o-t-0-0' });
  expect(ran).toEqual([['code', '-g', `${risky}:1`]]);
  expect(disk.toasts.length).toBe(1);
  expect(disk.toasts[0]).toContain(`could not open ${risky}:1`);
  await ui.unmount();
});

const CYCLE = '- [ ] Draft the plan\n- [/] Build it\n- [x] Ship it\n';
const OBSIDIAN = { options: { stateTemplate: 'Obsidian Tasks' } };

for (const surface of SURFACES) {
  const open = async ($: Engine) => {
    await $.session.start({ cwd: CWD, surface, isInteractive: true });
    return $.ui.mount({ plugin: 'md-taskview', surface, component: 'Pane', requestId: 'md-tasks', props: PANE });
  };

  test(`${surface}: an in-progress task draws a spinner that turns, beside a pressable label`, OBSIDIAN, async ($, on) => {
    world(on, { [AUTH_PATH]: CYCLE });
    const ui = await open($);

    const spinners = await ui.findAll({ type: 'Client' });
    expect(spinners.map((spinner) => spinner.key)).toEqual(['a-t-0-1']);
    // The engine rewrites `module` to the file's path under the plugin, so only its name is checked.
    expect(String(spinners[0]?.props.module)).toContain('spinner.tsx');
    expect(spinners[0]?.props).toMatchObject({ props: { color: 'suggestion' }, width: 1 });
    expect((await ui.find({ type: 'Button', key: 't-0-1' }))?.props).toMatchObject({ label: 'Build it' });

    expect((await ui.find({ type: 'Text', in: 'a-t-0-1' }))?.text).toBe('⠋');
    await ui.advance(120);
    expect((await ui.find({ type: 'Text', in: 'a-t-0-1' }))?.text).toBe('⠙');
    expect((await ui.find({ type: 'Text', in: 'a-t-0-1' }))?.props).toMatchObject({ color: 'suggestion' });
    await ui.unmount();
  });

  test(`${surface}: at most twelve spinners turn at once; the rest draw the static glyph`, OBSIDIAN, async ($, on) => {
    const lines = Array.from({ length: 14 }, (_, index) => `- [/] Task ${index + 1}`);
    world(on, { [AUTH_PATH]: `${lines.join('\n')}\n` });
    const ui = await open($);

    const spinners = await ui.findAll({ type: 'Client' });
    expect(spinners).toHaveLength(12);
    expect(spinners.at(-1)?.key).toBe('a-t-0-11');
    // The thirteenth is still an in-progress task, and still pressable.
    expect((await ui.find({ key: 'r-t-0-12' }))?.text).toContain('◐');
    expect((await ui.find({ key: 'r-t-0-12' }))?.text).toContain('Task 13');
    await ui.unmount();
  });

  test(`${surface}: the spinner gives way to the static glyph when animation is off`, async ($, on) => {
    world(on, { [AUTH_PATH]: CYCLE });
    const ui = await open($);

    // The Standard template has no in-progress state, so `[/]` is neither animated nor in progress there.
    expect(await ui.findAll({ type: 'Client' })).toEqual([]);
    await ui.unmount();
  });

  test(
    `${surface}: animateTaskIcons off draws the static in-progress glyph`,
    { options: { stateTemplate: 'Obsidian Tasks', animateTaskIcons: false } },
    async ($, on) => {
      world(on, { [AUTH_PATH]: CYCLE });
      const ui = await open($);

      expect(await ui.findAll({ type: 'Client' })).toEqual([]);
      expect((await ui.find({ key: 'r-t-0-1' }))?.text).toContain('◐');
      await ui.unmount();
    },
  );

  test(`${surface}: prefersReducedMotion draws the static in-progress glyph`, OBSIDIAN, async ($, on) => {
    const disk = world(on, { [AUTH_PATH]: CYCLE });
    disk.settings.prefersReducedMotion = true;
    const ui = await open($);

    expect(await ui.findAll({ type: 'Client' })).toEqual([]);
    expect((await ui.find({ key: 'r-t-0-1' }))?.text).toContain('◐');
    await ui.unmount();
  });

  test(`${surface}: Obsidian Tasks cycles not started, in progress, done`, OBSIDIAN, async ($, on) => {
    const disk = world(on, { [AUTH_PATH]: '- [ ] Draft the plan\n' });
    const ui = await open($);

    await ui.press({ key: 't-0-0' });
    expect(disk.files[AUTH_PATH]).toBe('- [/] Draft the plan\n');
    expect((await ui.findAll({ type: 'Client' })).map((spinner) => spinner.key)).toEqual(['a-t-0-0']);

    // The second press lands on the spinner row's label, which is the row's Button now.
    await ui.press({ key: 't-0-0' });
    expect(disk.files[AUTH_PATH]).toBe('- [x] Draft the plan\n');
    expect(await ui.findAll({ type: 'Client' })).toEqual([]);

    await ui.press({ key: 't-0-0' });
    expect(disk.files[AUTH_PATH]).toBe('- [ ] Draft the plan\n');
    await ui.unmount();
  });

  test(`${surface}: Standard (GFM) stays done and not done, and never writes [/]`, async ($, on) => {
    const disk = world(on, { [AUTH_PATH]: '- [ ] Draft the plan\n' });
    const ui = await open($);

    await ui.press({ key: 't-0-0' });
    expect(disk.files[AUTH_PATH]).toBe('- [x] Draft the plan\n');
    await ui.press({ key: 't-0-0' });
    expect(disk.files[AUTH_PATH]).toBe('- [ ] Draft the plan\n');
    expect(disk.writes.some((write) => write.text.includes('[/]'))).toBe(false);
    await ui.unmount();
  });

  test(`${surface}: a click on the spinner itself moves the task on`, OBSIDIAN, async ($, on) => {
    const disk = world(on, { [AUTH_PATH]: CYCLE });
    const ui = await open($);

    await ui.pointer({ type: 'down', x: 0, y: 0, button: 'left', in: 'a-t-0-1' });

    expect(disk.files[AUTH_PATH]).toBe('- [ ] Draft the plan\n- [x] Build it\n- [x] Ship it\n');
    await ui.unmount();
  });
}

// The fallback after a spinner fails on a surface (the `ui.fault` hook) has no test here: the kit raises
// that event only when a real surface module fails, and gives a test no call to raise it.

test('a surface with no Client element draws the static in-progress glyph', OBSIDIAN, async ($, on) => {
  world(on, { [AUTH_PATH]: CYCLE });
  await $.session.start({ cwd: CWD, surface: 'vscode', isInteractive: true });
  const ui = await $.ui.mount({
    plugin: 'md-taskview',
    surface: 'vscode',
    component: 'Pane',
    requestId: 'md-tasks',
    props: PANE,
  });

  expect(await ui.findAll({ type: 'Client' })).toEqual([]);
  expect((await ui.find({ key: 'r-t-0-1' }))?.text).toContain('◐');
  await ui.unmount();
});

test(
  'settings typed loosely at install still find the specs',
  { options: { specPathPattern: '/spec/*', milestoneKeywords: 'Milestone' } },
  async ($, on) => {
    world(on, { [AUTH_PATH]: AUTH });
    await $.session.start({ cwd: CWD, surface: 'terminal', isInteractive: true });
    const ui = await $.ui.mount({
      plugin: 'md-taskview',
      surface: 'terminal',
      component: 'Pane',
      requestId: 'md-tasks',
      props: PANE,
    });

    // A leading slash is not an absolute path here: the pattern is always relative to the working directory.
    expect((await ui.find({ key: 'r-g-0' }))?.text).toContain('auth (2/3)');
    expect((await ui.find({ key: 'r-h-0-0' }))?.text).toContain('⚐');
    await ui.unmount();
  },
);

test('milestoneKeywords defaults to Milestone only, and a configured list is kept', () => {
  expect(readSettings({}).milestoneKeywords).toEqual(['Milestone']);
  expect(readSettings({ milestoneKeywords: '' }).milestoneKeywords).toEqual(['Milestone']);
  expect(readSettings({ milestoneKeywords: 'Milestone, Release, , Beta' }).milestoneKeywords).toEqual([
    'Milestone',
    'Release',
    'Beta',
  ]);
});

test('task file names resolve as in the extension: the list, then the deprecated single name', () => {
  expect(resolveTaskFileNames('', '')).toEqual(['tasks.md', 'implementation_plan.md']);
  expect(resolveTaskFileNames(' , ', '')).toEqual(['tasks.md', 'implementation_plan.md']);
  expect(resolveTaskFileNames('tasks.md', 'todo.md')).toEqual(['tasks.md', 'todo.md']);
  // Trimmed, blanks dropped, and de-duplicated case-insensitively, keeping the first spelling.
  expect(resolveTaskFileNames(' A.md , a.MD ,, b.md', 'b.md')).toEqual(['A.md', 'b.md']);
  expect(readSettings({}).taskFileNames).toEqual(['tasks.md', 'implementation_plan.md']);
  expect(readSettings({ taskFileNames: 'tasks.md', taskFileName: '' }).taskFileNames).toEqual(['tasks.md']);
});

const PLAN_PATH = 'spec/auth/implementation_plan.md';
const PLAN = `# Auth plan
## Open Questions
- [ ] A stray question
## Proposed Changes
### Server
#### [NEW] \`src/limiter.ts\`
- [x] Write the limiter
- [ ] Test it
## Verification Plan
1. Run it.
`;

/** Every line the pane draws, joined: enough to say what is on it and what is not. */
const paneText = async (ui: { find: (query: { type: string }) => Promise<{ text: string } | undefined> }) =>
  (await ui.find({ type: 'Box' }))?.text ?? '';

test('a plan shows only its Proposed Changes, and a folder with both files gives a group for each', async ($, on) => {
  const disk = world(on, { [AUTH_PATH]: AUTH, [PLAN_PATH]: PLAN, 'spec/billing/implementation_plan.md': PLAN });
  await $.session.start({ cwd: CWD, surface: 'terminal', isInteractive: true });
  const ui = await $.ui.mount({ plugin: 'md-taskview', surface: 'terminal', component: 'Pane', requestId: 'md-tasks', props: PANE });

  // Sorted by name; the folder holding both files names each group after its file.
  expect((await ui.find({ key: 'r-g-0' }))?.text).toContain('auth (implementation_plan.md) (1/2)');
  expect((await ui.find({ key: 'r-g-1' }))?.text).toContain('auth (tasks.md) (2/3)');
  expect((await ui.find({ key: 'r-g-2' }))?.text).toContain('billing (1/2)');

  // The plan's top level is the area under Proposed Changes; its other sections are left out, and backticks are stripped.
  expect((await ui.find({ key: 'r-h-0-4' }))?.text).toContain('Server');
  expect((await ui.find({ key: 'r-h-0-5' }))?.text).toContain('[NEW] src/limiter.ts');
  const text = await paneText(ui);
  for (const absent of ['Auth plan', 'Open Questions', 'A stray question', 'Proposed Changes', 'Verification Plan']) {
    expect(text).not.toContain(absent);
  }

  // A press in a plan writes its one character, as in tasks.md.
  await ui.press({ key: 't-0-7' });
  expect(disk.writes).toEqual([{ path: PLAN_PATH, text: PLAN.replace('- [ ] Test it', '- [x] Test it') }]);
  expect((await ui.find({ key: 'r-g-0' }))?.text).toContain('(2/2)');
  await ui.unmount();
});

test(
  'useH1AsGroupName names a plan after its H1, though the H1 is not drawn',
  { options: { useH1AsGroupName: true } },
  async ($, on) => {
    world(on, { [PLAN_PATH]: PLAN });
    await $.session.start({ cwd: CWD, surface: 'terminal', isInteractive: true });
    const ui = await $.ui.mount({ plugin: 'md-taskview', surface: 'terminal', component: 'Pane', requestId: 'md-tasks', props: PANE });

    // The H1 is cut away with the plan's other sections, but still names the group.
    expect((await ui.find({ key: 'r-g-0' }))?.text).toContain('Auth plan (1/2)');
    await ui.unmount();
  },
);

test('task file names set to tasks.md alone leave plans out', { options: { taskFileNames: 'tasks.md' } }, async ($, on) => {
  world(on, { [AUTH_PATH]: AUTH, [PLAN_PATH]: PLAN });
  await $.session.start({ cwd: CWD, surface: 'terminal', isInteractive: true });
  const ui = await $.ui.mount({ plugin: 'md-taskview', surface: 'terminal', component: 'Pane', requestId: 'md-tasks', props: PANE });

  expect((await ui.find({ key: 'r-g-0' }))?.text).toContain('auth (2/3)');
  expect(await ui.find({ key: 'r-g-1' })).toBeUndefined();
  await ui.unmount();
});

// As the engine raises a command the person typed.
const typed = (command: string) => ({
  command,
  args: '',
  origin: { kind: 'composer' as const },
  presentation: { isFullscreen: true, columns: 120 },
});

test("registers /md-tasks only, and leaves Claude Code's own /tasks alone", async ($, on) => {
  const disk = world(on, { [AUTH_PATH]: AUTH });
  await $.session.start({ cwd: CWD, surface: 'terminal', isInteractive: true });

  expect(disk.commands).toEqual(['md-tasks']);
  expect(await $.command.run(typed('tasks'))).toMatchObject({ text: 'built-in /tasks' });
  expect(disk.opened).toEqual([]);

  expect(await $.command.run(typed('md-tasks'))).toEqual({});
  expect(disk.opened).toEqual(['md-tasks']);
});

test('does not answer /md-tasks when the name could not be registered', async ($, on) => {
  const disk = world(on, { [AUTH_PATH]: AUTH }, ['md-tasks']);
  await $.session.start({ cwd: CWD, surface: 'terminal', isInteractive: true });

  expect(disk.commands).toEqual([]);
  expect(await $.command.run(typed('md-tasks'))).toMatchObject({ text: 'built-in /md-tasks' });
  expect(disk.opened).toEqual([]);
});

test('a build that refuses Text inside a Button gets string-label rows', () => {
  // Stands in for Claude Code before 2.1.294, whose Button threw on anything but one string child.
  const made = (type: string) => (props: Record<string, unknown>) => ({ type, props }) as unknown as RenderElement;
  const old = {
    Box: made('Box'),
    Text: made('Text'),
    Button: (props: Record<string, unknown>) => {
      if (props.label === undefined && typeof props.children !== 'string') {
        throw new Error('JSX element <Button> needs a label: the label prop, or one string child');
      }
      return made('Button')(props);
    },
  } as unknown as RowElements;

  const nesting = { isRefused: false };
  const row = {
    key: 't-0-1',
    before: [{ text: '● ', color: 'success' }],
    label: { text: 'Done task', strikethrough: true, dimColor: true },
    after: [{ text: ' (1/1)', dimColor: true }],
    onPress: () => {},
  };

  const drawn = drawPressable(old, row, nesting) as unknown as { type: string; props: { children: unknown } };
  expect(nesting.isRefused).toBe(true);
  expect(drawn.type).toBe('Box');
  const children = (drawn.props.children as unknown[]).flat() as { type: string; props: Record<string, unknown> }[];
  expect(children.map((child) => child.type)).toEqual(['Text', 'Button', 'Text']);
  // The label can only be dimmed there: a Button's label takes no strikethrough.
  expect(children[1]?.props).toMatchObject({ key: 't-0-1', label: 'Done task', dimColor: true, plain: true });
});
