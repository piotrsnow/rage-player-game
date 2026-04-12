# Titles From Achievements

Postać identyfikuje się tytułami zdobywanymi za odblokowanie achievementów. Każdy achievement może opcjonalnie definiować `grantsTitle: { id, label, rarity }`, a po unlocku tytuł trafia do `character.titles`.

## Kluczowe ustalenia
- **Rarity**: `common` → `uncommon` → `rare` → `epic` → `legendary`. Trudność zdobycia tytułu odzwierciedla jego rangę.
- **Aktywny tytuł**: gracz może wybrać jeden tytuł jako aktywny (`activeTitleId`). Jeśli nie wybrał, domyślnie pokazywany jest tytuł najwyższej rzadkości.
- **Top-N do AI**: prompty otrzymują top-3 najtrudniejsze tytuły. AI wybiera w narracji który tytuł użyć w danym kontekście — np. handlarz wita gracza jako `Kupiec`, strażnik jako `Smokobójca`.
- **Dynamiczne tytuły z questów**: AI może podczas tworzenia questa dorzucić własny achievement z tytułem (`questReward.achievement.grantsTitle`). Cap rarity dla dynamicznie tworzonych tytułów to `rare`, chyba że quest jest oznaczony jako `mainQuest=true` (wtedy `epic`/`legendary` dozwolone).
- **Brak osobnego "career" / klasy**: progres postaci to skille + drzewka many + tytuły. Tytuły zastępują pojęcie kariery jako sposób identyfikacji postaci w świecie.

## Mechanika
- `addTitle` wywoływany przez reducer `ADD_TITLE` przy dispatchach z `useSceneGeneration` po unlocku achievementu z `grantsTitle`.
- `getTopTitles(character, n)` sortuje po rarity desc, tie-break przez `unlockedAt` desc.
- `getActiveTitle(character)` zwraca manualnie wybrany tytuł lub fallback do najrzadszego.

## Przykładowe tytuły z katalogu
- `Wędrowiec` (uncommon) — 50 scen
- `Legenda` (rare) — 100 scen
- `Weteran` (rare) — 50 pokonanych wrogów
- `Kartograf` (uncommon) — 15 lokacji
- `Mistrz Miecza` (rare) — skill walki bronią ≥ 16
- `Cień` (rare) — skradanie ≥ 16
- `Kowal` (rare) — 50 wykutych przedmiotów
- `Alchemik` (rare) — 30 uwarzonych mikstur
- `Kupiec` (uncommon) — 5 udanych targowań
- `Mag` (legendary) — 5 zaklęć z jednego drzewka
- `Smokobójca` (legendary) — pokonanie smoka
- `Bohater` (legendary) — ukończenie głównego wątku

Powiązane: [[../concepts/achievements-system]], [[luck-as-attribute-only]]
