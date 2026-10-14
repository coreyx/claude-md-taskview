import type { ClientModule } from 'claude-code';

const FRAMES = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
const FRAME_MS = 80;

/**
 * The in-progress spinner: one cell that steps through the frames on the
 * surface's own clock, so the pane's hook never redraws for it.
 *
 * A surface module, drawn where the pane puts a `Client` naming this file. It
 * has no `$`: a click on it is posted to the hooks module, which treats it as
 * a press on the task's row.
 *
 * @param props `color`, a theme key or raw colour for the glyph; absent, the default text colour.
 */
const Spinner: ClientModule<{ color?: string }, number> = (props, surface) => {
  const { Text } = surface.elements;

  // State is undefined only on the first call, which is when the timer and the listener are set up.
  if (surface.state === undefined) {
    surface.setState(0);
    surface.every(FRAME_MS, () => surface.setState(((surface.state ?? 0) + 1) % FRAMES.length));
    surface.onPointer((event) => {
      if (event.type === 'down') surface.post({ press: true });
    });
  }

  const frame = FRAMES[surface.state ?? 0] ?? '⠋';
  return props.color === undefined ? <Text>{frame}</Text> : <Text color={props.color}>{frame}</Text>;
};

export default Spinner;
