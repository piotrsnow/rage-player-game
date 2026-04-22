import { useCallback, useEffect, useState } from 'react';
import { apiClient } from '../../../../services/apiClient';
import FilterSelect from '../shared/FilterSelect';
import ModalShell from '../shared/ModalShell';
import ActionBtn from '../shared/ActionBtn';
import { KV, Section, Empty } from '../shared/primitives';
import { summarizePayload } from '../shared/summarizePayload';

export default function NpcListTab() {
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState({ alive: 'true', companion: '', locked: '' });
  const [detailId, setDetailId] = useState(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const q = new URLSearchParams();
      if (filter.alive) q.set('alive', filter.alive);
      if (filter.companion) q.set('companion', filter.companion);
      if (filter.locked) q.set('locked', filter.locked);
      q.set('limit', '100');
      const res = await apiClient.get(`/v1/admin/livingWorld/npcs?${q}`);
      setRows(Array.isArray(res?.rows) ? res.rows : []);
      setTotal(Number(res?.total) || 0);
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => { refresh(); }, [refresh]);

  return (
    <div>
      <div className="flex gap-3 mb-3 text-[11px]">
        <FilterSelect label="Alive" value={filter.alive} onChange={(v) => setFilter({ ...filter, alive: v })}
          options={[['', 'any'], ['true', 'alive'], ['false', 'dead']]} />
        <FilterSelect label="Companion" value={filter.companion} onChange={(v) => setFilter({ ...filter, companion: v })}
          options={[['', 'any'], ['true', 'yes'], ['false', 'no']]} />
        <FilterSelect label="Locked" value={filter.locked} onChange={(v) => setFilter({ ...filter, locked: v })}
          options={[['', 'any'], ['true', 'yes'], ['false', 'no']]} />
        <div className="ml-auto text-on-surface-variant self-center">{total} total • {loading ? '…' : `${rows.length} shown`}</div>
      </div>

      <div className="rounded-sm border border-outline-variant/25 overflow-hidden">
        <table className="w-full text-[11px]">
          <thead className="bg-surface-container/60 text-on-surface-variant uppercase tracking-widest text-[9px]">
            <tr>
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
              <tr><td colSpan={8} className="px-2 py-3 text-center text-on-surface-variant">No NPCs match filter</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {detailId && <NpcDetailModal id={detailId} onClose={() => setDetailId(null)} onMutated={refresh} />}
    </div>
  );
}

function NpcDetailModal({ id, onClose, onMutated }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [actionBusy, setActionBusy] = useState(false);
  const [lastResult, setLastResult] = useState(null);

  const load = useCallback(() => {
    setLoading(true);
    apiClient.get(`/v1/admin/livingWorld/npcs/${id}`).then(setData).finally(() => setLoading(false));
  }, [id]);

  useEffect(() => { load(); }, [load]);

  const runAction = useCallback(async (path, body) => {
    setActionBusy(true);
    setLastResult({ path, status: 'running' });
    try {
      const res = await apiClient.post(`/v1/admin/livingWorld/npcs/${id}/${path}`, body);
      setLastResult({ path, status: 'ok', data: res });
      load();
      onMutated?.();
    } catch (err) {
      setLastResult({ path, status: 'error', error: err?.message || String(err) });
    } finally {
      setActionBusy(false);
    }
  }, [id, load, onMutated]);

  if (loading) return <ModalShell onClose={onClose}><div>Loading…</div></ModalShell>;
  if (!data) return <ModalShell onClose={onClose}><div>Not found</div></ModalShell>;
  const { npc, events = [], attributions = [], goalProgress } = data;

  return (
    <ModalShell onClose={onClose} title={`${npc.name}  (${npc.role || 'no role'})`}>
      <div className="text-[11px] text-on-surface">
        <div className="grid grid-cols-2 gap-3 mb-3">
          <KV k="canonicalId" v={npc.canonicalId} />
          <KV k="alignment" v={npc.alignment} />
          <KV k="alive" v={npc.alive ? '✓' : '✗'} />
          <KV k="currentLocationId" v={npc.currentLocationId || '—'} />
          <KV k="pausedAt" v={npc.pausedAt ? new Date(npc.pausedAt).toISOString().slice(0, 16) : '—'} />
          <KV k="companionOfCampaignId" v={npc.companionOfCampaignId || '—'} />
          <KV k="lockedByCampaignId" v={npc.lockedByCampaignId || '—'} />
          <KV k="companionLoyalty" v={npc.companionLoyalty} />
          <KV k="lastTickAt" v={npc.lastTickAt ? new Date(npc.lastTickAt).toISOString().slice(0, 16) : '—'} />
        </div>

        {npc.activeGoal && (
          <div className="mb-3 p-2 rounded-sm bg-surface-container/40 border border-outline-variant/10">
            <div className="text-[9px] uppercase tracking-widest text-tertiary mb-1">Active goal</div>
            <div>{npc.activeGoal}</div>
            {goalProgress && (
              <pre className="mt-2 text-[10px] text-on-surface-variant whitespace-pre-wrap">{JSON.stringify(goalProgress, null, 2)}</pre>
            )}
          </div>
        )}

        <div className="flex gap-2 mb-3">
          <ActionBtn disabled={actionBusy} onClick={() => runAction('tick')}>Manual tick</ActionBtn>
          <ActionBtn disabled={actionBusy || !npc.pausedAt} onClick={() => runAction('force-unpause')}>Force unpause</ActionBtn>
          <ActionBtn danger disabled={actionBusy || !npc.lockedByCampaignId} onClick={() => runAction('release-lock')}>Release lock</ActionBtn>
          {actionBusy && <span className="text-[10px] text-on-surface-variant self-center">running…</span>}
        </div>

        {lastResult && (
          <div className={`mb-3 p-2 rounded-sm border text-[10px] ${
            lastResult.status === 'error' ? 'border-error/40 bg-error/10 text-error' :
            lastResult.status === 'ok' ? 'border-tertiary/30 bg-tertiary/10 text-tertiary' :
            'border-outline-variant/30 bg-surface-container/40 text-on-surface-variant'
          }`}>
            <div className="font-bold uppercase tracking-widest text-[9px] mb-1">
              {lastResult.path} → {lastResult.status}
            </div>
            {lastResult.error && <div>{lastResult.error}</div>}
            {lastResult.data && (
              <pre className="whitespace-pre-wrap break-words">{JSON.stringify(lastResult.data, null, 2)}</pre>
            )}
          </div>
        )}

        <Section title={`Recent events (${events.length})`}>
          {events.length === 0 ? <Empty /> : (
            <ul className="max-h-48 overflow-y-auto space-y-1">
              {events.map((e) => (
                <li key={e.id} className="text-[10px]">
                  <span className="text-tertiary">[{e.eventType}]</span>{' '}
                  <span className="text-on-surface-variant">{new Date(e.createdAt).toISOString().slice(0, 16)}</span>{' '}
                  <span>{summarizePayload(e.payload)}</span>
                </li>
              ))}
            </ul>
          )}
        </Section>

        <Section title={`Attributions (${attributions.length})`}>
          {attributions.length === 0 ? <Empty /> : (
            <ul className="max-h-32 overflow-y-auto space-y-1">
              {attributions.map((a) => (
                <li key={a.id} className="text-[10px]">
                  <span className="text-tertiary">[{a.actionType}]</span>{' '}
                  <span className={a.justified ? 'text-on-surface' : 'text-error'}>{a.justified ? 'justified' : 'unjustified'}</span>{' '}
                  <span className="text-on-surface-variant">conf={Math.round((a.judgeConfidence || 0) * 100)}%</span>{' '}
                  <span className="text-on-surface-variant">{a.judgeReason || ''}</span>
                </li>
              ))}
            </ul>
          )}
        </Section>
      </div>
    </ModalShell>
  );
}
