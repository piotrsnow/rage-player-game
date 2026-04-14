# SSE streaming in Fastify — the hijack gotcha

Server-Sent Events in this codebase need a very specific header + hijack setup. Skip any step and SSE silently degrades into "one-shot JSON after ~30s". The canonical helper is `writeSseHead()` in [backend/src/routes/ai.js](../../backend/src/routes/ai.js).

## The 4 non-negotiable steps

```js
function writeSseHead(request, reply) {
  const origin = resolveSseCorsOrigin(request.headers.origin);
  if (origin === false) {
    reply.code(403).send({ error: 'Origin not allowed' });
    return false;
  }

  // 1. Hijack the reply — stop Fastify's onSend lifecycle from running.
  reply.hijack();

  const headers = {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
    // 2. Explicit identity encoding — defense in depth against compression.
    'Content-Encoding': 'identity',
  };

  // 3. Manual CORS — hijack bypasses every Fastify hook, including corsPlugin.
  if (origin) {
    headers['Access-Control-Allow-Origin'] = origin;
    headers['Access-Control-Allow-Credentials'] = 'true';
  }

  reply.raw.writeHead(200, headers);

  // 4. Disable Nagle — flush small SSE frames immediately instead of
  //    waiting ~40ms to batch with the next write.
  request.raw.socket?.setNoDelay(true);
  return true;
}
```

## Why each step matters

- **`reply.hijack()`** — `@fastify/compress` subscribes to the `onSend` lifecycle. Without hijack it buffers every `reply.raw.write()` call and only flushes on response `end`. The symptom: the FE gets a single giant chunk at the end of the stream (~30s later) instead of progressive events. This was the 2026-04-15 "streaming fix" — scene streaming was completely broken by the compress plugin silently buffering.
- **`Content-Encoding: identity`** — belt-and-braces against any compression middleware that might still see the response (helmet, proxies, nginx upstream). SSE cannot be gzipped.
- **Manual CORS headers** — once hijacked, Fastify's `corsPlugin` is out of the picture. You MUST write the `Access-Control-Allow-Origin` header yourself using `resolveSseCorsOrigin()` from [backend/src/plugins/cors.js](../../backend/src/plugins/cors.js) (which reads the allowlist). Without this, the browser rejects the response because it lacks CORS headers even though the TCP connection succeeded.
- **`setNoDelay(true)`** — Nagle's algorithm batches small TCP writes for up to ~40ms to reduce packet count. On SSE that translates directly to latency per event. Disable it.
- **`X-Accel-Buffering: no`** — tells nginx (if used as reverse proxy) not to buffer the upstream response. Harmless if there's no nginx.

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

- `POST /v1/ai/generate-campaign` — inline SSE (see [decisions/bullmq-vs-sse-routes](../decisions/bullmq-vs-sse-routes.md) for why not via BullMQ).
- `POST /v1/ai/campaigns/:id/generate-scene-stream` — SSE with a BullMQ pub/sub bridge behind it. Route subscribes to `scene-job:<jobId>:events`, forwards every pub/sub message verbatim as `data: ...`.

## Don't

- Don't use `reply.send()` on SSE routes — it conflicts with hijack.
- Don't rely on `corsPlugin` for SSE responses — it does nothing after hijack.
- Don't forget to clear the safety timeout (`setTimeout + clearTimeout`) on `request.raw.on('close')` or you leak timers per disconnect.
- Don't gzip SSE upstream of Fastify (nginx, cloud load balancer). `identity` in the response headers is advisory — the actual compression would happen at the proxy layer.
