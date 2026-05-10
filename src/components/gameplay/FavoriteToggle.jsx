import { useTranslation } from 'react-i18next';
import { isPersistedSceneId } from '../../hooks/useFavoriteScenes';

/**
 * Heart-shaped toggle button used in the gameplay header to bookmark the
 * currently displayed scene. Hidden when the scene has not yet been
 * persisted to the backend (no UUID).
 */
export default function FavoriteToggle({ sceneId, campaignId, isFavorite, onToggle }) {
  const { t } = useTranslation();

  if (!isPersistedSceneId(sceneId) || !isPersistedSceneId(campaignId)) return null;

  const label = isFavorite
    ? t('gameplay.favoriteRemove', 'Usuń z ulubionych')
    : t('gameplay.favoriteAdd', 'Dodaj do ulubionych');

  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onToggle(sceneId, campaignId);
      }}
      title={label}
      aria-label={label}
      aria-pressed={isFavorite}
      className={`material-symbols-outlined text-base transition-all ml-1 ${
        isFavorite
          ? 'text-rose-400 hover:text-rose-300'
          : 'text-outline hover:text-rose-400'
      }`}
      style={isFavorite ? { fontVariationSettings: '"FILL" 1' } : undefined}
    >
      favorite
    </button>
  );
}
