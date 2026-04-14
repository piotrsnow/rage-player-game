// Custom rate-limit key generator. Called by @fastify/rate-limit on every
// rate-limited request to pick the bucket the counter increments against.
//
// Default behavior: keyed per-IP. Problems with that at our scale:
//   - Shared IPs (corporate NAT, VPN, mobile carrier) throttle legitimate
//     users against each other.
//   - Authenticated users can burst their account from many IPs to bypass
//     limits.
//   - No path to per-tier limits (free/paid) once billing lands.
//
// This keyGenerator runs in the global `onRequest` hook that
// @fastify/rate-limit installs, which fires BEFORE route-level hooks like
// `onRequest: [fastify.authenticate]`. That means `request.user` is not yet
// populated when we're called — we have to verify the JWT ourselves.
//
// Verification cost: HMAC check ~50-200μs. For authenticated routes this
// effectively runs twice (once here, once in route authenticate). Acceptable
// tradeoff — rate limiting is not the hot path and we avoid plumbing order
// dependencies between plugins and routes.
//
// Keys are namespaced so Redis buckets for `u:123` and `ip:1.2.3.4` can never
// collide — and so a user with id "1.2.3.4" (unlikely, but) does not share
// with the IP bucket for the same address.

export async function buildRateLimitKey(request) {
  try {
    await request.jwtVerify();
    const userId = request.user?.id;
    if (userId) return `u:${userId}`;
  } catch {
    // No token, expired, bad signature — fall through to IP.
  }
  return `ip:${request.ip}`;
}
