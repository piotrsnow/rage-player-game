import { useState, useMemo, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { apiClient } from '../../services/apiClient';
import {
  SPECIES, SPECIES_LIST, ATTRIBUTE_KEYS,
  CREATION_LIMITS, SKILL_CAPS, createStartingSkills, calculateMaxWounds,
} from '../../data/rpgSystem';
import {
  pickRandomName, randomizeSpecies,
  randomizeSkills, randomizeFullCharacter,
  generateStartingMoney,
} from '../../services/gameState';
import { normalizeCharacterAge } from '../../services/characterAge';
import PortraitGenerator from './PortraitGenerator';
import { SectionHeader } from './creation/Primitives';
import AttributesSection from './creation/AttributesSection';
import SkillsSection from './creation/SkillsSection';

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

          <AttributesSection
            attrAdded={attrAdded}
            attributes={attributes}
            speciesData={speciesData}
            attrPointsUsed={attrPointsUsed}
            attrPointsRemaining={attrPointsRemaining}
            attrPointCost={attrPointCost}
            maxWounds={maxWounds}
            onIncrement={handleAttrIncrement}
            onDecrement={handleAttrDecrement}
            onRandomize={handleRandomizeStats}
          />

          <SkillsSection
            skills={skills}
            racialSkillNames={racialSkillNames}
            racialBase={racialBase}
            totalSkillPoints={totalSkillPoints}
            skillPointsUsed={skillPointsUsed}
            remainingSkillPoints={remainingSkillPoints}
            skillPointsPct={skillPointsPct}
            onIncrement={handleSkillIncrement}
            onDecrement={handleSkillDecrement}
            onRandomize={handleRandomizeSkills}
          />

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
