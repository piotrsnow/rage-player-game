# Idea — combat auto-resolve on idle (multiplayer)

## What it is

In multiplayer combat, a round can stall waiting for one player's action. After a configurable timeout (e.g. 60s), the server picks a "safe default" action for the AFK player (typically `defend` or `flee`), round proceeds, others are notified. After N consecutive AFK rounds, the player is removed from the combat entirely.

## Why it's not adopted now

Solo combat is turn-based blocking on the player — they think as long as they want. No problem.

Multiplayer combat hasn't been stress-tested by real groups yet. The AFK-blocking problem will surface the first time 4 players report "we waited 10 minutes for X to decide their action."

## When it becomes relevant

The trigger is the first playtest where a multiplayer group complains about combat round stalls. That's the signal to ship this.

## Sketch

### dmSettings knobs

```js
combatRoundTimeoutMs: 60000,   // 1 minute default, user-tunable 15s-300s
combatMaxAfkRounds: 3,          // kick from round after N idle turns
```

Reuse the pattern that already lives in `SettingsContext.jsx` (narrator sliders, LLM timeouts).

### Timer management in room manager

```js
room.combatRound.startedAt = Date.now();
room.combatRound.timeoutHandle = setTimeout(() => {
  autoResolveAfkPlayers(room);
}, dmSettings.combatRoundTimeoutMs);

function autoResolveAfkPlayers(room) {
  const afkPlayers = room.combatRound.awaitingActions.filter(
    (p) => !room.combatRound.submittedActions.has(p.id)
  );
  for (const player of afkPlayers) {
    player.afkCount = (player.afkCount || 0) + 1;
    const action = player.afkCount >= dmSettings.combatMaxAfkRounds
      ? { type: 'kick_from_round' }
      : { type: 'defend', reason: 'afk_default' };
    submitAction(room, player.id, action);
  }
  resolveRoundIfReady(room);
}
```

### Notification

Emit `combat_afk_default` event to all players. Scene generator adds a one-line narrative note: "X, distracted, hunkered down defensively."

## Variants to consider

- **Auto-defend vs auto-flee.** Defend keeps them in combat; flee removes them. Default = defend, party leader override via room setting.
- **Graduated escalation.** 1st AFK = warning ping. 2nd = auto-defend. 3rd = kick. 4th = mark as spectator.
- **Reconnection grace.** If WebSocket disconnected (not just idle), extend timeout 30s.

## Dependencies

- Room manager must track AFK counts across rounds (new state field)
- Per-room dmSettings must include the new knobs

## Source

`pipecat-ai/gradient-bang` — `COMBAT_ROUND_TIMEOUT=30s` env tunable + pgSQL cron job that auto-resolves rounds.
