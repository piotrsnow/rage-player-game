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
  '[alchemy]  Brewing 12 volatile potions...                      OK',
  '[map]      Tessellating hex grid (1024x1024)...                OK',
  '[shader]   Compiling volumetric fog pass...                    OK',
  '[dungeon]  Seeding procedural catacombs (depth: 7)...          OK',
  '[ai-ctx]   Warming nano intent classifier...                   OK',
  '[tts]      Connecting to bardic speech synthesis...             OK',
  '[physics]  Bootstrapping ragdoll constraints...                OK',
  '[save]     Verifying campaign checksum integrity...             OK',
  '[guild]    Registering 8 faction reputation graphs...           OK',
  '[weather]  Simulating 30-day forecast for Yeralden...           OK',
  '[trade]    Populating merchant inventories (438 items)...       OK',
  '[bestiary] Indexing 127 creature stat blocks...                 OK',
  '[road]     Computing Dijkstra shortest paths...                 OK',
  '[crafting] Loading 64 recipe schematics...                     OK',
  '[socket]   Opening WebSocket tunnel to multiverse...            OK',
  '[terrain]  Generating heightmap normals...                      OK',
  '[journal]  Rebuilding adventure log index...                    OK',
  '[spell]    Validating 9 arcane skill trees...                   OK',
  '[npc-ai]   Assigning personality quirks to 47 NPCs...',
  '[lore]     Injecting 12 world lore sections...                  OK',
  '[docker]   Warming up sidecar containers...                     OK',
  '[quest]    Linking prerequisite chains (depth: 3)...            OK',
  '[embed]    Building HNSW index (ef=200, M=16)...               OK',
  '[crown]    Minting 10,000 Zlote Korony into treasury...         OK',
  '[karma]    Calibrating moral consequence engine...              OK',
  '[portal]   Stabilizing interdimensional gateway...              OK',
  '[rumor]    Distributing hearsay across 6 taverns...             OK',
  '[scroll]   Transcribing ancient spell scrolls...                OK',
  '[arena]    Scheduling gladiator tournament brackets...           OK',
  '[rng]      Seeding entropy pool (source: cosmic noise)...       OK',
  '[tavern]   Hiring suspicious bartender (loyalty: 12%)...',
  '[vault]    Encrypting player secrets (AES-256-GCM)...           OK',
  '[mount]    Saddling 3 griffons for fast travel...               OK',
  '[docker]   All services nominal                                ✓',
];

const STATUS_RE = /^(.+?)\s{2,}(OK|done|✓)$/;

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
      className="w-[52rem] h-[26rem] overflow-y-auto rounded-lg border border-[rgba(197,154,255,0.1)]
                 bg-[rgba(14,14,16,0.7)] px-8 py-6 font-mono text-[16px] leading-relaxed
                 custom-scrollbar select-none"
    >
      {lines.map((line, i) => {
        const m = line.match(STATUS_RE);
        if (m) {
          return (
            <div key={i} className="animate-fade-in flex justify-between gap-4" style={{ color: 'rgba(180,180,190,0.75)' }}>
              <span>{m[1]}</span>
              <span className="shrink-0" style={m[2] === '✓' ? { color: '#7ee787' } : undefined}>{m[2]}</span>
            </div>
          );
        }
        return (
          <div key={i} className="animate-fade-in" style={{ color: 'rgba(180,180,190,0.75)' }}>
            {line}
          </div>
        );
      })}
      {!done && lines.length < poolRef.current.length && (
        <span className="inline-block w-3 h-7 bg-[rgba(180,180,190,0.6)] animate-cursor-blink ml-1 align-middle" />
      )}
    </div>
  );
}
