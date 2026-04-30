import { useCallback, useEffect, useRef, useState } from 'react';
import { apiClient } from '../../services/apiClient';

const DEFAULT_PAGE_SIZE = 5;

export default function usePlaygroundHistory({ pageSize = DEFAULT_PAGE_SIZE, enabled = true } = {}) {
  const [items, setItems] = useState([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const reqIdRef = useRef(0);

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  const load = useCallback(async (nextPage = 1) => {
    if (!enabled) return;
    const reqId = ++reqIdRef.current;
    setLoading(true);
    setError(null);
    try {
      const qs = new URLSearchParams({ page: String(nextPage), pageSize: String(pageSize) });
      const json = await apiClient.get(`/playground/history?${qs.toString()}`);
      if (reqId !== reqIdRef.current) return;
      setItems(Array.isArray(json?.items) ? json.items : []);
      setTotal(Number.isInteger(json?.total) ? json.total : 0);
      setPage(nextPage);
    } catch (err) {
      if (reqId !== reqIdRef.current) return;
      setError(err?.message || String(err));
      setItems([]);
      setTotal(0);
    } finally {
      if (reqId === reqIdRef.current) setLoading(false);
    }
  }, [pageSize, enabled]);

  useEffect(() => {
    if (enabled) load(1);
  }, [enabled, load]);

  const append = useCallback(async (payload) => {
    try {
      const json = await apiClient.post('/playground/history', payload);
      if (page === 1 && json?.entry) {
        setItems((prev) => {
          const next = [json.entry, ...prev];
          return next.slice(0, pageSize);
        });
        setTotal((prev) => prev + 1);
      } else {
        setTotal((prev) => prev + 1);
      }
      return json?.entry || null;
    } catch (err) {
      setError(err?.message || String(err));
      return null;
    }
  }, [page, pageSize]);

  const remove = useCallback(async (id) => {
    try {
      await apiClient.del(`/playground/history/${id}`);
      await load(page);
    } catch (err) {
      setError(err?.message || String(err));
    }
  }, [load, page]);

  const goPrev = useCallback(() => {
    if (page > 1) load(page - 1);
  }, [page, load]);

  const goNext = useCallback(() => {
    if (page < totalPages) load(page + 1);
  }, [page, totalPages, load]);

  return {
    items,
    page,
    pageSize,
    total,
    totalPages,
    loading,
    error,
    load,
    append,
    remove,
    goPrev,
    goNext,
  };
}
