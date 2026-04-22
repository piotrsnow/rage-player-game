import { useEffect, useState } from 'react';
import { apiClient } from '../../../../services/apiClient';

export default function ReputationListTab() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setLoading(true);
    apiClient.get('/v1/admin/livingWorld/reputation?limit=200')
      .then((r) => setRows(Array.isArray(r?.rows) ? r.rows : []))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div>
      <div className="text-[11px] text-on-surface-variant mb-2">{loading ? 'Loading…' : `${rows.length} reputation rows`}</div>
      <div className="rounded-sm border border-outline-variant/25 overflow-hidden">
        <table className="w-full text-[11px]">
          <thead className="bg-surface-container/60 text-on-surface-variant uppercase tracking-widest text-[9px]">
            <tr>
              <th className="px-2 py-1 text-left">Character</th>
              <th className="px-2 py-1 text-left">Scope</th>
              <th className="px-2 py-1 text-left">Key</th>
              <th className="px-2 py-1 text-right">Score</th>
              <th className="px-2 py-1 text-left">Label</th>
              <th className="px-2 py-1 text-right">Bounty</th>
              <th className="px-2 py-1 text-left">Vendetta</th>
              <th className="px-2 py-1 text-left">Last incident</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-t border-outline-variant/10">
                <td className="px-2 py-1 font-mono text-[10px]">{r.characterId.slice(-8)}</td>
                <td className="px-2 py-1">{r.scope}</td>
                <td className="px-2 py-1">{r.scopeKey || '—'}</td>
                <td className={`px-2 py-1 text-right ${r.score < -100 ? 'text-error' : r.score > 100 ? 'text-tertiary' : ''}`}>{r.score}</td>
                <td className="px-2 py-1">{r.reputationLabel || '—'}</td>
                <td className="px-2 py-1 text-right">{r.bountyAmount > 0 ? `${r.bountyAmount} SK` : '—'}</td>
                <td className="px-2 py-1">{r.vendettaActive ? <span className="text-error font-bold">⚠</span> : '—'}</td>
                <td className="px-2 py-1 text-on-surface-variant">{r.lastIncidentAt ? new Date(r.lastIncidentAt).toISOString().slice(0, 10) : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
