# SSE streaming in Fastify — `writeSseHead` invariants

Server-Sent Events in this codebase go through a canonical helper: `writeSseHead()` in [backend/src/routes/ai.js](../../backend/src/routes/ai.js). It sets up direct socket writes via `reply.raw.writeHead` + `reply.raw.write` with four load-bearing steps. Skip any of them and SSE degrades in subtle, hard-to-debug ways.

## The writeSseHead invariants

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

- **`reply.hijack()`** — historically (pre-`281a826`) hijack was installed specifically to bypass `@fastify/compress` buffering — compress subscribed to the `onSend` lifecycle and buffered every `reply.raw.write()` call, making SSE look like a one-shot JSON response after ~30s. Compress was removed in `281a826` but **hijack stays for three defensive reasons**:

  1. **Clean lifecycle handoff.** Writing directly to `reply.raw` without calling `reply.send()` leaves Fastify in "handler didn't respond" state. That emits log warnings and can trigger response timeouts. Hijack is the documented way to tell Fastify "I own this socket, don't wait for me."

  2. **Defense against future `onSend` hooks.** Any plugin added later (audit log, metrics wrapper, auth response rewrite, compress redux) that registers an `onSend` hook would silently buffer SSE writes. Hijack is one line of code that makes every such addition safe-by-default instead of a tripwire.

  3. **Structural decoupling from `idempotency.js`.** The only current `onSend` hook is [backend/src/plugins/idempotency.js:82](../../backend/src/plugins/idempotency.js#L82) and it short-circuits on missing `config.idempotency: true`. SSE routes don't opt into idempotency so it's currently a no-op — but that's accidental. Hijack makes it structural: a future dev who adds `idempotency: true` to an SSE route won't silently break the stream.

- **`Content-Encoding: identity`** — was the primary pair with hijack against `@fastify/compress`. Post-removal it's defense-in-depth against anything else that might try to compress (nginx/CDN upstream gzip, a future in-process compress middleware, a reverse proxy plugin). Zero cost when nothing is compressing; cheap insurance against something that does.

- **Manual CORS headers** — `reply.raw.writeHead` bypasses Fastify's header pipeline entirely. `corsPlugin` never runs on raw writes, so we must write `Access-Control-Allow-Origin` ourselves. Use `resolveSseCorsOrigin()` from [backend/src/plugins/cors.js](../../backend/src/plugins/cors.js) which reads the allowlist. Without this, the browser rejects the response with a CORS error even though the TCP connection succeeded.

- **`setNoDelay(true)`** — Nagle's algorithm batches small TCP writes for up to ~40ms to reduce packet count. On SSE that translates directly to latency per event. Disable it. Unrelated to hijack or compress — purely a latency-per-frame concern.

- **`X-Accel-Buffering: no`** — tells nginx (if used as reverse proxy) not to buffer the upstream response. Harmless when there's no nginx.

## Historical note (2026-04-15)

Commit `281a826` ("streaming fix, local docker to atlas") removed `@fastify/compress` entirely from [backend/package.json](../../backend/package.json) and [backend/src/server.js](../../backend/src/server.js). Prior to that commit, `reply.hijack()` and `Content-Encoding: identity` were installed **specifically** to prevent compress's `onSend` hook from buffering SSE writes — the symptom was that streams arrived as single giant JSON chunks after ~30s instead of progressive events. After the removal, both stay as defensive measures per the rationale above. The git history will show why it looks like a workaround for a plugin we no longer use.

## Event writing convention

```js
const writeEvent = (event) => {
  try {
    reply.raw.write(`event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`);
  } catch {
    // client disconnected
  }
};
```

Always wrap writes in try/catch — once the client disconnects, `raw.write` throws synchronously. Bare `reply.raw.end()` on cleanup; never `return reply.send(...)` after hijack.

## Current routes that use this pattern

- `POST /v1/ai/generate-campaign` — SSE with BullMQ pub/sub bridge (subscribes to `campaign-job:<jobId>:events`, forwards messages verbatim). Inline SSE fallback when Redis disabled. See [[../decisions/bullmq-vs-sse-routes]].
- `POST /v1/ai/campaigns/:id/generate-scene-stream` — SSE with BullMQ pub/sub bridge (`scene-job:<jobId>:events`). Same shape as campaign-gen.

Both routes use the same `writeSseHead` helper + the same subscribe-before-enqueue ordering from [[bullmq-queues]].

## Don't

- Don't use `reply.send()` on SSE routes — it conflicts with hijack.
- Don't rely on `corsPlugin` for SSE responses — raw writes bypass it.
- Don't forget to clear the safety timeout (`setTimeout + clearTimeout`) on `request.raw.on('close')` or you leak timers per disconnect.
- Don't gzip SSE upstream of Fastify (nginx, cloud load balancer). `identity` in the response headers is advisory — actual compression happens at the proxy layer and must be disabled there separately.
- Don't remove hijack "because compress is gone" — the three defensive reasons above still apply. If a concrete future incident shows it's causing problems, that's a separate decision.

## Client parser and test mocks

The frontend SSE reader lives in [src/services/ai/service.js](../../src/services/ai/service.js). It reads the stream line-by-line, **only consumes lines starting with `data: `**, and completely **ignores `event: ` prefix lines**. The `event.type` is carried inside the JSON payload, not as an SSE event name:

```js
for (const line of lines) {
  if (!line.startsWith('data: ')) continue;
  const event = JSON.parse(line.slice(6));           // strip "data: "
  if (event.type === 'chunk' && event.text) { /* partial parse */ }
  else if (event.type === 'complete') { result = event.data; gotComplete = true; }
  else if (event.type === 'error') { throw new Error(event.error); }
}
```

### Event shapes the parser recognises

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

The parser breaks out of the main read loop the moment it sees `type: 'complete'`. Post-complete events (`quest_nano_update`) are consumed asynchronously in a background reader that doesn't block the caller's promise. If your mock emits `complete` first and then additional events, the main code path returns immediately and the extras are best-effort; if you want them to take effect, they must arrive in the same stream chunk **before** `complete`.

The stream MUST contain a `complete` event — otherwise the parser throws `"Stream ended without complete event"` after the reader closes. Tests that want to exercise the error path should emit `{type:'error', error:'...'}` instead of just closing.

### Mocking SSE in Playwright

`page.route()` can fulfil the full stream in one `body` payload. The frontend parser works on whole lines so emitting all events concatenated is fine:

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
},
```

Notes:

- **Don't use `route.continue()` to stream in chunks** — Playwright's route API doesn't support progressive writes well, and the frontend tolerates the whole-body variant because it accumulates `chunk.text` into `rawAccumulated` before parsing anyway.
- **`complete.data.scene`** must have the fields the downstream code reads: at minimum `dialogueSegments`, `suggestedActions`, `scenePacing`, `atmosphere`, `stateChanges`. Skipping them often makes the scene render blank instead of erroring — brittle. Use a realistic minimal payload like the one in `interceptBackendSceneStream()` as the baseline.
- **The scene object flows through `postProcessSuggestedActions()`** after `complete`, which needs `gameState` and localised strings. If your test doesn't provide suggestedActions, this is a no-op; if it does, make sure they're strings, not objects.

Worked example with full test setup: [e2e/specs/combat.spec.js](../../e2e/specs/combat.spec.js) + [e2e/helpers/seedCombatCampaign.js](../../e2e/helpers/seedCombatCampaign.js). See also [e2e-campaign-seeding.md](./e2e-campaign-seeding.md) for the companion pattern that mocks `GET /campaigns/:id`.
