import { useEffect, useState } from 'react';
import { apiClient } from '../../../../services/apiClient';
import ModalShell from '../shared/ModalShell';
import EventList from '../shared/EventList';
import { KV, Section, Empty } from '../shared/primitives';

export default function LocationListTab() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [detailId, setDetailId] = useState(null);

  useEffect(() => {
    setLoading(true);
    apiClient.get('/v1/admin/livingWorld/locations?limit=200')
      .then((r) => setRows(Array.isArray(r?.rows) ? r.rows : []))
      .finally(() => setLoading(false));
  }, []);

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
                  <ScopeIcon isCanonical={l.isCanonical} />
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

function LocationDetailModal({ id, onClose }) {
  const [data, setData] = useState(null);
  useEffect(() => {
    apiClient.get(`/v1/admin/livingWorld/locations/${id}`).then(setData);
  }, [id]);
  if (!data) return <ModalShell onClose={onClose}><div>Loading…</div></ModalShell>;
  const { location, npcs = [], events = [], aliases = [] } = data;
  return (
    <ModalShell onClose={onClose} title={location.canonicalName}>
      <div className="text-[11px] text-on-surface">
        <div className="flex items-center gap-2 mb-3">
          <ScopeIcon isCanonical={location.isCanonical} />
          <span className="text-[10px] font-label uppercase tracking-widest text-on-surface-variant">
            {location.isCanonical ? 'World (canonical)' : `Campaign-scoped${location.createdByCampaignId ? ` · ${location.createdByCampaignId.slice(-6)}` : ''}`}
          </span>
        </div>
        <div className="grid grid-cols-2 gap-3 mb-3">
          <KV k="region" v={location.region || '—'} />
          <KV k="category" v={location.category} />
          <KV k="aliases" v={(aliases || []).join(', ') || '—'} />
        </div>
        {location.description && <p className="mb-3 text-on-surface-variant">{location.description}</p>}
        <Section title={`NPCs here (${npcs.length})`}>
          {npcs.length === 0 ? <Empty /> : (
            <ul className="space-y-0.5">
              {npcs.map((n) => (
                <li key={n.id}>
                  <span className="font-bold">{n.name}</span>
                  {n.role && <span className="text-on-surface-variant"> ({n.role})</span>}
                  {n.companionOfCampaignId && <span className="ml-2 text-tertiary">[companion]</span>}
                  {n.pausedAt && <span className="ml-2 text-on-surface-variant">[paused]</span>}
                </li>
              ))}
            </ul>
          )}
        </Section>
        <Section title={`Recent events (${events.length})`}>
          <EventList events={events} />
        </Section>
      </div>
    </ModalShell>
  );
}

function ScopeIcon({ isCanonical }) {
  if (isCanonical) {
    return (
      <span
        title="Canonical world location (shared across all campaigns)"
        className="material-symbols-outlined text-[14px] text-primary"
      >
        public
      </span>
    );
  }
  return (
    <span
      title="Campaign-scoped location (not promoted to canonical world yet)"
      className="material-symbols-outlined text-[14px] text-tertiary"
    >
      flag
    </span>
  );
}
