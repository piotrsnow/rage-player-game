import { useState, useCallback, useRef } from 'react';
import { imageService } from '../services/imageGen.js';
import { apiClient } from '../services/apiClient.js';

/**
 * Client-side sequential bulk image generation for location graph nodes.
 * Supports both standard scene providers (proxy) and PixelLab (backend sprite endpoint).
 *
 * @param {{ campaignId?: string, onNodeComplete?: (nodeId: string, url: string) => void }} options
 */
export function useNodeImageBulkGeneration({ campaignId, onNodeComplete } = {}) {
  const [progress, setProgress] = useState(null);
  const [starting, setStarting] = useState(false);
  const cancelledRef = useRef(false);
  const activeRef = useRef(false);
  const onNodeCompleteRef = useRef(onNodeComplete);
  onNodeCompleteRef.current = onNodeComplete;

  const start = useCallback(async (nodes, { provider = 'dalle', sdModel = null } = {}) => {
    const missing = nodes.filter((n) => !n.nodeImageUrl);
    if (missing.length === 0 || activeRef.current) return;

    const isPixelLab = provider === 'pixellab';

    cancelledRef.current = false;
    activeRef.current = true;
    setStarting(true);
    setProgress({ done: 0, failed: 0, total: missing.length, status: 'running' });
    setStarting(false);

    let done = 0;
    let failed = 0;

    for (const node of missing) {
      if (cancelledRef.current) break;

      try {
        let url;
        if (isPixelLab) {
          const res = await apiClient.request(
            `/livingWorld/campaigns/${campaignId}/location-graph/nodes/${node.id}/generate-sprite`,
            { method: 'POST', body: {} },
          );
          url = res.nodeImageUrl;
        } else {
          const result = await imageService.generateNodeImage(node, {
            provider,
            campaignId,
            sdModel,
            forceNew: true,
          });
          url = result.url;
          if (url && campaignId) {
            await apiClient.request(
              `/livingWorld/campaigns/${campaignId}/location-graph/nodes/${node.id}`,
              { method: 'PUT', body: { nodeImageUrl: url } },
            ).catch(() => {});
          }
        }

        if (url && !cancelledRef.current) {
          onNodeCompleteRef.current?.(node.id, url);
        }
        done++;
      } catch (err) {
        console.error(`Node image gen failed for ${node.id}:`, err);
        failed++;
      }

      if (!cancelledRef.current) {
        setProgress({ done, failed, total: missing.length, status: 'running' });
      }
    }

    const finalStatus = cancelledRef.current ? 'cancelled' : 'completed';
    setProgress({ done, failed, total: missing.length, status: finalStatus });
    activeRef.current = false;
  }, [campaignId]);

  const cancel = useCallback(() => {
    cancelledRef.current = true;
    activeRef.current = false;
  }, []);

  const clearProgress = useCallback(() => {
    setProgress(null);
  }, []);

  const isActive = !!progress && progress.status === 'running';

  return { start, cancel, clearProgress, starting, isActive, progress };
}
