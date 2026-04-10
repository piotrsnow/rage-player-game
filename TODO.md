Co musisz zrobić przed pierwszym uruchomieniem
Wipe DB collections (lub zaakceptuj utratę danych przy db:push). MongoDB Atlas UI: drop collections Campaign, Character, MultiplayerSession. Albo lokalnie jeśli masz mongo CLI.

Push schema:


cd backend && npx prisma db push
Prisma client już zregenerowałem przy npx prisma generate.

Restart backend — npm run dev. Pierwsza świeża kampania powinna utworzyć rekord w Character collection oraz Campaign z characterIds: [<id>].
Co celowo zostało poza tym refactorem
NPC companions w state.party — wciąż embedded w campaign blob. Można promować do Character recordów później (additive zmiana, dorzucisz ID do characterIds[]).
Safe-zone gating — sama mechanika "tylko w karczmie możesz przenieść postać" wymaga osobnej iteracji. Architektura ją wspiera (jeden Character może być w characterIds[] wielu kampanii), ale guard nie został zaimplementowany.
Frontend MP join flow — backend już akceptuje msg.characterId i waliduje ownership, ale frontendowy WS klient dalej może wysyłać characterData. Backend obsługuje obie ścieżki (legacy fallback). Najlepiej zaktualizować FE join flow przy następnej iteracji MP.
Manual character mutations spoza scen AI (equip z UI, AdvancementPanel) — wciąż używają starego saveCharacter PUT pattern, co działa prawidłowo bo nowy endpoint przyjmuje pełny RPGon payload. Można je później przepisać na patchCharacterStateChanges.
Verification checklist
Załóż nową kampanię → sprawdź w Atlas: Character ma rekord, Campaign.characterIds ma jego ID, Campaign.characterState nie istnieje.
Zagraj scenę z wound damage / lootem / XP → po complete event state.character w devtools pokazuje nowe wartości natychmiast → odśwież Atlas → Character row już ma deltę (nie czekasz na autosave).
F5 → character ładuje się z campaign.characters[0].
Przejdź do drugiej kampanii (przy starcie nowej) z tego samego bazowego charactera → ten sam Character record jest w characterIds[] obu kampanii (przygotowane pod safe-zone w przyszłości).
Powodzenia z testami. Jakby coś sypało się przy starcie, najpewniejszym podejrzanym jest brak wipe'a DB lub stale characterIds w istniejących Campaign rekordach — w takim wypadku po prostu drop i regen.


jak wchodzę w kartę postaci to zamiast moich statystyk widzę same 10, i też nie mam żadnej możliwości dodawania punktów do statystyk nawet jak widzę że mam do rozdysponowania