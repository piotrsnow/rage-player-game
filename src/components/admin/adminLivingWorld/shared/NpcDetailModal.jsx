import { useCallback, useEffect, useState } from 'react';
import { apiClient } from '../../../../services/apiClient';
import ModalShell from './ModalShell';
import ActionBtn from './ActionBtn';
import { KV, Section, Empty } from './primitives';
import { summarizePayload } from './summarizePayload';

export default function NpcDetailModal({ id, onClose, onMutated }) {
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

  const {
    npc, events = [], attributions = [], goalProgress,
    knowledgeBase = [], dialogHistory = [], knownLocations = [],
    campaignShadows = [], relatedQuests = [],
  } = data;

  return (
    <ModalShell onClose={onClose} title={`${npc.name}  (${npc.role || 'no role'})`}>
      <div className="text-[11px] text-on-surface">
        {/* ── Core fields ── */}
        <div className="grid grid-cols-2 gap-3 mb-3">
          <KV k="canonicalId" v={npc.canonicalId} />
          <KV k="alignment" v={npc.alignment} />
          <KV k="alive" v={npc.alive ? '✓' : '✗'} />
          <KV k="category" v={npc.category || '—'} />
          <KV k="race" v={npc.race || '—'} />
          <KV k="level" v={npc.level ?? 1} />
          <KV k="currentLocation" v={npc.currentLocation?.canonicalName || npc.currentLocationId || '—'} />
          <KV k="homeLocation" v={npc.homeLocation?.canonicalName || npc.homeLocationId || '—'} />
          <KV k="pausedAt" v={npc.pausedAt ? new Date(npc.pausedAt).toISOString().slice(0, 16) : '—'} />
          <KV k="companionOfCampaignId" v={npc.companionOfCampaignId || '—'} />
          <KV k="lockedByCampaignId" v={npc.lockedByCampaignId || '—'} />
          <KV k="companionLoyalty" v={npc.companionLoyalty} />
          <KV k="lastTickAt" v={npc.lastTickAt ? new Date(npc.lastTickAt).toISOString().slice(0, 16) : '—'} />
          <KV k="keyNpc" v={npc.keyNpc ? '✓' : '✗'} />
          <KV k="globallyActive" v={npc.globallyActive ? '✓' : '✗'} />
          <KV k="softDeletedAt" v={npc.softDeletedAt ? new Date(npc.softDeletedAt).toISOString().slice(0, 16) : '—'} />
        </div>

        {npc.personality && (
          <div className="mb-3 p-2 rounded-sm bg-surface-container/40 border border-outline-variant/10">
            <div className="text-[9px] uppercase tracking-widest text-tertiary mb-1">Personality</div>
            <div className="whitespace-pre-wrap">{npc.personality}</div>
          </div>
        )}

        {npc.appearance && (
          <div className="mb-2 p-2 rounded-sm bg-surface-container/40 border border-outline-variant/10">
            <div className="text-[9px] uppercase tracking-widest text-tertiary mb-1">Appearance</div>
            <div>{npc.appearance}</div>
          </div>
        )}

        {npc.dialect && (
          <div className="mb-2 p-2 rounded-sm bg-surface-container/40 border border-outline-variant/10">
            <div className="text-[9px] uppercase tracking-widest text-tertiary mb-1">Dialect</div>
            <div>{npc.dialect}</div>
          </div>
        )}

        {npc.activeGoal && (
          <div className="mb-3 p-2 rounded-sm bg-surface-container/40 border border-outline-variant/10">
            <div className="text-[9px] uppercase tracking-widest text-tertiary mb-1">Active goal</div>
            <div>{npc.activeGoal}</div>
            {goalProgress && (
              <pre className="mt-2 text-[10px] text-on-surface-variant whitespace-pre-wrap">{JSON.stringify(goalProgress, null, 2)}</pre>
            )}
          </div>
        )}

        {npc.stats && Object.keys(npc.stats).length > 0 && (
          <details className="mb-3">
            <summary className="text-[9px] uppercase tracking-widest text-tertiary cursor-pointer">Stats (JSON)</summary>
            <pre className="mt-1 text-[10px] text-on-surface-variant whitespace-pre-wrap max-h-40 overflow-y-auto">{JSON.stringify(safeJson(npc.stats), null, 2)}</pre>
          </details>
        )}

        {/* ── Actions ── */}
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

        {/* ── Knowledge base ── */}
        <Section title={`Knowledge base (${knowledgeBase.length})`}>
          {knowledgeBase.length === 0 ? <Empty /> : (
            <ul className="max-h-48 overflow-y-auto space-y-1">
              {knowledgeBase.map((k) => (
                <li key={k.id} className="text-[10px]">
                  <span className="text-on-surface">{k.content}</span>
                  <span className="text-on-surface-variant ml-2">[{k.source}]</span>
                  <span className="text-on-surface-variant ml-1">{new Date(k.addedAt).toISOString().slice(0, 10)}</span>
                </li>
              ))}
            </ul>
          )}
        </Section>

        {/* ── Known locations ── */}
        <Section title={`Known locations (${knownLocations.length})`}>
          {knownLocations.length === 0 ? <Empty /> : (
            <ul className="max-h-32 overflow-y-auto space-y-0.5">
              {knownLocations.map((kl) => (
                <li key={`${kl.npcId}-${kl.locationId}`} className="text-[10px]">
                  <span className="font-bold">{kl.location?.canonicalName || kl.locationId}</span>
                  <span className="text-on-surface-variant ml-2">[{kl.grantedBy}]</span>
                  <span className="text-on-surface-variant ml-1">{new Date(kl.grantedAt).toISOString().slice(0, 10)}</span>
                </li>
              ))}
            </ul>
          )}
        </Section>

        {/* ── Dialog history ── */}
        <Section title={`Dialog history (${dialogHistory.length})`}>
          {dialogHistory.length === 0 ? <Empty /> : (
            <ul className="max-h-48 overflow-y-auto space-y-1">
              {dialogHistory.map((d) => (
                <li key={d.id} className="text-[10px]">
                  <span className="text-tertiary">[{d.speaker || 'npc'}]</span>{' '}
                  <span className="text-on-surface">{d.text}</span>
                  <span className="text-on-surface-variant ml-2">{new Date(d.createdAt).toISOString().slice(0, 16)}</span>
                  {d.campaignId && <span className="text-on-surface-variant ml-1">campaign:{d.campaignId.slice(0, 8)}…</span>}
                </li>
              ))}
            </ul>
          )}
        </Section>

        {/* ── Campaign shadows ── */}
        <Section title={`Campaign shadows (${campaignShadows.length})`}>
          {campaignShadows.length === 0 ? <Empty /> : (
            <div className="max-h-48 overflow-y-auto">
              <table className="w-full text-[10px]">
                <thead className="text-[9px] uppercase tracking-widest text-on-surface-variant">
                  <tr>
                    <th className="text-left px-1 py-0.5">Campaign</th>
                    <th className="text-left px-1 py-0.5">Alive</th>
                    <th className="text-left px-1 py-0.5">Disp.</th>
                    <th className="text-left px-1 py-0.5">Goal</th>
                    <th className="text-left px-1 py-0.5">Interactions</th>
                  </tr>
                </thead>
                <tbody>
                  {campaignShadows.map((s) => (
                    <tr key={s.id} className="border-t border-outline-variant/10">
                      <td className="px-1 py-0.5 font-medium">{s.campaign?.name || s.campaignId.slice(0, 8)}</td>
                      <td className="px-1 py-0.5">{s.alive ? '✓' : '✗'}</td>
                      <td className="px-1 py-0.5">{s.disposition}</td>
                      <td className="px-1 py-0.5 max-w-[16ch] truncate">{s.activeGoal || '—'}</td>
                      <td className="px-1 py-0.5">{s.interactionCount || 0}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Section>

        {/* ── Related quests ── */}
        <Section title={`Related quests (${relatedQuests.length})`}>
          {relatedQuests.length === 0 ? <Empty /> : (
            <div className="max-h-64 overflow-y-auto space-y-2">
              {relatedQuests.map((q) => (
                <div key={q.id} className="p-2 rounded-sm bg-surface-container/30 border border-outline-variant/10">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-bold text-on-surface">{q.name}</span>
                    <QuestStatusBadge status={q.status} />
                    <span className="text-[9px] text-on-surface-variant">{q.type}</span>
                    {q.campaign && <span className="text-[9px] text-on-surface-variant ml-auto">🏕 {q.campaign.name}</span>}
                  </div>
                  {q.questGiverId && <div className="text-[10px] text-on-surface-variant">giver: {q.questGiverId}</div>}
                  {q.turnInNpcId && <div className="text-[10px] text-on-surface-variant">turn-in: {q.turnInNpcId}</div>}
                  {q.objectives?.length > 0 && (
                    <ul className="mt-1 space-y-0.5 pl-3">
                      {q.objectives.map((o) => (
                        <li key={String(o.id)} className="text-[10px] flex items-baseline gap-1">
                          <ObjectiveStatusIcon status={o.status} />
                          <span>{o.description}</span>
                          {o.progress > 0 && <span className="text-on-surface-variant">({o.progress}/{o.targetAmount})</span>}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              ))}
            </div>
          )}
        </Section>

        {/* ── Events ── */}
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

        {/* ── Attributions ── */}
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

        {/* ── Meta ── */}
        <Section title="Meta">
          <div className="grid grid-cols-2 gap-2">
            <KV k="id" v={npc.id} />
            <KV k="createdAt" v={new Date(npc.createdAt).toISOString().slice(0, 16)} />
            <KV k="updatedAt" v={new Date(npc.updatedAt).toISOString().slice(0, 16)} />
            {npc.originCampaignId && <KV k="originCampaignId" v={npc.originCampaignId} />}
          </div>
        </Section>
      </div>
    </ModalShell>
  );
}

function QuestStatusBadge({ status }) {
  const colors = {
    active: 'bg-primary/20 text-primary',
    completed: 'bg-tertiary/20 text-tertiary',
    stalled: 'bg-warning/20 text-warning',
    failed: 'bg-error/20 text-error',
  };
  return (
    <span className={`text-[9px] px-1.5 py-0.5 rounded ${colors[status] || 'bg-surface-variant text-on-surface-variant'}`}>
      {status}
    </span>
  );
}

function ObjectiveStatusIcon({ status }) {
  const icons = { done: '✓', pending: '○', locked: '🔒', skipped: '—', failed: '✗' };
  const colors = { done: 'text-tertiary', pending: 'text-on-surface-variant', locked: 'text-on-surface-variant', skipped: 'text-on-surface-variant', failed: 'text-error' };
  return <span className={`${colors[status] || 'text-on-surface-variant'} shrink-0`}>{icons[status] || '?'}</span>;
}

function safeJson(s) {
  if (!s) return null;
  if (typeof s === 'object') return s;
  try { return JSON.parse(s); } catch { return null; }
}
