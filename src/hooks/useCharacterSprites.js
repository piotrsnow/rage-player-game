import { useState, useEffect, useRef, useMemo } from 'react';
import { apiClient } from '../services/apiClient';

function resolveSprites(raw) {
  const out = {};
  for (const [id, url] of Object.entries(raw || {})) {
    if (url) out[id] = apiClient.resolveMediaUrl(url);
  }
  return out;
}

/**
 * Lazy PixelLab character sprites for graph occupants (campaign NPC, party, admin WorldNPC).
 * @param {Array<{ id: string, kind: 'campaign-npc'|'character'|'world-npc', spriteUrl?: string|null }>} spriteItems
 * @param {{ campaignId?: string, endpoint: 'campaign'|'admin' }} opts
 */
export function useCharacterSprites(spriteItems, { campaignId, endpoint }) {
  const [extraSprites, setExtraSprites] = useState({});
  const [skippedIds, setSkippedIds] = useState([]);
  const skipSet = useMemo(() => new Set(skippedIds), [skippedIds]);
  const inFlightRef = useRef(false);

  const stableKey = useMemo(
    () => spriteItems
      .filter((i) => !i.spriteUrl && !extraSprites[i.id] && !skipSet.has(i.id))
      .map((i) => `${i.kind}:${i.id}`)
      .sort()
      .join('|'),
    [spriteItems, extraSprites, skipSet],
  );

  useEffect(() => {
    if (!stableKey) return;
    if (endpoint === 'campaign' && !campaignId) return;
    if (inFlightRef.current) return;

    const batch = spriteItems
      .filter((i) => !i.spriteUrl && !extraSprites[i.id] && !skipSet.has(i.id))
      .slice(0, 24);

    if (!batch.length) return;

    let cancelled = false;
    inFlightRef.current = true;

    const run = async () => {
      try {
        const path = endpoint === 'campaign'
          ? `/livingWorld/campaigns/${campaignId}/character-sprites/generate`
          : '/admin/livingWorld/character-sprites/generate';
        const data = await apiClient.post(path, {
          items: batch.map(({ id, kind }) => ({ id, kind })),
        });
        if (cancelled) return;
        const resolved = resolveSprites(data?.sprites);
        const missingUrls = [];
        for (const id of Object.keys(data?.sprites || {})) {
          if (!data.sprites[id]) missingUrls.push(id);
        }
        if (missingUrls.length) {
          setSkippedIds((prev) => [...new Set([...prev, ...missingUrls])]);
        }
        setExtraSprites((prev) => ({ ...prev, ...resolved }));
      } catch {
        setSkippedIds((prev) => [...new Set([...prev, ...batch.map((b) => b.id)])]);
      } finally {
        inFlightRef.current = false;
      }
    };

    run();
    return () => { cancelled = true; inFlightRef.current = false; };
  }, [stableKey, spriteItems, extraSprites, skipSet, campaignId, endpoint]);

  return extraSprites;
}
