import { useEffect, useState } from 'react';
import { apiClient } from '../../../../services/apiClient';
import LocationDetailModal from '../shared/LocationDetailModal';

export default function LocationListTab({ campaignId = null }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [detailId, setDetailId] = useState(null);

  useEffect(() => {
    setLoading(true);
    const q = new URLSearchParams({ limit: '200' });
    if (campaignId) q.set('campaignId', campaignId);
    apiClient.get(`/v1/admin/livingWorld/locations?${q}`)
      .then((r) => setRows(Array.isArray(r?.rows) ? r.rows : []))
      .finally(() => setLoading(false));
  }, [campaignId]);

  return (
    <div>
      <div className="text-[11px] text-on-surface-variant mb-2">{loading ? 'Loading…' : `${rows.length} locations`}</div>
      <div className="rounded-sm border border-outline-variant/25 overflow-hidden">
        <table className="w-full text-[11px]">
          <thead className="bg-surface-container/60 text-on-surface-variant uppercase tracking-widest text-[9px]">
            <tr>
              <th className="px-2 py-1 text-left w-6"></th>
              <th className="px-2 py-1 text-left">Canonical name</th>
              <th className="px-2 py-1 text-left">Region</th>
              <th className="px-2 py-1 text-left">Category</th>
              <th className="px-2 py-1 text-left">Created</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((l) => (
              <tr key={l.id} onClick={() => setDetailId(l.id)} className="border-t border-outline-variant/10 hover:bg-surface-container/30 cursor-pointer">
                <td className="px-2 py-1 text-center">
                  <ScopeIcon />
                </td>
                <td className="px-2 py-1 font-bold text-on-surface">{l.canonicalName}</td>
                <td className="px-2 py-1">{l.region || '—'}</td>
                <td className="px-2 py-1">{l.category}</td>
                <td className="px-2 py-1 text-on-surface-variant">{new Date(l.createdAt).toISOString().slice(0, 10)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {detailId && <LocationDetailModal id={detailId} onClose={() => setDetailId(null)} />}
    </div>
  );
}

// F5b — `/v1/admin/livingWorld/locations` returns WorldLocation rows only,
// every one of which is canonical (the isCanonical flag was dropped). The
// admin Location List is canonical-only — campaign-scoped CampaignLocations
// surface in the promotion queue (PromotionsTab) until admin approves them
// into canonical.
function ScopeIcon() {
  return (
    <span
      title="Canonical world location (shared across all campaigns)"
      className="material-symbols-outlined text-[14px] text-primary"
    >
      public
    </span>
  );
}
