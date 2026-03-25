import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useGame } from '../../contexts/GameContext';
import { useModalA11y } from '../../hooks/useModalA11y';
import {
  CHARACTERISTIC_KEYS,
  SKILLS,
  TALENTS,
  CAREERS,
  CAREER_CLASSES,
  getAdvancementCost,
  ADVANCEMENT_COSTS,
  getCareerTierSkills,
  getCareerTierTalents,
  getCurrentTierOnlySkills,
  getCurrentTierOnlyTalents,
  isCharacteristicInCareer,
  isSkillInCareer,
  isTalentInCareer,
  getCareerByName,
  canAdvanceTier,
  getSkillCharacteristic,
} from '../../data/wfrp';
import { getBonus } from '../../services/gameState';
import { translateSkill, translateTalent, translateCareer, translateTierName, translateStatus } from '../../utils/wfrpTranslate';

const TABS = ['characteristics', 'skills', 'talents', 'career'];

function TabButton({ active, label, onClick }) {
  return (
    <button
      onClick={onClick}
      className={`px-4 py-2 text-xs font-label uppercase tracking-widest transition-all border-b-2 ${
        active
          ? 'text-primary border-primary'
          : 'text-on-surface-variant border-transparent hover:text-tertiary hover:border-primary/20'
      }`}
    >
      {label}
    </button>
  );
}

function BuyButton({ cost, available, onClick, disabled }) {
  const canAfford = cost <= available && !disabled;
  return (
    <button
      onClick={onClick}
      disabled={!canAfford}
      className={`px-2 py-0.5 text-[10px] font-bold rounded-sm transition-all ${
        canAfford
          ? 'bg-primary/20 text-primary hover:bg-primary/30 active:scale-95'
          : 'bg-surface-container-highest/30 text-outline/40 cursor-not-allowed'
      }`}
    >
      +1 ({cost})
    </button>
  );
}

function CharacteristicsTab({ character, availableXp, dispatch }) {
  const { t } = useTranslation();
  const careerName = character.career?.name;
  const careerTier = character.career?.tier || 1;

  return (
    <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
      {CHARACTERISTIC_KEYS.map((key) => {
        const value = character.characteristics?.[key] || 0;
        const adv = character.advances?.[key] || 0;
        const bonus = getBonus(value);
        const inCareer = isCharacteristicInCareer(key, careerName, careerTier);
        const cost = getAdvancementCost(adv, inCareer);

        return (
          <div
            key={key}
            className={`p-3 rounded-sm border text-center transition-all ${
              inCareer
                ? 'bg-primary/5 border-primary/20'
                : 'bg-surface-container-high/40 border-outline-variant/10'
            }`}
          >
            <span className="text-[9px] font-label uppercase tracking-widest text-on-surface-variant">
              {t(`stats.${key}`)}
            </span>
            <p className="text-tertiary font-headline text-2xl">{value}</p>
            <div className="flex items-center justify-center gap-2 text-[10px] mt-1">
              <span className="text-primary-dim">B:{bonus}</span>
              {adv > 0 && <span className="text-green-400">+{adv}</span>}
            </div>
            {inCareer && (
              <span className="text-[8px] text-primary/60 uppercase">{t('advancement.inCareer')}</span>
            )}
            <div className="mt-2">
              <BuyButton
                cost={cost}
                available={availableXp}
                onClick={() => dispatch({ type: 'SPEND_XP_CHARACTERISTIC', payload: { key } })}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}

function SkillsTab({ character, availableXp, dispatch }) {
  const { t } = useTranslation();
  const careerName = character.career?.name;
  const careerTier = character.career?.tier || 1;
  const careerSkills = getCareerTierSkills(careerName, careerTier);

  const ownedSkills = Object.keys(character.skills || {});
  const allRelevant = [...new Set([...careerSkills, ...ownedSkills])].sort((a, b) => {
    const aIn = careerSkills.includes(a);
    const bIn = careerSkills.includes(b);
    if (aIn && !bIn) return -1;
    if (!aIn && bIn) return 1;
    return a.localeCompare(b);
  });

  return (
    <div className="space-y-1">
      {allRelevant.map((skillName) => {
        const adv = character.skills?.[skillName] || 0;
        const charKey = getSkillCharacteristic(skillName);
        const charValue = character.characteristics?.[charKey] || 0;
        const total = charValue + adv;
        const inCareer = isSkillInCareer(skillName, careerName, careerTier);
        const cost = getAdvancementCost(adv, inCareer);

        return (
          <div
            key={skillName}
            className={`flex items-center justify-between px-3 py-1.5 rounded-sm text-sm ${
              inCareer ? 'bg-primary/5' : ''
            }`}
          >
            <div className="flex items-center gap-2 min-w-0">
              {inCareer && <span className="w-1.5 h-1.5 bg-primary rounded-full shrink-0" />}
              <span className="text-on-surface-variant truncate">{translateSkill(skillName, t)}</span>
              <span className="text-[9px] text-outline uppercase">({t(`stats.${charKey}`)})</span>
            </div>
            <div className="flex items-center gap-3 shrink-0">
              <span className="text-tertiary font-headline text-sm w-8 text-right">{total}</span>
              {adv > 0 && (
                <span className="text-green-400 text-[10px] font-bold w-6 text-right">+{adv}</span>
              )}
              <BuyButton
                cost={cost}
                available={availableXp}
                onClick={() => dispatch({ type: 'SPEND_XP_SKILL', payload: { skill: skillName } })}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}

function TalentsTab({ character, availableXp, dispatch }) {
  const { t } = useTranslation();
  const careerName = character.career?.name;
  const careerTier = character.career?.tier || 1;
  const careerTalents = getCareerTierTalents(careerName, careerTier);
  const owned = new Set(character.talents || []);

  const sorted = [...careerTalents, ...TALENTS.filter((t) => !careerTalents.includes(t))];
  const unique = [...new Set(sorted)];

  return (
    <div className="space-y-1 max-h-[400px] overflow-y-auto custom-scrollbar">
      {unique.map((talent) => {
        const isOwned = owned.has(talent);
        const inCareer = isTalentInCareer(talent, careerName, careerTier);
        const cost = inCareer ? ADVANCEMENT_COSTS.talentInCareer : ADVANCEMENT_COSTS.talentOutOfCareer;

        return (
          <div
            key={talent}
            className={`flex items-center justify-between px-3 py-1.5 rounded-sm text-sm ${
              inCareer ? 'bg-primary/5' : ''
            }`}
          >
            <div className="flex items-center gap-2 min-w-0">
              {inCareer && <span className="w-1.5 h-1.5 bg-primary rounded-full shrink-0" />}
              <span className={`truncate ${isOwned ? 'text-tertiary' : 'text-on-surface-variant'}`}>
                {translateTalent(talent, t)}
              </span>
              {isOwned && (
                <span className="text-[8px] text-green-400 uppercase font-bold">{t('advancement.owned')}</span>
              )}
            </div>
            <div className="shrink-0">
              {isOwned ? (
                <span className="material-symbols-outlined text-green-400 text-sm">check_circle</span>
              ) : (
                <BuyButton
                  cost={cost}
                  available={availableXp}
                  onClick={() => dispatch({ type: 'SPEND_XP_TALENT', payload: { talent } })}
                />
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function TierRequirements({ character }) {
  const { t } = useTranslation();
  const careerName = character.career?.name;
  const careerTier = character.career?.tier || 1;

  const tierSkills = getCurrentTierOnlySkills(careerName, careerTier);
  const tierTalents = getCurrentTierOnlyTalents(careerName, careerTier);
  const ownedTalents = new Set(character.talents || []);

  const skillEntries = tierSkills.map((sk) => ({
    name: sk,
    advances: character.skills?.[sk] || 0,
    qualified: (character.skills?.[sk] || 0) >= 5,
  }));
  const qualifiedCount = skillEntries.filter((e) => e.qualified).length;
  const requiredSkills = Math.min(tierSkills.length, 8);
  const skillsMet = qualifiedCount >= requiredSkills;

  const talentEntries = tierTalents.map((tal) => ({
    name: tal,
    owned: ownedTalents.has(tal),
  }));
  const talentMet = talentEntries.some((e) => e.owned);

  return (
    <div className="bg-surface-container-high/40 p-4 rounded-sm border border-outline-variant/10 space-y-4">
      <span className="text-[9px] text-on-surface-variant uppercase tracking-widest">
        {t('advancement.tierRequirements')}
      </span>

      <div>
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs text-on-surface-variant">{t('advancement.skillsRequired')}</span>
          <span className={`text-xs font-bold ${skillsMet ? 'text-green-400' : 'text-outline'}`}>
            {qualifiedCount} / {requiredSkills}
          </span>
        </div>
        <div className="grid grid-cols-2 gap-x-4 gap-y-0.5">
          {skillEntries.map((entry) => (
            <div key={entry.name} className="flex items-center justify-between text-[11px] py-0.5">
              <div className="flex items-center gap-1.5 min-w-0">
                <span className={`material-symbols-outlined text-[12px] ${entry.qualified ? 'text-green-400' : 'text-outline/30'}`}>
                  {entry.qualified ? 'check_circle' : 'radio_button_unchecked'}
                </span>
                <span className={`truncate ${entry.qualified ? 'text-tertiary' : 'text-on-surface-variant/60'}`}>
                  {translateSkill(entry.name, t)}
                </span>
              </div>
              <span className={`shrink-0 font-bold ml-2 ${entry.qualified ? 'text-green-400' : 'text-outline/50'}`}>
                +{entry.advances}
              </span>
            </div>
          ))}
        </div>
      </div>

      <div>
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs text-on-surface-variant">{t('advancement.talentRequired')}</span>
          <span className={`text-xs font-bold ${talentMet ? 'text-green-400' : 'text-outline'}`}>
            {talentMet ? t('advancement.met') : t('advancement.notMet')}
          </span>
        </div>
        <div className="grid grid-cols-2 gap-x-4 gap-y-0.5">
          {talentEntries.map((entry) => (
            <div key={entry.name} className="flex items-center gap-1.5 text-[11px] py-0.5">
              <span className={`material-symbols-outlined text-[12px] ${entry.owned ? 'text-green-400' : 'text-outline/30'}`}>
                {entry.owned ? 'check_circle' : 'radio_button_unchecked'}
              </span>
              <span className={`truncate ${entry.owned ? 'text-tertiary' : 'text-on-surface-variant/60'}`}>
                {translateTalent(entry.name, t)}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function CareerTab({ character, availableXp, dispatch }) {
  const { t } = useTranslation();
  const [selectedClass, setSelectedClass] = useState(character.career?.class || 'Warriors');
  const currentCareer = character.career;
  const canTierUp = canAdvanceTier(character);

  const careers = CAREERS.filter((c) => c.class === selectedClass);

  return (
    <div className="space-y-6">
      {/* Current career and tier advance */}
      <div className="bg-surface-container-high/40 p-4 rounded-sm border border-outline-variant/10">
        <div className="flex items-center justify-between mb-2">
          <div>
            <span className="text-[9px] text-on-surface-variant uppercase tracking-widest">{t('advancement.current')}</span>
            <p className="text-tertiary font-headline text-lg">
              {translateCareer(currentCareer?.name, t)} — {translateTierName(currentCareer?.tierName, t)}
            </p>
            <p className="text-on-surface-variant text-xs">
              {t(`careerClasses.${currentCareer?.class}`, { defaultValue: currentCareer?.class })} · {t('common.tier')} {currentCareer?.tier} · {translateStatus(currentCareer?.status, t)}
            </p>
          </div>
          {currentCareer?.tier < 4 && (
            <button
              onClick={() => dispatch({ type: 'ADVANCE_CAREER_TIER' })}
              disabled={!canTierUp}
              className={`px-3 py-2 text-xs font-bold rounded-sm transition-all ${
                canTierUp
                  ? 'bg-primary/20 text-primary hover:bg-primary/30'
                  : 'bg-surface-container-highest/30 text-outline/40 cursor-not-allowed'
              }`}
            >
              {canTierUp ? t('advancement.tierAdvance') : t('advancement.requirementsNotMet')}
            </button>
          )}
        </div>
      </div>

      {currentCareer?.tier < 4 && <TierRequirements character={character} />}

      {/* Career class selector */}
      <div>
        <span className="text-[9px] text-on-surface-variant uppercase tracking-widest block mb-2">
          {t('advancement.changeCareer')}
        </span>
        <div className="flex flex-wrap gap-2 mb-4">
          {CAREER_CLASSES.map((cls) => (
            <button
              key={cls}
              onClick={() => setSelectedClass(cls)}
              className={`px-3 py-1.5 text-[10px] font-bold uppercase rounded-sm border transition-all ${
                selectedClass === cls
                  ? 'bg-primary/20 text-primary border-primary/30'
                  : 'bg-surface-container-high/40 text-on-surface-variant border-outline-variant/10 hover:border-primary/20'
              }`}
            >
              {t(`careerClasses.${cls}`, { defaultValue: cls })}
            </button>
          ))}
        </div>

        <div className="grid grid-cols-2 gap-2 max-h-[300px] overflow-y-auto custom-scrollbar">
          {careers.map((career) => {
            const isCurrent = career.name === currentCareer?.name;
            const sameClass = career.class === currentCareer?.class;
            const cost = sameClass
              ? ADVANCEMENT_COSTS.careerChangeSameClass
              : ADVANCEMENT_COSTS.careerChangeDifferentClass;
            const canAfford = cost <= availableXp;

            return (
              <div
                key={career.name}
                className={`p-3 rounded-sm border text-sm ${
                  isCurrent
                    ? 'bg-primary/10 border-primary/30'
                    : 'bg-surface-container-high/40 border-outline-variant/10'
                }`}
              >
                <p className={`font-headline ${isCurrent ? 'text-primary' : 'text-on-surface-variant'}`}>
                  {translateCareer(career.name, t)}
                </p>
                <p className="text-[9px] text-outline mt-0.5">
                  {translateTierName(career.tiers[0].name, t)} → {translateTierName(career.tiers[3].name, t)}
                </p>
                {!isCurrent && (
                  <button
                    onClick={() => dispatch({ type: 'CHANGE_CAREER', payload: { careerName: career.name } })}
                    disabled={!canAfford}
                    className={`mt-2 w-full px-2 py-1 text-[10px] font-bold rounded-sm transition-all ${
                      canAfford
                        ? 'bg-primary/20 text-primary hover:bg-primary/30'
                        : 'bg-surface-container-highest/30 text-outline/40 cursor-not-allowed'
                    }`}
                  >
                    {cost} {t('common.xp')} ({sameClass ? t('advancement.sameClass') : t('advancement.differentClass')})
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export default function AdvancementPanel({ onClose }) {
  const { t } = useTranslation();
  const { state, dispatch } = useGame();
  const [activeTab, setActiveTab] = useState('characteristics');
  const modalRef = useModalA11y(onClose);
  const character = state.character;

  if (!character) return null;

  const availableXp = (character.xp || 0) - (character.xpSpent || 0);

  const tabLabels = {
    characteristics: t('advancement.characteristics'),
    skills: t('advancement.skills'),
    talents: t('advancement.talents'),
    career: t('advancement.career'),
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm animate-fade-in" role="dialog" aria-modal="true" aria-label={t('advancement.title')} onClick={(e) => e.stopPropagation()}>
      <div ref={modalRef} className="bg-surface-container-low border border-outline-variant/15 rounded-sm w-full max-w-3xl max-h-[85vh] flex flex-col shadow-2xl mx-4">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-outline-variant/10">
          <div>
            <h2 className="font-headline text-xl text-tertiary">{t('advancement.title')}</h2>
            <p className="text-sm text-on-surface-variant mt-0.5">
              {t('advancement.availableXp')}:{' '}
              <span className={`font-bold ${availableXp > 0 ? 'text-primary' : 'text-outline'}`}>
                {availableXp} {t('common.xp')}
              </span>
              <span className="text-outline ml-2">
                ({character.xpSpent || 0} / {character.xp || 0})
              </span>
            </p>
          </div>
          <button
            onClick={onClose}
            aria-label={t('common.close')}
            className="material-symbols-outlined text-on-surface-variant hover:text-tertiary transition-colors"
          >
            close
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-outline-variant/10 px-4">
          {TABS.map((tab) => (
            <TabButton
              key={tab}
              active={activeTab === tab}
              label={tabLabels[tab]}
              onClick={() => setActiveTab(tab)}
            />
          ))}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 custom-scrollbar">
          {activeTab === 'characteristics' && (
            <CharacteristicsTab character={character} availableXp={availableXp} dispatch={dispatch} />
          )}
          {activeTab === 'skills' && (
            <SkillsTab character={character} availableXp={availableXp} dispatch={dispatch} />
          )}
          {activeTab === 'talents' && (
            <TalentsTab character={character} availableXp={availableXp} dispatch={dispatch} />
          )}
          {activeTab === 'career' && (
            <CareerTab character={character} availableXp={availableXp} dispatch={dispatch} />
          )}
        </div>
      </div>
    </div>
  );
}
