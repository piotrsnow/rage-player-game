import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useModalA11y } from '../../../hooks/useModalA11y';
import { useSettings } from '../../../contexts/SettingsContext.jsx';
import { GenderIcon } from '../../../utils/genderIcon';
import { speciesIcon } from '../../../utils/speciesIcons';
import { apiClient } from '../../../services/apiClient';
import NpcStatCard from '../world/NpcStatCard';

const ADMIN_DETAIL_FIELDS = [
  'id',
  'npcId',
  'category',
  'attitude',
  'disposition',
  'level',
  'alive',
  'gender',
  'race',
  'creatureKind',
  'lastLocationKind',
  'lastLocationId',
  'lastInteractionAt',
  'lastInteractionSceneIndex',
  'portraitUrl',
  'spriteUrl',
  'stats',
];

/** @param {(npcId: string, opts?: { limit?: number }) => Promise<{ npc: object, movements: object[] }>} props.fetchNpcDetails */
export default function NpcDetailsModal({ npcId, fetchNpcDetails, onClose }) {
  const { t, i18n } = useTranslation();
  const { backendUser } = useSettings();
  const modalRef = useModalA11y(onClose);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [adminDetailsOpen, setAdminDetailsOpen] = useState(false);
  const isAdmin = !!backendUser?.isAdmin;

  useEffect(() => {
    if (!npcId || !fetchNpcDetails) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    setAdminDetailsOpen(false);
    fetchNpcDetails(npcId)
      .then((res) => {
        if (!cancelled) {
          setData(res);
          setLoading(false);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setError(t('locationGraph.npcDetailsModal.loadError'));
          setLoading(false);
        }
      });
    return () => { cancelled = true; };
  }, [npcId, fetchNpcDetails, t]);

  const npc = data?.npc;
  const movements = data?.movements || [];
  const interactions = data?.interactions || [];

  const raceLabel = npc?.race
    ? t(`worldState.races.${npc.race}`, npc.race)
    : npc?.creatureKind || t('worldState.races.none');

  const portraitUrl = npc?.portraitUrl ? apiClient.resolveMediaUrl(npc.portraitUrl) : null;

  function sourceLabel(source) {
    if (source === 'scene_process') return t('locationGraph.npcDetailsModal.sourceScene');
    if (source === 'location_graph_manual') return t('locationGraph.npcDetailsModal.sourceManual');
    return source;
  }

  function movementLineDescription(mv) {
    if (!mv.fromKind || !mv.fromId) {
      return t('locationGraph.npcDetailsModal.appearedAt', { location: mv.toName || mv.toId });
    }
    return t('locationGraph.npcDetailsModal.movedFromTo', {
      from: mv.fromName || mv.fromId,
      to: mv.toName || mv.toId,
    });
  }

  const isDead = npc?.alive === false;
  const title = npc?.name || t('locationGraph.npcDetailsModal.title');
  const adminDetails = isAdmin && npc ? buildAdminDetails(npc, t, i18n.language) : [];

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-label={title} onClick={onClose}>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <div
        ref={modalRef}
        className="relative w-full max-w-[612px] max-h-[85vh] bg-surface-container-highest/85 backdrop-blur-2xl border border-outline-variant/15 rounded-sm flex flex-col shadow-2xl animate-fade-in"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-outline-variant/10 shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <span className={`material-symbols-outlined text-xl shrink-0 ${isDead ? 'text-red-400/70' : 'text-primary'}`}>
              {isDead ? 'skull' : 'badge'}
            </span>
            <h2 className={`text-lg sm:text-xl font-bold truncate ${isDead ? 'text-on-surface/50 line-through decoration-red-400/40' : 'text-on-surface'}`}>{title}</h2>
            {isDead && (
              <span className="shrink-0 px-1.5 py-0.5 rounded text-[10px] uppercase tracking-widest font-label bg-red-500/15 text-red-400 border border-red-500/20">
                {t('locationGraph.npcDetailsModal.dead')}
              </span>
            )}
          </div>
          <div className="flex items-center gap-1.5">
            {isAdmin && npc && (
              <button
                type="button"
                onClick={() => setAdminDetailsOpen((open) => !open)}
                aria-expanded={adminDetailsOpen}
                aria-label={t('locationGraph.npcDetailsModal.adminDetailsToggle')}
                title={t('locationGraph.npcDetailsModal.adminDetailsToggle')}
                className="flex items-center justify-center w-7 h-7 rounded-sm border border-primary/20 bg-primary/10 text-primary hover:bg-primary/20 transition-colors"
              >
                <span className="material-symbols-outlined text-[18px]">{adminDetailsOpen ? 'remove' : 'add'}</span>
              </button>
            )}
            <button type="button" onClick={onClose} aria-label={t('common.close')} className="material-symbols-outlined text-lg text-outline hover:text-on-surface transition-colors">close</button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto custom-scrollbar p-4 space-y-4 mr-3 min-h-0">
          {loading && (
            <div className="flex items-center gap-2 text-outline text-sm">
              <span className="material-symbols-outlined text-lg animate-spin">progress_activity</span>
              …
            </div>
          )}
          {error && (
            <div className="text-error text-sm">{error}</div>
          )}
          {!loading && !error && npc && (
            <>
              <div className={`relative mx-auto w-40 ${isDead ? 'opacity-50 grayscale' : ''}`}>
                <div className="relative w-full aspect-[832/1216] rounded-lg overflow-hidden border border-outline-variant/25 bg-black/25">
                  {portraitUrl ? (
                    <img src={portraitUrl} alt={npc.name} className="w-full h-full object-contain" onError={(e) => { e.currentTarget.style.display = 'none'; }} />
                  ) : (
                    <div className="absolute inset-0 flex items-center justify-center">
                      <span className="material-symbols-outlined text-6xl text-on-surface-variant/50">{speciesIcon(npc.race)}</span>
                    </div>
                  )}
                </div>
              </div>

              {isDead && (
                <div className="flex items-center gap-2 px-3 py-2 rounded bg-red-500/10 border border-red-500/20 text-red-300 text-sm">
                  <span className="material-symbols-outlined text-base shrink-0">skull</span>
                  <span>{t('locationGraph.npcDetailsModal.deadDescription')}</span>
                </div>
              )}

              <div className="text-sm text-on-surface-variant flex flex-wrap items-center gap-x-2 gap-y-1">
                <GenderIcon gender={npc.gender} className="text-sm text-outline/80 shrink-0" />
                <span>{raceLabel}</span>
                {npc.role && <span>· <span className="text-outline">{t('worldState.role')}:</span> {npc.role}</span>}
              </div>

              <div className="text-sm text-on-surface-variant space-y-1.5">
                {npc.personality && <div><span className="text-outline">{t('worldState.personality')}:</span> {npc.personality}</div>}
                {npc.appearance && <div><span className="text-outline">{t('worldState.appearance')}:</span> {npc.appearance}</div>}
                {npc.lastLocation && <div><span className="text-outline">{t('worldState.location')}:</span> {npc.lastLocation}</div>}
              </div>

              {npc.stats && Object.keys(npc.stats).length > 0 && (
                <NpcStatCard npc={npc} />
              )}

              {isAdmin && npc && adminDetailsOpen && (
                <AdminDetailsSection details={adminDetails} title={t('locationGraph.npcDetailsModal.adminDetailsTitle')} />
              )}

              <div>
                <h3 className="text-xs font-label uppercase tracking-widest text-outline mb-2">
                  {t('locationGraph.npcDetailsModal.interactionsTitle')}
                </h3>
                {interactions.length === 0 ? (
                  <p className="text-sm text-outline">{t('locationGraph.npcDetailsModal.interactionsEmpty')}</p>
                ) : (
                  <ul className="space-y-2 text-sm">
                    {interactions.map((ix) => {
                      const isHearsay = ix.content.startsWith('[zasłyszane');
                      const isMajor = ix.importance === 'major';
                      return (
                        <li key={ix.id} className="rounded border border-outline-variant/15 bg-white/5 px-3 py-2">
                          <div className={isHearsay ? 'italic text-outline' : isMajor ? 'text-on-surface' : 'text-on-surface-variant'}>
                            {ix.content}
                          </div>
                          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 mt-1 text-[11px] text-outline uppercase tracking-wide">
                            <span className={isMajor ? 'text-primary' : ''}>
                              {t(`locationGraph.npcDetailsModal.${isMajor ? 'importanceMajor' : 'importanceMinor'}`)}
                            </span>
                            {typeof ix.sceneIndex === 'number' && (
                              <>
                                <span>·</span>
                                <span>{t('locationGraph.npcDetailsModal.sceneIdx', { index: ix.sceneIndex })}</span>
                              </>
                            )}
                            <span>·</span>
                            <span>{new Date(ix.addedAt).toLocaleString(i18n.language)}</span>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>

              <div>
                <h3 className="text-xs font-label uppercase tracking-widest text-outline mb-2">
                  {t('locationGraph.npcDetailsModal.historyTitle')}
                </h3>
                {movements.length === 0 ? (
                  <p className="text-sm text-outline">{t('locationGraph.npcDetailsModal.historyEmpty')}</p>
                ) : (
                  <ul className="space-y-2 text-sm">
                    {movements.map((mv) => (
                      <li key={mv.id} className="rounded border border-outline-variant/15 bg-white/5 px-3 py-2">
                        <div className="text-on-surface">{movementLineDescription(mv)}</div>
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 mt-1 text-[11px] text-outline uppercase tracking-wide">
                          <span>{new Date(mv.movedAt).toLocaleString(i18n.language)}</span>
                          <span>·</span>
                          <span>{sourceLabel(mv.source)}</span>
                          {typeof mv.sceneIndex === 'number' && (
                            <>
                              <span>·</span>
                              <span>{t('locationGraph.npcDetailsModal.sceneIdx', { index: mv.sceneIndex })}</span>
                            </>
                          )}
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function buildAdminDetails(npc, t, language) {
  return ADMIN_DETAIL_FIELDS
    .filter((field) => npc[field] !== undefined && npc[field] !== null && npc[field] !== '')
    .map((field) => ({
      field,
      label: t(`locationGraph.npcDetailsModal.adminFields.${field}`, field),
      value: formatAdminValue(npc[field], language),
      isBlock: typeof npc[field] === 'object',
    }));
}

function formatAdminValue(value, language) {
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (typeof value === 'number') return String(value);
  if (typeof value === 'string') {
    const maybeDate = Date.parse(value);
    if (/^\d{4}-\d{2}-\d{2}T/.test(value) && !Number.isNaN(maybeDate)) {
      return new Date(value).toLocaleString(language);
    }
    return value;
  }
  return JSON.stringify(value, null, 2);
}

function AdminDetailsSection({ title, details }) {
  if (details.length === 0) return null;

  return (
    <div className="rounded border border-primary/20 bg-primary/5 px-3 py-3 space-y-2">
      <h3 className="flex items-center gap-1.5 text-xs font-label uppercase tracking-widest text-primary">
        <span className="material-symbols-outlined text-sm">admin_panel_settings</span>
        {title}
      </h3>
      <div className="grid gap-2 text-xs">
        {details.map((detail) => (
          <div key={detail.field} className="rounded border border-outline-variant/10 bg-black/15 px-2.5 py-2">
            <div className="mb-1 font-label uppercase tracking-wide text-outline">{detail.label}</div>
            {detail.isBlock ? (
              <pre className="max-h-48 overflow-auto whitespace-pre-wrap break-words rounded bg-black/20 p-2 text-[11px] leading-relaxed text-on-surface-variant custom-scrollbar">
                {detail.value}
              </pre>
            ) : (
              <div className="break-words font-mono text-[11px] leading-relaxed text-on-surface-variant">{detail.value}</div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
