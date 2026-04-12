# E2E Tests - Combat System

## Cel
Dodać testy e2e (Playwright) pokrywające flow walki — od wejścia w combat, przez tury, manewry, użycie magii, aż po zakończenie walki i przyznanie XP/loot.

## Obecny stan
- **Unit testy:** `src/services/combatEngine.test.js` — testuje silnik w izolacji (createCombatState, resolveManoeuvre, isCombatOver, endCombat, etc.)
- **E2E infrastruktura:** Playwright, fixtures w `e2e/fixtures/`, page objects w `e2e/helpers/pages/`
- **Page object:** `GameplayPage` ma już `combatPanel` locator (`[data-testid="combat-panel"]`), ale nie jest używany w żadnym teście
- **Brak data-testid w CombatPanel:** Komponent `CombatPanel.jsx` nie ma żadnych data-testid — trzeba je dodać
- **Mock AI:** `api-mocks.fixture.js` ma `interceptAll()` z mock responses, ale brak mocka zwracającego combat state
- **Mock responses:** `e2e/helpers/mock-responses.js` — brak `mockCombatResponse()`

## Do zrobienia

### 1. Przygotowanie infrastruktury testowej
- [ ] Dodać `data-testid` do elementów w `CombatPanel.jsx`:
  - combat-panel (wrapper — już w page object, ale brak w komponencie)
  - combat-combatant (każdy combatant)
  - combat-hp-bar (pasek HP)
  - combat-manoeuvre-btn (przyciski manewrów: attack, defend, dodge, charge, feint, flee, magic)
  - combat-turn-indicator (wskaźnik czyjej jest tury)
  - combat-log (log walki)
  - combat-round-counter (numer rundy)
  - combat-end-summary (podsumowanie po walce)
- [ ] Dodać `mockCombatResponse()` do `e2e/helpers/mock-responses.js` — AI response z `stateChanges.combat` inicjującym walkę
- [ ] Dodać `mockCombatRoundResponse()` — AI response rozstrzygający turę
- [ ] Dodać `mockCombatEndResponse()` — AI response kończący walkę z loot/XP
- [ ] Rozszerzyć `GameplayPage` page object o combat helpers:
  - `getCombatants()`, `getPlayerHP()`, `getEnemyHP()`
  - `selectManoeuvre(name)`, `getCombatLog()`
  - `waitForCombatEnd()`, `getCombatSummary()`

### 2. Testy — inicjacja walki
- [ ] Test: walka startuje po odpowiedzi AI z combat state — `combat-panel` widoczny
- [ ] Test: combatants wyświetlani poprawnie (nazwa, HP, pozycja)
- [ ] Test: gracz ma dostępne manewry (attack, defend, dodge, etc.)
- [ ] Test: wskaźnik tury pokazuje aktywnego combatanta

### 3. Testy — przebieg walki
- [ ] Test: wybór manewru (attack) → wysyłany request → rozstrzygnięcie tury
- [ ] Test: HP zmienia się po trafieniu
- [ ] Test: combat log rejestruje akcje (hit/miss/damage)
- [ ] Test: numer rundy inkrementuje się po turze każdego combatanta
- [ ] Test: defend/dodge zmienia modyfikatory (widoczne w UI lub logu)

### 4. Testy — magia w walce
- [ ] Test: maneuwr "magic" dostępny gdy postać zna zaklęcia
- [ ] Test: wybór zaklęcia z listy dostępnych
- [ ] Test: mana zmniejsza się po rzuceniu zaklęcia
- [ ] Test: brak many → zaklęcie niedostępne / komunikat błędu

### 5. Testy — zakończenie walki
- [ ] Test: walka kończy się gdy wróg pokonany (HP=0) — combat-end-summary widoczny
- [ ] Test: walka kończy się gdy gracz pokonany — odpowiedni komunikat
- [ ] Test: flee maneuwr — ucieczka z walki
- [ ] Test: po walce XP przyznany do odpowiednich skilli (combat log / notification)
- [ ] Test: loot po walce dodany do inventory

### 6. Testy — edge cases
- [ ] Test: wielu przeciwników — kolejność tur, target selection
- [ ] Test: walka z bossem (wyższy tier → więcej XP za kill)
- [ ] Test: gracz bez broni — walka wręcz jako fallback
- [ ] Test: disconnection/reload w trakcie walki — odtworzenie stanu

## Pliki do modyfikacji / utworzenia
- `e2e/specs/combat.spec.js` — nowy plik z testami e2e
- `e2e/helpers/mock-responses.js` — dodać mockCombatResponse, mockCombatRoundResponse, mockCombatEndResponse
- `e2e/helpers/pages/gameplay.page.js` — rozszerzyć o combat helpers
- `src/components/gameplay/CombatPanel.jsx` — dodać data-testid do elementów
- `src/components/gameplay/CombatDetailPanel.jsx` — dodać data-testid
