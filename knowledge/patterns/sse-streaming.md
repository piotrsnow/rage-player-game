# Pattern — SSE streaming in Fastify

Server-Sent Events in this codebase go through a canonical helper: `writeSseHead()` in [backend/src/routes/ai.js](../../backend/src/routes/ai.js). Four load-bearing steps. Skip any of them and SSE degrades in subtle, hard-to-debug ways.

## The `writeSseHead` invariants

```js
function writeSseHead(request, reply) {
  const origin = resolveSseCorsOrigin(request.headers.origin);
  if (origin === false) {
    reply.code(403).send({ error: 'Origin not allowed' });
    return false;
  }

  // 1. Hijack — take ownership of the socket, cancel Fastify's onSend lifecycle.
  reply.hijack();

  const headers = {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
    // 2. Identity encoding — defense-in-depth against upstream compression.
    'Content-Encoding': 'identity',
  };

  // 3. Manual CORS — reply.raw.writeHead bypasses Fastify's header pipeline.
  if (origin) {
    headers['Access-Control-Allow-Origin'] = origin;
    headers['Access-Control-Allow-Credentials'] = 'true';
  }

  reply.raw.writeHead(200, headers);

  // 4. Disable Nagle — flush SSE frames immediately, no ~40ms batching.
  request.raw.socket?.setNoDelay(true);
  return true;
}
```

## Why each step matters

### 1. `reply.hijack()`

Takes ownership of the socket and cancels Fastify's `onSend` lifecycle. Three defensive reasons it stays mandatory:

1. **Clean lifecycle handoff.** Writing directly to `reply.raw` without calling `reply.send()` leaves Fastify in "handler didn't respond" state → log warnings, potential response timeouts. Hijack is the documented way to say "I own this socket, don't wait for me."
2. **Defense against future `onSend` hooks.** Any plugin added later (audit log, metrics wrapper, auth response rewrite) that registers an `onSend` hook would silently buffer SSE writes. Hijack makes every such addition safe-by-default.
3. **Structural decoupling from opt-in plugins.** `idempotency.js` has an `onSend` hook that short-circuits on missing `config.idempotency: true`. SSE routes don't opt into idempotency so it's currently a no-op — but that's accidental. Hijack makes it structural: a future dev who adds `idempotency: true` to an SSE route won't silently break the stream.

### 2. `Content-Encoding: identity`

Defense-in-depth against anything that might try to compress the response (nginx/CDN upstream gzip, a future in-process compress middleware, a reverse proxy plugin). Zero cost when nothing is compressing; cheap insurance against something that does.

### 3. Manual CORS

`reply.raw.writeHead` bypasses Fastify's header pipeline entirely. `corsPlugin` never runs on raw writes, so CORS headers must be written manually. Use `resolveSseCorsOrigin()` from [backend/src/plugins/cors.js](../../backend/src/plugins/cors.js) which reads the allowlist. Without this, the browser rejects the response with a CORS error even though the TCP connection succeeded.

### 4. `setNoDelay(true)`

Nagle's algorithm batches small TCP writes for up to ~40ms to reduce packet count. On SSE that translates directly to per-event latency. Disable it. Unrelated to hijack — purely a latency-per-frame concern.

### 5. `X-Accel-Buffering: no`

Tells nginx (if used as reverse proxy) not to buffer the upstream response. Harmless when there's no nginx.

## Event writing convention

```js
const writeEvent = (event) => {
  try {
    reply.raw.write(`event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`);
  } catch {
    // client disconnected — write throws synchronously after disconnect
  }
};
```

Always wrap writes in try/catch — once the client disconnects, `raw.write` throws synchronously. Bare `reply.raw.end()` on cleanup; never `return reply.send(...)` after hijack.

## Current routes using this pattern

- `POST /v1/ai/generate-campaign` — SSE with BullMQ pub/sub bridge (channel `campaign-job:<jobId>:events`). Inline SSE fallback when Redis disabled.
- `POST /v1/ai/campaigns/:id/generate-scene-stream` — SSE with BullMQ pub/sub bridge (channel `scene-job:<jobId>:events`).

Both use the same `writeSseHead` helper and the same subscribe-before-enqueue ordering from [bullmq-queues.md](bullmq-queues.md).

## Client parser (frontend)

The frontend SSE reader lives in [src/services/ai/service.js](../../src/services/ai/service.js). Rules:

- Reads stream line-by-line.
- **Only consumes lines starting with `data: `.**
- **Completely ignores `event: ` prefix lines** — the `event.type` is carried inside the JSON payload.

```js
for (const line of lines) {
  if (!line.startsWith('data: ')) continue;
  const event = JSON.parse(line.slice(6));           // strip "data: "
  if (event.type === 'chunk' && event.text) { /* partial parse */ }
  else if (event.type === 'complete') { result = event.data; gotComplete = true; }
  else if (event.type === 'error') { throw new Error(event.error); }
}
```

### Event shapes

```
data: {"type":"intent","data":{"intent":"explore"}}
data: {"type":"context_ready","data":{}}
data: {"type":"dice_early","data":{"diceRoll":{...}}}
data: {"type":"chunk","text":"<partial JSON fragment>"}
data: {"type":"quest_nano_update","data":{"questUpdates":[...]}}    # post-complete
data: {"type":"complete","data":{"scene":{...},"sceneIndex":N,"sceneId":"..."}}
data: {"type":"error","error":"message","code":"optional"}
```

The backend writes both `event: TYPE\ndata: {...}\n\n` pairs; the `event:` line is belt-and-braces for SSE-strict clients but currently ignored. **When mocking SSE for tests, emit only `data: {...}\n\n` — skip the `event:` prefix.**

### Termination contract

The parser breaks out of the main read loop the moment it sees `type: 'complete'`. Post-complete events (`quest_nano_update`) are consumed asynchronously by a background reader that doesn't block the caller's promise. If your mock emits `complete` first and then extras, the main code path has already returned — the extras are best-effort. To guarantee they're applied, emit them **before** `complete`.

The stream MUST contain a `complete` event — otherwise the parser throws `Stream ended without complete event`. Tests exercising error paths should emit `{type:'error', error:'...'}` instead of just closing.

## Mocking SSE in Playwright

`page.route()` can fulfil the full stream in one `body` payload. The frontend parser accumulates lines before parsing so one-shot body is fine:

```js
// e2e/fixtures/api-mocks.fixture.js
async interceptBackendSceneStream(sceneOverrides = {}) {
  const scene = { narrative: '...', dialogueSegments: [...], stateChanges: {...}, ...sceneOverrides };
  const events = [
    { type: 'intent', data: { intent: 'explore' } },
    { type: 'context_ready', data: {} },
    { type: 'chunk', text: JSON.stringify({ narrative: scene.narrative }) },
    { type: 'complete', data: { scene, sceneIndex: scene.sceneIndex, sceneId: scene.sceneId } },
  ];
  const body = events.map((ev) => `data: ${JSON.stringify(ev)}\n\n`).join('');
  await page.route('**/ai/campaigns/*/generate-scene-stream', (route) => {
    return route.fulfill({
      status: 200,
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'X-Accel-Buffering': 'no',
      },
      body,
    });
  });
}
```

Notes:

- **Don't use `route.continue()` for progressive chunks** — Playwright's route API doesn't support progressive writes well. Whole-body works because the frontend accumulates `chunk.text` into `rawAccumulated` before parsing anyway.
- **`complete.data.scene`** must have the fields downstream code reads: at minimum `dialogueSegments`, `suggestedActions`, `scenePacing`, `atmosphere`, `stateChanges`. Skipping them makes the scene render blank instead of erroring — brittle. Use a realistic minimal payload.
- **`postProcessSuggestedActions()`** runs after `complete` and needs `gameState` + localised strings. If the test doesn't provide suggestedActions, it's a no-op; if it does, make sure they're strings.

Worked example with full test setup: [e2e/specs/combat.spec.js](../../e2e/specs/combat.spec.js) + [e2e/helpers/seedCombatCampaign.js](../../e2e/helpers/seedCombatCampaign.js). See also [e2e-campaign-seeding.md](e2e-campaign-seeding.md) for the companion pattern that mocks `GET /campaigns/:id`.

## Don't

- **Don't use `reply.send()` on SSE routes** — it conflicts with hijack.
- **Don't rely on `corsPlugin` for SSE responses** — raw writes bypass it. Always write CORS headers manually.
- **Don't forget to clear the safety timeout** (`setTimeout + clearTimeout`) on `request.raw.on('close')`, or you leak timers per disconnect.
- **Don't gzip SSE upstream of Fastify** (nginx, cloud load balancer). `identity` in the response headers is advisory — actual compression happens at the proxy layer and must be disabled there separately.
- **Don't remove hijack** "because no compress plugin is registered." The three defensive reasons still apply.

## Related

- [bullmq-queues.md](bullmq-queues.md) — the pub/sub bridge pattern these routes use
- [decisions/bullmq-vs-sse-routes.md](../decisions/bullmq-vs-sse-routes.md) — why these routes use BullMQ + SSE
- [e2e-campaign-seeding.md](e2e-campaign-seeding.md) — the companion pattern for `GET /campaigns/:id` mock
