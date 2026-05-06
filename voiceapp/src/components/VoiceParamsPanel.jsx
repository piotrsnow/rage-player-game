import { useConfigStore, PRESETS, DEFAULT_PARAMS } from '../store';

const PARAM_DEFS = [
  { key: 'temperature', label: 'Temperature', min: 0.1, max: 1.0, step: 0.05, desc: 'Randomness of generation' },
  { key: 'top_p', label: 'Top P', min: 0.5, max: 1.0, step: 0.05, desc: 'Nucleus sampling threshold' },
  { key: 'top_k', label: 'Top K', min: 10, max: 100, step: 5, desc: 'Token selection pool size' },
  { key: 'repetition_penalty', label: 'Repetition Penalty', min: 1.0, max: 15.0, step: 0.5, desc: 'Penalize repeated tokens' },
  { key: 'length_penalty', label: 'Length Penalty', min: 0.5, max: 2.0, step: 0.1, desc: 'Bias towards longer/shorter output' },
  { key: 'speed', label: 'Speed', min: 0.5, max: 2.0, step: 0.1, desc: 'Playback speed multiplier' },
];

export default function VoiceParamsPanel({ voiceId }) {
  const params = useConfigStore((s) => s.voiceParams[voiceId]) ?? DEFAULT_PARAMS;
  const detectedPreset = useConfigStore((s) => {
    const p = s.voiceParams[voiceId] || DEFAULT_PARAMS;
    for (const [id, preset] of Object.entries(PRESETS)) {
      const { label, desc, ...vals } = preset;
      if (Object.entries(vals).every(([k, v]) => Math.abs((p[k] ?? DEFAULT_PARAMS[k]) - v) < 0.001)) return id;
    }
    return null;
  });
  const setVoicePreset = useConfigStore((s) => s.setVoicePreset);
  const setVoiceParam = useConfigStore((s) => s.setVoiceParam);

  return (
    <div className="border-t border-outline-variant/10 bg-surface-container/30 px-4 py-3 space-y-3 animate-fade-in overflow-hidden">
      {/* Preset quick buttons */}
      <div className="flex items-center gap-1.5">
        <span className="text-[9px] text-on-surface-variant font-label uppercase tracking-widest mr-1">
          Presets
        </span>
        {Object.entries(PRESETS).map(([id, p]) => (
          <button
            key={id}
            onClick={() => setVoicePreset(voiceId, id)}
            title={p.desc}
            className={`px-2 py-0.5 text-[9px] font-bold uppercase tracking-widest rounded-sm border transition-all ${
              detectedPreset === id
                ? 'border-primary/50 text-primary bg-primary/10'
                : 'border-outline-variant/20 text-on-surface-variant hover:border-primary/30'
            }`}
          >
            {p.label}
          </button>
        ))}
      </div>

      {/* Parameter sliders */}
      {PARAM_DEFS.map((def) => {
        const value = params[def.key] ?? DEFAULT_PARAMS[def.key];
        return (
          <div key={def.key} className="flex items-center gap-3 min-w-0">
            <div className="w-28 shrink-0">
              <p className="text-[10px] text-on-surface-variant font-label leading-tight">{def.label}</p>
              <p className="text-[8px] text-on-surface-variant/50">{def.desc}</p>
            </div>
            <input
              type="range"
              min={def.min}
              max={def.max}
              step={def.step}
              value={value}
              onChange={(e) => setVoiceParam(voiceId, def.key, parseFloat(e.target.value))}
              className="flex-1 min-w-0 h-1 accent-primary bg-surface-container-high rounded-full cursor-pointer"
            />
            <span className="w-10 shrink-0 text-right text-[10px] text-on-surface font-mono tabular-nums">
              {Number.isInteger(def.step) ? value : value.toFixed(2)}
            </span>
          </div>
        );
      })}
    </div>
  );
}
