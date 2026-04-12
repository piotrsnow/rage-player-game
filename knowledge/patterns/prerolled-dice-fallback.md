# Pattern — Pre-Rolled Dice Fallback

When the nano dice-inference model misses a roll the large model actually needed, the backend ships a small pool of pre-rolled d50 values so the large model can still resolve checks consistently.

## Rules
- Up to 3 rolls per scene
- Thresholds for degree: 20 / 35 / 50 / 65 / 80
- Post-response reconciliation against mechanical rules

Lives in the dice inference / scene generation path; see auto-memory `project_dice_roll_fallback.md` for context.

## Related
- [[../concepts/deterministic-mechanics]]
- [[margin-resolution]]
- [[../concepts/two-stage-pipeline]]
