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
    <div className="bg-amber-500/8 border border-amber-500/15 rounded-sm p-4">
      <p className="flex items-center gap-2 text-base font-headline uppercase tracking-widest text-amber-400/80 mb-1">
        {t('quests.reward')}
        <span className="material-symbols-outlined text-2xl">paid</span>
      </p>
      <p className="text-lg text-on-surface leading-relaxed">{text}</p>
    </div>
  );
}
