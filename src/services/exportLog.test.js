import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { exportAsJson } from './exportLog';

function setupDomStubs() {
  const clicks = [];
  const appended = [];
  const removed = [];
  const blobs = [];

  class FakeBlob {
    constructor(parts, options) {
      this.parts = parts;
      this.type = options?.type;
    }
  }

  const createdLinks = [];
  const fakeDocument = {
    createElement: (tag) => {
      if (tag !== 'a') throw new Error(`unexpected tag: ${tag}`);
      const link = {
        tag,
        href: '',
        download: '',
        click: () => clicks.push({ href: link.href, download: link.download }),
      };
      createdLinks.push(link);
      return link;
    },
    body: {
      appendChild: (el) => appended.push(el),
      removeChild: (el) => removed.push(el),
    },
  };

  vi.stubGlobal('Blob', FakeBlob);
  vi.stubGlobal('document', fakeDocument);
  vi.stubGlobal('URL', {
    createObjectURL: (blob) => {
      blobs.push(blob);
      return `blob:mock-${blobs.length}`;
    },
    revokeObjectURL: () => {},
  });

  return { clicks, appended, removed, blobs, createdLinks };
}

describe('exportAsJson', () => {
  let stubs;

  beforeEach(() => {
    stubs = setupDomStubs();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('strips loading/error/generation flags and serializes the rest', () => {
    exportAsJson({
      isLoading: true,
      error: 'boom',
      isGeneratingScene: true,
      isGeneratingImage: true,
      campaign: { name: 'Moja Kampania' },
      scenes: [{ id: 's1' }],
    });

    const blob = stubs.blobs[0];
    expect(blob.type).toBe('application/json');
    const payload = JSON.parse(blob.parts[0]);
    expect(payload).toEqual({
      campaign: { name: 'Moja Kampania' },
      scenes: [{ id: 's1' }],
    });
  });

  it('builds a dated, sanitized filename from the campaign name', () => {
    exportAsJson({ campaign: { name: 'Zły / Krzemuch?' } });

    expect(stubs.clicks).toHaveLength(1);
    const { download } = stubs.clicks[0];
    expect(download).toMatch(/^Zły_Krzemuch_\d{4}-\d{2}-\d{2}\.json$/);
  });

  it('falls back to "campaign" when there is no name', () => {
    exportAsJson({});

    const { download } = stubs.clicks[0];
    expect(download).toMatch(/^campaign_\d{4}-\d{2}-\d{2}\.json$/);
  });
});
