import { useEffect, useRef, useState } from 'react';

const ALL_LINES = [
  '[docker]   Pulling dungeon-master:latest...                    done',
  '[prisma]   Migrating dragon_loot_table...                      OK',
  '[npc-ai]   Spawning 47 villagers with questionable morals...',
  '[d50]      Calibrating probability matrices...                 OK',
  '[fastify]  Binding port 3001 to the Aether...                  OK',
  '[pgvector] Indexing 1,536-dimensional spell embeddings...      OK',
  '[auth]     Verifying adventurer credentials...                  OK',
  '[tavern]   Warming up the mead server...                       OK',
  '[loot]     Shuffling treasure tables (seed: 0xDEAD)...         OK',
  '[combat]   Loading d50 physics engine v2.7...                  OK',
  '[world]    Rendering Yeralden overworld (42 regions)...        OK',
  '[quests]   Assigning morally ambiguous objectives...           OK',
  '[music]    Tuning bardic instruments...                        OK',
  '[fog]      Initializing fog-of-war subsystem...                OK',
  '[memory]   Compressing 15 campaign facts into HNSW index...    OK',
  '[npc-ai]   Teaching merchants to overcharge adventurers...',
  '[docker]   Container rpgon-backend healthy                     ✓',
];

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export default function BootLog({ done = false }) {
  const [lines, setLines] = useState([]);
  const poolRef = useRef(null);
  const scrollRef = useRef(null);

  if (!poolRef.current) poolRef.current = shuffle(ALL_LINES);

  useEffect(() => {
    if (done) return undefined;

    let idx = lines.length;
    let timer = null;

    const addNext = () => {
      if (idx >= poolRef.current.length) return;
      setLines((prev) => [...prev, poolRef.current[idx]]);
      idx++;
      timer = setTimeout(addNext, 400 + Math.random() * 400);
    };

    timer = setTimeout(addNext, 300 + Math.random() * 300);
    return () => clearTimeout(timer);
  }, [done]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [lines.length]);

  return (
    <div
      ref={scrollRef}
      className="w-full max-w-lg max-h-48 overflow-y-auto rounded-lg border border-[rgba(197,154,255,0.1)]
                 bg-[rgba(14,14,16,0.7)] px-4 py-3 font-mono text-[11px] leading-relaxed
                 custom-scrollbar select-none"
    >
      {lines.map((line, i) => (
        <div
          key={i}
          className="animate-fade-in whitespace-pre"
          style={{ color: line.endsWith('✓') ? '#7ee787' : 'rgba(180,180,190,0.75)' }}
        >
          {line}
        </div>
      ))}
      {!done && lines.length < poolRef.current.length && (
        <span className="inline-block w-1.5 h-3.5 bg-[rgba(180,180,190,0.6)] animate-cursor-blink ml-0.5 align-middle" />
      )}
    </div>
  );
}
