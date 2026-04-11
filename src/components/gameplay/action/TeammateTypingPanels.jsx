import AnimatedTypingDraft from './AnimatedTypingDraft';

export default function TeammateTypingPanels({ panels }) {
  if (!panels.length) return null;
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2 pt-0.5">
      {panels.map((member) => (
        <div
          key={member.odId}
          className={`rounded-sm border px-2.5 py-2 min-h-[54px] transition-all ${
            member.isTyping
              ? 'border-primary/35 bg-primary/8 shadow-[0_0_12px_rgba(197,154,255,0.15)]'
              : 'border-outline-variant/20 bg-surface-container-high/35'
          }`}
        >
          <div className="flex items-center justify-between gap-2 mb-1">
            <span className="text-[10px] font-label uppercase tracking-wider text-on-surface-variant/85 truncate">
              {member.name}
            </span>
            <span className={`text-[9px] font-label uppercase tracking-widest ${
              member.status === 'typing'
                ? 'text-primary'
                : member.status === 'ready'
                  ? 'text-tertiary'
                  : 'text-on-surface-variant/45'
            }`}>
              {member.status}
            </span>
          </div>
          <div className={`text-[11px] leading-snug ${member.isTyping ? 'text-on-surface' : 'text-on-surface-variant/60'}`}>
            <AnimatedTypingDraft text={member.draft} />
          </div>
        </div>
      ))}
    </div>
  );
}
