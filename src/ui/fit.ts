// Fit Parts: the entry other screens call to fit a car. Fitting now happens in the Mechanic Shop's service bay
// (src/ui/mechanic.ts): the same exact-part install / swap / remove, before/after stats and Recommended fit, with
// the car as the centrepiece. This keeps the contract signature. Owned by the Mechanic Shop workstream.
import type { CarId, Family } from '../data/tables';
import type { App } from './app';
import { areaOf, openMechanic } from './mechanic';

export { describeFitEvents } from './mechanic';

/**
 * Open the Fit Parts view for a car (default: the active car), optionally on one family's slot.
 * `opts.onClose` runs when it closes (Pit Setup and Rival Runs return to where they came from).
 * Contract: other workstreams call only this.
 */
export function openFitParts(app: App, car: CarId = app.game.state.activeCar, focus?: Family, opts: { onClose?: () => void } = {}) {
  return openMechanic(app, { car, family: focus, area: focus ? areaOf(focus) : undefined, returnTo: opts.onClose });
}
