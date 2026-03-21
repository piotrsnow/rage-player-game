# AI RPG (Single Player) – Product Spec / MVP

## 1. Produkt

Gra RPG dla jednego gracza prowadzona przez AI (Dungeon Master).
Gracz definiuje, o czym ma być historia, a AI generuje świat, narrację i prowadzi kampanię w czasie rzeczywistym.

---

## 2. Core Vision

"Jednoosobowa sesja RPG prowadzona przez AI z trwałą pamięcią świata i konsekwencjami decyzji."

---

## 3. Główna pętla rozgrywki

1. AI opisuje scenę
2. Gracz wybiera akcję (lub wpisuje własną)
3. AI rozstrzyga wynik
4. Aktualizacja stanu gry
5. Następna scena

---

## 4. Ekrany (MVP)

### 4.1 Lobby / Start
- Nowa kampania
- Kontynuuj kampanię
- Lista zapisów

### 4.2 Kreator kampanii
Gracz ustawia:
- Gatunek (fantasy, sci-fi, horror)
- Ton (mroczny, epicki, humorystyczny)
- Styl gry (narracyjny vs mechaniczny)
- Poziom trudności
- Długość kampanii

Input tekstowy:
"O czym ma być historia?"

Output AI:
- opis świata
- hook fabularny
- pierwsza scena

---

### 4.3 Ekran rozgrywki (CORE)

Sekcje:

#### A. Scena (centrum)
- opis narracyjny
- aktualna sytuacja

#### B. Akcje gracza
- 3–4 sugerowane opcje
- pole tekstowe: "zrób coś własnego"

#### C. Wynik / konsekwencje
- efekt decyzji
- testy (opcjonalnie)

#### D. Pasek stanu
- HP
- zasoby
- statusy

---

### 4.4 Karta postaci
- statystyki
- ekwipunek
- umiejętności
- relacje

---

### 4.5 Panel MG AI
Sterowanie:
- styl narracji
- długość odpowiedzi
- poziom trudności
- ilość testów
- swoboda vs prowadzenie

---

## 5. Stan gry (Game State)

Musi być jawny i zapisany:

- Postać:
  - HP
  - statystyki
  - ekwipunek
  - statusy

- Świat:
  - lokacje
  - fakty fabularne
  - historia wydarzeń

- Relacje:
  - NPC
  - reputacja

- Questy:
  - aktywne
  - zakończone

---

## 6. System decyzji

Tryby:
- narracyjny (AI decyduje)
- hybrydowy (testy + AI)
- mechaniczny (statystyki + rzuty)

MVP: tryb hybrydowy

---

## 7. Pamięć i zapis

- zapis kampanii
- auto-save
- "Previously on..." (streszczenie)
- skrócona pamięć świata dla AI

---

## 8. MVP Scope (v0.1)

MUST HAVE:
- kreator kampanii
- ekran rozgrywki
- podstawowy stan postaci
- zapis/odczyt
- sugerowane akcje

NICE TO HAVE:
- panel MG AI
- relacje NPC
- quest log

---

## 9. UX priorytety

- Scena > UI
- Jasne opcje decyzji
- Widoczne konsekwencje
- Minimalna liczba paneli

---

## 10. North Star

Gracz czuje:
- AI pamięta
- decyzje mają znaczenie
- historia jest spójna
- to jest gra, nie chat

---

## 11. Kolejne iteracje

v0.2:
- rozwój postaci
- relacje

v0.3:
- bardziej zaawansowana mechanika
- system frakcji

v1.0:
- pełne kampanie
- tryb multiplayer

---

## 12. Generator obrazów (AI Visual Layer)

### Cel
Wzmocnienie immersji poprzez generowanie obrazów na podstawie aktualnej sceny fabularnej.

### Główne założenie
Obrazy są generowane automatycznie przez AI na podstawie:
- aktualnej sceny
- opisu lokacji
- postaci i ich wyglądu
- tonu kampanii

---

### Integracja z rozgrywką

Na ekranie rozgrywki:

#### A. Obraz sceny (nad narracją lub w tle)
- ilustracja aktualnej lokacji / wydarzenia
- aktualizowana co scenę lub kluczowy moment

#### B. Portrety postaci
- generowane przy pierwszym spotkaniu NPC
- zapisywane w stanie gry

#### C. Kluczowe momenty
- opcjonalne „cinematic shots” dla ważnych wydarzeń

---

### Logika generowania

Trigger generacji:
- nowa lokacja
- nowe NPC
- ważne wydarzenie fabularne

Prompt do generatora bazuje na:
- streszczeniu sceny
- stylu kampanii (np. dark fantasy, sci-fi)
- opisach postaci

---

### Stan gry (rozszerzenie)

Do Game State dodajemy:
- obrazy lokacji
- portrety NPC
- kluczowe ilustracje scen

---

### MVP Scope (obrazy)

MUST HAVE:
- generowanie obrazu sceny przy rozpoczęciu
- 1 styl wizualny globalny

NICE TO HAVE:
- portrety NPC
- regeneracja obrazów
- różne style artystyczne

---

### Ryzyka

- zbyt częste generowanie = wolna gra
- niespójność stylu
- obrazy niezgodne z narracją

---

### UX zasady

- obraz wspiera narrację, nie zastępuje jej
- generowanie nie blokuje decyzji gracza
- możliwość ukrycia / wyłączenia

---

### North Star (wizualny)

Gracz czuje:
- "widzę świat, który opisuje AI"
- "to jest moja unikalna kampania"

