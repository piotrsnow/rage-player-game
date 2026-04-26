# freeRoam mode — explore canonical world without an active campaign

## Idea

Add a second top-level gameplay mode alongside the existing **campaign** mode:

- **`campaign`** (today) — AI tells a directed story; can spawn `CampaignLocation` rows for AI-invented places
- **`freeRoam`** (new) — no campaign arc; player explores the canonical world only. No CampaignLocations, no quest objectives, no DM agent driving plot. Just NPCs, locations, sublocations, optional side-quests via canonical interactions.

## Motivation

Two angles converge:

1. **F5b cleanup** ([plans/postgres-migration.md](../../plans/postgres-migration.md)) introduces `CampaignLocation` as the per-campaign sandbox. freeRoam is the natural complement — a mode where that sandbox doesn't exist by design.
2. **Side-quest exploration** ([side-quests-between-campaigns.md](side-quests-between-campaigns.md)) flagged the same urge: let players visit the world without committing to a long arc.

## Sketch

### Mode field
- `Campaign.mode String @default("campaign")` — `"campaign"` | `"freeRoam"`
- POST `/v1/campaigns` body accepts `mode` (default `"campaign"` for back-compat)

### freeRoam constraints
- AI emits `createLocation` → **rejected** (no CampaignLocation creation in freeRoam)
- AI emits `currentLocation` → **must resolve to existing canonical WorldLocation** or fall back to nearest (no fuzzy create)
- DM agent (`dmAgent`, `pendingHooks`, `dmMemory`) — disabled
- Initial quest seeding — skipped
- Living World seed of bounded settlements — skipped (player roams the global canonical map)
- Combat, dialog, NPC interaction — fully active

### What stays
- `CampaignNPC` shadows still clone canonical WorldNPCs at first encounter (state isolation per freeRoam session is still valuable — kills, dispositions, gifts shouldn't leak across sessions)
- `WorldEvent` log records the visit
- Reputation (`WorldReputation`) accrues normally
- Scene generation pipeline runs the same — just with `[FREEROAM MODE]` block in the system prompt that tells premium not to invent locations and not to drive a plot arc

### Flow
1. Player picks "freeRoam" on campaign creation (no genre/tone/hook pickers — just a starting canonical settlement)
2. Player can revisit any time — campaign row persists like a save slot
3. No "ending" — freeRoam never completes; no post-campaign promotion runs

## When it becomes relevant

- Once F5b lands: the CampaignLocation/WorldLocation split makes freeRoam's "canonical-only" guarantee easy to enforce (just block CampaignLocation writes when `mode=freeRoam`)
- Player feedback wanting to explore the world without committing to a 5-hour campaign arc
- Want to demo the world to new users without overwhelming them with character-creation + genre-picking

## Open questions

- Should freeRoam sessions count toward `Character.campaignCount` and lock the character to the freeRoam slot? (probably yes — same character can't be in two places at once)
- Reputation persistence: does freeRoam infamy show up in subsequent campaign? (probably yes via canonical `WorldReputation`)
- Subquests vs quests: freeRoam quests should be lightweight ("help merchant find shipment"), no multi-objective arcs
- UI: does the gameplay screen show different chrome for freeRoam (no quest log panel, no DM hint button)?
