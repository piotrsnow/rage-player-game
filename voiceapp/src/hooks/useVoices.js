import { useCallback, useEffect, useState } from 'react';
import { api } from '../api';

export function useVoices() {
  const [voices, setVoices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const list = await api.getVoices();
      setVoices(list);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const upload = useCallback(async (file, name, gender) => {
    const entry = await api.uploadVoice(file, name, gender);
    setVoices((prev) => [...prev, entry]);
    return entry;
  }, []);

  const patch = useCallback(async (id, data) => {
    const updated = await api.patchVoice(id, data);
    setVoices((prev) => prev.map((v) => (v.id === id ? updated : v)));
    return updated;
  }, []);

  const remove = useCallback(async (id) => {
    await api.deleteVoice(id);
    setVoices((prev) => prev.filter((v) => v.id !== id));
  }, []);

  return { voices, loading, error, refresh, upload, patch, remove };
}
