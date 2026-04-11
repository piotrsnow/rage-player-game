export default function RewardBadge({ reward, compact = false, t }) {
  if (!reward) return null;
  const parts = [];
  if (reward.xp) parts.push(`${reward.xp} ${t('quests.xpShort')}`);
  if (reward.money) {
    const m = reward.money;
    if (m.gold) parts.push(`${m.gold} ${t('currency.goldShort', 'ZK')}`);
    if (m.silver) parts.push(`${m.silver} ${t('currency.silverShort', 'SK')}`);
    if (m.copper) parts.push(`${m.copper} ${t('currency.copperShort', 'MK')}`);
  }
  if (reward.items?.length > 0) {
    parts.push(...reward.items.map((i) => i.name || i));
  }
  const text = parts.length > 0 ? parts.join(', ') : reward.description;
  if (!text) return null;

  if (compact) {
    return (
      <span className="inline-flex items-center gap-1 text-[9px] font-label text-amber-400/80">
        <span className="material-symbols-outlined" style={{ fontSize: '10px' }}>paid</span>
        {text}
      </span>
    );
  }

  return (
    <div className="flex items-start gap-2 bg-amber-500/8 border border-amber-500/15 rounded-sm p-3">
      <span className="material-symbols-outlined text-sm text-amber-400 mt-0.5">paid</span>
      <div>
        <p className="text-[10px] font-label uppercase tracking-widest text-amber-400/80">
          {t('quests.reward')}
        </p>
        <p className="text-xs text-on-surface mt-0.5 leading-relaxed">{text}</p>
      </div>
    </div>
  );
}
