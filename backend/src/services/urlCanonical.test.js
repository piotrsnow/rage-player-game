import { describe, it, expect } from 'vitest';
import { toCanonicalStoragePath, canonicalizeFields } from './urlCanonical.js';

describe('toCanonicalStoragePath', () => {
  it('returns falsy/data/blob inputs unchanged', () => {
    expect(toCanonicalStoragePath('')).toBe('');
    expect(toCanonicalStoragePath(null)).toBe(null);
    expect(toCanonicalStoragePath(undefined)).toBe(undefined);
    expect(toCanonicalStoragePath('data:image/png;base64,abc')).toBe('data:image/png;base64,abc');
  });

  it('strips host and ?token= from hydrated media URLs', () => {
    expect(
      toCanonicalStoragePath('http://backend:3001/v1/media/file/images/abc.jpg?token=XYZ'),
    ).toBe('/v1/media/file/images/abc.jpg');
  });

  it('is idempotent on canonical paths', () => {
    const canonical = '/v1/media/file/images/abc.jpg';
    expect(toCanonicalStoragePath(canonical)).toBe(canonical);
    expect(toCanonicalStoragePath(toCanonicalStoragePath(canonical))).toBe(canonical);
  });

  it('hoists legacy pre-versioned paths onto /v1', () => {
    expect(toCanonicalStoragePath('/media/file/x.jpg')).toBe('/v1/media/file/x.jpg');
    expect(toCanonicalStoragePath('/proxy/openai/images')).toBe('/v1/proxy/openai/images');
  });

  it('converts legacy GCS signed URLs to canonical paths', () => {
    expect(
      toCanonicalStoragePath(
        'https://storage.googleapis.com/my-bucket/images/abc.jpg?Expires=123&Signature=xyz',
      ),
    ).toBe('/v1/media/file/images/abc.jpg');
  });

  it('leaves remote (non-media) URLs unchanged', () => {
    expect(toCanonicalStoragePath('https://cdn.example.com/foo.png')).toBe(
      'https://cdn.example.com/foo.png',
    );
  });
});

describe('canonicalizeFields', () => {
  it('rewrites listed string fields in place', () => {
    const obj = {
      portraitUrl: 'http://host/v1/media/file/p.jpg?token=A',
      name: 'Anna',
    };
    canonicalizeFields(obj, ['portraitUrl', 'name']);
    expect(obj.portraitUrl).toBe('/v1/media/file/p.jpg');
    expect(obj.name).toBe('Anna');
  });

  it('ignores missing fields', () => {
    const obj = { a: '/v1/media/file/x.jpg' };
    canonicalizeFields(obj, ['a', 'b']);
    expect(obj.a).toBe('/v1/media/file/x.jpg');
    expect('b' in obj).toBe(false);
  });

  it('returns the same reference', () => {
    const obj = { portraitUrl: '/v1/media/file/p.jpg' };
    expect(canonicalizeFields(obj, ['portraitUrl'])).toBe(obj);
  });
});
