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
        <div className="text-xs text-on-surface-variant">
          {t('locationGraph.travelInspector.type')}: {visual.label}
        </div>
        <div className="text-xs text-on-surface-variant">
          {t('locationGraph.travelInspector.dangerLevel')}: {t(`locationGraph.danger.${selectedNode.dangerLevel || 'safe'}`)}
        </div>
        {selectedNode.atmosphere && (
          <div className="text-sm text-on-surface-variant leading-relaxed">
            {selectedNode.atmosphere}
          </div>
        )}
      </div>

      <div className="space-y-2">
        <div className="text-xs uppercase tracking-widest text-on-surface-variant/70">
          {t('locationGraph.travelInspector.occupants')}
        </div>
        {selectedOccupants.length === 0 ? (
          <div className="text-xs text-on-surface-variant">
            {t('locationGraph.travelInspector.noOccupants')}
          </div>
        ) : (
          <ul className="space-y-1">
            {selectedOccupants.map((occ) => (
              <li key={occ.id} className="text-sm text-on-surface-variant">
                {occ.name}
              </li>
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
