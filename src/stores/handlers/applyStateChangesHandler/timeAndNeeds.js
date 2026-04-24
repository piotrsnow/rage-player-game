import { hourToPeriod, decayNeeds } from '../../../services/timeUtils';
import { PERIOD_START_HOUR, createDefaultNeeds } from '../_shared';

/**
 * Time advance + needs decay + explicit need deltas + the rest-crisis
 * penalty. Must run after character mutations (so attrs/maxWounds are up to
 * date) and BEFORE the knowledge-base auto-populate pass (which stamps
 * `sceneIdx` onto kb entries and expects needs to already be decayed).
 */
export function applyTimeAndNeeds(draft, changes) {
  applyTimeAdvance(draft, changes);
  applyNeedsChanges(draft, changes);
}

function applyTimeAdvance(draft, changes) {
  if (!changes.timeAdvance) return;
  const ts = draft.world.timeState || { day: 1, timeOfDay: 'morning', hour: 6, season: 'unknown' };
  const currentHour = ts.hour ?? 6;

  let hoursElapsed = changes.timeAdvance.hoursElapsed;
  if (!hoursElapsed && changes.timeAdvance.timeOfDay) {
    const targetHour = PERIOD_START_HOUR[changes.timeAdvance.timeOfDay] ?? currentHour;
    hoursElapsed = targetHour > currentHour
      ? targetHour - currentHour
      : targetHour < currentHour ? (24 - currentHour + targetHour) : 0;
  }
  hoursElapsed = hoursElapsed || 0.5;

  let newHour = currentHour + hoursElapsed;
  let dayIncrement = 0;
  while (newHour >= 24) { newHour -= 24; dayIncrement++; }
  if (changes.timeAdvance.newDay && dayIncrement === 0) dayIncrement = 1;

  draft.world.timeState = {
    ...ts,
    hour: Math.round(newHour * 10) / 10,
    timeOfDay: hourToPeriod(newHour),
    day: ts.day + dayIncrement,
    ...(changes.timeAdvance.season && { season: changes.timeAdvance.season }),
  };

  if (draft.character) {
    const currentNeeds = draft.character.needs || createDefaultNeeds();
    draft.character.needs = decayNeeds(currentNeeds, hoursElapsed);
  }
}

function applyNeedsChanges(draft, changes) {
  if (!changes.needsChanges || !draft.character) return;
  if (!draft.character.needs) draft.character.needs = createDefaultNeeds();
  for (const [key, delta] of Object.entries(changes.needsChanges)) {
    if (key in draft.character.needs) {
      draft.character.needs[key] = Math.max(0, Math.min(100, (draft.character.needs[key] ?? 100) + delta));
    }
  }
  if (changes.needsChanges.rest > 0) {
    draft.momentumBonus = 0;
  }
}

/**
 * Rest-crisis penalty — activates -10 modifier when rest hits 0 and clears
 * when the character has rested above zero again. Separate from
 * applyTimeAndNeeds because it runs AFTER knowledge-base auto-populate in
 * the original order (the penalty is a view of the post-advance state).
 */
export function applyRestCrisisPenalty(draft) {
  if (!draft.character?.needs) return;
  const hasRestCrisis = (draft.character.needs.rest ?? 100) === 0;
  if (hasRestCrisis && !draft.character.needsPenalty) {
    draft.character.needsPenalty = -10;
  } else if (!hasRestCrisis && draft.character.needsPenalty) {
    draft.character.needsPenalty = 0;
  }
}
