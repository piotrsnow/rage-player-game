# Magic Crystals - System magicznych kryształów

## Cel
Zaimplementować mechanikę magicznych kryształów (kamieni) które gracz może znaleźć/zdobyć i wykorzystać do zwiększenia statystyki Magii (max mana).

## Obecny stan
- `rpgMagic.js` linia 277: `manaGrowth: 'Mana rosnie wylacznie przez magiczne kamienie (rzadki zasob)'` — zasada jest zdefiniowana, ale brak implementacji
- Mana przechowywana jako `character.mana = { current, max }` — brak mechaniki zmiany `max`
- Brak definicji kryształów jako itemów
- Brak akcji/handlera do konsumpcji kryształu i zwiększenia max many
- Brak sposobu na zdobycie kryształów (loot, quest reward, zakup, znalezienie)

## Do zrobienia

### 1. Definicja kryształów
- [ ] Zdefiniować typy kryształów (np. Mały/Średni/Duży Kryształ Magii)
- [ ] Każdy typ daje inny bonus do max many (np. +1, +3, +5)
- [ ] Rarity: Rare/Epic/Legendary odpowiednio
- [ ] Kryształy jako item type (nowy typ lub podtyp Artifact/Trinket)
- [ ] Dodać stałe do `rpgSystem.js` lub `rpgMagic.js`

### 2. Mechanika użycia kryształu
- [ ] Nowa akcja `USE_MAGIC_CRYSTAL` w handlerach
- [ ] Konsumuje kryształ z inventory (jednorazowe użycie)
- [ ] Zwiększa `character.mana.max` o wartość kryształu
- [ ] Opcjonalnie: odnawia część many przy użyciu
- [ ] Walidacja: gracz musi mieć kryształ w inventory
- [ ] Ewentualny cap na max manę (żeby nie eskalowało w nieskończoność)

### 3. Sposoby zdobycia kryształów
- [ ] Loot z potężnych przeciwników (boss/hard tier) — dodać do tabeli loot
- [ ] Nagroda za questy magiczne
- [ ] Rzadki drop w lokacjach magicznych (ruiny, wieże magów)
- [ ] Zakup u specjalistycznych NPC (wysoka cena)
- [ ] Crafting z rzadkich materiałów magicznych (jeśli system craftingu to wspiera)
- [ ] Upewnić się że AI wie o kryształach i może je przyznawać w scenach

### 4. UI - użycie kryształu
- [ ] Przycisk "Użyj" na krysztale w `ItemDetailBox.jsx` (jak equip, ale konsumuje)
- [ ] Animacja/feedback po użyciu (np. efekt magiczny, powiadomienie o +X many)
- [ ] Wyświetlanie aktualnej i nowej max many przed potwierdzeniem
- [ ] Kryształy powinny mieć wyróżniający się wygląd w inventory (specjalna ikona/glow)

### 5. Integracja z AI
- [ ] Dodać info o kryształach do kontekstu AI (prompt)
- [ ] AI może przyznawać kryształy jako loot/reward w `stateChanges`
- [ ] AI zna zasadę: mana rośnie TYLKO przez kryształy
- [ ] Dodać kryształy do equipment/item catalog na backendzie

## Pliki do modyfikacji
- `src/data/rpgMagic.js` - definicje kryształów, stałe (typy, bonusy, cap)
- `src/data/rpgSystem.js` - ewentualne limity (max mana cap)
- `src/stores/handlers/inventoryHandlers.js` - nowa akcja USE_MAGIC_CRYSTAL
- `src/stores/handlers/applyStateChangesHandler.js` - obsługa kryształów z AI response
- `src/components/character/inventory/ItemDetailBox.jsx` - przycisk "Użyj" dla kryształów
- `src/components/character/inventory/constants.js` - nowy typ/ikona dla kryształów
- `src/services/contextManager.js` - kontekst kryształów dla AI
- `src/locales/pl.json` + `en.json` - tłumaczenia
