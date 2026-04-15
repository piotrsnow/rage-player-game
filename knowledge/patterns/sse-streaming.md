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
