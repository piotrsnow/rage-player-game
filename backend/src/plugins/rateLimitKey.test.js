import { describe, it, expect, vi } from 'vitest';
import { buildRateLimitKey } from './rateLimitKey.js';

function makeRequest({ verifyResult = null, verifyThrows = null, ip = '1.2.3.4' } = {}) {
  const request = {
    ip,
    user: null,
    jwtVerify: vi.fn(async () => {
      if (verifyThrows) throw verifyThrows;
      request.user = verifyResult;
      return verifyResult;
    }),
  };
  return request;
}

describe('buildRateLimitKey', () => {
  it('returns u:<id> when JWT verifies and payload has id', async () => {
    const request = makeRequest({ verifyResult: { id: 'user-abc', email: 'a@b.com' } });
    const key = await buildRateLimitKey(request);
    expect(key).toBe('u:user-abc');
    expect(request.jwtVerify).toHaveBeenCalledTimes(1);
  });

  it('falls back to ip: when no Authorization header (jwtVerify throws)', async () => {
    const request = makeRequest({
      verifyThrows: new Error('No Authorization was found in request.headers'),
      ip: '10.0.0.42',
    });
    const key = await buildRateLimitKey(request);
    expect(key).toBe('ip:10.0.0.42');
  });

  it('falls back to ip: on invalid JWT signature', async () => {
    const request = makeRequest({
      verifyThrows: new Error('Authorization token is invalid: The token signature is invalid.'),
      ip: '192.168.1.1',
    });
    const key = await buildRateLimitKey(request);
    expect(key).toBe('ip:192.168.1.1');
  });

  it('falls back to ip: on expired JWT', async () => {
    const request = makeRequest({
      verifyThrows: new Error('Authorization token expired'),
      ip: '127.0.0.1',
    });
    const key = await buildRateLimitKey(request);
    expect(key).toBe('ip:127.0.0.1');
  });

  it('falls back to ip: when JWT payload is missing id (edge case)', async () => {
    // Valid token but payload somehow has no id field — should not key with undefined.
    const request = makeRequest({ verifyResult: { email: 'no-id@example.com' }, ip: '8.8.8.8' });
    const key = await buildRateLimitKey(request);
    expect(key).toBe('ip:8.8.8.8');
  });

  it('namespaces u: and ip: so they cannot collide', async () => {
    const userReq = makeRequest({ verifyResult: { id: '1.2.3.4' } });
    const ipReq = makeRequest({ verifyThrows: new Error('no auth'), ip: '1.2.3.4' });
    const userKey = await buildRateLimitKey(userReq);
    const ipKey = await buildRateLimitKey(ipReq);
    expect(userKey).toBe('u:1.2.3.4');
    expect(ipKey).toBe('ip:1.2.3.4');
    expect(userKey).not.toBe(ipKey);
  });
});
