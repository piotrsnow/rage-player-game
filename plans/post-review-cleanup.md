# Post-review cleanup — low-severity items left from 2026-04-22 audit

Ostatnia duża sesja (2026-04-22 → 2026-04-23) zamknęła całą krytyczną + ważną kolejkę z audytu (C1-C6 + W1-W7) plus bonus splity (applyStateChangesHandler, storage, GameplayPage). Te punkty oznaczone były w oryginalnym review jako **"Do poprawy"** lub **"Out of scope — do obserwacji"** — niskie severity, nic nie blokuje prod-readiness. Zbieram je tutaj żeby nie zginęły.

## Lore endpoint higiena (admin-only, ~15 min łącznie)

### L1. `maxLength: 100000` na `WorldLoreSection.content`

Admin może wkleić megabyty lore — backend aktualnie akceptuje każdą wielkość stringa. Niski blast-radius (admin-controlled) ale higieniczne.

**Gdzie:** [backend/src/routes/adminLivingWorld.js](backend/src/routes/adminLivingWorld.js) — `PUT /lore/:slug`
**Fix:** dodać `schema: { body: { type: 'object', properties: { title: {...}, content: { type: 'string', maxLength: 100000 }, order: {...} } } }` w route config.
**Test:** manualny — spróbować wkleić >100k → spodziewany 400.

### L2. DOMPurify przy renderze lore markdown w FE

Admin-only write + admin-only render (AdminWorldLoreTab preview). Brak XSS vector'a bo scene-gen wysyła treść do LLM jako plain text, nie jako HTML. Ale jeśli kiedyś użyjemy markdown renderera w publicznych ścieżkach — DOMPurify zabezpiecza.

**Gdzie:** [src/components/admin/adminLivingWorld/tabs/AdminWorldLoreTab.jsx](src/components/admin/adminLivingWorld/tabs/AdminWorldLoreTab.jsx) (preview section)
**Fix:** jeśli używamy `dangerouslySetInnerHTML` przy markdown preview — wrap w DOMPurify.sanitize(). Jeśli używamy react-markdown lub podobnego z domyślnym escape'em — pominąć.
**Akcja:** najpierw sprawdzić jak dziś się renderuje; prawdopodobnie nic do zrobienia.

### L3. Idempotency-Key na `PUT /lore/:slug`

Plugin `idempotency` już istnieje (używany w `/ai/campaigns/:id/scenes` i `/scenes/bulk`). Tu brakuje flagi. Double-click przy edycji lore powoduje drugi upsert z tym samym body — brak realnego damage, ale brzydkie.

**Gdzie:** [backend/src/routes/adminLivingWorld.js](backend/src/routes/adminLivingWorld.js) — `PUT /lore/:slug`
**Fix:** `config: { idempotency: true }` w route options.
**Test:** tests green (plugin ma własne testy).

## Scalability flags — monitorować, nie fix'ować teraz

### S1. CampaignNPC shadow TTL/GC

Clone-on-first-encounter tworzy CampaignNPC shadow per kampania. Porzucone/abandoned kampanie zostawiają shadowy na wieki. Przy skali (1000+ kampanii × 100 NPC) to ~100k wierszy w collection `CampaignNPC`.

**Trigger do działania:** gdy Atlas zacznie raportować storage growth z `CampaignNPC` lub gdy admin map view zacznie mulić.
**Opcje:**
- TTL index na `updatedAt` z 90-dniowym progiem (jeśli kampania nieaktywna → shadow wygasa)
- Batch GC job z `Campaign.updatedAt < 90d AND status != 'active'` → usuń wszystkie shadowy tej kampanii
- Soft-tagging `abandoned` przy /campaigns/:id DELETE + hard-delete shadowów po 30d

### S2. WorldNPC tick-batch rollup

`/admin/tick-batch` z `limit: 50` odpala do 50 nano LLM calls równolegle. Per 1000 keyNpc NPC = 1000 nano calls = wąskie gardło cost'u i rate-limit'u dostawcy.

**Trigger do działania:** gdy włączymy tick scheduler (obecnie manual-only), lub gdy `tick-batch` zacznie bić w 429 z OpenAI/Anthropic.
**Opcje:**
- Concurrency cap per batch (np. max 10 równocześnie)
- Skip NPCs whose `activeGoal` + `goalProgress` nie zmienił się vs poprzedni tick (deterministic schedule-driven baseline)
- Rollup: grupuj NPCs po location, wyślij jedno group-nano zamiast N osobnych

Poza zakresem oryginalnego review — flaguję bo jeśli kiedyś uruchomimy auto-dispatch (patrz `knowledge/ideas/living-world-npc-auto-dispatch.md`), to będzie pierwszy problem do rozwiązania.

## Priorytet

L1 + L3 — szybkie 5-10 min razem, zero ryzyka, warto złapać razem jak będę już w `adminLivingWorld.js`.
L2 — najpierw sprawdzić czy preview faktycznie eksponuje raw HTML; jeśli nie, skreślić.
S1, S2 — nie ruszać aż zobaczymy realną presję.
