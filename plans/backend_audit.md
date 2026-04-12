# Backend Architecture Audit — Rage Player Game

## Context

Audyt backendu Node.js/Fastify pod katem architektury, bezpieczenstwa, jakosci kodu i przygotowania na wieksza liczbe uzytkownikow. System to RPG z trybem singleplayer (AI scene generation) i multiplayer (WebSocket rooms). Backend obsluguje auth, kampanie, postacie, media, proxy do AI providerow i multiplayer w czasie rzeczywistym.

---

## Podsumowanie

Backend jest **solidny funkcjonalnie** — dobrze zaprojektowany system pluginow Fastify, sensowna separacja routes/services, poprawne hashowanie hasel (bcrypt 12 rounds), szyfrowanie kluczy API (AES-256-GCM), ownership checks na zasobach. Architektura jest czytelna i logiczna.

Glowne obszary do poprawy to: **brak walidacji inputu na wiekszosci endpointow**, **in-memory room state bez horyzontalnego skalowania**, **duze monolityczne pliki serwisowe** (sceneGenerator 1900 linii, multiplayerAI 1600 linii), i **brak testow** (1 plik testowy na caly backend).

---

## CRITICAL — Problemy wymagajace natychmiastowej reakcji

### 1. Brak walidacji inputu na wiekszosci endpointow

**Pliki:** `routes/campaigns.js`, `routes/characters.js`, `routes/multiplayer.js`

Tylko `/auth/register` i `/auth/login` maja zdefiniowane Fastify JSON schemas. Wszystkie pozostale endpointy przyjmuja dowolny JSON bez walidacji:

- `PUT /campaigns/:id` — brak walidacji `name`, `genre`, `tone`
- `POST /campaigns/:id/save-state` — coreState przyjmowany bez ograniczen
- `PATCH /characters/:id/state-changes` — state changes bez schema
- Wszystkie wiadomosci WebSocket — parsowane z raw JSON bez walidacji typow

**Ryzyko:** Prototype pollution, memory exhaustion (ogromne payloady), nieoczekiwane crashe.

**Rozwiazanie:** Dodac Fastify JSON Schema do kazdego endpointu z `maxLength`, `maxItems`, `additionalProperties: false`. Dla WebSocket — walidacja kazdego `msg.type` z dedykowana schema.

### 2. In-memory room state — brak horyzontalnego skalowania

**Plik:** `services/roomManager.js:5`

```javascript
const rooms = new Map(); // caly stan multiplayer w pamieci procesu
```

Wszystkie pokoje multiplayer zyja w `Map` w pamieci jednego procesu. To oznacza:
- **Nie mozna uruchomic wielu instancji** serwera za load balancerem
- **Restart serwera = utrata aktywnych sesji** (jest DB persistence, ale reconnect wymaga manualnego rejoin)
- **Pamiec rosnie liniowo** z kazda aktywna sesja

**Rozwiazanie etapowe:**
1. **Krotkoterminowo (teraz):** Sticky sessions + Redis pub/sub dla broadcast miedzy instancjami
2. **Dlugoterminowo:** Przeniesienie room state do Redis (hashes + sorted sets), WebSocket adapter z pub/sub

### 3. Brak rate limitingu na multiplayer i gameData

**Plik:** `server.js:94,97`

```javascript
await fastify.register(multiplayerRoutes, { prefix: '/multiplayer' }); // brak scope z rate limit
await fastify.register(gameDataRoutes, { prefix: '/game-data' });       // brak scope z rate limit
```

Rate limit jest `global: false`, wiec te route'y nie maja zadnych limitow. WebSocket endpoint jest szczegolnie wrazliwy — jeden klient moze spamowac wiadomosciami bez ograniczen.

**Rozwiazanie:** 
- Dodac rate limit scope dla `/multiplayer` (REST endpointy)
- Dodac per-message throttling w WebSocket handler (np. max 30 msg/s per socket)
- Dodac rate limit dla `/game-data`

---

## HIGH — Wazne usprawnienia

### 4. Monolityczne pliki serwisowe

| Plik | Linie |
|------|-------|
| `services/sceneGenerator.js` | 1,897 |
| `services/multiplayerAI.js` | 1,612 |
| `routes/multiplayer.js` | 1,289 |
| `routes/campaigns.js` | 912 |

Te pliki lacza wiele odpowiedzialnosci — prompt building, AI calling, state mutation, embedding, persistence. Trudne do testowania i utrzymania.

**Rozwiazanie:** Rozdzielic na mniejsze moduly:
- `sceneGenerator.js` → `scenePipeline.js` (orchestrator), `scenePromptBuilder.js`, `sceneStateApplier.js`, `combatFastPath.js`
- `multiplayerAI.js` → `mpSceneGenerator.js`, `mpCampaignGenerator.js`, `mpCombatResolver.js`
- `routes/multiplayer.js` → wyniesc `handleMessage` switch cases do osobnych handlerow per typ wiadomosci

### 5. Silent error swallowing

Wiele miejsc w kodzie lapiace bledy bez logowania:

```javascript
// roomManager.js:183
deleteRoomFromDB(roomCode).catch(() => {});

// roomManager.js:427
deleteRoomFromDB(code).catch(() => {});

// roomManager.js:525  
await prisma.multiplayerSession.delete({ where: { roomCode } }).catch(() => {});

// multiplayer.js:250
saveRoomToDB(roomCode).catch(() => {});
```

**Rozwiazanie:** Zamienic na `.catch((err) => fastify.log.warn(err, 'context'))` albo uzyc centralnego error reporter.

### 6. Brak heartbeat/ping-pong na WebSocket

**Plik:** `routes/multiplayer.js`

Nie ma mechanizmu wykrywania martwych polaczen. Jesli klient straci siec bez wyslania `close` frame, serwer trzyma martwe sockety w pamieci do cleanup (30 min TTL).

**Rozwiazanie:**
```javascript
const HEARTBEAT_INTERVAL = 30_000;
const heartbeat = setInterval(() => {
  socket.ping();
}, HEARTBEAT_INTERVAL);

socket.on('pong', () => { /* mark alive */ });
socket.on('close', () => clearInterval(heartbeat));
```

### 7. Brak CSP (Content Security Policy)

**Plik:** `server.js:40`

```javascript
contentSecurityPolicy: false, // wylaczone!
```

Dla SPA serwowanego z tego samego serwera, CSP jest wazna warstwa ochrony przed XSS.

**Rozwiazanie:** Dodac bazowy CSP dostosowany do uzywanych CDN-ow i API.

### 8. Brak refresh tokenow

**Plik:** `plugins/auth.js:8`

JWT z 7-dniowym wygasaniem, bez refresh token. Nie ma mozliwosci revokacji tokenu (np. po zmianie hasla).

**Rozwiazanie (po MVP):**
- Short-lived access token (15-30 min) + refresh token w httpOnly cookie
- Token blacklist w Redis dla natychmiastowej revokacji

---

## MEDIUM — Usprawnienia

### 9. Niespojne logowanie

Mix `console.log`, `console.warn`, `console.error` i `fastify.log.*`. Brak structured logging z kontekstem (userId, roomCode, campaignId).

**Rozwiazanie:** Ujednolicic na `fastify.log.*` z request ID i kontekstem. Dodac `request.log` w handlerach route.

### 10. Brak graceful shutdown dla WebSocket

**Plik:** `lib/prisma.js` — disconnect Prisma na SIGTERM, ale:
- Brak zamykania aktywnych WebSocket polaczen
- Brak drainowania in-flight requestow
- Cleanup timer ma `unref()` ale brak explicit stop

**Rozwiazanie:**
```javascript
process.on('SIGTERM', async () => {
  // 1. Stop accepting new connections
  // 2. Close all WebSocket connections gracefully
  // 3. Save all active rooms to DB
  // 4. Close Fastify (drains requests)
  // 5. Disconnect Prisma
});
```

### 11. Body limit 50MB globalnie

**Plik:** `server.js:35`

Globalny `bodyLimit: 50MB` jest za duzy dla wiekszosci endpointow. Tylko media upload potrzebuje tak duzego limitu.

**Rozwiazanie:** Ustawic globalny limit na 1-2MB, a 50MB tylko per-route na media endpoints.

### 12. Duplikacja logiki w proxy routes

Kazdy proxy route (`openai.js`, `anthropic.js`, `stability.js`, etc.) powtarza ten sam wzorzec:
- Resolve API key
- Try/catch z error handling
- Forward request

**Rozwiazanie:** Ekstrakcja wspolnego middleware `createProxyHandler(provider, options)`.

### 13. Brak testow

Tylko 1 plik testowy: `services/roomManager.test.js`. Zero testow dla:
- Auth flow (register/login)
- Campaign CRUD i state sync
- Character mutations
- Scene generation pipeline
- WebSocket message handling

**Rozwiazanie (priorytetyzacja):**
1. Auth routes — unit testy
2. Character mutations — unit testy (pure functions)
3. Campaign save-state — integration test z Prisma
4. WebSocket message handling — integration test

---

## LOW — Sugestie nice-to-have

### 14. Health check nie sprawdza DB

`/health` zwraca `{ status: 'ok' }` bez sprawdzania polaczenia z MongoDB. Load balancer nie wykryje problemu z baza.

**Rozwiazanie:** `await prisma.$runCommandRaw({ ping: 1 })` w health check.

### 15. Brak API versioning

Wszystkie endpointy bez prefiksu wersji (`/campaigns` zamiast `/v1/campaigns`). Przy breaking changes trzeba bedzie migrowac wszystkich klientow naraz.

### 16. Brak idempotency na krytycznych endpointach

`POST /campaigns/:id/save-state` moze byc wywolany wielokrotnie — brak idempotency key.

### 17. Embedding cache bez TTL

**Plik:** `services/embeddingService.js`

LRU cache (100 items) bez TTL — embeddingi nigdy nie wygasaja w ramach jednej sesji serwera.

---

## Przygotowanie na wieksza liczbe uzytkownikow

### Obecne bottlenecki pod obciazeniem:

1. **In-memory rooms** — limit 1 instancja serwera, pamiec rosnie liniowo
2. **Brak connection pooling info** — Prisma domyslnie uzywa connection pool, ale brak konfiguracji
3. **AI calls sa synchroniczne per-request** — blokuja worker thread na czas generacji (moze trwac 10-30s)
4. **Brak kolejki zadan** — scene generation blokuje request handler
5. **Rate limit per IP** — wielu userow za NAT-em moze dzielic limit

### Rekomendacje skalowania (kolejnosc priorytetow):

| # | Akcja | Wplyw | Trudnosc |
|---|-------|-------|----------|
| 1 | Dodac walidacje inputu (schemas) | Zapobiega crashom i memory issues | Niska |
| 2 | WebSocket heartbeat + per-message throttling | Stabilnosc polaczen | Niska |
| 3 | Redis dla room state | Umozliwia multi-instance | Srednia |
| 4 | Background job queue (BullMQ) dla AI generation | Odblokowanie request handlers | Srednia |
| 5 | Graceful shutdown + drain | Zero-downtime deploys | Niska |
| 6 | Per-user rate limiting (zamiast per-IP) | Fair usage | Niska |
| 7 | DB connection pool tuning | Wiecej concurrent queries | Niska |
| 8 | CDN dla static assets i media | Odciazenie serwera | Srednia |

### Architektura docelowa (multi-instance):

```
                    Load Balancer (sticky sessions)
                   /              |              \
            Instance 1      Instance 2      Instance 3
                 \              |              /
                  Redis (pub/sub + room state)
                  MongoDB Atlas (connection pool)
                  BullMQ (AI job queue)
```

---

## Co jest dobrze zrobione

- Bcrypt 12 rounds — solidne hashowanie hasel
- AES-256-GCM dla stored API keys — poprawna kryptografia
- Ownership checks na wszystkich CRUD — `request.user.id` weryfikowany konsekwentnie
- WebSocket message queue pattern — sekwencyjne przetwarzanie, brak race conditions
- Prisma ORM — ochrona przed injection
- Room cleanup z TTL — automatyczne czyszczenie nieaktywnych sesji
- DB persistence dla sesji multiplayer — przezywa restart
- Scoped rate limiting — rozne limity dla roznych typow endpointow
- Path traversal prevention — sanityzacja sciezek w media routes
- CORS production guard — blokuje wildcard w production

---

## Plan implementacji poprawek

### Faza 1 — Krytyczne (natychmiast)
- [ ] Dodac Fastify JSON schemas do wszystkich endpointow
- [ ] Dodac rate limit scope dla `/multiplayer` i `/game-data`
- [ ] Per-message throttling na WebSocket
- [ ] Zamienic ciche `.catch(() => {})` na logowane ostrzezenia

### Faza 2 — Wazne (ten sprint)
- [ ] WebSocket heartbeat (ping/pong)
- [ ] Graceful shutdown (WS close, request drain, room save)
- [ ] Zmniejszyc globalny bodyLimit, per-route override na media
- [ ] Wlaczyc bazowy CSP

### Faza 3 — Skalowanie (przed wiekszym ruchem)
- [ ] Redis adapter dla room state
- [ ] BullMQ dla AI generation jobs
- [ ] Health check z DB ping
- [ ] Structured logging z kontekstem

### Faza 4 — Jakosc kodu (ongoing)
- [ ] Rozdzielic monolityczne pliki (sceneGenerator, multiplayerAI)
- [ ] Ekstrakcja proxy route middleware
- [ ] Testy: auth, character mutations, campaign state
- [ ] Refresh token + token revocation

---

## Kluczowe pliki do modyfikacji

- `backend/src/server.js` — rate limits, bodyLimit, CSP, graceful shutdown
- `backend/src/routes/*.js` — dodanie schemas
- `backend/src/routes/multiplayer.js` — heartbeat, message throttling
- `backend/src/services/roomManager.js` — error logging, Redis migration
- `backend/src/plugins/auth.js` — refresh token (faza 4)
- `backend/src/lib/prisma.js` — shutdown handler rozszerzenie
