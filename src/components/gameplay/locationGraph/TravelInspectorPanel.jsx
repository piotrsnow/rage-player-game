import { useMemo, useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { apiClient } from '../../../services/apiClient.js';
import { getNodeVisual } from './graphVisuals.js';

export default function TravelInspectorPanel({
  campaignId,
  selectedNode,
  currentNode,
  adjacentIds,
  occupants = [],
  occupantSpriteMap = {},
  canAttemptDistantTravel,
  onTravel,
}) {
  const { t } = useTranslation();
  const [travelPending, setTravelPending] = useState(false);
  const [travelError, setTravelError] = useState(null);

  const selectedOccupants = useMemo(
    () => occupants.filter((o) => o.locationId === selectedNode?.id),
    [occupants, selectedNode?.id],
  );

  const players = useMemo(
    () => selectedOccupants.filter((o) => o.type === 'player'),
    [selectedOccupants],
  );
  const npcs = useMemo(
    () => selectedOccupants.filter((o) => o.type !== 'player'),
    [selectedOccupants],
  );

  const tags = useMemo(() => {
    const raw = selectedNode?.tags;
    if (Array.isArray(raw)) return raw.filter(Boolean);
    return [];
  }, [selectedNode?.tags]);

  const travelState = useMemo(() => {
    if (!selectedNode) return 'none';
    if (currentNode?.id === selectedNode.id) return 'current';
    if (adjacentIds?.has?.(selectedNode.id)) return 'adjacent';
    return 'distant';
  }, [selectedNode, currentNode?.id, adjacentIds]);

  const handleTravel = useCallback(async () => {
    if (!selectedNode || travelState === 'current' || travelPending) return;

    setTravelError(null);
    if (travelState === 'adjacent') {
      onTravel?.(selectedNode.name);
      return;
    }

    if (!canAttemptDistantTravel) {
      setTravelError(t('locationGraph.travelInspector.errors.quietSceneRequired'));
      return;
    }

    setTravelPending(true);
    try {
      const result = await apiClient.request(
        `/livingWorld/campaigns/${campaignId}/travel-check`,
        { method: 'POST', body: { destinationName: selectedNode.name } },
      );
      if (result.allowed) {
        onTravel?.(selectedNode.name);
      } else {
        onTravel?.(selectedNode.name, { travelFailureReason: result.reason });
      }
    } catch (err) {
      setTravelError(err?.message || t('locationGraph.travelInspector.errors.travelCheckFailed'));
    } finally {
      setTravelPending(false);
    }
  }, [
    campaignId,
    selectedNode,
    travelState,
    travelPending,
    canAttemptDistantTravel,
    onTravel,
    t,
  ]);

  if (!selectedNode) {
    return (
      <div className="h-full flex items-center justify-center px-6 text-center text-sm text-on-surface-variant">
        {t('locationGraph.travelInspector.selectNode')}
      </div>
    );
  }

  const visual = getNodeVisual(selectedNode.type);
  const travelStatusKey = `locationGraph.travelInspector.status.${travelState}`;

  return (
    <div className="h-full overflow-y-auto custom-scrollbar p-4 space-y-4">
      {selectedNode.nodeImageUrl && (
        <img
          src={apiClient.resolveMediaUrl(selectedNode.nodeImageUrl)}
          alt={selectedNode.name}
          className="w-full max-h-44 object-cover rounded border border-outline-variant/20 bg-black/20"
          style={{ imageRendering: 'pixelated' }}
        />
      )}

      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <span className="w-3 h-3 rounded-full" style={{ backgroundColor: visual.color }} />
          <h3 className="text-base font-semibold text-on-surface">{selectedNode.name}</h3>
        </div>
        <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-on-surface-variant">
          <span>{t('locationGraph.travelInspector.type')}: {visual.label}</span>
          <span>
            {t('locationGraph.travelInspector.dangerLevel')}: {t(`locationGraph.danger.${selectedNode.dangerLevel || 'safe'}`)}
          </span>
          {selectedNode.region && (
            <span>{t('locationGraph.travelInspector.region')}: {selectedNode.region}</span>
          )}
          {selectedNode.biome && (
            <span>{t('locationGraph.travelInspector.biome')}: {selectedNode.biome}</span>
          )}
          {selectedNode.visitCount > 0 && (
            <span>
              {t('locationGraph.travelInspector.visits', { count: selectedNode.visitCount })}
            </span>
          )}
        </div>
        {selectedNode.atmosphere && (
          <div className="text-sm italic text-on-surface-variant leading-relaxed">
            {selectedNode.atmosphere}
          </div>
        )}
        {selectedNode.description && (
          <div className="text-sm text-on-surface-variant leading-relaxed whitespace-pre-line">
            {selectedNode.description}
          </div>
        )}
        {tags.length > 0 && (
          <div className="flex flex-wrap gap-1 pt-1">
            {tags.map((tag) => (
              <span
                key={tag}
                className="inline-flex items-center bg-primary/12 text-primary rounded-full px-2 py-0.5 text-[11px] leading-tight"
              >
                {tag}
              </span>
            ))}
          </div>
        )}
      </div>

      <div className="space-y-2">
        <div className="text-xs uppercase tracking-widest text-on-surface-variant/70">
          {t('locationGraph.travelInspector.occupants')}
          {selectedOccupants.length > 0 && (
            <span className="ml-1 text-outline normal-case tracking-normal">
              ({selectedOccupants.length})
            </span>
          )}
        </div>
        {selectedOccupants.length === 0 ? (
          <div className="text-xs text-on-surface-variant">
            {t('locationGraph.travelInspector.noOccupants')}
          </div>
        ) : (
          <ul className="space-y-1">
            {players.map((occ) => (
              <OccupantRow key={occ.id} occ={occ} sprite={occupantSpriteMap[occ.id]} t={t} />
            ))}
            {npcs.map((occ) => (
              <OccupantRow key={occ.id} occ={occ} sprite={occupantSpriteMap[occ.id]} t={t} />
            ))}
          </ul>
        )}
      </div>

      <div className="rounded border border-outline-variant/20 bg-surface-container-high/40 px-3 py-2 text-sm text-on-surface-variant">
        {t('locationGraph.travelInspector.travelStatus')}: {t(travelStatusKey)}
      </div>

      {travelError && (
        <div className="px-3 py-2 rounded border border-error/35 bg-error/10 text-error text-sm">
          {travelError}
        </div>
      )}

      <button
        type="button"
        onClick={handleTravel}
        disabled={travelState === 'current' || travelPending}
        className="w-full inline-flex items-center justify-center gap-2 px-4 py-2 rounded border border-primary/35 bg-primary/12 hover:bg-primary/20 text-primary text-sm font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
      >
        {travelPending && <span className="material-symbols-outlined animate-spin text-base">progress_activity</span>}
        {travelPending
          ? t('locationGraph.travelInspector.travelChecking')
          : t('locationGraph.travelInspector.travelHere')}
      </button>
    </div>
  );
}

function OccupantRow({ occ, sprite, t }) {
  const isPlayer = occ.type === 'player';
  const dotColor = isPlayer ? '#22d3ee' : '#f472b6';
  const subtitle = isPlayer
    ? (occ.species || t('locationGraph.travelInspector.playerBadge'))
    : (occ.role || occ.category || t('locationGraph.travelInspector.npcBadge'));

  return (
    <li className="flex items-center gap-2 px-2 py-1.5 rounded bg-white/5">
      {sprite ? (
        <img
          src={sprite}
          alt={occ.name}
          className="w-7 h-7 rounded-sm object-cover bg-black/20 flex-shrink-0"
          style={{ imageRendering: 'pixelated' }}
        />
      ) : (
        <span
          className="w-2.5 h-2.5 rounded-full flex-shrink-0"
          style={{ backgroundColor: dotColor }}
        />
      )}
      <div className="flex-1 min-w-0">
        <div className="text-sm text-on-surface truncate">{occ.name}</div>
        {subtitle && (
          <div className="text-[10px] text-outline truncate">{subtitle}</div>
        )}
      </div>
      <span
        className={`text-[9px] uppercase tracking-widest px-1.5 py-0.5 rounded flex-shrink-0 ${
          isPlayer ? 'bg-cyan-500/15 text-cyan-300' : 'bg-pink-500/15 text-pink-300'
        }`}
      >
        {isPlayer
          ? t('locationGraph.travelInspector.playerBadge')
          : t('locationGraph.travelInspector.npcBadge')}
      </span>
    </li>
  );
}
