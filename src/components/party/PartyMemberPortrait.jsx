import { useTranslation } from 'react-i18next';
import { apiClient } from '../../services/apiClient';
import { speciesIcon } from '../../utils/speciesIcons';

export default function PartyMemberPortrait({ member, selected = false, onClick }) {
  const { t } = useTranslation();
  const isPlayer = member?.type !== 'companion';
  const portraitUrl = member?.portraitUrl ? apiClient.resolveMediaUrl(member.portraitUrl) : null;
  const speciesLabel = t(`species.${member?.species}`, { defaultValue: member?.species || '' });
  const woundsCurrent = member?.wounds ?? 0;
  const woundsMax = member?.maxWounds ?? 0;
  const safeMax = woundsMax > 0 ? woundsMax : 1;
  const pct = (Math.min(woundsCurrent, safeMax) / safeMax) * 100;

  const ringClass = selected
    ? (isPlayer ? 'border-primary ring-1 ring-primary/40' : 'border-primary/60 ring-1 ring-primary/30')
    : (isPlayer ? 'border-primary/40' : 'border-tertiary/30');

  const tooltip = `${member?.name || ''} · ${speciesLabel} · HP ${woundsCurrent}/${woundsMax}`;

  return (
    <button
      type="button"
      onClick={onClick}
      title={tooltip}
      aria-label={tooltip}
      className={`relative aspect-square w-full rounded-sm overflow-hidden bg-surface-container border ${ringClass} transition-all hover:border-primary/60 group`}
    >
      {portraitUrl ? (
        <img
          src={portraitUrl}
          alt={member?.name || ''}
          className="absolute inset-0 w-full h-full object-cover"
          onError={(e) => { e.currentTarget.style.display = 'none'; }}
        />
      ) : (
        <div className={`absolute inset-0 flex items-center justify-center ${isPlayer ? 'text-primary' : 'text-tertiary'}`}>
          <span className="material-symbols-outlined text-2xl">{speciesIcon(member?.species)}</span>
        </div>
      )}
      <div className="absolute bottom-0 left-0 right-0 h-1 bg-black/40">
        <div
          className={`h-full ${isPlayer ? 'bg-primary' : 'bg-tertiary'} transition-all duration-300`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </button>
  );
}
