# New Mechanics - Training System

## Cel
Zbudowanie pełnej mechaniki treningów jako dedykowanej aktywności w grze.

## Obecny stan
- Trening istnieje jako prosty przycisk w `AdvancementPanel.jsx` - podnosi cap umiejętności o 1
- Cooldown: 20 scen między treningami (`TRAINING_COOLDOWN_SCENES` w `rpgSystem.js`)
- Akcja `TRAIN_SKILL` w `characterHandlers.js` - tylko bump cap, brak głębszej mechaniki
- Brak dedykowanej sceny treningowej, brak wyboru sposobu treningu, brak interakcji z NPC trenerem

## Do zrobienia

### 1. Rozbudowa mechaniki treningów
- [ ] Zaprojektować system treningów jako osobną aktywność (nie tylko bump cap)
- [ ] Typy treningów: samodzielny, z trenerem NPC, sparring, studiowanie
- [ ] Każdy typ treningu daje inny bonus / ma inny koszt (czas, pieniądze, materiały)
- [ ] Trening z trenerem NPC - wymaga znalezienia odpowiedniego NPC, koszt w złocie
- [ ] Sparring - wymaga partnera, daje XP do skill + szansę na podniesienie cap
- [ ] Samodzielny trening - wolniejszy, ale darmowy, wymaga odpowiedniego miejsca

### 2. Sceny treningowe
- [ ] Dedykowane sceny treningowe generowane przez AI (typ sceny: "training")
- [ ] Wybór co trenujemy przed rozpoczęciem sceny
- [ ] Mini-eventy podczas treningu (np. odkrycie nowej techniki, kontuzja)
- [ ] Feedback wizualny postępu treningu

### 3. Integracja z istniejącymi systemami
- [ ] Trening powinien dawać XP do umiejętności (przez `applyCharacterXpGain`)
- [ ] Powiązanie z systemem lokacji - niektóre miejsca lepsze do treningu
- [ ] Trening magii - wymaga many / reagentów, osobne zasady

## Pliki do modyfikacji
- `src/data/rpgSystem.js` - nowe stałe treningowe, typy treningów
- `src/stores/handlers/characterHandlers.js` - rozbudowa TRAIN_SKILL lub nowe akcje
- `src/components/character/AdvancementPanel.jsx` - UI treningów
- `src/stores/handlers/applyStateChangesHandler.js` - obsługa wyników treningów z AI
- Nowy komponent: panel wyboru treningu
