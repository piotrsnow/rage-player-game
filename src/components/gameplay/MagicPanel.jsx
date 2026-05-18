import { useState, useMemo, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import {
  castSpell,
  canCastAnySpell,
  learnFromScroll,
  useScrollOneShot,
  getSpellProgressionStatus,
  resolveKnownSpellDisplay,
} from '../../services/magicEngine';
import { SPELL_TREES, formatSpellDamageLabel, computeSpellDamage, computeSpellHeal } from '../../data/rpgMagic';
import { DAMAGE_TYPES } from '../../../shared/domain/damageTypes.js';
import { useSpellCombatStats } from '../../hooks/useSpellCombatStats';

function SectionToggle({ label, icon, open, onToggle, badge, children, desc }) {
  return (
    <div className="rounded-sm border border-outline-variant/10 bg-surface-container/40 overflow-hidden">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="w-full flex items-center justify-between gap-2 p-2 text-left hover:bg-surface-container-high/30 transition-colors"
      >
        <div className="flex items-center gap-1 min-w-0">
          <span className="material-symbols-outlined text-xs text-primary shrink-0">{icon}</span>
          <span className="text-[9px] font-label uppercase tracking-widest text-primary truncate">{label}</span>
          {badge}
        </div>
        <span className={`material-symbols-outlined text-xs text-on-surface-variant transition-transform ${open ? 'rotate-180' : ''}`}>
          expand_more
        </span>
      </button>
      {open && (
        <div className="px-2 pb-2 space-y-2">
          {desc && <p className="text-[8px] text-on-surface-variant/70 leading-tight italic">{desc}</p>}
          {children}
        </div>
      )}
    </div>
  );
}

function CustomSpellButton({ name, character, isSelected, onSelect, mana, usageCounts, t }) {
  const meta = resolveKnownSpellDisplay(name, character);
  const hasEnoughMana = mana.current >= meta.manaCost;
  const uses = usageCounts?.[name] || 0;
  const {
    combatStats, explanation, loading, reloading, reload,
  } = useSpellCombatStats(name, { ...meta, combatStats: meta.combatStats ?? character?.customSpells?.find((s) => s?.name === name)?.combatStats });

  const cs = combatStats;
  const modes = cs?.attackModes;
  const primaryMode = modes?.ranged || modes?.melee || modes?.aoe;
  const supportMode = cs?.supportModes?.melee || cs?.supportModes?.ranged || cs?.supportModes?.aoe;
  const dmgType = primaryMode?.damageComponents?.[0]?.type
    || supportMode?.healComponents?.[0]?.type;
  const typeDef = dmgType ? DAMAGE_TYPES[dmgType] : null;

  let damageLabel = null;
  if (cs) {
    const int = character?.attributes?.inteligencja || 0;
    if (cs.type === 'offensive' && primaryMode?.damageComponents?.length) {
      const c = primaryMode.damageComponents[0];
      const scale = c.intScale ? _fmtScale(c.intScale) : '';
      const flat = (c.flat || 0) > 0 ? (scale ? ` + ${c.flat}` : `${c.flat}`) : '';
      const evaluated = c.intScale ? Math.max(1, Math.floor(int * c.intScale) + (c.flat || 0)) : (c.flat || 0);
      damageLabel = { text: `${scale}${flat} obrz.`, preview: evaluated > 0 ? ` (${evaluated})` : '' };
    } else if (cs.type === 'heal' && supportMode?.healComponents?.length) {
      const c = supportMode.healComponents[0];
      const scale = c.intScale ? _fmtScale(c.intScale) : '';
      const flat = (c.flat || 0) > 0 ? (scale ? ` + ${c.flat}` : `${c.flat}`) : '';
      const evaluated = c.intScale ? Math.max(1, Math.floor(int * c.intScale) + (c.flat || 0)) : (c.flat || 0);
      damageLabel = { text: `Leczy ${scale}${flat} HP`, preview: evaluated > 0 ? ` (${evaluated})` : '' };
    }
  }

  const handleReload = (e) => {
    e.stopPropagation();
    reload();
  };

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onSelect(name)}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelect(name); } }}
      className={`w-full text-left rounded-sm px-2 py-1 border transition-all cursor-pointer ${
        isSelected
          ? 'border-tertiary/40 bg-tertiary/10'
          : 'border-transparent hover:border-outline-variant/20'
      } ${hasEnoughMana ? '' : 'opacity-45'}`}
    >
      <div className="flex items-center justify-between gap-2 min-w-0">
        <span className={`flex items-center gap-1.5 min-w-0 text-[10px] font-bold ${hasEnoughMana ? 'text-on-surface' : 'text-on-surface-variant'}`}>
          <span className="material-symbols-outlined text-xs text-tertiary shrink-0">{meta.icon}</span>
          <span className="truncate">{name}</span>
        </span>
        <div className="flex items-center gap-1.5 shrink-0">
          <span className="text-[9px] text-on-surface-variant tabular-nums">
            {meta.manaCost} many · {uses} {t('magic.usesShort', 'uż.')}
          </span>
          <button
            type="button"
            onClick={handleReload}
            disabled={reloading || loading}
            title={t('magic.reloadSpellStats', 'Przelicz staty')}
            className="flex items-center justify-center w-5 h-5 rounded-sm text-on-surface-variant/50 hover:text-tertiary border border-transparent hover:border-tertiary/30 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <span className={`material-symbols-outlined text-[12px] ${reloading ? 'animate-spin' : ''}`}>
              {reloading ? 'progress_activity' : 'refresh'}
            </span>
          </button>
        </div>
      </div>
      {meta.description && (
        <div className="text-[9px] text-on-surface-variant/90 leading-tight line-clamp-2">{meta.description}</div>
      )}
      {(loading || reloading) && (
        <div className="flex items-center gap-1 text-[8px] text-on-surface-variant/50 mt-0.5">
          <span className="material-symbols-outlined text-[10px] animate-spin">progress_activity</span>
          <span>{t('magic.generatingStats', { defaultValue: 'Generuję statystyki...' })}</span>
        </div>
      )}
      {!loading && !reloading && damageLabel && (
        <div className="flex items-center gap-1 text-[8px] text-tertiary/80 leading-tight mt-0.5 font-label tabular-nums">
          {typeDef && (
            <span className={`material-symbols-outlined text-[10px] ${typeDef.color}`}>{typeDef.icon}</span>
          )}
          {cs?.type === 'heal' && !typeDef && (
            <span className="material-symbols-outlined text-[10px] text-emerald-400">healing</span>
          )}
          <span>{damageLabel.text}</span>
          {damageLabel.preview && <span className="text-on-surface-variant/60">{damageLabel.preview}</span>}
        </div>
      )}
      {!loading && !reloading && !damageLabel && !cs && (
        <div className="text-[9px] text-on-surface-variant/80 leading-tight">
          {t('magic.customSpellShortHint', { defaultValue: 'Poza standardowym drzewkiem — uproszczony koszt many.' })}
        </div>
      )}
      {!loading && !reloading && explanation && (
        <p className="text-[8px] text-on-surface-variant/50 leading-tight mt-0.5 italic">{explanation}</p>
      )}
    </div>
  );
}

function _fmtScale(intScale) {
  if (intScale === 1) return 'INT';
  if (intScale === 0.5) return 'INT/2';
  if (intScale === 0.25) return 'INT/4';
  if (intScale === 0.33) return 'INT/3';
  if (intScale === 0.75) return '3/4 INT';
  return `${intScale}×INT`;
}

export default function MagicPanel({ character, combat, onCastSpell }) {
  const { t } = useTranslation();
  const [selectedSpell, setSelectedSpell] = useState(null);
  const [lastCastResult, setLastCastResult] = useState(null);
  const [lastScrollResult, setLastScrollResult] = useState(null);
  const [panelCollapsed, setPanelCollapsed] = useState(false);
  const [openSections, setOpenSections] = useState({
    mana: true,
    spells: true,
    casting: true,
    scrolls: true,
    progression: false,
  });

  const toggleSection = useCallback((key) => {
    setOpenSections((s) => ({ ...s, [key]: !s[key] }));
  }, []);

  const mana = character?.mana || { current: 0, max: 0 };
  const spells = character?.spells || { known: [], usageCounts: {}, scrolls: [] };
  const inCombat = Boolean(combat);

  const progression = useMemo(() => getSpellProgressionStatus(character), [character]);
  const canCast = canCastAnySpell(character);

  // Group known spells by tree
  const spellsByTree = useMemo(() => {
    const map = new Map();
    for (const spellName of spells.known) {
      for (const [treeId, tree] of Object.entries(SPELL_TREES)) {
        const spell = tree.spells.find((s) => s.name === spellName);
        if (spell) {
          if (!map.has(treeId)) map.set(treeId, { tree, spells: [] });
          map.get(treeId).spells.push(spell);
          break;
        }
      }
    }
    return [...map.entries()];
  }, [spells.known]);

  const customKnownSpellNames = useMemo(
    () => spells.known.filter((name) => resolveKnownSpellDisplay(name).isCustom),
    [spells.known],
  );

  // Auto-select first available spell
  useEffect(() => {
    if (!selectedSpell && spells.known.length > 0) {
      setSelectedSpell(spells.known[0]);
    }
  }, [selectedSpell, spells.known]);

  const handleCast = () => {
    if (!character || !selectedSpell) return;
    const result = castSpell(character, selectedSpell);
    setLastCastResult(result);

    if (result.success) {
      onCastSpell?.(result);
    }
  };

  const handleLearnScroll = (scrollName) => {
    if (!character) return;
    const result = learnFromScroll(character, scrollName);
    setLastScrollResult(result);
    if (result.success) {
      onCastSpell?.({ ...result, type: 'learnScroll' });
    }
  };

  const handleUseScroll = (scrollName) => {
    if (!character) return;
    const result = useScrollOneShot(character, scrollName);
    setLastScrollResult(result);
    if (result.success) {
      onCastSpell?.({ ...result, type: 'useScroll' });
    }
  };

  const manaPct = mana.max > 0 ? (mana.current / mana.max) * 100 : 0;

  return (
    <div className="relative space-y-2 p-3 bg-tertiary-container/5 border border-tertiary/20 rounded-sm">
      {/* Panel header — collapsible */}
      <button
        type="button"
        onClick={() => setPanelCollapsed((c) => !c)}
        aria-expanded={!panelCollapsed}
        className="w-full flex items-center justify-between gap-2"
      >
        <div className="flex items-center gap-2 min-w-0">
          <span className="material-symbols-outlined text-tertiary text-lg shrink-0">auto_fix_high</span>
          <h3 className="text-sm font-bold text-tertiary uppercase tracking-widest truncate">
            {t('magic.title')}
          </h3>
          {inCombat && (
            <span className="text-[10px] text-on-surface-variant px-2 py-0.5 bg-surface-container rounded-sm shrink-0">
              {t('combat.round')} {combat.round}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <div className="flex items-center gap-1 text-[10px] text-on-surface-variant tabular-nums">
            <span className="material-symbols-outlined text-xs">water_drop</span>
            <span className="font-bold text-tertiary">{mana.current}/{mana.max}</span>
          </div>
          <span className={`material-symbols-outlined text-sm text-on-surface-variant transition-transform ${panelCollapsed ? '' : 'rotate-180'}`}>
            expand_more
          </span>
        </div>
      </button>

      {!panelCollapsed && (
        <div className="space-y-2">
          {/* Mana bar */}
          <SectionToggle
            label="Mana"
            icon="water_drop"
            open={openSections.mana}
            onToggle={() => toggleSection('mana')}
          >
            <div className="flex items-center gap-2">
              <div className="flex-1 h-3 bg-surface-container-high/60 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-300 ${
                    manaPct > 50 ? 'bg-tertiary' : manaPct > 20 ? 'bg-tertiary/70' : 'bg-error/70'
                  }`}
                  style={{ width: `${manaPct}%` }}
                />
              </div>
              <span className="text-sm font-headline text-tertiary tabular-nums w-14 text-right">
                {mana.current}/{mana.max}
              </span>
            </div>
          </SectionToggle>

          {/* Known spells by tree */}
          <SectionToggle
            label={t('magic.spells', 'Zaklecia')}
            icon="menu_book"
            open={openSections.spells}
            onToggle={() => toggleSection('spells')}
            badge={
              spells.known.length > 0 ? (
                <span className="text-[8px] text-on-surface-variant/60 tabular-nums ml-1">({spells.known.length})</span>
              ) : null
            }
          >
            <div className="max-h-48 overflow-y-auto custom-scrollbar space-y-1">
              {spells.known.length === 0 && (
                <p className="text-[10px] text-on-surface-variant">{t('magic.noSpells', 'Brak znanych zakleć')}</p>
              )}
              {spellsByTree.map(([treeId, { tree, spells: treeSpells }]) => (
                <div key={treeId} className="space-y-1">
                  <div className="flex items-center gap-1 text-[9px] font-bold text-primary/90 uppercase tracking-wide">
                    <span className="material-symbols-outlined text-xs">{tree.icon}</span>
                    {tree.name}
                  </div>
                  <div className="space-y-1 pl-1 border-l border-outline-variant/20">
                    {treeSpells.map((s) => {
                      const isSelected = selectedSpell === s.name;
                      const hasEnoughMana = mana.current >= s.manaCost;
                      const uses = spells.usageCounts?.[s.name] || 0;
                      return (
                        <button
                          key={s.name}
                          type="button"
                          onClick={() => setSelectedSpell(s.name)}
                          className={`w-full text-left rounded-sm px-2 py-1 border transition-all ${
                            isSelected
                              ? 'border-tertiary/40 bg-tertiary/10'
                              : 'border-transparent hover:border-outline-variant/20'
                          } ${hasEnoughMana ? '' : 'opacity-45'}`}
                        >
                          <div className="flex items-center justify-between gap-2 min-w-0">
                            <span className={`flex items-center gap-1.5 min-w-0 text-[10px] font-bold ${hasEnoughMana ? 'text-on-surface' : 'text-on-surface-variant'}`}>
                              <span className="material-symbols-outlined text-xs text-tertiary shrink-0">
                                {s.icon || tree.icon}
                              </span>
                              <span className="truncate">{s.name}</span>
                            </span>
                            <span className="text-[9px] text-on-surface-variant tabular-nums shrink-0">
                              {s.manaCost} many · {uses} {t('magic.usesShort', 'uż.')}
                            </span>
                          </div>
                          <div className="text-[9px] text-on-surface-variant/90 leading-tight line-clamp-2">{s.description}</div>
                          {(() => {
                            const label = formatSpellDamageLabel(s);
                            if (!label) return null;
                            const int = character?.attributes?.inteligencja || 0;
                            const dmgVal = computeSpellDamage(s.name, int);
                            const healVal = computeSpellHeal(s.name, int);
                            const preview = dmgVal > 0 ? ` (${dmgVal})` : healVal > 0 ? ` (${healVal})` : '';
                            const cs = s.combatStats;
                            const modes = cs?.attackModes;
                            const primaryMode = modes?.ranged || modes?.melee || modes?.aoe;
                            const dmgType = primaryMode?.damageComponents?.[0]?.type
                              || cs?.supportModes?.heal?.healComponents?.[0]?.type
                              || cs?.damageComponents?.[0]?.type
                              || cs?.healComponents?.[0]?.type;
                            const typeDef = dmgType ? DAMAGE_TYPES[dmgType] : null;
                            return (
                              <div className="flex items-center gap-1 text-[8px] text-tertiary/80 leading-tight mt-0.5 font-label tabular-nums">
                                {typeDef && (
                                  <span className={`material-symbols-outlined text-[10px] ${typeDef.color}`}>{typeDef.icon}</span>
                                )}
                                {cs?.type === 'heal' && !typeDef && (
                                  <span className="material-symbols-outlined text-[10px] text-emerald-400">healing</span>
                                )}
                                <span>{label}</span>
                                {preview && <span className="text-on-surface-variant/60">{preview}</span>}
                              </div>
                            );
                          })()}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
              {customKnownSpellNames.length > 0 && (
                <div className="space-y-1">
                  <div className="flex items-center gap-1 text-[9px] font-bold text-amber-400/90 uppercase tracking-wide">
                    <span className="material-symbols-outlined text-xs">draw</span>
                    {t('magic.customSpellsSection', 'Fabularne / niestandardowe')}
                  </div>
                  <div className="space-y-1 pl-1 border-l border-amber-500/20">
                    {customKnownSpellNames.map((name) => (
                      <CustomSpellButton
                        key={name}
                        name={name}
                        character={character}
                        isSelected={selectedSpell === name}
                        onSelect={setSelectedSpell}
                        mana={mana}
                        usageCounts={spells.usageCounts}
                        t={t}
                      />
                    ))}
                  </div>
                </div>
              )}
            </div>
          </SectionToggle>

          {/* Casting section */}
          <SectionToggle
            label={t('magic.casting', 'Rzucanie')}
            icon="flare"
            open={openSections.casting}
            onToggle={() => toggleSection('casting')}
          >
            {selectedSpell ? (
              <>
                <div className="flex flex-wrap gap-x-3 gap-y-1 text-[10px] text-on-surface-variant">
                  <span>
                    <span className="text-on-surface font-bold">{selectedSpell}</span>
                  </span>
                  <span className="tabular-nums">
                    Mana: <span className="text-tertiary font-bold">{mana.current}/{mana.max}</span>
                  </span>
                </div>
                <button
                  type="button"
                  onClick={handleCast}
                  disabled={!canCast || !selectedSpell}
                  className="w-full px-2 py-1.5 text-[10px] font-bold uppercase tracking-widest bg-tertiary/15 text-tertiary border border-tertiary/25 rounded-sm hover:bg-tertiary/25 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  {t('magic.cast', 'Rzuc zaklecie')}
                </button>
              </>
            ) : (
              <p className="text-[10px] text-on-surface-variant">{t('magic.pickSpell', 'Wybierz zaklecie')}</p>
            )}

            {lastCastResult && (
              <div className="text-[9px] bg-surface-dim/30 rounded-sm px-2 py-1.5 border border-outline-variant/10 space-y-1">
                <div className="font-bold text-on-surface">
                  {lastCastResult.spellName}
                  <span className={lastCastResult.success ? ' text-primary' : ' text-error'}>
                    {' '}— {lastCastResult.success ? t('magic.castSuccess', 'Sukces') : t('magic.castFail', 'Nieudane')}
                  </span>
                </div>
                {lastCastResult.success && (
                  <div className="text-on-surface-variant leading-tight">
                    -{lastCastResult.manaCost} many ·{' '}
                    {lastCastResult.description
                      || (lastCastResult.isCustomSpell
                        ? t('magic.customSpellCastBlurb', { defaultValue: 'Efekt opisuje scena / MG.' })
                        : '')}
                  </div>
                )}
                {lastCastResult.error && (
                  <div className="text-error leading-tight">{lastCastResult.error}</div>
                )}
              </div>
            )}
          </SectionToggle>

          {/* Scrolls section */}
          {spells.scrolls?.length > 0 && (
            <SectionToggle
              label={t('magic.scrolls', 'Scrolle')}
              icon="article"
              open={openSections.scrolls}
              onToggle={() => toggleSection('scrolls')}
              badge={<span className="text-[8px] text-on-surface-variant/60 tabular-nums ml-1">({spells.scrolls.length})</span>}
            >
              <div className="space-y-1.5">
                {spells.scrolls.map((scrollName, idx) => (
                  <div key={`${scrollName}-${idx}`} className="flex items-center justify-between gap-2 px-2 py-1 bg-surface-dim/20 rounded-sm border border-outline-variant/10">
                    <span className="text-[10px] text-on-surface font-bold truncate">{scrollName}</span>
                    <div className="flex gap-1 shrink-0">
                      <button
                        type="button"
                        onClick={() => handleLearnScroll(scrollName)}
                        className="px-2 py-0.5 text-[9px] font-bold bg-primary/15 text-primary border border-primary/20 rounded-sm hover:bg-primary/25 transition-colors"
                      >
                        {t('magic.learn', 'Naucz sie')}
                      </button>
                      <button
                        type="button"
                        onClick={() => handleUseScroll(scrollName)}
                        className="px-2 py-0.5 text-[9px] font-bold bg-tertiary/15 text-tertiary border border-tertiary/20 rounded-sm hover:bg-tertiary/25 transition-colors"
                      >
                        {t('magic.useOnce', 'Uzyj raz')}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
              {lastScrollResult && (
                <div className="text-[9px] bg-surface-dim/30 rounded-sm px-2 py-1 border border-outline-variant/10 mt-1">
                  {lastScrollResult.learned !== undefined ? (
                    <span className={lastScrollResult.learned ? 'text-primary' : 'text-error'}>
                      {lastScrollResult.learned
                        ? t('magic.scrollLearned', { spell: lastScrollResult.learnSpell, defaultValue: `Nauczono sie: ${lastScrollResult.learnSpell}` })
                        : t('magic.scrollFailed', { roll: lastScrollResult.roll, chance: lastScrollResult.chance, defaultValue: `Nie udalo sie (${lastScrollResult.roll} > ${lastScrollResult.chance}%). Scroll zuzyty.` })}
                    </span>
                  ) : (
                    <span className="text-tertiary">
                      {t('magic.scrollUsed', { spell: lastScrollResult.spellName, defaultValue: `Uzyto scrolla: ${lastScrollResult.spellName}` })}
                    </span>
                  )}
                </div>
              )}
            </SectionToggle>
          )}

          {/* Progression section */}
          {progression.length > 0 && (
            <SectionToggle
              label={t('magic.progression', 'Progresja')}
              icon="trending_up"
              open={openSections.progression}
              onToggle={() => toggleSection('progression')}
            >
              <div className="space-y-1.5">
                {progression.map((p) => (
                  <div key={p.spellName} className="px-2 py-1 bg-surface-dim/20 rounded-sm border border-outline-variant/10">
                    <div className="flex items-center justify-between gap-2 text-[10px]">
                      <span className="font-bold text-on-surface">{p.spellName}</span>
                      <span className="text-on-surface-variant tabular-nums">
                        {p.treeName} · lv.{p.level} · {p.manaCost} many
                      </span>
                    </div>
                    <div className="flex items-center gap-2 mt-1">
                      <div className="flex-1 h-1 bg-surface-container-high/60 rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all ${p.unlocked ? 'bg-green-400' : 'bg-primary/60'}`}
                          style={{ width: `${p.progress * 100}%` }}
                        />
                      </div>
                      <span className="text-[9px] text-on-surface-variant/60 tabular-nums">
                        {p.unlocked ? '✓' : `${p.currentUses}/${p.requiredUses}`}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </SectionToggle>
          )}
        </div>
      )}
    </div>
  );
}
