import { useState, useMemo, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import {
  SPECIES, SPECIES_LIST, CHARACTERISTIC_KEYS, CHARACTERISTIC_SHORT,
  CAREERS, CAREER_CLASSES, getCareerByName,
} from '../../data/wfrp';
import {
  generateCharacteristics, calculateWounds, roll2d10,
  pickRandomName, randomizeSpecies, randomizeCareer,
  randomizeSkills, randomizeTalents, randomizeFullCharacter,
  generateStartingMoney,
} from '../../services/gameState';

function SectionHeader({ icon, label, onRandomize }) {
  return (
    <div className="flex items-center justify-between mb-3">
      <div className="flex items-center gap-2">
        <span className="material-symbols-outlined text-primary text-lg">{icon}</span>
        <h3 className="text-[10px] text-on-surface-variant font-label uppercase tracking-widest">{label}</h3>
      </div>
      {onRandomize && (
        <button
          type="button"
          onClick={onRandomize}
          className="flex items-center gap-1 px-2 py-1 text-[10px] font-label text-tertiary hover:text-primary transition-colors rounded-sm hover:bg-surface-tint/10"
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
      <span className="text-[9px] text-on-surface-variant uppercase tracking-wider">{shortLabel}</span>
      <span className="text-lg font-headline text-tertiary">{value}</span>
      <span className="text-[8px] text-outline truncate max-w-full">{label}</span>
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

  const defaultSpecies = initialCharacter?.species || 'Human';
  const defaultCareerDef = initialCharacter?.career?.name
    ? getCareerByName(initialCharacter.career.name) || CAREERS[0]
    : null;

  const [name, setName] = useState(initialCharacter?.name || '');
  const [gender, setGender] = useState(initialCharacter?.gender || 'male');
  const [species, setSpecies] = useState(defaultSpecies);
  const [careerClassFilter, setCareerClassFilter] = useState(defaultCareerDef?.class || '');
  const [selectedCareer, setSelectedCareer] = useState(defaultCareerDef || null);
  const [characteristics, setCharacteristics] = useState(
    initialCharacter?.characteristics || generateCharacteristics(defaultSpecies),
  );
  const [skills, setSkills] = useState(initialCharacter?.skills || {});
  const [talents, setTalents] = useState(initialCharacter?.talents || []);
  const [backstory, setBackstory] = useState(initialCharacter?.backstory || '');

  const speciesData = SPECIES[species] || SPECIES.Human;
  const maxWounds = useMemo(() => calculateWounds(characteristics), [characteristics]);

  const filteredCareers = useMemo(() => {
    if (!careerClassFilter) return CAREERS;
    return CAREERS.filter((c) => c.class === careerClassFilter);
  }, [careerClassFilter]);

  const tier1 = selectedCareer?.tiers?.[0];

  const handleSpeciesChange = useCallback((sp) => {
    setSpecies(sp);
    setCharacteristics(generateCharacteristics(sp));
  }, []);

  const handleRandomizeName = useCallback(() => {
    setName(pickRandomName(genre, name));
  }, [genre, name]);

  const handleRandomizeSpecies = useCallback(() => {
    const sp = randomizeSpecies();
    setSpecies(sp);
    setCharacteristics(generateCharacteristics(sp));
  }, []);

  const handleRandomizeCareer = useCallback(() => {
    const career = randomizeCareer(careerClassFilter || undefined);
    setSelectedCareer(career);
    setCareerClassFilter(career.class);
    if (career) {
      setSkills(randomizeSkills(career, species));
      setTalents(randomizeTalents(career, species));
    }
  }, [careerClassFilter, species]);

  const handleRandomizeStats = useCallback(() => {
    setCharacteristics(generateCharacteristics(species));
  }, [species]);

  const handleRerollStat = useCallback((key) => {
    const base = speciesData.characteristics[key];
    setCharacteristics((prev) => ({ ...prev, [key]: roll2d10() + base }));
  }, [speciesData]);

  const handleRandomizeSkills = useCallback(() => {
    setSkills(randomizeSkills(selectedCareer, species));
  }, [selectedCareer, species]);

  const handleRandomizeTalents = useCallback(() => {
    setTalents(randomizeTalents(selectedCareer, species));
  }, [selectedCareer, species]);

  const handleRandomizeAll = useCallback(() => {
    const char = randomizeFullCharacter(genre, undefined);
    setName(char.name);
    setGender(char.gender);
    setSpecies(char.species);
    setCharacteristics(char.characteristics);
    const careerDef = CAREERS.find(
      (c) => c.name === char.career.name && c.class === char.career.class,
    );
    setSelectedCareer(careerDef || null);
    setCareerClassFilter(char.career.class);
    setSkills(char.skills);
    setTalents(char.talents);
  }, [genre]);

  const handleConfirm = useCallback(() => {
    const advances = Object.fromEntries(CHARACTERISTIC_KEYS.map((k) => [k, 0]));
    const career = selectedCareer
      ? {
          class: selectedCareer.class,
          name: selectedCareer.name,
          tier: 1,
          tierName: tier1?.name || selectedCareer.name,
          status: tier1?.status || 'Silver 1',
        }
      : { class: 'Warriors', name: 'Soldier', tier: 1, tierName: 'Recruit', status: 'Silver 1' };

    onConfirm({
      name: name.trim() || pickRandomName(genre),
      gender,
      species,
      career,
      characteristics,
      advances,
      wounds: maxWounds,
      maxWounds,
      movement: speciesData.movement,
      fate: speciesData.fate,
      fortune: speciesData.fate,
      resilience: speciesData.resilience,
      resolve: speciesData.resilience,
      skills,
      talents,
      inventory: [],
      money: generateStartingMoney(career.status),
      statuses: [],
      backstory,
      xp: 0,
      xpSpent: 0,
    });
  }, [name, gender, species, selectedCareer, tier1, characteristics, maxWounds, speciesData, skills, talents, backstory, genre, onConfirm]);

  const availableTalents = useMemo(() => {
    const careerTalents = tier1?.talents || [];
    const speciesTalents = speciesData.talents || [];
    return [...new Set([...careerTalents, ...speciesTalents])];
  }, [tier1, speciesData]);

  const availableSkills = useMemo(() => {
    const careerSkills = tier1?.skills || [];
    const speciesSkills = speciesData.skills || [];
    return [...new Set([...careerSkills, ...speciesSkills])];
  }, [tier1, speciesData]);

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

          {/* Name + Gender */}
          <section>
            <SectionHeader icon="badge" label={t('charCreator.nameLabel')} onRandomize={handleRandomizeName} />
            <div className="flex gap-3 items-end">
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={t('charCreator.namePlaceholder')}
                maxLength={40}
                className="flex-1 bg-transparent border-0 border-b border-outline-variant/20 focus:border-primary/50 focus:ring-0 text-on-surface text-sm py-2 px-1 placeholder:text-outline/40 font-body"
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
                  <div className="text-[9px] opacity-70 mt-0.5">{t(`species.${sp.replace(' ', '')}Desc`)}</div>
                </button>
              ))}
            </div>
          </section>

          {/* Career */}
          <section>
            <SectionHeader icon="work" label={t('charCreator.careerLabel')} onRandomize={handleRandomizeCareer} />
            <div className="flex flex-wrap gap-1.5 mb-3">
              {['', ...CAREER_CLASSES].map((cls) => (
                <button
                  key={cls}
                  type="button"
                  onClick={() => setCareerClassFilter(cls)}
                  className={`px-2.5 py-1.5 rounded-sm font-label text-[10px] transition-all border ${
                    careerClassFilter === cls
                      ? 'bg-surface-tint text-on-primary border-primary'
                      : 'bg-surface-container-high/30 text-on-surface-variant border-outline-variant/10 hover:border-primary/20'
                  }`}
                >
                  {cls || t('careerClasses.any')}
                </button>
              ))}
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-1.5 max-h-[200px] overflow-y-auto custom-scrollbar pr-1">
              {filteredCareers.map((career) => {
                const isSelected = selectedCareer?.name === career.name && selectedCareer?.class === career.class;
                return (
                  <button
                    key={`${career.class}-${career.name}`}
                    type="button"
                    onClick={() => {
                      setSelectedCareer(career);
                      setSkills(randomizeSkills(career, species));
                      setTalents(randomizeTalents(career, species));
                    }}
                    className={`text-left px-2.5 py-2 rounded-sm border transition-all ${
                      isSelected
                        ? 'bg-primary/10 border-primary/30 shadow-[0_0_10px_rgba(197,154,255,0.15)]'
                        : 'bg-surface-container-high/30 border-outline-variant/10 hover:border-primary/20 hover:bg-surface-container-high/50'
                    }`}
                  >
                    <div className={`text-xs font-bold truncate ${isSelected ? 'text-primary' : 'text-on-surface'}`}>
                      {career.name}
                    </div>
                    <div className="text-[9px] text-on-surface-variant">{career.class}</div>
                  </button>
                );
              })}
            </div>
            {selectedCareer && tier1 && (
              <div className="mt-3 p-3 bg-surface-container-high/20 border border-outline-variant/10 rounded-sm">
                <div className="text-[10px] text-on-surface-variant mb-1">
                  <span className="text-tertiary font-bold">{tier1.name}</span>
                  <span className="mx-1.5 opacity-50">&middot;</span>
                  <span>{tier1.status}</span>
                </div>
              </div>
            )}
          </section>

          {/* Characteristics */}
          <section>
            <SectionHeader icon="monitoring" label={t('charCreator.characteristicsLabel')} onRandomize={handleRandomizeStats} />
            <div className="grid grid-cols-5 gap-2">
              {CHARACTERISTIC_KEYS.map((key) => (
                <StatBox
                  key={key}
                  label={t(`stats.${key}Long`)}
                  shortLabel={CHARACTERISTIC_SHORT[key]}
                  value={characteristics[key]}
                  onReroll={() => handleRerollStat(key)}
                />
              ))}
            </div>
            <div className="flex flex-wrap gap-4 mt-3 text-[10px] text-on-surface-variant">
              <span>{t('charCreator.derivedWounds')}: <strong className="text-tertiary">{maxWounds}</strong></span>
              <span>{t('charCreator.derivedMovement')}: <strong className="text-tertiary">{speciesData.movement}</strong></span>
              <span>{t('charCreator.derivedFate')}: <strong className="text-tertiary">{speciesData.fate}</strong></span>
              <span>{t('charCreator.derivedResilience')}: <strong className="text-tertiary">{speciesData.resilience}</strong></span>
            </div>
          </section>

          {/* Skills */}
          <section>
            <SectionHeader icon="construction" label={t('charCreator.skillsLabel')} onRandomize={handleRandomizeSkills} />
            {availableSkills.length === 0 ? (
              <p className="text-xs text-on-surface-variant">{t('charCreator.selectCareerFirst')}</p>
            ) : (
              <div className="grid grid-cols-2 gap-x-4 gap-y-1">
                {availableSkills.map((skill) => (
                  <div key={skill} className="flex items-center justify-between py-1 border-b border-outline-variant/5">
                    <span className="text-xs text-on-surface truncate pr-2">{skill}</span>
                    <input
                      type="number"
                      min={0}
                      max={20}
                      value={skills[skill] || 0}
                      onChange={(e) => setSkills((prev) => ({ ...prev, [skill]: Math.max(0, Math.min(20, parseInt(e.target.value) || 0)) }))}
                      className="w-12 text-center bg-transparent border border-outline-variant/15 rounded-sm text-xs text-tertiary py-0.5 focus:border-primary/50 focus:ring-0"
                    />
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* Talents */}
          <section>
            <SectionHeader icon="auto_awesome" label={t('charCreator.talentsLabel')} onRandomize={handleRandomizeTalents} />
            {availableTalents.length === 0 ? (
              <p className="text-xs text-on-surface-variant">{t('charCreator.selectCareerFirst')}</p>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {availableTalents.map((talent) => {
                  const isSelected = talents.includes(talent);
                  return (
                    <button
                      key={talent}
                      type="button"
                      onClick={() => {
                        setTalents((prev) =>
                          isSelected ? prev.filter((t) => t !== talent) : [...prev, talent],
                        );
                      }}
                      className={`px-2.5 py-1.5 rounded-sm text-[10px] font-label border transition-all ${
                        isSelected
                          ? 'bg-primary/15 border-primary/30 text-primary'
                          : 'bg-surface-container-high/30 border-outline-variant/10 text-on-surface-variant hover:border-primary/20'
                      }`}
                    >
                      {talent}
                    </button>
                  );
                })}
              </div>
            )}
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
