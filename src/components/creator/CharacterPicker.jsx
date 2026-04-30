import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { apiClient } from '../../services/apiClient';
import { storage } from '../../services/storage';
import { ATTRIBUTE_KEYS } from '../../data/rpgSystem';
import { isSafeLocation } from '../../../shared/domain/safeLocation';
import PortraitGenerator from '../character/PortraitGenerator';
import { useAI } from '../../hooks/useAI';
import { useSettings } from '../../contexts/SettingsContext';

/**
 * Big, poster-style character summary shown under the "create/use" tabs in
 * the campaign creator. Same visual footprint for freshly-created and
 * saved-from-library characters so the creator layout doesn't jump.
 *
 * Legend is fetched lazily on button click and cached on the character
 * reference via an in-memory map keyed by backendId/localId/name — avoids
 * re-hitting the API when the user toggles between characters.
 */
const legendCache = new Map();

function characterKey(ch) {
  return ch?.backendId || ch?.localId || ch?.id || ch?.name || 'unknown';
}

function CharacterShowcase({
  character,
  actionLabel,
  actionIcon,
  onAction,
  headlineKey,
  children,
}) {
  const { t } = useTranslation();
  const { generateCharacterLegend } = useAI();
  const { hasApiKey } = useSettings();
  const hasServerAi = hasApiKey('openai') || hasApiKey('anthropic');

  const key = characterKey(character);
  const [legend, setLegend] = useState(() => legendCache.get(key) || '');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    setLegend(legendCache.get(key) || '');
    setError(null);
  }, [key]);

  const careerName = character?.career?.name || null;
  const level = Number(character?.characterLevel || character?.level || 1);
  const xp = Number(character?.characterXp || 0);
  const gender = character?.gender;

  const handleGenerateLegend = async () => {
    if (loading || !hasServerAi) return;
    setLoading(true);
    setError(null);
    try {
      const text = await generateCharacterLegend(character);
      if (text) {
        legendCache.set(key, text);
        setLegend(text);
      }
    } catch (err) {
      setError(err?.message || 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-6 bg-surface-container-high/30 border border-primary/20 rounded-sm">
      <div className="flex items-center justify-between mb-4 gap-3">
        <div className="flex items-center gap-2">
          <span className="material-symbols-outlined text-primary">check_circle</span>
          <span className="text-xs font-bold text-primary uppercase tracking-wider">
            {t(headlineKey)}
          </span>
        </div>
        {onAction && (
          <button
            type="button"
            onClick={onAction}
            className="flex items-center gap-1 text-xs text-tertiary hover:text-primary transition-colors"
          >
            <span className="material-symbols-outlined text-sm">{actionIcon}</span>
            {actionLabel}
          </button>
        )}
      </div>

      <div className="flex items-start gap-6">
        <div className="w-[140px] h-[180px] bg-surface-container-lowest rounded-sm flex items-center justify-center overflow-hidden shrink-0 border border-outline-variant/15">
          {character?.portraitUrl ? (
            <img
              src={apiClient.resolveMediaUrl(character.portraitUrl)}
              alt={character.name}
              className="w-full h-full object-cover"
              onError={(e) => { e.target.style.display = 'none'; }}
            />
          ) : (
            <span className="material-symbols-outlined text-5xl text-primary/60">person</span>
          )}
        </div>

        <div className="min-w-0 flex-1">
          <p className="font-headline text-2xl text-tertiary leading-tight">{character?.name}</p>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1 text-xs text-on-surface-variant">
            <span>{t(`species.${character?.species}`, { defaultValue: character?.species })}</span>
            {careerName && (
              <>
                <span className="text-outline">•</span>
                <span>{careerName}</span>
              </>
            )}
            {gender && (
              <>
                <span className="text-outline">•</span>
                <span className="capitalize">{gender}</span>
              </>
            )}
            <span className="text-outline">•</span>
            <span>{t('characterPicker.levelLabel', 'Lv')} {level}</span>
            <span className="text-outline">•</span>
            <span>{xp} {t('characterPicker.xpLabel')}</span>
          </div>

          <div className="flex flex-wrap gap-x-4 gap-y-1 mt-3">
            {ATTRIBUTE_KEYS.slice(0, 6).map((attrKey) => (
              <span key={attrKey} className="text-[11px] text-on-surface-variant">
                {t(`rpgAttributeShort.${attrKey}`)}:{' '}
                <strong className="text-tertiary">{character?.attributes?.[attrKey] ?? 0}</strong>
              </span>
            ))}
          </div>

          <div className="mt-4 pt-4 border-t border-outline-variant/15">
            {legend ? (
              <>
                <p className="text-[9px] uppercase tracking-widest text-primary/70 font-label mb-2">
                  {t('characterPicker.legendLabel', 'Legenda')}
                </p>
                <p className="text-sm text-on-surface italic leading-relaxed font-body">
                  {legend}
                </p>
                <button
                  type="button"
                  onClick={handleGenerateLegend}
                  disabled={loading || !hasServerAi}
                  className="mt-2 text-[11px] text-tertiary hover:text-primary disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1 transition-colors"
                >
                  <span className="material-symbols-outlined text-xs">refresh</span>
                  {loading
                    ? t('characterPicker.legendLoading', 'Spisywanie legendy...')
                    : t('characterPicker.legendRegenerate', 'Napisz na nowo')}
                </button>
              </>
            ) : (
              <button
                type="button"
                onClick={handleGenerateLegend}
                disabled={loading || !hasServerAi}
                className="flex items-center gap-2 text-xs text-tertiary hover:text-primary disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                <span className="material-symbols-outlined text-sm">auto_stories</span>
                {loading
                  ? t('characterPicker.legendLoading', 'Spisywanie legendy...')
                  : t('characterPicker.legendGenerate', 'Wygeneruj legendę postaci')}
              </button>
            )}
            {error && (
              <p className="mt-2 text-[11px] text-error flex items-center gap-1">
                <span className="material-symbols-outlined text-xs">error</span>
                {t('characterPicker.legendError', 'Nie udało się wygenerować legendy')}
              </p>
            )}
            {!hasServerAi && !legend && (
              <p className="mt-2 text-[10px] text-outline">
                {t('characterPicker.legendNoAi', 'Skonfiguruj klucz AI aby wygenerować legendę')}
              </p>
            )}
          </div>
        </div>
      </div>

      {children}
    </div>
  );
}

function getCharacterLockInfo(ch, t) {
  if (!ch?.lockedCampaignId) return { locked: false };
  if (isSafeLocation(ch.lockedLocation)) return { locked: false };
  const campaignName = ch.lockedCampaignName || t('characterPicker.lockedFallbackCampaign', 'innej kampanii');
  const locationLabel = ch.lockedLocation
    ? t('characterPicker.lockedAtLocation', 'obecnie w: {{loc}}', { loc: ch.lockedLocation })
    : t('characterPicker.lockedNoLocation', 'bez znanej bezpiecznej lokalizacji');
  return {
    locked: true,
    tooltip: t(
      'characterPicker.lockedTooltip',
      'Postać musi znaleźć się w bezpiecznym miejscu (karczma, tawerna, świątynia) w kampanii "{{campaign}}" żeby przejść do innej kampanii. {{location}}.',
      { campaign: campaignName, location: locationLabel },
    ),
    campaignName,
  };
}

export default function CharacterPicker({
  charMode,
  onCharModeChange,
  createdCharacter,
  selectedCharacter,
  onSelectedCharacterChange,
  savedCharacters,
  onShowCharModal,
  editingSelectedPortrait,
  onEditingSelectedPortraitChange,
  persistSelectedCharacter,
  genre,
}) {
  const { t } = useTranslation();

  return (
    <section>
      <label className="block text-[10px] text-on-surface-variant font-label uppercase tracking-widest mb-4">
        {t('characterPicker.title')}
      </label>

      <div className="flex gap-3 mb-6">
        <button
          onClick={() => {
            onCharModeChange('new');
            onSelectedCharacterChange(null);
            onEditingSelectedPortraitChange(false);
          }}
          className={`flex-1 px-4 py-4 rounded-sm border transition-all duration-300 text-left ${
            charMode === 'new'
              ? 'bg-surface-tint text-on-primary border-primary shadow-[0_0_20px_rgba(197,154,255,0.3)]'
              : 'bg-surface-container-high/40 text-on-surface-variant border-outline-variant/15 hover:bg-surface-container-high hover:text-tertiary hover:border-primary/20'
          }`}
        >
          <div className="flex items-center gap-2 mb-1">
            <span className="material-symbols-outlined text-lg">person_add</span>
            <span className="font-bold text-sm">{t('characterPicker.createNew')}</span>
          </div>
          <p className="text-[10px] opacity-70">{t('characterPicker.createNewDesc')}</p>
        </button>
        <button
          onClick={() => {
            onCharModeChange('existing');
            onEditingSelectedPortraitChange(false);
          }}
          className={`flex-1 px-4 py-4 rounded-sm border transition-all duration-300 text-left ${
            charMode === 'existing'
              ? 'bg-surface-tint text-on-primary border-primary shadow-[0_0_20px_rgba(197,154,255,0.3)]'
              : 'bg-surface-container-high/40 text-on-surface-variant border-outline-variant/15 hover:bg-surface-container-high hover:text-tertiary hover:border-primary/20'
          }`}
        >
          <div className="flex items-center gap-2 mb-1">
            <span className="material-symbols-outlined text-lg">group</span>
            <span className="font-bold text-sm">{t('characterPicker.useExisting')}</span>
          </div>
          <p className="text-[10px] opacity-70">{t('characterPicker.useExistingDesc')}</p>
        </button>
      </div>

      {charMode === 'new' && (
        <div className="animate-fade-in">
          {createdCharacter ? (
            <CharacterShowcase
              character={createdCharacter}
              headlineKey="charCreator.characterReady"
              actionLabel={t('charCreator.editCharacter')}
              actionIcon="edit"
              onAction={onShowCharModal}
            />
          ) : (
            <button
              onClick={onShowCharModal}
              className="w-full p-6 border border-dashed border-outline-variant/30 rounded-sm hover:border-primary/40 hover:bg-surface-tint/5 transition-all group"
            >
              <div className="flex flex-col items-center gap-2">
                <span className="material-symbols-outlined text-3xl text-outline group-hover:text-primary transition-colors">person_add</span>
                <span className="text-sm font-label text-on-surface-variant group-hover:text-primary transition-colors">
                  {t('charCreator.createCharacter')}
                </span>
              </div>
            </button>
          )}
        </div>
      )}

      {charMode === 'existing' && (
        <div className="animate-fade-in">
          {savedCharacters.length === 0 ? (
            <p className="text-on-surface-variant text-sm text-center py-6 border border-outline-variant/10 rounded-sm bg-surface-container-high/20">
              {t('characterPicker.noCharacters')}
            </p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
              {savedCharacters.map((ch) => {
                const charId = ch.backendId || ch.localId || ch.id;
                const isSelected = selectedCharacter && (selectedCharacter.backendId || selectedCharacter.localId || selectedCharacter.id) === charId;
                const lockInfo = getCharacterLockInfo(ch, t);
                const cardClasses = lockInfo.locked
                  ? 'bg-surface-container-high/20 border-outline-variant/10 opacity-40 cursor-not-allowed'
                  : isSelected
                    ? 'bg-primary/10 border-primary/30 shadow-[0_0_15px_rgba(197,154,255,0.2)] cursor-pointer'
                    : 'bg-surface-container-high/40 border-outline-variant/10 hover:border-primary/20 hover:bg-surface-container-high/60 cursor-pointer';
                return (
                  <div
                    key={charId}
                    title={lockInfo.locked ? lockInfo.tooltip : undefined}
                    aria-disabled={lockInfo.locked ? 'true' : undefined}
                    className={`p-4 rounded-sm border transition-all ${cardClasses}`}
                    onClick={async () => {
                      if (lockInfo.locked) return;
                      if (isSelected) {
                        onSelectedCharacterChange(null);
                        onEditingSelectedPortraitChange(false);
                      } else {
                        const id = ch.backendId || ch.localId || ch.id;
                        let fullChar;
                        try {
                          fullChar = await storage.loadCharacter(id);
                        } catch {
                          fullChar = null;
                        }
                        const base = fullChar || ch;
                        const normalized = {
                          ...base,
                          backendId: base.backendId || ch.backendId || ch.id,
                          localId: base.localId || ch.localId || ch.id,
                        };
                        onSelectedCharacterChange(normalized);
                        onEditingSelectedPortraitChange(false);
                      }
                    }}
                  >
                    <div className="flex items-start gap-3">
                      <div className="w-12 h-16 bg-surface-container-lowest rounded-sm flex items-center justify-center overflow-hidden shrink-0 border border-outline-variant/10">
                        {ch.portraitUrl ? (
                          <img src={apiClient.resolveMediaUrl(ch.portraitUrl)} alt={ch.name} className="w-full h-full object-cover" onError={(e) => { e.target.style.display = 'none'; }} />
                        ) : (
                          <span className="material-symbols-outlined text-xl text-outline/40">person</span>
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className={`font-headline text-sm truncate ${isSelected ? 'text-primary' : 'text-tertiary'}`}>
                          {ch.name}
                        </p>
                        <p className="text-[10px] text-on-surface-variant truncate">
                          {t(`species.${ch.species}`, { defaultValue: ch.species })}
                        </p>
                        <div className="flex items-center gap-2 mt-1 text-[9px] text-outline">
                          <span>{ch.characterXp || 0} {t('characterPicker.xpLabel')}</span>
                        </div>
                      </div>
                      {isSelected && !lockInfo.locked && (
                        <span className="material-symbols-outlined text-primary text-lg shrink-0">check_circle</span>
                      )}
                      {lockInfo.locked && (
                        <span
                          className="material-symbols-outlined text-outline text-lg shrink-0"
                          aria-label={lockInfo.tooltip}
                        >
                          lock
                        </span>
                      )}
                    </div>
                    {lockInfo.locked && (
                      <p className="mt-2 text-[9px] text-outline/80 italic truncate">
                        {t('characterPicker.lockedBadge', 'W kampanii: {{name}}', { name: lockInfo.campaignName })}
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {selectedCharacter && (
            <div className="mt-4">
              <CharacterShowcase
                character={selectedCharacter}
                headlineKey="characterPicker.selectedCharacter"
                actionLabel={t('character.updatePortrait')}
                actionIcon="photo_camera"
                onAction={() => onEditingSelectedPortraitChange(!editingSelectedPortrait)}
              >
                {editingSelectedPortrait && (
                  <div className="mt-6 pt-6 border-t border-outline-variant/15">
                    <PortraitGenerator
                      species={selectedCharacter.species}
                      gender={selectedCharacter.gender}
                      careerName={selectedCharacter.career?.name}
                      genre={genre}
                      initialPortrait={selectedCharacter.portraitUrl}
                      onPortraitReady={async (url) => {
                        try {
                          await persistSelectedCharacter({ portraitUrl: url || '' });
                          onEditingSelectedPortraitChange(false);
                        } catch {
                          // Keep the editor open so the user can retry.
                        }
                      }}
                    />
                  </div>
                )}
              </CharacterShowcase>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
