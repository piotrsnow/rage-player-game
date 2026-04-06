import { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import {
  performChannellingTest,
  performCastingTest,
  getAvailableSpells,
  canCastSpell,
  calculateOvercast,
} from '../../services/magicEngine';
import { WINDS_OF_MAGIC, SPELLS, PETTY_SPELLS } from '../../data/wfrpMagic';
import { getBonus } from '../../services/gameState';

function loreLabel(loreKey, t) {
  if (loreKey === 'petty') return t('gameplay.pettyMagic');
  const i18nLabel = t(`magic.lore.${loreKey}`, '');
  if (i18nLabel) return i18nLabel;
  const w = WINDS_OF_MAGIC[loreKey];
  return w?.title || loreKey;
}

function spellField(spell, field, t) {
  const key = `magic.spellData.${spell.name}.${field}`;
  const val = t(key, '');
  return val || spell[field] || '';
}

function effectRoundsFromSpell(spell, wp) {
  const d = (spell?.duration || '').toLowerCase();
  if (d.includes('instant')) return null;
  const wpb = Math.max(1, getBonus(wp));
  if (d.includes('round')) return wpb;
  if (d.includes('minute')) return wpb * 10;
  return wpb * 5;
}

const defaultMagic = () => ({ storedWindPoints: 0, activeMagicEffects: [] });

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

export default function MagicPanel({ character, combat, dispatch, onCastSpell }) {
  const { t } = useTranslation();
  const [channelLore, setChannelLore] = useState('petty');
  const [lastChannelResult, setLastChannelResult] = useState(null);
  const [castSpell, setCastSpell] = useState(null);
  const [lastCastResult, setLastCastResult] = useState(null);
  const [miscastFlash, setMiscastFlash] = useState(null);
  const [localMagic, setLocalMagic] = useState(defaultMagic);
  const prevRoundRef = useRef(combat?.round);

  const [panelCollapsed, setPanelCollapsed] = useState(false);
  const [openSections, setOpenSections] = useState({
    channelling: true,
    spells: true,
    casting: true,
    activeEffects: true,
  });

  const toggleSection = useCallback((key) => {
    setOpenSections((s) => ({ ...s, [key]: !s[key] }));
  }, []);

  const inCombat = Boolean(combat);
  const combatMagic = combat?.magic || {};
  const storedWindPoints = inCombat
    ? (combatMagic.storedWindPoints ?? 0)
    : localMagic.storedWindPoints;
  const activeMagicEffects = inCombat
    ? (combatMagic.activeMagicEffects ?? [])
    : localMagic.activeMagicEffects;

  const setMagic = useCallback(
    (updater) => {
      if (inCombat) {
        const current = { ...defaultMagic(), ...combatMagic };
        const next = typeof updater === 'function' ? updater(current) : { ...current, ...updater };
        dispatch({ type: 'UPDATE_COMBAT', payload: { magic: next } });
      } else {
        setLocalMagic((s) => {
          const base = { ...defaultMagic(), ...s };
          return typeof updater === 'function' ? updater(base) : { ...base, ...updater };
        });
      }
    },
    [inCombat, combatMagic, dispatch]
  );

  const availableSpells = useMemo(() => getAvailableSpells(character), [character]);

  const loreSortOrder = useMemo(() => {
    const order = [];
    const seen = new Set();
    for (const s of [...PETTY_SPELLS, ...SPELLS]) {
      if (!seen.has(s.lore)) {
        seen.add(s.lore);
        order.push(s.lore);
      }
    }
    return order;
  }, []);

  const spellsByLore = useMemo(() => {
    const map = new Map();
    for (const s of availableSpells) {
      const lk = s.lore;
      if (!map.has(lk)) map.set(lk, []);
      map.get(lk).push(s);
    }
    const keys = [...map.keys()].sort(
      (a, b) => loreSortOrder.indexOf(a) - loreSortOrder.indexOf(b)
    );
    return keys.map((k) => ({ loreKey: k, label: loreLabel(k, t), spells: map.get(k) }));
  }, [availableSpells, loreSortOrder, t]);

  const channelLoreOptions = useMemo(() => {
    const keys = [...new Set(availableSpells.map((s) => s.lore))].sort(
      (a, b) => loreSortOrder.indexOf(a) - loreSortOrder.indexOf(b)
    );
    return keys;
  }, [availableSpells, loreSortOrder]);

  useEffect(() => {
    if (!channelLoreOptions.length) return;
    if (!channelLoreOptions.includes(channelLore)) {
      setChannelLore(channelLoreOptions[0]);
    }
  }, [channelLoreOptions, channelLore]);

  useEffect(() => {
    if (!castSpell || !availableSpells.some((s) => s.name === castSpell.name)) {
      setCastSpell(availableSpells[0] || null);
    }
  }, [availableSpells, castSpell]);

  useEffect(() => {
    const prev = prevRoundRef.current;
    const round = combat?.round;
    if (round == null) {
      prevRoundRef.current = round;
      return;
    }
    if (prev != null && round > prev && activeMagicEffects.length > 0) {
      setMagic((m) => ({
        ...m,
        activeMagicEffects: (m.activeMagicEffects || [])
          .map((e) => ({ ...e, roundsLeft: e.roundsLeft - 1 }))
          .filter((e) => e.roundsLeft > 0),
      }));
    }
    prevRoundRef.current = round;
  }, [combat?.round, activeMagicEffects.length, setMagic]);

  useEffect(() => {
    if (!miscastFlash) return;
    const tmr = setTimeout(() => setMiscastFlash(null), 6500);
    return () => clearTimeout(tmr);
  }, [miscastFlash]);

  const handleChannel = () => {
    if (!character) return;
    const res = performChannellingTest(character, channelLore);
    setLastChannelResult(res);
    if (res.success && res.windPoints > 0) {
      setMagic((m) => ({
        ...m,
        storedWindPoints: (m.storedWindPoints ?? 0) + res.windPoints,
      }));
    }
  };

  const handleCast = () => {
    if (!character || !castSpell) return;
    const windUsed = storedWindPoints;
    const result = performCastingTest(character, castSpell, windUsed);
    setLastCastResult({ ...result, spell: castSpell, storedWindPointsUsed: windUsed });

    onCastSpell?.({
      ...result,
      spell: castSpell,
      storedWindPointsUsed: windUsed,
      overcastDetail: calculateOvercast(result.totalSL, result.spellCn, character.characteristics?.wp),
    });

    setMagic((m) => ({ ...m, storedWindPoints: 0 }));

    if (result.miscast && result.miscastResult) {
      setMiscastFlash(result.miscastResult);
    }

    if (result.success) {
      const rounds = effectRoundsFromSpell(castSpell, character.characteristics?.wp ?? 30);
      if (rounds != null && rounds > 0) {
        setMagic((m) => ({
          ...m,
          activeMagicEffects: [
            ...(m.activeMagicEffects || []),
            {
              id: `${castSpell.name}-${Date.now()}`,
              spellName: castSpell.name,
              lore: castSpell.lore,
              effect: castSpell.effect,
              roundsLeft: rounds,
            },
          ],
        }));
      }
    }
  };

  const wp = character?.characteristics?.wp ?? 30;

  const formatOvercast = (totalSL, spellCn) => {
    const oc = calculateOvercast(totalSL, spellCn, wp);
    if (oc.overcasts <= 0) return t('magic.overcastNone');
    const wpb = oc.effects.willpowerBonus;
    if (wpb != null) {
      return t('magic.overcastSummary', { count: oc.overcasts, wpb });
    }
    return t('magic.overcastSummaryNoWpb', { count: oc.overcasts });
  };

  return (
    <div className="relative space-y-2 p-3 bg-tertiary-container/5 border border-tertiary/20 rounded-sm">
      {/* Miscast overlay */}
      {miscastFlash && (
        <div className="absolute inset-0 z-20 flex items-center justify-center rounded-sm bg-black/75 backdrop-blur-md p-3">
          <div className="max-w-sm w-full border-2 border-error shadow-lg shadow-error/30 bg-error-container/30 p-4 rounded-sm text-center space-y-2 animate-pulse">
            <span className="material-symbols-outlined text-4xl text-error">crisis_alert</span>
            <div className="text-xs font-label uppercase tracking-[0.2em] text-error">
              {t('magic.miscast')}
            </div>
            <div className="text-[10px] uppercase text-error/90 font-bold">
              {t(`magic.severity.${miscastFlash.severity}`, miscastFlash.severity)}
            </div>
            <p className="text-xs text-on-surface leading-snug">
              {miscastFlash.id ? t(`magic.miscastData.${miscastFlash.id}.desc`, miscastFlash.description) : miscastFlash.description}
            </p>
            <p className="text-[10px] text-on-surface-variant border-t border-outline-variant/20 pt-2">
              {miscastFlash.id ? t(`magic.miscastData.${miscastFlash.id}.effect`, miscastFlash.mechanicalEffect) : miscastFlash.mechanicalEffect}
            </p>
          </div>
        </div>
      )}

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
            <span className="material-symbols-outlined text-xs">air</span>
            <span className="font-bold text-primary">{storedWindPoints}</span>
            <span>{t('magic.wind')}</span>
          </div>
          <span className={`material-symbols-outlined text-sm text-on-surface-variant transition-transform ${panelCollapsed ? '' : 'rotate-180'}`}>
            expand_more
          </span>
        </div>
      </button>

      {!panelCollapsed && (
        <div className="space-y-2">
          {/* Channelling section */}
          <SectionToggle
            label={t('magic.channelling')}
            icon="waves"
            open={openSections.channelling}
            onToggle={() => toggleSection('channelling')}
            desc={t('magic.channellingDesc')}
          >
            <div className="flex flex-wrap gap-1">
              {channelLoreOptions.map((lk) => (
                <button
                  key={lk}
                  type="button"
                  onClick={() => setChannelLore(lk)}
                  className={`px-2 py-1 rounded-sm border text-[9px] font-bold uppercase tracking-wide transition-all ${
                    channelLore === lk
                      ? 'bg-primary/15 text-primary border-primary/30'
                      : 'bg-surface-dim/40 text-on-surface-variant border-outline-variant/10 hover:border-primary/20'
                  }`}
                >
                  {loreLabel(lk, t)}
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={handleChannel}
              disabled={!character || !channelLoreOptions.length}
              className="w-full px-2 py-1.5 text-[10px] font-bold uppercase tracking-widest bg-primary/10 text-primary border border-primary/20 rounded-sm hover:bg-primary/20 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
            >
              {t('magic.channelWind')}
            </button>
            {lastChannelResult && (
              <div className="text-[9px] text-on-surface-variant bg-surface-dim/30 rounded-sm px-2 py-1 border border-outline-variant/10 leading-tight">
                <span className="font-bold text-on-surface">{t('magic.d100')} {lastChannelResult.roll}</span>
                <span> {t('magic.vs')} {lastChannelResult.target}</span>
                <span className={lastChannelResult.success ? ' text-primary' : ' text-outline'}>
                  {' '}
                  — {lastChannelResult.success ? `${t('magic.success')} (+${lastChannelResult.windPoints} ${t('magic.wind')})` : t('magic.fail')}
                </span>
                {lastChannelResult.success && (
                  <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 ml-1 ${
                    lastChannelResult.sl > 0
                      ? 'text-primary bg-primary/12 border-primary/20'
                      : lastChannelResult.sl < 0
                        ? 'text-error bg-error/12 border-error/20'
                        : 'text-on-surface-variant bg-surface-container-high/40 border-outline-variant/20'
                  }`}>
                    <span className="material-symbols-outlined text-[11px] leading-none">fitness_center</span>
                    <span className="font-bold">
                      {t('gameplay.rollEdge', { value: `${lastChannelResult.sl > 0 ? '+' : ''}${lastChannelResult.sl}` })}
                    </span>
                  </span>
                )}
              </div>
            )}
          </SectionToggle>

          {/* Spell list section */}
          <SectionToggle
            label={t('magic.spells')}
            icon="menu_book"
            open={openSections.spells}
            onToggle={() => toggleSection('spells')}
            badge={
              availableSpells.length > 0 ? (
                <span className="text-[8px] text-on-surface-variant/60 tabular-nums ml-1">({availableSpells.length})</span>
              ) : null
            }
            desc={t('magic.spellsDesc')}
          >
            <div className="max-h-40 overflow-y-auto custom-scrollbar space-y-1">
              {!availableSpells.length && (
                <p className="text-[10px] text-on-surface-variant">{t('magic.noSpells')}</p>
              )}
              {spellsByLore.map(({ loreKey, label, spells }) => (
                <div key={loreKey} className="space-y-1">
                  <div className="text-[9px] font-bold text-primary/90 uppercase tracking-wide">{label}</div>
                  <div className="space-y-1 pl-1 border-l border-outline-variant/20">
                    {spells.map((s) => {
                      const allowed = canCastSpell(character, s);
                      const selected = castSpell?.name === s.name;
                      return (
                        <button
                          key={s.name}
                          type="button"
                          onClick={() => setCastSpell(s)}
                          className={`w-full text-left rounded-sm px-2 py-1 border transition-all ${
                            selected
                              ? 'border-tertiary/40 bg-tertiary/10'
                              : 'border-transparent hover:border-outline-variant/20'
                          } ${allowed ? '' : 'opacity-45'}`}
                        >
                          <div className="flex items-center justify-between gap-2 min-w-0">
                            <span className={`text-[10px] font-bold truncate ${allowed ? 'text-on-surface' : 'text-on-surface-variant'}`}>
                              {spellField(s, 'name', t)}
                            </span>
                            <span className="text-[9px] text-on-surface-variant tabular-nums shrink-0">{t('magic.cn')} {s.cn}</span>
                          </div>
                          <div className="text-[9px] text-on-surface-variant leading-tight mt-0.5">
                            <span className="text-outline">{spellField(s, 'range', t)}</span>
                            <span className="mx-1">·</span>
                            <span>{spellField(s, 'duration', t)}</span>
                          </div>
                          <div className="text-[9px] text-on-surface-variant/90 leading-tight line-clamp-2">{spellField(s, 'effect', t)}</div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </SectionToggle>

          {/* Casting section */}
          <SectionToggle
            label={t('magic.casting')}
            icon="flare"
            open={openSections.casting}
            onToggle={() => toggleSection('casting')}
            desc={t('magic.castingDesc')}
          >
            {castSpell ? (
              <>
                <div className="flex flex-wrap gap-x-3 gap-y-1 text-[10px] text-on-surface-variant">
                  <span>
                    <span className="text-on-surface font-bold">{spellField(castSpell, 'name', t)}</span>
                    <span className="text-on-surface-variant"> — {t('magic.cn')} {castSpell.cn}</span>
                  </span>
                  <span className="tabular-nums">
                    {t('magic.storedWind')}:{' '}
                    <span className="text-primary font-bold">{storedWindPoints}</span>
                  </span>
                  <span className="tabular-nums">
                    {t('magic.totalSlNeeded')} ≥ {castSpell.cn}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={handleCast}
                  disabled={!character || !canCastSpell(character, castSpell)}
                  className="w-full px-2 py-1.5 text-[10px] font-bold uppercase tracking-widest bg-tertiary/15 text-tertiary border border-tertiary/25 rounded-sm hover:bg-tertiary/25 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  {t('magic.cast')}
                </button>
              </>
            ) : (
              <p className="text-[10px] text-on-surface-variant">{t('magic.pickSpell')}</p>
            )}

            {lastCastResult && (
              <div className="text-[9px] bg-surface-dim/30 rounded-sm px-2 py-1.5 border border-outline-variant/10 space-y-1">
                <div className="font-bold text-on-surface">
                  {lastCastResult.spell ? spellField(lastCastResult.spell, 'name', t) : ''}
                  <span className={lastCastResult.success ? ' text-primary' : ' text-outline'}>
                    {' '}
                    — {lastCastResult.success ? t('magic.castSuccess') : t('magic.castFail')}
                  </span>
                </div>
                <div className="text-on-surface-variant leading-tight">
                  {t('magic.d100')} {lastCastResult.roll} {t('magic.vs')} {lastCastResult.target} — {t('magic.castingSl')} {lastCastResult.sl}
                  {lastCastResult.storedWindPointsUsed > 0 && (
                    <span>
                      {' '}
                      + {lastCastResult.storedWindPointsUsed} {t('magic.wind')} → {t('magic.totalSl')}{' '}
                      {lastCastResult.totalSL}
                    </span>
                  )}
                </div>
                {lastCastResult.success && lastCastResult.overcasts > 0 && (
                  <div className="text-primary leading-tight">
                    {t('magic.overcasts')}: {lastCastResult.overcasts} — {formatOvercast(lastCastResult.totalSL, lastCastResult.spellCn)}
                  </div>
                )}
                {lastCastResult.miscast && (
                  <div className="text-error font-bold flex items-start gap-1">
                    <span className="material-symbols-outlined text-xs shrink-0">warning</span>
                    <span>{t('magic.miscastWarning')}</span>
                  </div>
                )}
              </div>
            )}
          </SectionToggle>

          {/* Active effects section */}
          <SectionToggle
            label={t('magic.activeEffects')}
            icon="timer"
            open={openSections.activeEffects}
            onToggle={() => toggleSection('activeEffects')}
            badge={
              activeMagicEffects.length > 0 ? (
                <span className="text-[8px] text-primary tabular-nums ml-1">({activeMagicEffects.length})</span>
              ) : null
            }
            desc={t('magic.activeEffectsDesc')}
          >
            <div className="max-h-28 overflow-y-auto custom-scrollbar space-y-1.5">
              {!activeMagicEffects.length && (
                <p className="text-[10px] text-on-surface-variant">{t('magic.noneActive')}</p>
              )}
              {activeMagicEffects.map((e) => (
                <div
                  key={e.id}
                  className="text-[9px] border border-outline-variant/10 rounded-sm px-2 py-1 bg-surface-dim/20 leading-tight"
                >
                  <div className="flex justify-between gap-2">
                    <span className="font-bold text-on-surface truncate">{spellField({ name: e.spellName }, 'name', t)}</span>
                    <span className="text-primary tabular-nums shrink-0">
                      {e.roundsLeft} {inCombat ? t('magic.rounds') : t('magic.ticks')}
                    </span>
                  </div>
                  <div className="text-on-surface-variant line-clamp-2">
                    {spellField({ name: e.spellName, effect: e.effect }, 'effect', t)}
                  </div>
                </div>
              ))}
            </div>
          </SectionToggle>
        </div>
      )}
    </div>
  );
}
