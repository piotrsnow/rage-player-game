import { useState, useMemo, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { apiClient } from '../../services/apiClient';
import {
  SPECIES, SPECIES_LIST, ATTRIBUTE_KEYS, ATTRIBUTE_SHORT,
  CREATION_LIMITS, createStartingSkills, calculateMaxWounds,
} from '../../data/rpgSystem';
import {
  generateAttributes,
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

function StatBox({ label, shortLabel, value, onReroll }) {
  return (
    <div className="flex flex-col items-center gap-1 p-2 bg-surface-container-high/40 border border-outline-variant/10 rounded-sm min-w-[60px]">
      <span className="text-[11px] text-on-surface-variant uppercase tracking-wider">{shortLabel}</span>
      <span className="text-lg font-headline text-tertiary">{value}</span>
      <span className="text-[10px] text-outline truncate max-w-full">{label}</span>
      {onReroll && (
        <button
          type="button"
          onClick={onReroll}
          className="material-symbols-outlined text-[12px] text-outline hover:text-primary transition-colors mt-0.5"
        >
          casino
        </button>
      )}
    </div>
  );
}

export default function CharacterCreationModal({ onConfirm, onClose, genre = 'Fantasy', initialCharacter }) {
  const { t } = useTranslation();

  const [name, setName] = useState(initialCharacter?.name || '');
  const [age, setAge] = useState(normalizeCharacterAge(initialCharacter?.age));
  const [gender, setGender] = useState(initialCharacter?.gender || 'male');
  const [species, setSpecies] = useState(initialCharacter?.species || 'Human');
  const [attributes, setAttributes] = useState(
    initialCharacter?.attributes || generateAttributes(initialCharacter?.species || 'Human'),
  );
  const [skills, setSkills] = useState(initialCharacter?.skills || createStartingSkills(initialCharacter?.species || 'Human'));
  const [backstory, setBackstory] = useState(initialCharacter?.backstory || '');
  const [portraitUrl, setPortraitUrl] = useState(initialCharacter?.portraitUrl || null);
  const [portraitOpen, setPortraitOpen] = useState(false);

  const speciesData = SPECIES[species] || SPECIES.Human;
  const maxWounds = useMemo(() => calculateMaxWounds(attributes?.wytrzymalosc ?? 10), [attributes]);

  const handleSpeciesChange = useCallback((sp) => {
    setSpecies(sp);
    setAttributes(generateAttributes(sp));
    setSkills(createStartingSkills(sp));
  }, []);

  const handleRandomizeName = useCallback(() => {
    setName(pickRandomName(genre, name));
  }, [genre, name]);

  const handleRandomizeSpecies = useCallback(() => {
    const sp = randomizeSpecies();
    setSpecies(sp);
    setAttributes(generateAttributes(sp));
    setSkills(createStartingSkills(sp));
  }, []);

  const handleRandomizeStats = useCallback(() => {
    setAttributes(generateAttributes(species));
  }, [species]);

  const handleRerollStat = useCallback((key) => {
    const specMod = speciesData.attributes?.[key] || 0;
    const base = Math.floor(Math.random() * 15) + 5; // 5-19 range
    setAttributes((prev) => ({ ...prev, [key]: Math.max(1, Math.min(25, base + specMod)) }));
  }, [speciesData]);

  const handleRandomizeSkills = useCallback(() => {
    setSkills(randomizeSkills(null, species));
  }, [species]);

  const handleRandomizeAll = useCallback(() => {
    const char = randomizeFullCharacter(genre, undefined);
    setName(char.name);
    setAge(normalizeCharacterAge(char.age));
    setGender(char.gender);
    setSpecies(char.species);
    setAttributes(char.attributes || char.characteristics);
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
      xp: 0,
      xpSpent: 0,
    });
  }, [name, age, gender, species, attributes, maxWounds, speciesData, skills, backstory, portraitUrl, genre, onConfirm]);

  // Skill points system for creation
  const skillPointsUsed = useMemo(() => {
    return Object.values(skills).reduce((sum, v) => {
      const level = typeof v === 'object' ? v.level : (v || 0);
      return sum + level;
    }, 0);
  }, [skills]);
  const totalSkillPoints = CREATION_LIMITS.startingSkillPoints;
  const remainingSkillPoints = totalSkillPoints - skillPointsUsed;
  const skillPointsPct = Math.min(100, (skillPointsUsed / totalSkillPoints) * 100);

  const handleSkillChange = useCallback((skillName, raw) => {
    const value = Math.max(0, Math.min(CREATION_LIMITS.maxPerSkillAtCreation, parseInt(raw) || 0));
    setSkills((prev) => {
      const old = prev[skillName];
      const oldLevel = typeof old === 'object' ? old.level : (old || 0);
      const delta = value - oldLevel;
      const currentUsed = Object.values(prev).reduce((s, v) => {
        const l = typeof v === 'object' ? v.level : (v || 0);
        return s + l;
      }, 0);
      if (delta > 0 && currentUsed + delta > totalSkillPoints) {
        const clamped = oldLevel + (totalSkillPoints - currentUsed);
        const newLevel = Math.max(0, clamped);
        if (typeof old === 'object') {
          return { ...prev, [skillName]: { ...old, level: newLevel } };
        }
        return { ...prev, [skillName]: newLevel };
      }
      if (typeof old === 'object') {
        return { ...prev, [skillName]: { ...old, level: value } };
      }
      return { ...prev, [skillName]: value };
    });
  }, [totalSkillPoints]);

  // Species starting skills + all skills for display
  const displaySkills = useMemo(() => {
    const specSkills = speciesData.skills || [];
    const owned = Object.keys(skills).filter((k) => {
      const v = skills[k];
      const level = typeof v === 'object' ? v.level : (v || 0);
      return level > 0;
    });
    return [...new Set([...specSkills, ...owned])].sort();
  }, [speciesData, skills]);

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

          {/* Attributes */}
          <section>
            <SectionHeader icon="monitoring" label={t('charCreator.characteristicsLabel')} onRandomize={handleRandomizeStats} />
            <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
              {ATTRIBUTE_KEYS.map((key) => (
                <StatBox
                  key={key}
                  label={t(`rpgAttributes.${key}`, { defaultValue: key })}
                  shortLabel={ATTRIBUTE_SHORT[key]}
                  value={attributes[key]}
                  onReroll={() => handleRerollStat(key)}
                />
              ))}
            </div>
            <div className="flex flex-wrap gap-4 mt-3 text-xs text-on-surface-variant">
              <span>{t('charCreator.derivedWounds')}: <strong className="text-tertiary">{maxWounds}</strong></span>
              <span>{t('charCreator.derivedMovement')}: <strong className="text-tertiary">{speciesData.movement}</strong></span>
              <span>Mana: <strong className="text-tertiary">{speciesData.startingMana || 0}</strong></span>
            </div>
          </section>

          {/* Skills */}
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
            <div className="grid grid-cols-2 gap-x-4 gap-y-1">
              {displaySkills.map((skillName) => {
                const val = skills[skillName];
                const level = typeof val === 'object' ? val.level : (val || 0);
                return (
                  <div key={skillName} className="flex items-center justify-between py-1 border-b border-outline-variant/5">
                    <span className="text-xs text-on-surface truncate pr-2">{translateSkill(skillName, t)}</span>
                    <input
                      type="number"
                      min={0}
                      max={CREATION_LIMITS.maxPerSkillAtCreation}
                      value={level}
                      onChange={(e) => handleSkillChange(skillName, e.target.value)}
                      className="w-12 text-center bg-transparent border border-outline-variant/15 rounded-sm text-xs text-tertiary py-0.5 focus:border-primary/50 focus:ring-0"
                    />
                  </div>
                );
              })}
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
