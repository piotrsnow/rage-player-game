/** Must match `.animate-dice-fly-in { animation-duration }` in `src/index.css` and `shared/ui-theme/base.css`. */
export const DICE_OVERLAY_INTRO_MS = 480;

/** Wait until CSS fly-in settles before starting WebGL physics (avoids jank on the canvas wrapper). */
export const DICE_OVERLAY_THROW_DELAY_MS = DICE_OVERLAY_INTRO_MS + 70;
