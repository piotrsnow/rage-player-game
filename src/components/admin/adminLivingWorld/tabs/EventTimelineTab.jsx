import { useCallback, useEffect, useState } from 'react';
import { apiClient } from '../../../../services/apiClient';
import FilterSelect from '../shared/FilterSelect';
import EventList from '../shared/EventList';

export default function EventTimelineTab() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState({ eventType: '', visibility: '' });

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const q = new URLSearchParams();
      if (filter.eventType) q.set('eventType', filter.eventType);
      if (filter.visibility) q.set('visibility', filter.visibility);
      q.set('limit', '200');
      const res = await apiClient.get(`/v1/admin/livingWorld/events?${q}`);
      setRows(Array.isArray(res?.rows) ? res.rows : []);
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => { refresh(); }, [refresh]);

  return (
    <div>
      <div className="flex gap-3 mb-3 text-[11px]">
        <label className="flex items-center gap-1">
          <span className="text-on-surface-variant">eventType:</span>
          <input
            type="text"
            value={filter.eventType}
            onChange={(e) => setFilter({ ...filter, eventType: e.target.value })}
            placeholder="moved|killed|..."
            className="px-2 py-1 bg-surface-container rounded-sm border border-outline-variant/25 text-on-surface"
          />
        </label>
        <FilterSelect label="visibility" value={filter.visibility} onChange={(v) => setFilter({ ...filter, visibility: v })}
          options={[['', 'any'], ['campaign', 'campaign'], ['private', 'private'], ['deferred', 'deferred'], ['global', 'global']]} />
        <div className="ml-auto text-on-surface-variant self-center">{loading ? '…' : `${rows.length} events`}</div>
      </div>
      <EventList events={rows} showCampaignId />
    </div>
  );
}
