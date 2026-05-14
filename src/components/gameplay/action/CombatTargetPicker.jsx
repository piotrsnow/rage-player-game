import { useTranslation } from 'react-i18next';

const ATTITUDE_STYLES = {
  hostile: 'bg-error/20 text-error border-error/30',
  neutral: 'bg-warning/20 text-warning border-warning/30',
  friendly: 'bg-success/20 text-success border-success/30',
};

/**
 * @param {'combat'|'beer_duel'|'card_game'|'dice_game'} variant
 * @param {() => void} onGeneral — general combat / AI-picked opponent
 * @param {(npcName: string) => void} onVsNpc — attack NPC / duel vs named NPC
 */
export default function CombatTargetPicker({
  npcs,
  disabled,
  variant = 'combat',
  onGeneral,
  onVsNpc,
  onCancel,
}) {
  const { t } = useTranslation();
  const isBeer = variant === 'beer_duel';
  const isCardGame = variant === 'card_game';
  const isDiceGame = variant === 'dice_game';
  const isMinigame = isBeer || isCardGame || isDiceGame;

  const generalBtnStyle = isCardGame
    ? 'text-on-surface bg-emerald-500/10 hover:bg-emerald-500/20 border-emerald-400/25 hover:border-emerald-400/45'
    : isDiceGame
    ? 'text-on-surface bg-amber-500/10 hover:bg-amber-500/20 border-amber-400/25 hover:border-amber-400/45'
    : isBeer
    ? 'text-on-surface bg-amber-500/10 hover:bg-amber-500/20 border-amber-400/25 hover:border-amber-400/45'
    : 'text-on-surface bg-error/10 hover:bg-error/20 border-error/20 hover:border-error/40';

  const generalIconStyle = isCardGame ? 'text-emerald-300' : isDiceGame ? 'text-amber-300' : isBeer ? 'text-amber-300' : 'text-error';
  const generalIcon = isCardGame ? 'style' : isDiceGame ? 'casino' : isBeer ? 'smart_toy' : 'target';

  const npcBtnStyle = isCardGame
    ? 'text-emerald-200 hover:text-on-surface bg-emerald-500/15 hover:bg-emerald-500/25 border-emerald-400/30 hover:border-emerald-400/50'
    : isDiceGame
    ? 'text-amber-200 hover:text-on-surface bg-amber-500/15 hover:bg-amber-500/25 border-amber-400/30 hover:border-amber-400/50'
    : isBeer
    ? 'text-amber-200 hover:text-on-surface bg-amber-500/15 hover:bg-amber-500/25 border-amber-400/30 hover:border-amber-400/50'
    : 'text-error hover:text-on-surface bg-error/10 hover:bg-error/20 border-error/20 hover:border-error/40';

  const npcIcon = isCardGame ? 'style' : isDiceGame ? 'casino' : isBeer ? 'sports_bar' : 'swords';

  return (
    <div className="p-3 bg-surface-container-high border border-outline-variant/20 rounded-sm space-y-2 animate-fade-in">
      <label className="block text-[10px] text-on-surface-variant font-label uppercase tracking-widest mb-2">
        {isCardGame ? t('gameplay.selectCardGameTarget', 'Oczko — wybierz przeciwnika')
          : isDiceGame ? t('gameplay.selectDiceGameTarget', 'Gra w kości — wybierz przeciwnika')
          : isBeer ? t('gameplay.selectBeerDuelTarget', 'Pojedynek piwny — przeciwnicy')
          : t('gameplay.selectTarget')}
      </label>

      <button
        onClick={onGeneral}
        disabled={disabled}
        className={`w-full flex items-center gap-2 px-3 py-2.5 text-xs font-label border rounded-sm transition-all disabled:opacity-30 ${generalBtnStyle}`}
      >
        <span className={`material-symbols-outlined text-sm ${generalIconStyle}`}>{generalIcon}</span>
        {isCardGame ? t('gameplay.generalCardGame', 'Ogólna gra (AI wybiera)')
          : isDiceGame ? t('gameplay.generalDiceGame', 'Ogólna gra (AI wybiera)')
          : isBeer ? t('gameplay.generalBeerDuel', 'Ogólny pojedynek (AI wybiera)')
          : t('gameplay.generalCombat')}
      </button>

      {npcs.length > 0 ? (
        <div className="space-y-1 max-h-48 overflow-y-auto custom-scrollbar">
          {npcs.map((npc) => {
            const attitudeKey = npc.attitude === 'hostile' ? 'attitudeHostile'
              : npc.attitude === 'friendly' ? 'attitudeFriendly' : 'attitudeNeutral';
            const attitudeStyle = ATTITUDE_STYLES[npc.attitude] || ATTITUDE_STYLES.neutral;
            return (
              <div
                key={npc.id || npc.name}
                className="flex items-center justify-between gap-2 px-3 py-2 bg-surface-container/60 border border-outline-variant/10 rounded-sm"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-sm text-on-surface truncate">{npc.name}</span>
                  <span className={`shrink-0 text-[10px] px-1.5 py-0.5 rounded-sm border font-label uppercase tracking-wider ${attitudeStyle}`}>
                    {t(`gameplay.${attitudeKey}`)}
                  </span>
                </div>
                <button
                  onClick={() => onVsNpc(npc.name)}
                  disabled={disabled}
                  className={`shrink-0 flex items-center gap-1 px-2 py-1 text-[10px] font-label uppercase tracking-widest border rounded-sm transition-all disabled:opacity-30 ${npcBtnStyle}`}
                >
                  <span className="material-symbols-outlined text-xs">{npcIcon}</span>
                  {isCardGame ? t('gameplay.cardGameVsNpc', 'Zagraj')
                    : isDiceGame ? t('gameplay.diceGameVsNpc', 'Zagraj')
                    : isBeer ? t('gameplay.beerDuelVsNpc', 'Na melanż')
                    : t('gameplay.attackNpc')}
                </button>
              </div>
            );
          })}
        </div>
      ) : (
        <p className="text-[10px] text-on-surface-variant/60 italic px-1">
          {t('gameplay.noNpcsNearby')}
        </p>
      )}

      <button
        onClick={onCancel}
        className="w-full flex items-center justify-center gap-1 px-2 py-1.5 text-[10px] font-label uppercase tracking-widest text-on-surface-variant hover:text-on-surface transition-colors"
      >
        {t('gameplay.cancelCombat')}
      </button>
    </div>
  );
}
