import type { StateDefinition } from './types';

export interface StateTemplate {
  name: string;
  description: string;
  defaultState: string;
  states: StateDefinition[];
}

export const STANDARD_TEMPLATE: StateTemplate = {
  name: 'Standard (GFM)',
  description: 'Standard GitHub-Flavored Markdown checklist states',
  defaultState: ' ',
  states: [
    {
      char: ' ',
      id: 'pending',
      label: 'Not Started',
      icon: 'circle-large-outline',
      strikethrough: false,
      countsAsCompleted: false,
      nextState: 'x',
    },
    {
      char: 'x',
      id: 'done',
      label: 'Done',
      icon: 'pass-filled',
      color: 'charts.green',
      strikethrough: true,
      countsAsCompleted: true,
      nextState: ' ',
    },
  ],
};

export const OBSIDIAN_TEMPLATE: StateTemplate = {
  name: 'Obsidian Tasks',
  description: 'Obsidian Tasks plugin multi-state task conventions',
  defaultState: ' ',
  states: [
    {
      char: ' ',
      id: 'not_started',
      label: 'Not Started',
      icon: 'circle-large-outline',
      strikethrough: false,
      countsAsCompleted: false,
      nextState: '/',
    },
    {
      char: '/',
      id: 'in_progress',
      label: 'In Progress',
      icon: 'sync',
      color: 'charts.yellow',
      strikethrough: false,
      countsAsCompleted: false,
      nextState: 'x',
    },
    {
      char: 'x',
      id: 'done',
      label: 'Done',
      icon: 'pass-filled',
      color: 'charts.green',
      strikethrough: true,
      countsAsCompleted: true,
      nextState: ' ',
    },
    {
      char: '-',
      id: 'cancelled',
      label: 'Cancelled',
      icon: 'circle-slash',
      color: 'disabledForeground',
      strikethrough: true,
      countsAsCompleted: false,
      nextState: ' ',
    },
    {
      char: '?',
      id: 'clarification',
      label: 'Needs Clarification',
      icon: 'question',
      color: 'charts.purple',
      strikethrough: false,
      countsAsCompleted: false,
      nextState: ' ',
    },
    {
      char: '!',
      id: 'important',
      label: 'Important',
      icon: 'warning',
      color: 'charts.red',
      strikethrough: false,
      countsAsCompleted: false,
      nextState: ' ',
    },
  ],
};

/**
 * Returns the state a bracket character maps to in the template, matching
 * case-insensitively so `[X]` reads as `[x]`.
 *
 * @param template Active state template.
 * @param char Character found inside the checklist brackets.
 */
export function getState(template: StateTemplate, char: string): StateDefinition {
  const lower = char.toLowerCase();

  // Last match wins, as a later duplicate overwrote an earlier one in the upstream index.
  for (let index = template.states.length - 1; index >= 0; index--) {
    const state = template.states[index];
    if (state && state.char.toLowerCase() === lower) {
      return state;
    }
  }

  // Fallback for unmapped bracket character
  return {
    char,
    id: 'unknown',
    label: `Custom [${char}]`,
    icon: 'circle-small-filled',
    strikethrough: false,
    countsAsCompleted: false,
    nextState: template.defaultState,
  };
}

/**
 * Returns the state a task moves to when toggled.
 *
 * @param template Active state template.
 * @param char Character currently inside the checklist brackets.
 */
export function getNextState(template: StateTemplate, char: string): StateDefinition {
  const currentState = getState(template, char);
  const nextChar = currentState.nextState ?? template.defaultState;
  return getState(template, nextChar);
}

/**
 * Checks that a parsed custom template is usable and fills its optional
 * top-level fields.
 *
 * @param obj Value parsed from a `*.jsonc` template file.
 * @returns The template, or `null` when it has no usable `states`.
 */
export function validateTemplate(obj: unknown): StateTemplate | null {
  if (typeof obj !== 'object' || obj === null) return null;

  const candidate = obj as Partial<StateTemplate>;
  if (!Array.isArray(candidate.states) || candidate.states.length === 0) return null;

  for (const state of candidate.states as unknown[]) {
    if (typeof state !== 'object' || state === null) return null;
    const { char, id, label } = state as Partial<StateDefinition>;
    // One character per state: a toggle writes exactly one character between the brackets.
    if (typeof char !== 'string' || char.length !== 1) return null;
    if (typeof id !== 'string' || typeof label !== 'string') return null;
  }

  return {
    name: typeof candidate.name === 'string' ? candidate.name : 'Custom',
    description: typeof candidate.description === 'string' ? candidate.description : '',
    defaultState: typeof candidate.defaultState === 'string' ? candidate.defaultState : ' ',
    states: candidate.states,
  };
}

/**
 * Parses JSON with comments: strips `//` and block comments and trailing
 * commas outside strings, then hands the rest to `JSON.parse`.
 *
 * @param text Contents of a `*.jsonc` file.
 * @throws SyntaxError when what remains is not valid JSON.
 */
export function parseJsonc(text: string): unknown {
  let out = '';
  // A comma is held back, with the whitespace after it, until the next token shows whether it trails.
  let heldComma = '';
  let index = text.charCodeAt(0) === 0xfeff ? 1 : 0;

  while (index < text.length) {
    const ch = text[index] ?? '';
    const next = text[index + 1] ?? '';

    if (ch === '/' && next === '/') {
      while (index < text.length && text[index] !== '\n') index++;
      continue;
    }

    if (ch === '/' && next === '*') {
      const end = text.indexOf('*/', index + 2);
      index = end === -1 ? text.length : end + 2;
      continue;
    }

    if (heldComma) {
      if (/\s/.test(ch)) {
        heldComma += ch;
        index++;
        continue;
      }
      out += ch === '}' || ch === ']' ? heldComma.slice(1) : heldComma;
      heldComma = '';
    }

    if (ch === ',') {
      heldComma = ch;
      index++;
      continue;
    }

    if (ch === '"') {
      const start = index;
      index++;
      while (index < text.length && text[index] !== '"') {
        index += text[index] === '\\' ? 2 : 1;
      }
      index++;
      out += text.slice(start, index);
      continue;
    }

    out += ch;
    index++;
  }

  return JSON.parse(out + heldComma);
}
