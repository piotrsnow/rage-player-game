import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { apiClient } from '../../services/apiClient';
import { useAI } from '../../hooks/useAI';
import { SPELL_TREES } from '../../data/rpgMagic';
import { resolveKnownSpellDisplay } from '../../services/magicEngine';
import { gameData } from '../../services/gameDataService';

const SPELL_TREE_THEMES = {
  ogien: { border: 'border-red-400/30', glow: 'shadow-[0_0_12px_rgba(248,113,113,0.15)]' },
  blyskawice: { border: 'border-yellow-300/30', glow: 'shadow-[0_0_12px_rgba(253,224,71,0.15)]' },
  ochrona: { border: 'border-blue-300/30', glow: 'shadow-[0_0_12px_rgba(147,197,253,0.15)]' },
  niewidzialnosc: { border: 'border-violet-300/30', glow: 'shadow-[0_0_12px_rgba(196,181,253,0.15)]' },
  lod: { border: 'border-cyan-200/30', glow: 'shadow-[0_0_12px_rgba(165,243,252,0.15)]' },
  leczenie: { border: 'border-emerald-300/30', glow: 'shadow-[0_0_12px_rgba(110,231,183,0.15)]' },
  przestrzen: { border: 'border-fuchsia-300/30', glow: 'shadow-[0_0_12px_rgba(240,171,252,0.15)]' },
  umysl: { border: 'border-pink-300/30', glow: 'shadow-[0_0_12px_rgba(249,168,212,0.15)]' },
  wiatr_percepcja: { border: 'border-teal-300/30', glow: 'shadow-[0_0_12px_rgba(94,234,212,0.15)]' },
  magia_zakazana: { border: 'border-rose-400/30', glow: 'shadow-[0_0_12px_rgba(251,113,133,0.15)]' },
};

function normalizeCustomSpellSchool(school) {
  if (!school || school === 'ogolna') return 'magia_zakazana';
  return SPELL_TREES[school] ? school : 'magia_zakazana';
}

export default function SpellsTab({
  character,
  dispatch,
  autoSave,
  isMultiplayer,
  settings,
}) {
  const { t } = useTranslation();
  const [selectedSpellName, setSelectedSpellName] = useState(null);
  const [regeneratingSpellName, setRegeneratingSpellName] = useState(null);
  const [classifyingSpellSchools, setClassifyingSpellSchools] = useState(false);
  const spellSchoolClassifyAttemptedRef = useRef(new Set());

  const { generateSpellImageForSpell } = useAI();
  const canRegenerateSpellImage = !isMultiplayer && settings.itemImagesEnabled !== false;

  const knownSpells = useMemo(() => {
    const usageCounts = character.spells?.usageCounts || {};
    const customCatalogByName = new Map(gameData.customSpells.map((s) => [s.name, s]));
    return (character.spells?.known || []).map((spellName) => {
      const base = resolveKnownSpellDisplay(spellName, character);
      const catalogEntry = base.isCustom ? customCatalogByName.get(spellName) : null;
      return {
        ...base,
        name: base.name,
        uses: usageCounts[spellName] || 0,
        manaCost: base.manaCost || catalogEntry?.manaCost || 2,
        level: base.level || catalogEntry?.level || null,
        school: base.school || catalogEntry?.school || null,
        treeName: base.isCustom
          ? (SPELL_TREES[base.school || catalogEntry?.school]?.name || t('magic.customSpellSchool', { defaultValue: 'Niestandardowe' }))
          : base.treeName,
        description: base.isCustom
          ? (base.description || catalogEntry?.description || '')
          : base.description,
      };
    });
  }, [character.spells?.known, character.spells?.usageCounts, character.spells?.icons, character.spells?.schools, character.spells?.details, t]);

  const selectedSpell = selectedSpellName ? knownSpells.find((s) => s.name === selectedSpellName) || null : null;
  const selectedSpellImageUrl = selectedSpell && gameData.spellImages?.[selectedSpell.name]
    ? apiClient.resolveMediaUrl(gameData.spellImages[selectedSpell.name])
    : null;
  const selectedSpellHasEnoughMana = selectedSpell ? (character.mana?.current || 0) >= selectedSpell.manaCost : false;

  useEffect(() => {
    if (selectedSpellName && !knownSpells.some((s) => s.name === selectedSpellName)) {
      setSelectedSpellName(null);
    }
  }, [knownSpells, selectedSpellName]);

  const incompleteCustomSpellNames = useMemo(
    () => knownSpells
      .filter((spell) => spell.isCustom && (!spell.school || !spell.level || !spell.description))
      .map((spell) => spell.name),
    [knownSpells],
  );

  const classifyMissingSpellSchools = useCallback(async () => {
    if (!dispatch || isMultiplayer || incompleteCustomSpellNames.length === 0 || classifyingSpellSchools) return;
    const spellNames = incompleteCustomSpellNames.filter(
      (name) => !spellSchoolClassifyAttemptedRef.current.has(`${name}:meta_v2`),
    );
    if (spellNames.length === 0) return;
    for (const name of spellNames) {
      spellSchoolClassifyAttemptedRef.current.add(`${name}:meta_v2`);
    }
    setClassifyingSpellSchools(true);
    try {
      const { results, details } = await apiClient.post('/ai/classify-spell-school', { spellNames });
      if (results) {
        for (const [spellName, school] of Object.entries(results)) {
          const detail = details?.[spellName];
          dispatch({
            type: 'APPLY_STATE_CHANGES',
            payload: {
              learnSpell: spellName,
              learnSpellSchool: detail?.school || school,
              ...(detail?.description ? { learnSpellDescription: detail.description } : {}),
              ...(detail?.level ? { learnSpellLevel: detail.level } : {}),
              ...(detail?.manaCost ? { learnSpellManaCost: detail.manaCost } : {}),
            },
          });
        }
        if (autoSave) autoSave();
      }
    } catch {
      // Classification is a convenience — leave the spell uncategorized if the AI call fails.
    } finally {
      setClassifyingSpellSchools(false);
    }
  }, [autoSave, classifyingSpellSchools, dispatch, isMultiplayer, incompleteCustomSpellNames]);

  useEffect(() => {
    void classifyMissingSpellSchools();
  }, [classifyMissingSpellSchools]);

  const handleRegenerateSpellImage = useCallback(async (spellName) => {
    if (!spellName || regeneratingSpellName) return;
    setRegeneratingSpellName(spellName);
    try {
      await generateSpellImageForSpell(spellName, { forceNew: true });
    } finally {
      setRegeneratingSpellName(null);
    }
  }, [regeneratingSpellName, generateSpellImageForSpell]);

  return (
    <div className="flex flex-col lg:flex-row gap-6 animate-fade-in">
      {/* Spell grid */}
      <div className="w-full lg:w-[340px] shrink-0 min-w-0">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-tertiary font-headline text-xl">
            {t('magic.spells', { defaultValue: 'Zaklęcia' })}
            <span className="ml-2 text-sm text-on-surface-variant font-label">({knownSpells.length})</span>
          </h3>
        </div>

        {knownSpells.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-on-surface-variant/60">
            <span className="material-symbols-outlined text-5xl mb-3">auto_awesome</span>
            <p className="text-sm font-label">{t('magic.noSpells', { defaultValue: 'Brak zaklęć' })}</p>
          </div>
        ) : (
          <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
            {knownSpells.map((spell) => {
              const imageUrl = gameData.spellImages?.[spell.name];
              const resolvedImageUrl = imageUrl ? apiClient.resolveMediaUrl(imageUrl) : null;
              const isSelected = selectedSpellName === spell.name;
              const schoolId = normalizeCustomSpellSchool(spell.school || spell.treeId);
              const theme = SPELL_TREE_THEMES[schoolId] || {};

              return (
                <div
                  key={spell.name}
                  className={`relative aspect-square bg-surface-container-highest border cursor-pointer group transition-all hover:scale-[1.03] ${
                    isSelected
                      ? 'ring-2 ring-tertiary scale-[1.03] shadow-[0_0_20px_rgba(255,239,213,0.2)]'
                      : `border-tertiary/20 ${theme.glow || ''}`
                  }`}
                  onClick={() => setSelectedSpellName(isSelected ? null : spell.name)}
                >
                  {resolvedImageUrl ? (
                    <img
                      src={resolvedImageUrl}
                      alt={spell.name}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                      onError={(e) => { e.target.style.display = 'none'; if (e.target.nextSibling) e.target.nextSibling.style.display = 'flex'; }}
                    />
                  ) : null}
                  <div
                    className={`${resolvedImageUrl ? 'hidden' : 'flex'} absolute inset-0 items-center justify-center`}
                  >
                    <span className="material-symbols-outlined text-tertiary/40 text-4xl">
                      {spell.icon || 'auto_awesome'}
                    </span>
                  </div>

                  {spell.uses > 0 && (
                    <div className="absolute top-1 right-1 min-w-[1.25rem] h-5 px-1 bg-tertiary/80 rounded-full flex items-center justify-center">
                      <span className="text-[10px] font-bold text-surface-dim">{spell.uses}</span>
                    </div>
                  )}

                  <div className="absolute inset-x-0 bottom-0 px-1.5 pt-5 pb-1 bg-gradient-to-t from-black/90 via-black/50 to-transparent pointer-events-none">
                    <span className="block text-[10px] font-label leading-tight truncate text-on-surface">
                      {spell.name}
                    </span>
                    <span className="text-[8px] text-tertiary/70">{spell.manaCost} many</span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Detail panel */}
      <div className="flex-1 min-w-0">
        {selectedSpell ? (
          <div
            className="sticky top-0 overflow-hidden border border-tertiary/15 rounded-sm shadow-xl animate-in fade-in slide-in-from-right-3 duration-150"
            style={selectedSpellImageUrl ? { backgroundImage: `url(${selectedSpellImageUrl})`, backgroundSize: 'cover', backgroundPosition: 'center' } : undefined}
          >
            {selectedSpellImageUrl && (
              <>
                <div className="absolute inset-0 bg-gradient-to-t from-surface-dim via-surface-dim/85 to-surface-dim/35" />
                <div className="absolute inset-0 backdrop-blur-[1px]" />
              </>
            )}
            <div className="relative p-5">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-tertiary font-headline flex items-center gap-2">
                  <span className="material-symbols-outlined text-sm">auto_awesome</span>
                  {t('magic.spellDetails', { defaultValue: 'Szczegóły zaklęcia' })}
                </h3>
                <button
                  onClick={() => setSelectedSpellName(null)}
                  aria-label={t('common.close')}
                  className="text-on-surface-variant hover:text-tertiary transition-colors"
                >
                  <span className="material-symbols-outlined text-base">close</span>
                </button>
              </div>

              <div className="mb-3">
                <p className="text-[10px] font-label uppercase tracking-[0.18em] text-tertiary/80 mb-1">
                  {selectedSpell.isCustom
                    ? selectedSpell.treeName
                    : `${selectedSpell.treeName} · ${t('magic.level', { level: selectedSpell.level, defaultValue: `Poziom ${selectedSpell.level}` })}`}
                </p>
                <h4 className="font-headline text-2xl text-tertiary leading-tight">
                  {selectedSpell.name}
                </h4>
              </div>

              {!selectedSpellImageUrl && (
                <div className="flex items-center justify-center py-6">
                  <span className="material-symbols-outlined text-6xl text-tertiary/30">{selectedSpell.icon}</span>
                </div>
              )}

              <div className="grid grid-cols-2 gap-2 mb-3">
                <div className="rounded-sm bg-surface-container-high/60 border border-outline-variant/15 px-3 py-2">
                  <div className="text-[9px] font-label uppercase tracking-widest text-on-surface-variant/70">
                    {t('magic.manaCost', 'Koszt many')}
                  </div>
                  <div className={`font-headline text-lg ${selectedSpellHasEnoughMana ? 'text-tertiary' : 'text-error-light'}`}>
                    {selectedSpell.manaCost}
                  </div>
                </div>
                <div className="rounded-sm bg-surface-container-high/60 border border-outline-variant/15 px-3 py-2">
                  <div className="text-[9px] font-label uppercase tracking-widest text-on-surface-variant/70">
                    {t('magic.usesLabel', 'Użycia')}
                  </div>
                  <div className="font-headline text-lg text-primary">{selectedSpell.uses}</div>
                </div>
              </div>

              <div className="rounded-sm bg-surface-container-high/40 border border-outline-variant/10 p-3">
                <p className="text-on-surface-variant text-sm leading-relaxed">
                  {selectedSpell.description || t('magic.customSpellDescription', { defaultValue: 'Zaklęcie z fabuły lub wymyślone — nie należy do standardowego drzewka w grze.' })}
                </p>
                {!selectedSpellHasEnoughMana && (
                  <p className="text-error-light/80 text-xs mt-3">
                    {t('magic.notEnoughMana', { cost: selectedSpell.manaCost, current: character.mana?.current || 0 })}
                  </p>
                )}
              </div>

              {canRegenerateSpellImage && (
                <button
                  type="button"
                  onClick={() => handleRegenerateSpellImage(selectedSpell.name)}
                  disabled={regeneratingSpellName === selectedSpell.name}
                  className="flex items-center gap-1.5 text-xs font-label text-on-surface-variant/80 hover:text-tertiary transition-colors disabled:opacity-50 mt-3"
                >
                  <span className={`material-symbols-outlined text-sm ${regeneratingSpellName === selectedSpell.name ? 'animate-spin' : ''}`}>
                    {regeneratingSpellName === selectedSpell.name ? 'progress_activity' : 'refresh'}
                  </span>
                  {regeneratingSpellName === selectedSpell.name
                    ? t('magic.regeneratingImage', { defaultValue: 'Generowanie...' })
                    : t('magic.regenerateImage', { defaultValue: 'Regeneruj obraz' })}
                </button>
              )}
            </div>
          </div>
        ) : (
          <div className="sticky top-0 flex flex-col items-center justify-center py-20 text-on-surface-variant/40 border border-dashed border-outline-variant/15 rounded-sm">
            <span className="material-symbols-outlined text-4xl mb-2">auto_awesome</span>
            <p className="text-xs font-label uppercase tracking-widest">
              {t('magic.selectSpellHint', { defaultValue: 'Wybierz zaklęcie' })}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
