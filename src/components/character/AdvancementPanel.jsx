import { useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useGameCharacter, useGameDispatch, useGameAutoSave } from '../../stores/gameSelectors';
import { useModalA11y } from '../../hooks/useModalA11y';
import {
  ATTRIBUTE_KEYS, SKILL_CAPS, ATTRIBUTE_SCALE,
  getSkillAttribute,
  xpForSkillLevel, cumulativeCharXpThreshold, CREATION_LIMITS,
} from '../../data/rpgSystem';
import { SPELL_TREES } from '../../data/rpgMagic';
import { getSpellProgressionStatus } from '../../services/magicEngine';
import { translateSkill, translateAttribute } from '../../utils/rpgTranslate';

const TABS = ['attributes', 'skills', 'spellTrees'];

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

function AttributesTab({ character, dispatch }) {
  const { t } = useTranslation();
  const attrPoints = character.attributePoints || 0;

  return (
    <div>
      {attrPoints > 0 && (
        <div className="mb-4 px-3 py-2 bg-primary/10 border border-primary/20 rounded-sm text-center">
          <span className="text-xs text-primary font-bold">
            {t('advancement.attributePointsAvailable', { count: attrPoints, defaultValue: `${attrPoints} punktów atrybutów do wydania!` })}
          </span>
        </div>
      )}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {ATTRIBUTE_KEYS.map((key) => {
          const value = character.attributes?.[key] || 0;
          const short = t(`rpgAttributeShort.${key}`);
          const cost = key === 'szczescie' ? CREATION_LIMITS.szczesciePointCost : 1;
          const canSpend = attrPoints >= cost && value < ATTRIBUTE_SCALE.max;

          return (
            <div
              key={key}
              className={`p-3 rounded-sm border text-center transition-all ${
                canSpend ? 'bg-primary/10 border-primary/20' : 'bg-surface-container-high/40 border-outline-variant/10'
              }`}
            >
              <span className="text-[9px] font-label uppercase tracking-widest text-on-surface-variant">
                {short}
              </span>
              <p className="text-tertiary font-headline text-2xl">{value}</p>
              <span className="text-[10px] text-outline">{translateAttribute(key, t)}</span>
              {canSpend && (
                <button
                  onClick={() => dispatch({ type: 'SPEND_ATTRIBUTE_POINT', payload: { attribute: key } })}
                  className="mt-1 px-3 py-0.5 text-[10px] font-bold rounded-sm bg-primary/20 text-primary hover:bg-primary/30 active:scale-95 transition-all"
                >
                  +1 {cost > 1 ? `(${cost} pkt)` : ''}
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function SkillsTab({ character }) {
  const { t } = useTranslation();
  const skills = character.skills || {};

  const sortedSkills = useMemo(() => {
    return Object.entries(skills)
      .map(([name, data]) => {
        const d = typeof data === 'object' ? data : { level: data || 0, xp: 0, cap: SKILL_CAPS.basic };
        return { name, ...d, xp: d.xp ?? d.progress ?? 0, attribute: getSkillAttribute(name) };
      })
      .sort((a, b) => {
        if (b.level !== a.level) return b.level - a.level;
        return a.name.localeCompare(b.name);
      });
  }, [skills]);

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between px-3 py-1 text-[9px] font-label uppercase tracking-widest text-on-surface-variant border-b border-outline-variant/10">
        <span>{t('advancement.skill', 'Umiejetnosc')}</span>
        <div className="flex gap-6">
          <span className="w-10 text-center">{t('advancement.level', 'Poz.')}</span>
          <span className="w-16 text-center">{t('advancement.progress', 'Progres')}</span>
          <span className="w-10 text-center">{t('advancement.cap', 'Cap')}</span>
        </div>
      </div>
      {sortedSkills.map(({ name, level, xp, cap, attribute }) => {
        const needed = xpForSkillLevel(level + 1);
        const xpPct = needed > 0 && level < cap ? Math.min(100, (xp / needed) * 100) : (level >= cap ? 100 : 0);
        const atCap = level >= cap;

        return (
          <div
            key={name}
            className={`flex items-center justify-between px-3 py-1.5 rounded-sm text-sm ${
              level > 0 ? 'bg-primary/5' : ''
            }`}
          >
            <div className="flex items-center gap-2 min-w-0">
              {level > 0 && <span className="w-1.5 h-1.5 bg-primary rounded-full shrink-0" />}
              <span className="text-on-surface-variant truncate">{translateSkill(name, t)}</span>
              <span className="text-[9px] text-outline uppercase">({t(`rpgAttributeShort.${attribute}`)})</span>
            </div>
            <div className="flex items-center gap-6 shrink-0">
              <span className="text-tertiary font-headline text-sm w-10 text-center">{level}</span>
              <div className="w-20 flex flex-col items-center gap-0.5">
                <div className="w-full h-1.5 bg-surface-container-high/60 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all ${atCap ? 'bg-tertiary' : 'bg-primary'}`}
                    style={{ width: `${xpPct}%` }}
                  />
                </div>
                {!atCap && needed > 0 && (
                  <span className="text-[8px] text-outline tabular-nums">{xp}/{needed}</span>
                )}
              </div>
              <span className="text-[10px] text-outline w-10 text-center">{cap}</span>
            </div>
          </div>
        );
      })}
      <p className="text-[10px] text-on-surface-variant/60 mt-3 px-3">
        {t('advancement.trainingHint', 'Podniesienie cap ponad 10 wymaga nauki od NPC-trenera napotkanego w świecie.')}
      </p>
    </div>
  );
}

function SpellTreesTab({ character }) {
  const { t } = useTranslation();
  const [expandedTree, setExpandedTree] = useState(null);
  const progression = useMemo(() => getSpellProgressionStatus(character), [character]);
  const known = new Set(character.spells?.known || []);
  const usageCounts = character.spells?.usageCounts || {};
  const mana = character.mana || { current: 0, max: 0 };

  const knownTreeIds = useMemo(() => {
    const ids = new Set();
    for (const spellName of known) {
      for (const [treeId, tree] of Object.entries(SPELL_TREES)) {
        if (tree.spells.some((s) => s.name === spellName)) ids.add(treeId);
      }
    }
    return ids;
  }, [known]);

  return (
    <div className="space-y-4">
      {/* Mana bar */}
      <div className="flex items-center gap-3 px-3 py-2 bg-tertiary-container/10 border border-tertiary/20 rounded-sm">
        <span className="material-symbols-outlined text-tertiary text-lg">water_drop</span>
        <span className="text-xs font-label uppercase tracking-widest text-on-surface-variant">Mana</span>
        <div className="flex-1 h-2 bg-surface-container-high/60 rounded-full overflow-hidden">
          <div
            className="h-full bg-tertiary rounded-full transition-all"
            style={{ width: `${mana.max > 0 ? (mana.current / mana.max) * 100 : 0}%` }}
          />
        </div>
        <span className="text-sm font-headline text-tertiary tabular-nums">{mana.current}/{mana.max}</span>
      </div>

      {/* Scrolls */}
      {character.spells?.scrolls?.length > 0 && (
        <div className="px-3 py-2 bg-surface-container-high/30 border border-outline-variant/10 rounded-sm">
          <span className="text-[9px] font-label uppercase tracking-widest text-on-surface-variant block mb-1">
            {t('magic.scrolls', 'Scrolle')}
          </span>
          <div className="flex flex-wrap gap-1">
            {character.spells.scrolls.map((s, i) => (
              <span key={i} className="px-2 py-0.5 text-[10px] bg-primary/10 text-primary border border-primary/20 rounded-sm">
                {s}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Spell trees */}
      {Object.entries(SPELL_TREES).map(([treeId, tree]) => {
        const hasKnown = knownTreeIds.has(treeId);
        const isExpanded = expandedTree === treeId;

        return (
          <div
            key={treeId}
            className={`rounded-sm border overflow-hidden transition-all ${
              hasKnown ? 'border-primary/20 bg-primary/5' : 'border-outline-variant/10 bg-surface-container-high/30'
            }`}
          >
            <button
              type="button"
              onClick={() => setExpandedTree(isExpanded ? null : treeId)}
              className="w-full flex items-center justify-between gap-2 px-3 py-2 hover:bg-surface-container-high/40 transition-colors"
            >
              <div className="flex items-center gap-2 min-w-0">
                <span className="material-symbols-outlined text-sm text-primary">{tree.icon}</span>
                <span className={`text-xs font-bold uppercase tracking-wide ${hasKnown ? 'text-primary' : 'text-on-surface-variant'}`}>
                  {tree.name}
                </span>
                {hasKnown && (
                  <span className="text-[8px] text-green-400 uppercase font-bold">
                    {tree.spells.filter((s) => known.has(s.name)).length}/{tree.spells.length}
                  </span>
                )}
              </div>
              <span className={`material-symbols-outlined text-xs text-on-surface-variant transition-transform ${isExpanded ? 'rotate-180' : ''}`}>
                expand_more
              </span>
            </button>

            {isExpanded && (
              <div className="px-3 pb-3 space-y-1.5 border-t border-outline-variant/10">
                <p className="text-[9px] text-on-surface-variant/70 italic mt-2">{tree.description}</p>
                {tree.spells.map((spell) => {
                  const isKnown = known.has(spell.name);
                  const uses = usageCounts[spell.name] || 0;
                  const prog = progression.find((p) => p.spellName === spell.name);
                  const isUnlocked = prog?.unlocked || isKnown || !spell.unlockCondition;

                  return (
                    <div
                      key={spell.name}
                      className={`flex items-start gap-2 px-2 py-1.5 rounded-sm border text-[10px] ${
                        isKnown
                          ? 'bg-primary/10 border-primary/20'
                          : isUnlocked
                            ? 'bg-tertiary/5 border-tertiary/15'
                            : 'bg-surface-container-high/20 border-outline-variant/5 opacity-60'
                      }`}
                    >
                      <span className={`material-symbols-outlined text-sm mt-0.5 shrink-0 ${
                        isKnown ? 'text-green-400' : isUnlocked ? 'text-tertiary' : 'text-outline/40'
                      }`}>
                        {isKnown ? 'check_circle' : isUnlocked ? 'lock_open' : 'lock'}
                      </span>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2">
                          <span className={`font-bold ${isKnown ? 'text-primary' : 'text-on-surface'}`}>
                            {spell.name}
                          </span>
                          <span className="text-on-surface-variant tabular-nums shrink-0">
                            {spell.manaCost} many · lv.{spell.level}
                          </span>
                        </div>
                        <p className="text-on-surface-variant/80 leading-tight">{spell.description}</p>
                        {isKnown && (
                          <span className="text-[9px] text-green-400">
                            {t('magic.uses', { count: uses, defaultValue: `${uses} uzyc` })}
                          </span>
                        )}
                        {!isKnown && prog && !prog.unlocked && (
                          <div className="flex items-center gap-2 mt-1">
                            <div className="flex-1 h-1 bg-surface-container-high/60 rounded-full overflow-hidden">
                              <div
                                className="h-full bg-tertiary/60 rounded-full transition-all"
                                style={{ width: `${prog.progress * 100}%` }}
                              />
                            </div>
                            <span className="text-[9px] text-on-surface-variant/60 tabular-nums">
                              {prog.currentUses}/{prog.requiredUses}
                            </span>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

export default function AdvancementPanel({ onClose }) {
  const { t } = useTranslation();
  const character = useGameCharacter();
  const dispatch = useGameDispatch();
  const autoSave = useGameAutoSave();
  const [activeTab, setActiveTab] = useState('attributes');
  const modalRef = useModalA11y(onClose);

  if (!character) return null;

  const charLevel = character.characterLevel || 1;
  const charXp = character.characterXp || 0;
  const prevCharXpThreshold = cumulativeCharXpThreshold(charLevel);
  const nextCharXpThreshold = cumulativeCharXpThreshold(charLevel + 1);
  const charXpPct = nextCharXpThreshold > prevCharXpThreshold
    ? Math.min(100, ((charXp - prevCharXpThreshold) / (nextCharXpThreshold - prevCharXpThreshold)) * 100)
    : 0;

  const tabLabels = {
    attributes: t('advancement.characteristics', 'Atrybuty'),
    skills: t('advancement.skills', 'Umiejetnosci'),
    spellTrees: t('advancement.spellTrees', 'Drzewka zakleć'),
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm animate-fade-in" role="dialog" aria-modal="true" aria-label={t('advancement.title')} onClick={(e) => e.stopPropagation()}>
      <div ref={modalRef} className="bg-surface-container-low border border-outline-variant/15 rounded-sm w-full max-w-3xl max-h-[85vh] flex flex-col shadow-2xl mx-4">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-outline-variant/10">
          <div>
            <div className="flex items-center gap-3">
              <h2 className="font-headline text-xl text-tertiary">{t('advancement.title')}</h2>
              <span className="px-2 py-0.5 text-xs font-bold rounded-sm bg-tertiary/20 text-tertiary">
                {t('advancement.characterLevel', { level: charLevel, defaultValue: `Poziom ${charLevel}` })}
              </span>
              {(character.attributePoints || 0) > 0 && (
                <span className="px-2 py-0.5 text-xs font-bold rounded-sm bg-primary/20 text-primary animate-pulse">
                  +{character.attributePoints} {t('advancement.attrPoints', 'pkt atr.')}
                </span>
              )}
            </div>
            <div className="flex items-center gap-2 mt-1">
              <span className="text-[10px] text-on-surface-variant">{t('advancement.nextLevel', 'Nast. poziom')}:</span>
              <div className="w-32 h-1.5 bg-surface-container-high/60 rounded-full overflow-hidden">
                <div className="h-full bg-tertiary rounded-full transition-all" style={{ width: `${charXpPct}%` }} />
              </div>
              <span className="text-[10px] text-outline tabular-nums">{charXp}/{nextCharXpThreshold}</span>
            </div>
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
          {activeTab === 'attributes' && (
            <AttributesTab character={character} dispatch={(action) => { dispatch(action); autoSave(); }} />
          )}
          {activeTab === 'skills' && (
            <SkillsTab character={character} />
          )}
          {activeTab === 'spellTrees' && (
            <SpellTreesTab character={character} />
          )}
        </div>
      </div>
    </div>
  );
}
