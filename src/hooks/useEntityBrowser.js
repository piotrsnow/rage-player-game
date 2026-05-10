import { useState, useCallback, useEffect, useRef } from 'react';
import { apiClient } from '../services/apiClient.js';

const ENTITY_TYPES = [
  'WorldNPC', 'WorldLocation', 'Road',
  'CampaignNPC', 'CampaignLocation', 'CampaignEdge', 'CampaignQuest', 'Character',
];

const PAGE_SIZE = 50;

export function useEntityBrowser(campaignId) {
  const [entities, setEntities] = useState([]);
  const [counts, setCounts] = useState({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [typeFilter, setTypeFilter] = useState(null);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState(null);
  const [selectedIds, setSelectedIds] = useState(new Set());
  const abortRef = useRef(null);

  const fetch = useCallback(async () => {
    if (abortRef.current) abortRef.current.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (typeFilter) params.set('type', typeFilter);
      if (search.trim()) params.set('search', search.trim());
      if (campaignId) params.set('campaignId', campaignId);
      params.set('page', String(page));
      params.set('limit', String(PAGE_SIZE));

      const data = await apiClient.get(`/admin/livingWorld/entities?${params.toString()}`);
      if (!controller.signal.aborted) {
        setEntities(data.entities || []);
        setCounts(data.counts || {});
      }
    } catch (err) {
      if (!controller.signal.aborted) {
        setError(err.message || 'Failed to load entities');
      }
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  }, [typeFilter, search, page, campaignId]);

  useEffect(() => { fetch(); }, [fetch]);

  const toggleSelect = useCallback((id) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const selectAll = useCallback(() => {
    setSelectedIds(new Set(entities.map((e) => e.id)));
  }, [entities]);

  const clearSelection = useCallback(() => {
    setSelectedIds(new Set());
  }, []);

  const deleteEntity = useCallback(async (type, id) => {
    try {
      await apiClient.del(`/admin/livingWorld/entities/${type}/${id}`);
      setEntities((prev) => prev.filter((e) => e.id !== id));
      setSelectedIds((prev) => { const next = new Set(prev); next.delete(id); return next; });
      if (selected?.id === id) setSelected(null);
    } catch (err) {
      setError(err.message || 'Delete failed');
    }
  }, [selected]);

  const bulkDelete = useCallback(async () => {
    if (selectedIds.size === 0) return;
    const items = entities
      .filter((e) => selectedIds.has(e.id))
      .map((e) => ({ type: e.type, id: e.id }));
    try {
      await apiClient.request('/admin/livingWorld/entities/bulk', { method: 'DELETE', body: { items } });
      const deletedIds = new Set(items.map((i) => i.id));
      setEntities((prev) => prev.filter((e) => !deletedIds.has(e.id)));
      setSelectedIds(new Set());
      if (selected && deletedIds.has(selected.id)) setSelected(null);
    } catch (err) {
      setError(err.message || 'Bulk delete failed');
    }
  }, [selectedIds, entities, selected]);

  return {
    entities, counts, loading, error,
    typeFilter, setTypeFilter,
    search, setSearch,
    page, setPage,
    selected, setSelected,
    selectedIds, toggleSelect, selectAll, clearSelection,
    deleteEntity, bulkDelete, refresh: fetch,
    ENTITY_TYPES, PAGE_SIZE,
  };
}
