import type { ClientModule } from 'claude-code';

const FRAMES = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
// Slower than the 80 ms a terminal spinner usually runs at. The Desktop Code tab stops spinners that
// redraw too often in total: twenty at 80 ms failed there, twelve did not, and twenty at 160 ms did not.
// With MAX_SPINNERS in register.tsx this keeps a full pane at 100 redraws a second.
const FRAME_MS = 120;

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
