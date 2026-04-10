import { useState, useMemo, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { apiClient } from '../../services/apiClient';
import {
  SPECIES, SPECIES_LIST, ATTRIBUTE_KEYS,
  CREATION_LIMITS, SKILL_CAPS, SKILL_CATEGORIES, createStartingSkills, calculateMaxWounds,
} from '../../data/rpgSystem';
import {
  pickRandomName, randomizeSpecies,
  randomizeSkills, randomizeFullCharacter,
  generateStartingMoney,
} from '../../services/gameState';
import { normalizeCharacterAge } from '../../services/characterAge';
import { translateSkill } from '../../utils/rpgTranslate';
import PortraitGenerator from './PortraitGenerator';

function SectionHeader({ icon, label, onRandomize }) {
  return (
    <div className="flex items-center justify-between mb-3">
      <div className="flex items-center gap-2">
        <span className="material-symbols-outlined text-primary text-lg">{icon}</span>
        <h3 className="text-xs text-on-surface-variant font-label uppercase tracking-widest">{label}</h3>
      </div>
      {onRandomize && (
        <button
          type="button"
          onClick={onRandomize}
          className="flex items-center gap-1 px-2 py-1 text-xs font-label text-tertiary hover:text-primary transition-colors rounded-sm hover:bg-surface-tint/10"
          title={label}
        >
          <span className="material-symbols-outlined text-sm">casino</span>
        </button>
      )}
    </div>
  );
}

function PointBuyRow({ label, shortLabel, baseValue, added, speciesMod, finalValue, pointCost, onIncrement, onDecrement, canIncrement, canDecrement }) {
  return (
    <div className="flex items-center gap-2 p-2 bg-surface-container-high/40 border border-outline-variant/10 rounded-sm">
      <div className="flex flex-col min-w-[70px]">
        <div className="flex items-center gap-1">
          <span className="text-[11px] text-on-surface-variant uppercase tracking-wider font-label">{shortLabel}</span>
          {pointCost > 1 && (
            <span className="text-[9px] px-1 py-0.5 bg-amber-500/15 text-amber-400 rounded-sm font-label">×{pointCost}</span>
          )}
        </div>
        <span className="text-[10px] text-outline truncate">{label}</span>
      </div>
      <div className="flex items-center gap-1 ml-auto">
        <button
          type="button"
          onClick={onDecrement}
          disabled={!canDecrement}
          className="w-6 h-6 flex items-center justify-center rounded-sm border border-outline-variant/20 text-on-surface-variant hover:text-primary hover:border-primary/30 disabled:opacity-20 disabled:cursor-not-allowed transition-colors text-sm font-bold"
        >
          −
        </button>
        <div className="flex items-center gap-0.5 min-w-[80px] justify-center">
          <span className="text-xs text-on-surface-variant tabular-nums">{baseValue + added}</span>
          {speciesMod !== 0 && (
            <span className={`text-[10px] tabular-nums ${speciesMod > 0 ? 'text-green-400' : 'text-red-400'}`}>
              {speciesMod > 0 ? '+' : ''}{speciesMod}
            </span>
          )}
          <span className="text-xs text-outline mx-0.5">=</span>
          <span className="text-lg font-headline text-tertiary tabular-nums">{finalValue}</span>
        </div>
        <button
          type="button"
          onClick={onIncrement}
          disabled={!canIncrement}
          className="w-6 h-6 flex items-center justify-center rounded-sm border border-outline-variant/20 text-on-surface-variant hover:text-primary hover:border-primary/30 disabled:opacity-20 disabled:cursor-not-allowed transition-colors text-sm font-bold"
        >
          +
        </button>
      </div>
    </div>
  );
}

export default function CharacterCreationModal({ onConfirm, onClose, genre = 'Fantasy', initialCharacter }) {
  const { t } = useTranslation();

  const [name, setName] = useState(initialCharacter?.name || '');
  const [age, setAge] = useState(normalizeCharacterAge(initialCharacter?.age));
  const [gender, setGender] = useState(initialCharacter?.gender || 'male');
  const [species, setSpecies] = useState(initialCharacter?.species || 'Human');
  // Point-buy: track added points per attribute (0 to maxPerAttributeAtCreation)
  const initBase = () => {
    const base = {};
    for (const key of ATTRIBUTE_KEYS) base[key] = 0;
    return base;
  };
  const [attrAdded, setAttrAdded] = useState(initBase);
  const [skills, setSkills] = useState(initialCharacter?.skills || createStartingSkills(initialCharacter?.species || 'Human'));
  const [backstory, setBackstory] = useState(initialCharacter?.backstory || '');
  const [portraitUrl, setPortraitUrl] = useState(initialCharacter?.portraitUrl || null);
  const [portraitOpen, setPortraitOpen] = useState(false);

  const speciesData = SPECIES[species] || SPECIES.Human;

  // Derive final attributes from base + added + species mod
  const attributes = useMemo(() => {
    const result = {};
    for (const key of ATTRIBUTE_KEYS) {
      const base = CREATION_LIMITS.baseAttribute + (attrAdded[key] || 0);
      const mod = speciesData.attributes[key] || 0;
      result[key] = Math.max(1, base + mod);
    }
    return result;
  }, [attrAdded, speciesData]);

  const szczCost = CREATION_LIMITS.szczesciePointCost;
  const attrPointCost = useCallback((key) => key === 'szczescie' ? szczCost : 1, [szczCost]);
  const attrPointsUsed = useMemo(() =>
    ATTRIBUTE_KEYS.reduce((sum, key) => sum + (attrAdded[key] || 0) * (key === 'szczescie' ? szczCost : 1), 0),
  [attrAdded, szczCost]);
  const attrPointsRemaining = CREATION_LIMITS.distributableAttributePoints - attrPointsUsed;

  const maxWounds = useMemo(() => calculateMaxWounds(attributes?.wytrzymalosc ?? 10), [attributes]);

  const handleSpeciesChange = useCallback((sp) => {
    setSpecies(sp);
    setAttrAdded(initBase());
    setSkills(createStartingSkills(sp));
  }, []);

  const handleRandomizeName = useCallback(() => {
    setName(pickRandomName(genre, name));
  }, [genre, name]);

  const handleRandomizeSpecies = useCallback(() => {
    const sp = randomizeSpecies();
    setSpecies(sp);
    setAttrAdded(initBase());
    setSkills(createStartingSkills(sp));
  }, []);

  const handleRandomizeStats = useCallback(() => {
    const { distributableAttributePoints, maxPerAttributeAtCreation, szczesciePointCost } = CREATION_LIMITS;
    const added = {};
    for (const key of ATTRIBUTE_KEYS) added[key] = 0;
    let remaining = distributableAttributePoints;
    // Exclude szczescie from random — too expensive to randomly land on
    const nonLuckKeys = ATTRIBUTE_KEYS.filter((k) => k !== 'szczescie');
    let attempts = 0;
    while (remaining > 0 && attempts < 200) {
      const key = nonLuckKeys[Math.floor(Math.random() * nonLuckKeys.length)];
      if (added[key] < maxPerAttributeAtCreation) {
        added[key]++;
        remaining--;
      }
      attempts++;
    }
    setAttrAdded(added);
  }, []);

  const handleAttrIncrement = useCallback((key) => {
    const cost = key === 'szczescie' ? CREATION_LIMITS.szczesciePointCost : 1;
    setAttrAdded((prev) => {
      if ((prev[key] || 0) >= CREATION_LIMITS.maxPerAttributeAtCreation) return prev;
      const used = ATTRIBUTE_KEYS.reduce((s, k) => s + (prev[k] || 0) * (k === 'szczescie' ? CREATION_LIMITS.szczesciePointCost : 1), 0);
      if (used + cost > CREATION_LIMITS.distributableAttributePoints) return prev;
      return { ...prev, [key]: (prev[key] || 0) + 1 };
    });
  }, []);

  const handleAttrDecrement = useCallback((key) => {
    setAttrAdded((prev) => {
      if ((prev[key] || 0) <= 0) return prev;
      return { ...prev, [key]: (prev[key] || 0) - 1 };
    });
  }, []);

  const handleRandomizeSkills = useCallback(() => {
    setSkills(randomizeSkills(species));
  }, [species]);

  const handleRandomizeAll = useCallback(() => {
    const char = randomizeFullCharacter(genre, undefined);
    setName(char.name);
    setAge(normalizeCharacterAge(char.age));
    setGender(char.gender);
    setSpecies(char.species);
    // Reverse-engineer attrAdded from generated attributes (strip species mods)
    const sp = SPECIES[char.species] || SPECIES.Human;
    const added = {};
    for (const key of ATTRIBUTE_KEYS) {
      const finalVal = (char.attributes || char.characteristics)?.[key] || CREATION_LIMITS.baseAttribute;
      const mod = sp.attributes[key] || 0;
      added[key] = Math.max(0, finalVal - CREATION_LIMITS.baseAttribute - mod);
    }
    setAttrAdded(added);
    setSkills(char.skills || createStartingSkills(char.species));
  }, [genre]);

  const handleConfirm = useCallback(() => {
    onConfirm({
      name: name.trim() || pickRandomName(genre),
      age: normalizeCharacterAge(age),
      gender,
      species,
      attributes,
      wounds: maxWounds,
      maxWounds,
      movement: speciesData.movement,
      mana: { current: speciesData.startingMana || 0, max: speciesData.startingMana || 0 },
      spells: { known: [], usageCounts: {}, scrolls: [] },
      skills,
      inventory: [],
      money: generateStartingMoney(),
      statuses: [],
      backstory,
      portraitUrl: portraitUrl || '',
      characterLevel: 1,
      characterXp: 0,
      attributePoints: 0,
    });
  }, [name, age, gender, species, attributes, maxWounds, speciesData, skills, backstory, portraitUrl, genre, onConfirm]);

  // Skill points system for creation
  const racialSkillNames = useMemo(() => new Set(speciesData.skills || []), [speciesData]);
  const racialBase = CREATION_LIMITS.racialSkillLevel;
  const maxSkillLevel = SKILL_CAPS.basic;

  const skillPointsUsed = useMemo(() => {
    let used = 0;
    for (const [name, v] of Object.entries(skills)) {
      const level = typeof v === 'object' ? v.level : (v || 0);
      const base = racialSkillNames.has(name) ? racialBase : 0;
      used += Math.max(0, level - base);
    }
    return used;
  }, [skills, racialSkillNames, racialBase]);
  const totalSkillPoints = CREATION_LIMITS.startingSkillPoints;
  const remainingSkillPoints = totalSkillPoints - skillPointsUsed;
  const skillPointsPct = Math.min(100, (skillPointsUsed / totalSkillPoints) * 100);

  const handleSkillIncrement = useCallback((skillName) => {
    setSkills((prev) => {
      const old = prev[skillName];
      const oldLevel = typeof old === 'object' ? old.level : (old || 0);
      if (oldLevel >= maxSkillLevel) return prev;
      // Check budget
      const base = racialSkillNames.has(skillName) ? racialBase : 0;
      let used = 0;
      for (const [name, v] of Object.entries(prev)) {
        const l = typeof v === 'object' ? v.level : (v || 0);
        const b = racialSkillNames.has(name) ? racialBase : 0;
        used += Math.max(0, l - b);
      }
      if (used >= totalSkillPoints) return prev;
      const newLevel = oldLevel + 1;
      if (typeof old === 'object') {
        return { ...prev, [skillName]: { ...old, level: newLevel } };
      }
      return { ...prev, [skillName]: newLevel };
    });
  }, [racialSkillNames, racialBase, totalSkillPoints, maxSkillLevel]);

  const handleSkillDecrement = useCallback((skillName) => {
    setSkills((prev) => {
      const old = prev[skillName];
      const oldLevel = typeof old === 'object' ? old.level : (old || 0);
      const minLevel = racialSkillNames.has(skillName) ? racialBase : 0;
      if (oldLevel <= minLevel) return prev;
      const newLevel = oldLevel - 1;
      if (typeof old === 'object') {
        return { ...prev, [skillName]: { ...old, level: newLevel } };
      }
      return { ...prev, [skillName]: newLevel };
    });
  }, [racialSkillNames, racialBase]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <div
        className="relative w-full max-w-3xl max-h-[90vh] bg-surface-container-highest/80 backdrop-blur-2xl border border-outline-variant/15 rounded-sm flex flex-col shadow-2xl animate-fade-in"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-outline-variant/10 shrink-0">
          <div className="flex items-center gap-3">
            <span className="material-symbols-outlined text-primary text-xl">person_add</span>
            <h2 className="text-sm font-bold text-on-surface uppercase tracking-widest">
              {t('charCreator.title')}
            </h2>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleRandomizeAll}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-label text-tertiary hover:text-primary border border-outline-variant/15 hover:border-primary/30 rounded-sm transition-all hover:bg-surface-tint/10"
            >
              <span className="material-symbols-outlined text-sm">casino</span>
              {t('charCreator.randomizeAll')}
            </button>
            <button onClick={onClose} className="material-symbols-outlined text-lg text-outline hover:text-on-surface transition-colors">
              close
            </button>
          </div>
        </div>

        {/* Scrollable body */}
        <div className="overflow-y-auto flex-1 px-5 py-5 space-y-8 custom-scrollbar">

          {/* Name + Age + Gender */}
          <section>
            <SectionHeader icon="badge" label={t('charCreator.nameLabel')} onRandomize={handleRandomizeName} />
            <div className="flex gap-3 items-end">
              <input
                type="text"
                name="name"
                data-testid="character-name-input"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={t('charCreator.namePlaceholder')}
                maxLength={40}
                className="flex-1 bg-transparent border-0 border-b border-outline-variant/20 focus:border-primary/50 focus:ring-0 text-on-surface text-sm py-2 px-1 placeholder:text-outline/40 font-body"
              />
              <input
                type="number"
                min={1}
                max={999}
                value={age}
                onChange={(e) => setAge(normalizeCharacterAge(e.target.value))}
                aria-label={t('charCreator.ageLabel')}
                className="w-20 bg-transparent border-0 border-b border-outline-variant/20 focus:border-primary/50 focus:ring-0 text-on-surface text-sm py-2 px-1 placeholder:text-outline/40 font-body text-right"
              />
              <div className="flex gap-1.5 shrink-0">
                {['male', 'female'].map((g) => (
                  <button
                    key={g}
                    type="button"
                    onClick={() => setGender(g)}
                    className={`px-3 py-1.5 text-xs rounded-sm border transition-colors ${
                      gender === g
                        ? 'border-primary bg-primary/10 text-primary'
                        : 'border-outline-variant/20 text-on-surface-variant hover:border-primary/20'
                    }`}
                  >
                    {t(`multiplayer.${g}`)}
                  </button>
                ))}
              </div>
            </div>
          </section>

          {/* Portrait */}
          <section>
            <SectionHeader icon="photo_camera" label={t('charCreator.portrait')} />
            {portraitUrl && !portraitOpen ? (
              <div className="flex items-center gap-4">
                <div className="w-16 h-[85px] rounded-sm overflow-hidden border border-primary/30 shadow-[0_0_10px_rgba(197,154,255,0.15)]">
                  <img src={apiClient.resolveMediaUrl(portraitUrl)} alt="Portrait" className="w-full h-full object-cover" onError={(e) => { e.target.style.display = 'none'; }} />
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setPortraitOpen(true)}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-label text-tertiary hover:text-primary border border-outline-variant/15 hover:border-primary/30 rounded-sm transition-all hover:bg-surface-tint/10"
                  >
                    <span className="material-symbols-outlined text-sm">edit</span>
                    {t('character.updatePortrait')}
                  </button>
                  <button
                    type="button"
                    onClick={() => { setPortraitUrl(null); setPortraitOpen(true); }}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-label text-on-surface-variant hover:text-error border border-outline-variant/15 hover:border-error/30 rounded-sm transition-all"
                  >
                    <span className="material-symbols-outlined text-sm">delete</span>
                  </button>
                </div>
              </div>
            ) : (
              <PortraitGenerator
                species={species}
                age={age}
                gender={gender}
                genre={genre}
                initialPortrait={portraitUrl}
                onPortraitReady={(url) => {
                  setPortraitUrl(url);
                  if (url) setPortraitOpen(false);
                }}
              />
            )}
          </section>

          {/* Species */}
          <section>
            <SectionHeader icon="groups" label={t('charCreator.speciesLabel')} onRandomize={handleRandomizeSpecies} />
            <div className="flex flex-wrap gap-2">
              {SPECIES_LIST.map((sp) => (
                <button
                  key={sp}
                  type="button"
                  onClick={() => handleSpeciesChange(sp)}
                  className={`px-3 py-2 rounded-sm font-label text-xs transition-all duration-300 border ${
                    species === sp
                      ? 'bg-surface-tint text-on-primary border-primary shadow-[0_0_15px_rgba(197,154,255,0.3)]'
                      : 'bg-surface-container-high/40 text-on-surface-variant border-outline-variant/15 hover:bg-surface-container-high hover:text-tertiary hover:border-primary/20'
                  }`}
                >
                  <div className="font-bold">{t(`species.${sp}`)}</div>
                  <div className="text-[11px] opacity-70 mt-0.5">{t(`species.${sp.replace(' ', '')}Desc`)}</div>
                </button>
              ))}
            </div>
          </section>

          {/* Attributes — Point Buy */}
          <section>
            <SectionHeader icon="monitoring" label={t('charCreator.characteristicsLabel')} onRandomize={handleRandomizeStats} />
            <div className="mb-3">
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-[10px] font-label uppercase tracking-wider text-on-surface-variant">
                  {t('charCreator.attributePointsRemaining')}
                </span>
                <span className={`text-xs font-bold tabular-nums ${
                  attrPointsRemaining <= 0 ? 'text-error' : attrPointsRemaining <= 3 ? 'text-tertiary' : 'text-primary'
                }`}>
                  {attrPointsRemaining} / {CREATION_LIMITS.distributableAttributePoints}
                </span>
              </div>
              <div className="h-1.5 rounded-full bg-surface-container-high/60 overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-300 ${
                    attrPointsRemaining <= 0 ? 'bg-error' : attrPointsRemaining <= 3 ? 'bg-tertiary' : 'bg-primary'
                  }`}
                  style={{ width: `${Math.min(100, (attrPointsUsed / CREATION_LIMITS.distributableAttributePoints) * 100)}%` }}
                />
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {ATTRIBUTE_KEYS.map((key) => {
                const added = attrAdded[key] || 0;
                const specMod = speciesData.attributes[key] || 0;
                const cost = attrPointCost(key);
                return (
                  <PointBuyRow
                    key={key}
                    label={t(`rpgAttributes.${key}`)}
                    shortLabel={t(`rpgAttributeShort.${key}`)}
                    baseValue={CREATION_LIMITS.baseAttribute}
                    added={added}
                    speciesMod={specMod}
                    finalValue={attributes[key]}
                    pointCost={cost}
                    onIncrement={() => handleAttrIncrement(key)}
                    onDecrement={() => handleAttrDecrement(key)}
                    canIncrement={added < CREATION_LIMITS.maxPerAttributeAtCreation && attrPointsRemaining >= cost}
                    canDecrement={added > 0}
                  />
                );
              })}
            </div>
            <div className="flex flex-wrap gap-4 mt-3 text-xs text-on-surface-variant">
              <span>{t('charCreator.derivedWounds')}: <strong className="text-tertiary">{maxWounds}</strong></span>
              <span>{t('charCreator.derivedMovement')}: <strong className="text-tertiary">{speciesData.movement}</strong></span>
              <span>Mana: <strong className="text-tertiary">{speciesData.startingMana || 0}</strong></span>
            </div>
          </section>

          {/* Skills — grouped by category */}
          <section>
            <SectionHeader icon="construction" label={t('charCreator.skillsLabel')} onRandomize={handleRandomizeSkills} />
            <div className="mb-3">
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-[10px] font-label uppercase tracking-wider text-on-surface-variant">
                  {t('charCreator.skillPointsRemaining')}
                </span>
                <span className={`text-xs font-bold tabular-nums ${
                  remainingSkillPoints <= 0 ? 'text-error' : remainingSkillPoints <= 5 ? 'text-tertiary' : 'text-primary'
                }`}>
                  {remainingSkillPoints} / {totalSkillPoints}
                </span>
              </div>
              <div className="h-1.5 rounded-full bg-surface-container-high/60 overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-300 ${
                    remainingSkillPoints <= 0 ? 'bg-error' : remainingSkillPoints <= 5 ? 'bg-tertiary' : 'bg-primary'
                  }`}
                  style={{ width: `${skillPointsPct}%` }}
                />
              </div>
            </div>
            <div className="space-y-4">
              {SKILL_CATEGORIES.map((cat) => (
                <div key={cat.key}>
                  <div className="flex items-center gap-1.5 mb-2">
                    <span className="material-symbols-outlined text-sm text-primary">{cat.icon}</span>
                    <span className="text-[11px] font-label uppercase tracking-wider text-on-surface-variant">{t(`rpgSkillCategories.${cat.key}`, { defaultValue: cat.label })}</span>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1">
                    {cat.skills.map((skillName) => {
                      const val = skills[skillName];
                      const level = typeof val === 'object' ? val.level : (val || 0);
                      const isRacial = racialSkillNames.has(skillName);
                      const minLevel = isRacial ? racialBase : 0;
                      return (
                        <div key={skillName} className="flex items-center justify-between py-1 border-b border-outline-variant/5">
                          <div className="flex items-center gap-1.5 min-w-0">
                            <span className="text-xs text-on-surface truncate">{translateSkill(skillName, t)}</span>
                            {isRacial && (
                              <span className="shrink-0 text-[9px] px-1 py-0.5 bg-primary/15 text-primary rounded-sm font-label">
                                {t('charCreator.racialSkill')}
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-1 shrink-0">
                            <button
                              type="button"
                              onClick={() => handleSkillDecrement(skillName)}
                              disabled={level <= minLevel}
                              className="w-5 h-5 flex items-center justify-center rounded-sm text-on-surface-variant hover:text-primary disabled:opacity-20 disabled:cursor-not-allowed transition-colors text-xs font-bold"
                            >
                              −
                            </button>
                            <span className={`w-6 text-center text-xs tabular-nums ${level > 0 ? 'text-tertiary font-bold' : 'text-outline'}`}>
                              {level}
                            </span>
                            <button
                              type="button"
                              onClick={() => handleSkillIncrement(skillName)}
                              disabled={level >= maxSkillLevel || remainingSkillPoints <= 0}
                              className="w-5 h-5 flex items-center justify-center rounded-sm text-on-surface-variant hover:text-primary disabled:opacity-20 disabled:cursor-not-allowed transition-colors text-xs font-bold"
                            >
                              +
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </section>

          {/* Backstory */}
          <section>
            <SectionHeader icon="menu_book" label={t('charCreator.backstoryLabel')} />
            <textarea
              value={backstory}
              onChange={(e) => setBackstory(e.target.value)}
              placeholder={t('charCreator.backstoryPlaceholder')}
              rows={3}
              className="w-full bg-transparent border-0 border-b border-outline-variant/20 focus:border-primary/50 focus:ring-0 text-on-surface text-sm py-2 px-1 resize-none placeholder:text-outline/40 font-body"
            />
          </section>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-5 py-4 border-t border-outline-variant/10 shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm font-label text-on-surface-variant hover:text-on-surface transition-colors"
          >
            {t('common.cancel')}
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            className="px-5 py-2 bg-surface-tint text-on-primary text-sm font-label font-bold rounded-sm border border-primary shadow-[0_0_20px_rgba(197,154,255,0.3)] hover:shadow-[0_0_30px_rgba(197,154,255,0.5)] transition-all"
          >
            <span className="flex items-center gap-2">
              <span className="material-symbols-outlined text-sm">check</span>
              {t('charCreator.confirm')}
            </span>
          </button>
        </div>
      </div>
    </div>
  );
}
