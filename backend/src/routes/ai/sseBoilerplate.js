import { resolveSseCorsOrigin } from '../../plugins/cors.js';

/**
 * Take ownership of the reply socket for SSE, write headers directly, and
 * disable Nagle so small frames flush immediately.
 *
 * Three reasons hijack stays even though @fastify/compress was removed in
 * 281a826 (originally installed to prevent its onSend buffering):
 *   1. Clean lifecycle handoff — writing to reply.raw without calling
 *      reply.send() leaves Fastify in "handler didn't respond" state,
 *      which triggers log warnings and potential response timeouts.
 *   2. Defense against future onSend hooks — any plugin added later
 *      (audit log, metrics, compress redux, auth rewrite) with an onSend
 *      hook would silently buffer SSE writes unless we hijack.
 *   3. Structural decoupling from idempotency.js onSend — it currently
 *      short-circuits on missing `config.idempotency` so SSE routes are
 *      accidentally safe. Hijack makes that structural, not accidental.
 *
 * Returns true on success; on CORS rejection sends 403 and returns false.
 */
export function writeSseHead(request, reply) {
  const origin = resolveSseCorsOrigin(request.headers.origin);
  if (origin === false) {
    reply.code(403).send({ error: 'Origin not allowed' });
    return false;
  }
  reply.hijack();
  const headers = {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
    // Defense-in-depth pair with hijack — opts out of any upstream
    // compression (nginx/CDN gzip, future in-process compress middleware)
    // that might still see the raw response. Zero cost when no compressor
    // is in the stack.
    'Content-Encoding': 'identity',
  };
  if (origin) {
    // Manual CORS is required because reply.raw.writeHead bypasses
    // Fastify's header pipeline entirely — corsPlugin never runs on raw
    // writes. We resolve the allowlist via resolveSseCorsOrigin and write
    // the header directly here.
    headers['Access-Control-Allow-Origin'] = origin;
    headers['Access-Control-Allow-Credentials'] = 'true';
  }
  reply.raw.writeHead(200, headers);
  // Disable Nagle's algorithm so small SSE frames flush immediately
  // instead of waiting ~40ms to batch with the next write.
  request.raw.socket?.setNoDelay(true);
  return true;
}
