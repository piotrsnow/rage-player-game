# Context → Zustand Migration Plan

Assessment of which React contexts should be migrated to Zustand and which should stay.

## Migrate

### GameContext — usunąć (thin wrapper)
- 22 linijki, zero własnego stanu — re-exportuje `useGameStore`
- Jedyny side-effect (`beforeunload` → `flushPendingSave`) przenieść do `Layout` lub do samego store
- `useGame()` facade zostaje jako re-export z `gameSelectors.js` lub inline

### ModalContext — przenieść do Zustand
- 54 linijki, 5 booleanów (`characterSheetOpen`, `worldStateOpen`, `tasksInfoOpen`, `settingsOpen`, `keysOpen`)
- Zero side-effectów, czysto UI state
- 8 konsumentów — mała powierzchnia zmian
- Bonus: granularne selektory wyeliminują re-rendery całego drzewa przy open/close

### MusicContext — przenieść do Zustand
- 85 linijek, 4 konsumentów
- Prosty stan (`narratorState`) + delegacja do `useLocalMusic`
- Lekkie effecty (pauza/resume muzyki przy zmianie widoku)

## Zostaw jako Context

### SettingsContext — zostaw
- 352 linijki, **28 konsumentów**, 6 useEffectów
- Ciężka logika backendowa: auth, sync z debounce, i18n, preload game data
- Settings zmieniają się raz na sesję — brak zysku z granularnych subskrypcji Zustand
- Side-effecty (login/logout, backend key fetch) naturalnie żyją w Provider lifecycle

### MultiplayerContext — zostaw
- ~795 linijek (context + reducer + WebSocket subscription + actions)
- Zamknięty subsystem: WebSocket state machine, event handlers, rejoin logic
- 22 konsumentów, ale wszystko w scope multiplayer
- Duży refaktor z realnym ryzykiem regresji, minimalny zysk

## Zasada ogólna
Zustand opłaca się dla stanu, który:
- zmienia się często i powoduje re-rendery (game state, modals)
- jest czytany granularnie (nie każdy komponent potrzebuje całości)
- nie ma ciężkich side-effectów w lifecycle

Context zostaje gdy:
- stan zmienia się rzadko (settings — raz na sesję)
- lifecycle Providera enkapsuluje ciężkie side-effecty (WebSocket, auth, sync)
- subsystem jest zamknięty i nie przecieka do reszty drzewa
