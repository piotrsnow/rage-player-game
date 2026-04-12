# Validate Systems - Weryfikacja XP i nagród

## Cel
Przejrzeć i zwalidować poprawność przyznawania XP za umiejętności, XP za questy, XP za walki i ogólny flow progresji postaci.

## Obecny stan
- XP za umiejętności: difficulty-based (Easy=4-8, Medium=8-16, Hard=14-28, VeryHard=20-40, Extreme=28-56)
- XP za walki: Miss=10, Hit=20, Kill=50-500 (zależne od tier wroga)
- XP za questy: pole `reward.xp` w queście, stosowane przez `applyCharacterXpGain`
- Character XP: skill level-up daje `newLevel^2` character XP, level-up kosztuje `5 * targetLevel^2`
- Wszystko przechodzi przez `applyStateChangesHandler.js` (250+ linii)

## Do zrobienia

### 1. Audit XP za umiejętności (skill XP)
- [ ] Sprawdzić czy XP za skill check jest poprawnie naliczany w `skillCheck.js`
- [ ] Sprawdzić czy `skillXpAccumulator` prawidłowo kumuluje XP w trakcie walki
- [ ] Sprawdzić czy XP jest aplikowany po walce (payload `skillProgress`)
- [ ] Zweryfikować skalowanie - czy na wyższych levelach umiejętności progresja nie jest za szybka/wolna
- [ ] Sprawdzić edge cases: co jeśli skill jest na cap? Co z XP overflow?

### 2. Audit XP za questy
- [ ] Sprawdzić flow: quest completion -> reward extraction -> `applyCharacterXpGain`
- [ ] Zweryfikować czy AI poprawnie generuje quest rewards (xp, money, items)
- [ ] Sprawdzić czy completed quests poprawnie trafiają do `draft.quests.completed`
- [ ] Sprawdzić czy `rewardGranted: true` zapobiega podwójnemu naliczeniu
- [ ] Przetestować edge case: co jeśli quest nie ma reward?

### 3. Audit XP za walki (combat XP)
- [ ] Sprawdzić mapowanie weapon type -> skill w `combatEngine.js`
- [ ] Zweryfikować tier-based kill XP (weak=50, medium=100, hard=200, boss=500)
- [ ] Sprawdzić czy XP za miss/hit/kill jest poprawnie akumulowany
- [ ] Sprawdzić co się dzieje z XP za zaklęcia w walce
- [ ] Zweryfikować czy post-combat XP jest poprawnie dystrybuowany do wszystkich skilli

### 4. Audit progresji postaci (character level-up)
- [ ] Sprawdzić formułę: skill level-up -> character XP (`newLevel^2`)
- [ ] Sprawdzić koszt level-up: `5 * targetLevel^2` - czy skalowanie jest sensowne
- [ ] Zweryfikować attribute points per level-up
- [ ] Sprawdzić cap atrybutów (25) i koszt Luck (3 punkty)

### 5. Balans ogólny
- [ ] Symulacja: ile scen/walk/questów potrzeba na level 5, 10, 15, 20?
- [ ] Czy krzywa XP jest satysfakcjonująca? Czy nie ma plateau?
- [ ] Porównanie ścieżek: czysto walka vs czysto questy vs mix

## Pliki do przeglądu
- `src/data/rpgSystem.js` - formuły XP, stałe
- `src/services/mechanics/skillCheck.js` - naliczanie skill XP
- `src/services/combatEngine.js` - combat XP
- `src/stores/handlers/applyStateChangesHandler.js` - aplikowanie XP i nagród
- `src/stores/handlers/characterHandlers.js` - level-up, attribute points
- `src/stores/handlers/_shared.js` - `applyCharacterXpGain()`
- `src/components/character/quest/RewardBadge.jsx` - wyświetlanie nagród
