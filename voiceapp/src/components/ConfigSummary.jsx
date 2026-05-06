import { useConfigStore } from '../store';

export default function ConfigSummary({ voices }) {
  const narratorVoiceId = useConfigStore((s) => s.narratorVoiceId);
  const maleNpcVoices = useConfigStore((s) => s.maleNpcVoices);
  const femaleNpcVoices = useConfigStore((s) => s.femaleNpcVoices);

  const narrator = voices.find((v) => v.id === narratorVoiceId);

  return (
    <div className="flex flex-wrap gap-4 text-[10px] font-label uppercase tracking-widest text-on-surface-variant">
      <span className="flex items-center gap-1.5">
        <span className="material-symbols-outlined text-sm text-tertiary">record_voice_over</span>
        Narrator: {narrator ? (
          <span className="text-tertiary font-bold">{narrator.name}</span>
        ) : (
          <span className="text-on-surface-variant/50">not set</span>
        )}
      </span>
      <span className="flex items-center gap-1.5">
        <span className="text-blue-300">♂</span>
        NPC male: <span className="text-blue-300 font-bold">{maleNpcVoices.length}</span>
      </span>
      <span className="flex items-center gap-1.5">
        <span className="text-pink-300">♀</span>
        NPC female: <span className="text-pink-300 font-bold">{femaleNpcVoices.length}</span>
      </span>
    </div>
  );
}
