import { useCallback, useEffect, useState } from 'react';
import { apiClient } from '../../../../services/apiClient';
import FilterSelect from '../shared/FilterSelect';
import ActionBtn from '../shared/ActionBtn';
import NpcDetailModal from '../shared/NpcDetailModal';
import { NPC_CATEGORY_COLORS } from './mapHelpers';

export default function NpcListTab({ campaignId = null }) {
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [spriteBusy, setSpriteBusy] = useState(false);
  const [filter, setFilter] = useState({ alive: 'true', companion: '', locked: '' });
  const [detailId, setDetailId] = useState(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const q = new URLSearchParams();
      if (filter.alive) q.set('alive', filter.alive);
      if (filter.companion) q.set('companion', filter.companion);
      if (filter.locked) q.set('locked', filter.locked);
      if (campaignId) q.set('campaignId', campaignId);
      q.set('limit', '100');
      const res = await apiClient.get(`/v1/admin/livingWorld/npcs?${q}`);
      setRows(Array.isArray(res?.rows) ? res.rows : []);
      setTotal(Number(res?.total) || 0);
    } finally {
      setLoading(false);
    }
  }, [filter, campaignId]);

  useEffect(() => { refresh(); }, [refresh]);

  const generateMissingSprites = useCallback(async () => {
    const missing = rows.filter((r) => !r.spriteUrl).slice(0, 24).map((r) => ({ kind: 'world-npc', id: r.id }));
    if (!missing.length) return;
    setSpriteBusy(true);
    try {
      await apiClient.post('/admin/livingWorld/character-sprites/generate', { items: missing });
      await refresh();
    } finally {
      setSpriteBusy(false);
    }
  }, [rows, refresh]);

  return (
    <div>
      <div className="flex gap-3 mb-3 text-[11px]">
        <FilterSelect label="Alive" value={filter.alive} onChange={(v) => setFilter({ ...filter, alive: v })}
          options={[['', 'any'], ['true', 'alive'], ['false', 'dead']]} />
        <FilterSelect label="Companion" value={filter.companion} onChange={(v) => setFilter({ ...filter, companion: v })}
          options={[['', 'any'], ['true', 'yes'], ['false', 'no']]} />
        <FilterSelect label="Locked" value={filter.locked} onChange={(v) => setFilter({ ...filter, locked: v })}
          options={[['', 'any'], ['true', 'yes'], ['false', 'no']]} />
        <ActionBtn
          disabled={spriteBusy || rows.every((r) => r.spriteUrl)}
          onClick={generateMissingSprites}
        >
          {spriteBusy ? 'Sprites…' : 'Sprites (missing, batch 24)'}
        </ActionBtn>
        <div className="ml-auto text-on-surface-variant self-center">{total} total • {loading ? '…' : `${rows.length} shown`}</div>
      </div>

      <div className="rounded-sm border border-outline-variant/25 overflow-hidden">
        <table className="w-full text-[11px]">
          <thead className="bg-surface-container/60 text-on-surface-variant uppercase tracking-widest text-[9px]">
            <tr>
              <th className="px-2 py-1 w-10" aria-label="Token" />
              <th className="px-2 py-1 text-left">Name</th>
              <th className="px-2 py-1 text-left">Role</th>
              <th className="px-2 py-1 text-left">Alignment</th>
              <th className="px-2 py-1 text-left">Alive</th>
              <th className="px-2 py-1 text-left">Companion</th>
              <th className="px-2 py-1 text-left">Locked</th>
              <th className="px-2 py-1 text-left">Goal</th>
              <th className="px-2 py-1 text-left">Last tick</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((n) => (
              <tr key={n.id} onClick={() => setDetailId(n.id)} className="border-t border-outline-variant/10 hover:bg-surface-container/30 cursor-pointer">
                <td className="px-2 py-1 align-middle w-10">
                  {n.spriteUrl ? (
                    <img
                      src={apiClient.resolveMediaUrl(n.spriteUrl)}
                      alt=""
                      className="w-6 h-6 object-contain"
                      style={{ imageRendering: 'pixelated' }}
                    />
                  ) : (
                    <span
                      className="inline-block w-6 h-6 rounded-full border border-outline-variant/30"
                      style={{
                        background: NPC_CATEGORY_COLORS[n.category || 'commoner'] || NPC_CATEGORY_COLORS.commoner,
                      }}
                    />
                  )}
                </td>
                <td className="px-2 py-1 font-bold text-on-surface">{n.name}</td>
                <td className="px-2 py-1">{n.role || '—'}</td>
                <td className="px-2 py-1">{n.alignment}</td>
                <td className="px-2 py-1">{n.alive ? '✓' : '✗'}</td>
                <td className="px-2 py-1">{n.companionOfCampaignId ? 'yes' : '—'}</td>
                <td className="px-2 py-1">{n.lockedByCampaignId ? 'yes' : '—'}</td>
                <td className="px-2 py-1 max-w-[20ch] truncate">{n.activeGoal || '—'}</td>
                <td className="px-2 py-1 text-on-surface-variant">{n.lastTickAt ? new Date(n.lastTickAt).toISOString().slice(0, 16) : '—'}</td>
              </tr>
            ))}
            {!loading && rows.length === 0 && (
              <tr><td colSpan={9} className="px-2 py-3 text-center text-on-surface-variant">No NPCs match filter</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {detailId && <NpcDetailModal id={detailId} onClose={() => setDetailId(null)} onMutated={refresh} />}
    </div>
  );
}

