# Quick Beats — "mała akcja"

A lightweight RP-beat path that bypasses the full scene-generation pipeline. Use it when the player wants to do something in-character that doesn't move the plot — sip ale, glance around the tavern, ask an NPC trivia, loot a fallen enemy, pick up a visible item. The output lands in chat history (same size as normal DM messages, with a subtle amber background tint), advances world-time by a tiny amount, optionally grants items (up to 3), and never creates a new `CampaignScene`.

**Keyboard shortcut: Shift+Enter** (when input is focused and quick beat is available).

If you're touching anything in `backend/src/services/sceneGenerator/quickBeat.js`, the SSE route, the FE button, or the chat rendering — read this first.

---

## High-level flow

```
Frontend: useQuickBeat.submitQuickBeat(action)
  ├── apiClient.aiService.quickBeatViaBackendStream(...) ← SSE
  └── On 'complete' event → dispatch ADD_QUICK_BEAT
        ├── Pushes 2 chat entries (player + DM, both subtype='quick_beat')
        ├── Optional dialogueSegments[0] (NPC reply for TTS)
        ├── applyTimeAndNeeds(timeAdvance)   ← reuses scene-time reducer
        └── quickBeatStreak += 1            ← FE-side lock counter

Backend route: POST /v1/ai/campaigns/:id/quick-beat-stream
  ├── writeSseHead, auth, idempotency
  └── runQuickBeat({ campaignId, playerAction, ... })
        ├── shouldEscalateQuickBeat()      ← heuristic guard
        ├── countConsecutiveQuickBeats()   ← server-side cap (defensive)
        ├── pickPresentNpcs()              ← whitelist for nano prompt
        ├── callAIJson(nano, prompt)       ← single-shot, no two-stage
        ├── enforce NPC whitelist on response
        └── prisma.campaignQuickBeat.create({ ... })
```

Post-scene async work is intentionally **NOT** triggered by quick beats:
- No embedding (no `WorldEntityEmbedding` row, no `CampaignScene.embedding`).
- No memory compression (`memoryCompressor` doesn't run).
- No Living World ticks (`runNpcTick`, `runWorldTick`).
- No image / TTS / SFX generation (no async media pipeline).

Quick beats are flavor, not policy. They never write to `CampaignNPC.experienceLog`, `WorldNpcKnowledge`, `Codex`, `Quest`, or any structured state. The only durable side effects are the `CampaignQuickBeat` row, the `timeAdvance` consumed by the FE reducer, and optional `newItems` (up to 3 mundane items — looting, picking up visible objects). Items are applied client-side via `applyCharacterMutations` inside `ADD_QUICK_BEAT` and generate `item_gained` system messages in chat.

---

## Escalation

Two layers stop a quick beat from masquerading as a real scene:

1. **`shouldEscalateQuickBeat(action, entityTags)`** — heuristic regex over the player's input. Combat verbs (atakuję, walczę, attack), travel verbs (idę do, podróżuję), trade verbs (kupuję, sprzedaję), spell incantations, dungeon nav, plus structured `entityTags` of kind=`spell|enemy|trader`. Match → return `'ESCALATE'` reason and the route falls through.

2. **FE `useQuickBeat`** — when the BE returns `{ action: 'escalate', reason }`, the hook automatically calls `generateScene(action)` so the player's input is never lost. The UI just shows a brief toast that the action was upgraded.

Why two layers: the FE check stops obviously-wrong inputs from leaving the box; the BE check is the source of truth and protects the DB.

---

## Streak + lock

`gameState.quickBeatStreak` counts consecutive quick beats since the last `ADD_SCENE`. When `streak >= 5` (`quickBeatLimit`), the FE button is disabled and the input shows a "Limit małych akcji osiągnięty" hint. The next full scene resets the counter via `ADD_SCENE: draft.quickBeatStreak = 0`.

Why 5: nano model + `CampaignQuickBeat` rows don't exercise `memoryCompressor`, so the next scene's prompt would otherwise grow unbounded with `[RECENT QUICK BEATS]` lines. Forcing a full scene every 5 beats guarantees the memory pass runs.

After a refresh, the streak is rebuilt from DB in `parseBackendCampaign`:
```js
state.quickBeatStreak = full.quickBeats.filter(
  (qb) => qb.parentSceneIndex === lastSceneIndex,
).length;
```

The BE has its own defensive cap in `runQuickBeat` (`countConsecutiveQuickBeats`) — if the FE somehow bypasses the lock, the BE returns `{ action: 'escalate', reason: 'limit_reached' }` and the hook falls back to a full scene.

---

## NPC dialogue + TTS

The nano prompt receives a whitelist of NPCs present at the current location. The model can return at most one `npcSpeaker` + `npcReply` (short line, ≤120 chars). After parsing:

- `runQuickBeat` looks up the speaker in `dbNpcs` to get the canonical name + gender. If the model hallucinated a non-whitelisted name, the reply is dropped (we keep the narration).
- The SSE `complete` event carries `npcSpeaker`, `npcSpeakerGender`, `npcReply` separately.
- The FE handler builds `dialogueSegments[0]` with the right gender so the existing TTS voice picker fires correctly.

On reload, `parseBackendCampaign` re-derives the gender from `world.npcs` by name (defaults to `'male'` if the NPC was meanwhile killed off or renamed).

---

## Persistence

```prisma
model CampaignQuickBeat {
  id               String   @id @default(uuid(7)) @db.Uuid
  campaignId       String   @db.Uuid
  parentSceneIndex Int      // sceneIndex of the last full scene — anchors the beat
  characterId      String?  @db.Uuid
  playerAction     String   @db.Text
  narrationText    String   @db.Text
  npcSpeaker       String?
  npcReply         String?  @db.Text
  timeAdvance      Float?
  createdAt        DateTime @default(now()) @db.Timestamptz

  campaign Campaign @relation(fields: [campaignId], references: [id], onDelete: Cascade)
  @@index([campaignId, createdAt])
}
```

`parentSceneIndex` is the anchor — every beat lives between scene N and scene N+1. The hydration path orders by `createdAt asc` and timestamps the chat entries to fall just after the parent scene's timestamp; the `LOAD_CAMPAIGN` reducer's final timestamp sort keeps everything chronological.

The reducer treats quick-beat chat rows as **non-counting** when reconstructing missing DM messages from `state.scenes`:
```js
const existingDmCount = (loaded.chatHistory || [])
  .filter((m) => m.role === 'dm' && m.subtype !== 'quick_beat').length;
```

Without that filter, two beats on scene N would skip reconstruction of scene N+1's DM message after a refresh.

---

## Premium scene continuity

When the player finally fires a full scene after a beat run, `generateSceneStream` fetches the trailing beats anchored to the last scene and threads them into the user prompt:

```
## [RECENT QUICK BEATS] — drobne RP-bity od ostatniej pełnej sceny (kontynuuj z tego punktu, NIE powtarzaj ich):
1. Gracz: rozglądam się po karczmie
   DM: Kąt jest gęsty od dymu fajek...
2. Gracz: pytam barmana o plotki | NPC Geralt: "..."
```

Capped at 8 entries (FE caps at 5, so this is just a defensive ceiling). Premium uses these for situational awareness — picking up "you've been at the bar a while now" instead of re-establishing the tavern.

---

## What's NOT in V1

- **Multiplayer.** Quick beats are solo-only. The button is hidden in MP mode (`quickBeatAvailable={!!onQuickBeat && !isMultiplayer}`). MP needs a different write path because the gameState lives in `room.gameState` (in-memory) rather than the `Campaign` row, and broadcasting beats would compete with the scene-locking mechanic. Planned for V2 — see related ideas in `knowledge/ideas/`.

- **Dice rolls.** A beat that "needs a roll" is a beat that should be a full scene. The escalation heuristic catches obvious cases; subtle ones default to the model returning narration with no dice. If a quick beat ever needs to roll, escalate.

- **Player-facing manual escalation.** The button is binary (send beat). If the player wants a full scene, they use the regular submit. We considered an "escalate this beat to a scene" button — rejected as redundant.

## V1.1 additions

- **Keyboard shortcut (Shift+Enter).** When the TaggableInput is focused, Shift+Enter sends as quick beat. Enter (no modifier) sends as full scene. Tooltip on the ⚡ button mentions the shortcut.

- **Item acquisition (`newItems`).** The nano prompt schema now includes an optional `newItems` array (max 3, mundane only). Nano returns items when the player is looting, searching, or picking up something visible. Items are sanitized server-side (valid type, quantity 1-10, name ≤80 chars) and applied client-side via `applyCharacterMutations`. Each item triggers an `item_gained` system message in chat.

- **Full-size chat rendering.** Quick beat DM messages now render at the same size and structure as normal DmMessage (text-xs, HighlightedText, ReadAloudButton, DialogueSegments), distinguished only by a subtle amber background tint (`bg-amber-400/[0.06]`) and amber left border.

---

## Critical-path files

| Concern | File |
|---|---|
| FE entry hook | `src/hooks/sceneGeneration/useQuickBeat.js` |
| FE soft-detect | `src/services/quickBeatDetector.js` |
| FE store handler | `src/stores/handlers/sceneHandlers.js` (`ADD_QUICK_BEAT`) |
| FE button | `src/components/gameplay/action/CustomActionForm.jsx` |
| FE chat render | `src/components/gameplay/chat/ChatMessages.jsx` (`QuickBeatMessage`) |
| FE hydration | `src/services/storage/campaignParse.js` |
| BE service | `backend/src/services/sceneGenerator/quickBeat.js` |
| BE route | `backend/src/routes/ai/quickBeatStream.js` |
| BE prompt continuity | `backend/src/services/sceneGenerator/userPrompt.js` (`recentQuickBeats`) |
| Prisma model | `backend/prisma/schema.prisma` (`CampaignQuickBeat`) |
| Migration | `backend/prisma/migrations/20260510140000_campaign_quick_beat/` |

---

## When to add a quick-beat-related state change

**Almost never.** Quick beats support only `timeAdvance` and `newItems` (looting). If you find yourself wanting to write to `experienceLog`, drop XP, change disposition, modify quests, etc. — the player's action is too big for a beat. Either:

1. Tighten the escalation heuristic so it routes to `generateScene`, or
2. Handle it client-side without a server round-trip.

The line is: **a quick beat is something the camera could capture without the player rolling dice, meeting new NPCs, or moving more than across a room.** Looting a body or picking up a visible object is fine.
