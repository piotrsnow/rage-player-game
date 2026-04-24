import PlayerWorldMap from '../worldMap/PlayerWorldMap';
import { EmptyState } from './shared';

export default function MapTab({ campaignId, currentSceneId, currentLocation, onTravel, onEnterSub, t }) {
  if (!campaignId) {
    return <EmptyState icon="map" text={t('worldState.emptyMap')} />;
  }

  return (
    <div className="space-y-3">
      {currentLocation && (
        <div className="flex items-center gap-2 px-1">
          <span className="material-symbols-outlined text-sm text-primary">my_location</span>
          <span className="text-[10px] font-label uppercase tracking-widest text-on-surface-variant">{t('worldState.currentLocation')}:</span>
          <span className="text-sm font-bold text-primary">{currentLocation}</span>
        </div>
      )}
      <PlayerWorldMap
        campaignId={campaignId}
        sceneId={currentSceneId}
        onTravel={onTravel}
        onEnterSub={onEnterSub}
      />
    </div>
  );
}
