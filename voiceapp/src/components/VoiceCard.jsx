import { useState } from 'react';
import { useConfigStore, PRESETS, DEFAULT_PARAMS } from '../store';
import VoiceParamsPanel from './VoiceParamsPanel';

export default function VoiceCard({ voice, onTest, testing, onDelete, onPatch }) {
  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState(voice.name);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [expanded, setExpanded] = useState(false);

  const narratorVoiceId = useConfigStore((s) => s.narratorVoiceId);
  const setNarrator = useConfigStore((s) => s.setNarrator);
  const toggleNpcPool = useConfigStore((s) => s.toggleNpcPool);
  const isInMalePool = useConfigStore((s) => s.maleNpcVoices.some((v) => v.voiceId === voice.id));
  const isInFemalePool = useConfigStore((s) => s.femaleNpcVoices.some((v) => v.voiceId === voice.id));
  const detectedPreset = useConfigStore((s) => {
    const p = s.voiceParams[voice.id] || DEFAULT_PARAMS;
    for (const [id, preset] of Object.entries(PRESETS)) {
      const { label, desc, ...vals } = preset;
      if (Object.entries(vals).every(([k, v]) => Math.abs((p[k] ?? DEFAULT_PARAMS[k]) - v) < 0.001)) return id;
    }
    return null;
  });
  const isNarrator = narratorVoiceId === voice.id;
  const isTesting = testing === voice.id;

  const handleSaveName = async () => {
    if (editName.trim() && editName !== voice.name) {
      await onPatch(voice.id, { name: editName.trim() });
    }
    setEditing(false);
  };

  const handleDelete = async () => {
    if (!confirmDelete) {
      setConfirmDelete(true);
      setTimeout(() => setConfirmDelete(false), 3000);
      return;
    }
    await onDelete(voice.id);
  };

  return (
    <div className={`
      glass-panel-elevated rounded-sm flex flex-col transition-all overflow-hidden
      ${isNarrator ? 'ring-1 ring-tertiary/40' : ''}
    `}>
      <div className="p-4 flex flex-col gap-3">
        {/* Header: name + gender */}
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            {editing ? (
              <input
                autoFocus
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                onBlur={handleSaveName}
                onKeyDown={(e) => e.key === 'Enter' && handleSaveName()}
                className="w-full bg-surface-container px-2 py-1 rounded-sm text-on-surface font-headline text-sm border border-outline-variant/30 focus:border-primary/50 outline-none"
              />
            ) : (
              <button
                onClick={() => { setEditName(voice.name); setEditing(true); }}
                className="font-headline text-sm text-on-surface hover:text-primary transition-colors truncate block text-left w-full"
                title="Click to rename"
              >
                {voice.name}
              </button>
            )}
            <div className="flex items-center gap-2 mt-1">
              <p className="text-[10px] text-on-surface-variant">
                {voice.durationS}s &middot; {voice.gender === 'female' ? '♀' : '♂'} {voice.gender}
              </p>
              {detectedPreset && (
                <span className="text-[9px] font-bold uppercase tracking-widest text-primary/60 bg-primary/5 px-1.5 py-0.5 rounded-sm">
                  {PRESETS[detectedPreset].label}
                </span>
              )}
            </div>
          </div>

          <button
            onClick={() => onPatch(voice.id, { gender: voice.gender === 'male' ? 'female' : 'male' })}
            className={`shrink-0 px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest rounded-sm border transition-all ${
              voice.gender === 'female'
                ? 'border-pink-400/40 text-pink-300 bg-pink-500/10'
                : 'border-blue-400/40 text-blue-300 bg-blue-500/10'
            }`}
            title="Toggle gender"
          >
            {voice.gender === 'female' ? '♀' : '♂'}
          </button>
        </div>

        {/* Role badges */}
        <div className="flex flex-wrap gap-1.5">
          <button
            onClick={() => setNarrator(isNarrator ? null : voice.id)}
            className={`px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest rounded-sm border transition-all ${
              isNarrator
                ? 'border-tertiary/50 text-tertiary bg-tertiary/10'
                : 'border-outline-variant/20 text-on-surface-variant hover:border-tertiary/30'
            }`}
          >
            Narrator
          </button>
          <button
            onClick={() => toggleNpcPool(voice.id, voice.name, 'male')}
            className={`px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest rounded-sm border transition-all ${
              isInMalePool
                ? 'border-blue-400/40 text-blue-300 bg-blue-500/10'
                : 'border-outline-variant/20 text-on-surface-variant hover:border-blue-400/30'
            }`}
          >
            ♂ NPC
          </button>
          <button
            onClick={() => toggleNpcPool(voice.id, voice.name, 'female')}
            className={`px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest rounded-sm border transition-all ${
              isInFemalePool
                ? 'border-pink-400/40 text-pink-300 bg-pink-500/10'
                : 'border-outline-variant/20 text-on-surface-variant hover:border-pink-400/30'
            }`}
          >
            ♀ NPC
          </button>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2 pt-2 border-t border-outline-variant/10">
          <button
            onClick={() => onTest(voice.id)}
            disabled={isTesting}
            className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-widest text-primary hover:text-tertiary disabled:opacity-50 transition-colors"
          >
            <span className="material-symbols-outlined text-sm">
              {isTesting ? 'stop' : 'play_arrow'}
            </span>
            {isTesting ? 'Playing...' : 'Test'}
          </button>

          <button
            onClick={() => setExpanded(!expanded)}
            className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-widest text-on-surface-variant hover:text-primary transition-colors"
          >
            <span className="material-symbols-outlined text-sm">
              {expanded ? 'tune' : 'tune'}
            </span>
            Params
            <span className="material-symbols-outlined text-xs">
              {expanded ? 'expand_less' : 'expand_more'}
            </span>
          </button>

          <div className="flex-1" />

          <button
            onClick={handleDelete}
            className={`flex items-center gap-1 text-[10px] font-bold uppercase tracking-widest transition-colors ${
              confirmDelete ? 'text-error' : 'text-on-surface-variant hover:text-error'
            }`}
          >
            <span className="material-symbols-outlined text-sm">delete</span>
            {confirmDelete ? 'Confirm?' : 'Delete'}
          </button>
        </div>
      </div>

      {/* Expandable params panel */}
      {expanded && (
        <VoiceParamsPanel voiceId={voice.id} />
      )}
    </div>
  );
}
