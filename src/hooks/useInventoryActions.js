import { useCallback } from 'react';
import { apiClient } from '../services/apiClient';

/**
 * Hook that wires inventory mutations (discard / combine / enchant) to the
 * single-shot backend endpoints and threads the returned snapshot back into
 * the store via `RECONCILE_CHARACTER_FROM_BACKEND`. Equipment scrub + lineage
 * lives on the server — FE only reconciles whatever the snapshot says.
 *
 * `useInventoryActions(character, dispatch)` returns:
 *   - discardItem(itemKey) → POST /characters/:id/items/:itemKey/discard
 *   - combineItems(payload, campaignId) → POST /ai/campaigns/:id/combine-items
 *   - enchantItem(payload, campaignId) → POST /ai/campaigns/:id/enchant-item
 *
 * All three reconcile the character snapshot from the endpoint response.
 * Combine and enchant ALSO return the verdict object so the caller (modal)
 * can render the result screen — they don't reset the FE selection state on
 * their own.
 */
export function useInventoryActions(character, dispatch) {
  const characterId = character?.backendId || character?.id || null;

  const reconcile = useCallback((snapshot) => {
    if (!snapshot || !dispatch) return;
    dispatch({ type: 'RECONCILE_CHARACTER_FROM_BACKEND', payload: snapshot });
  }, [dispatch]);

  const discardItem = useCallback(async (itemKey) => {
    if (!characterId || !itemKey) return null;
    const res = await apiClient.post(`/characters/${characterId}/items/${encodeURIComponent(itemKey)}/discard`);
    if (res?.character) reconcile(res.character);
    return res;
  }, [characterId, reconcile]);

  const combineItems = useCallback(async (campaignId, payload) => {
    if (!campaignId) throw new Error('combineItems: missing campaignId');
    const body = { ...payload, ...(characterId ? { characterId } : {}) };
    const res = await apiClient.post(`/ai/campaigns/${campaignId}/combine-items`, body);
    if (res?.character) reconcile(res.character);
    return res;
  }, [characterId, reconcile]);

  const enchantItem = useCallback(async (campaignId, payload) => {
    if (!campaignId) throw new Error('enchantItem: missing campaignId');
    const body = { ...payload, ...(characterId ? { characterId } : {}) };
    const res = await apiClient.post(`/ai/campaigns/${campaignId}/enchant-item`, body);
    if (res?.character) reconcile(res.character);
    return res;
  }, [characterId, reconcile]);

  return { discardItem, combineItems, enchantItem };
}
