import { callAIJson, parseJsonOrNull } from './aiJsonCall.js';

const ATTR_KEYS = ['sila', 'inteligencja', 'charyzma', 'zrecznosc', 'wytrzymalosc', 'szczescie'];

function buildCharacterBlock(character) {
  const safe = character || {};
  const attrs = safe.attributes || {};
  const attrSummary = ATTR_KEYS
    .map((k) => `${k}=${Number(attrs[k] ?? 0)}`)
    .join(', ');

  const skills = safe.topSkills || [];
  const skillLine = skills.length > 0
    ? skills.map((s) => `${s.name} ${s.level}`).join(', ')
    : 'brak wyróżniających się umiejętności';

  const factions = safe.factions || {};
  const factionLines = Object.entries(factions)
    .map(([name, rep]) => `${name}: ${rep}`)
    .join(', ');

  const lines = [
    `Imię: ${safe.name || 'Nieznany'}`,
    `Rasa: ${safe.species || 'człowiek'}`,
    `Płeć: ${safe.gender || 'nieznana'}`,
    `Poziom: ${safe.level || 1}`,
    `Atrybuty: ${attrSummary}`,
    `Główne umiejętności: ${skillLine}`,
    factionLines ? `Reputacja frakcyjna: ${factionLines}` : null,
    safe.backstory ? `Tło: ${String(safe.backstory).slice(0, 400)}` : null,
    safe.titles?.length ? `Tytuły: ${safe.titles.join(', ')}` : null,
  ];
  return lines.filter(Boolean).join('\n');
}

function buildCampaignBlock(digest) {
  const safe = digest || {};
  const lines = [
    `Liczba scen: ${safe.sceneCount || 0}`,
  ];

  if (safe.quests?.length) {
    const questLines = safe.quests
      .slice(0, 8)
      .map((q) => `  - ${q.name}${q.completed ? ' (ukończony)' : ''}`)
      .join('\n');
    lines.push(`Zadania:\n${questLines}`);
  }

  if (safe.recentActions?.length) {
    const actionLines = safe.recentActions
      .slice(0, 15)
      .map((a) => {
        let line = `  - ${a.action}`;
        if (a.roll) line += ` [rzut ${a.roll.skill}: ${a.roll.success ? 'sukces' : 'porażka'}]`;
        return line;
      })
      .join('\n');
    lines.push(`Ostatnie akcje:\n${actionLines}`);
  }

  if (safe.factionChanges?.length) {
    const fLines = safe.factionChanges
      .slice(0, 10)
      .map((f) => `  - ${f.faction}: ${f.delta > 0 ? '+' : ''}${f.delta}`)
      .join('\n');
    lines.push(`Zmiany reputacji frakcyjnej:\n${fLines}`);
  }

  return lines.join('\n');
}

export async function generateReputationNarrative({
  character,
  campaignDigest,
  language = 'pl',
  provider = 'openai',
  model = null,
  userApiKeys = null,
  userId = null,
} = {}) {
  const isPolish = language === 'pl';

  const systemPrompt = isPolish
    ? 'Jesteś kronikarzem i bardem świata RPG. Na podstawie profilu postaci i jej przygód piszesz żywy, barwny opis tego, jakie opinie, plotki i legendy krążą o tej postaci po świecie gry. Piszesz w drugiej osobie lub z perspektywy mieszkańców świata (karczmarzy, kupców, żołnierzy, wieśniaków). Odpowiadaj wyłącznie poprawnym JSON.'
    : 'You are a chronicler and bard of an RPG world. Based on a character profile and their adventures, you write vivid, colorful descriptions of what opinions, rumors and legends circulate about this character in the game world. Write from the perspective of world inhabitants (innkeepers, merchants, soldiers, villagers). Respond with valid JSON only.';

  const characterBlock = buildCharacterBlock(character);
  const campaignBlock = buildCampaignBlock(campaignDigest);

  const userPrompt = [
    isPolish
      ? 'Napisz 2-4 akapity opisujące jakie opinie, plotki i pogłoski krążą o tej postaci w świecie gry. Uwzględnij:'
      : 'Write 2-4 paragraphs describing what opinions, rumors and gossip circulate about this character in the game world. Include:',
    isPolish
      ? '- Co mówią o postaci karczmiarze i zwykli ludzie\n- Jak postrzegają ją przedstawiciele frakcji (jeśli ma z nimi relacje)\n- Jakie plotki i legendy narosły wokół jej czynów\n- Ogólny wydźwięk reputacji (heroiczna/groźna/nieznana/żałosna)'
      : '- What innkeepers and common folk say about the character\n- How faction members perceive them (if any faction relations exist)\n- What rumors and legends have grown around their deeds\n- Overall reputation vibe (heroic/fearsome/unknown/pathetic)',
    isPolish
      ? 'Jeśli postać ma mało przygód, napisz że jest jeszcze mało znana, ale wspominając to co już zrobiła. Bądź kreatywny, używaj mowy potocznej mieszkańców fantasy świata.'
      : 'If the character has few adventures, write that they are still relatively unknown, while mentioning what they have done. Be creative, use colloquial speech of fantasy world inhabitants.',
    `\nPROFIL POSTACI:\n${characterBlock}`,
    `\nPRZEBIEG PRZYGÓD:\n${campaignBlock}`,
    isPolish
      ? `\nPisz w języku polskim. Zwróć JSON: { "reputation": "<tekst reputacji, 2-4 akapity oddzielone \\n\\n>" }`
      : `\nWrite in English. Return JSON: { "reputation": "<reputation text, 2-4 paragraphs separated by \\n\\n>" }`,
  ].join('\n\n');

  const result = await callAIJson({
    provider,
    model,
    modelTier: 'standard',
    taskCategory: 'reputationNarrative',
    systemPrompt,
    userPrompt,
    maxTokens: 1200,
    temperature: 0.9,
    userApiKeys,
    userId,
    taskType: 'reputation-narrative',
    taskLabel: 'Generate character reputation narrative',
  });

  const parsed = parseJsonOrNull(result.text);
  if (parsed?.reputation && typeof parsed.reputation === 'string') {
    return { reputation: parsed.reputation.trim() };
  }

  const fallback = (result.text || '').trim();
  return {
    reputation: fallback || null,
    meta: { degraded: true, reason: fallback ? 'missing_reputation_field' : 'empty_response' },
  };
}
