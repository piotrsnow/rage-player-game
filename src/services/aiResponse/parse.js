import { hasNamedSpeaker } from '../dialogueSegments.js';
import { SceneResponseSchema, CampaignResponseSchema } from './schemas.js';
import { shortId } from '../../utils/ids';

export function safeParseJSON(raw) {
  if (typeof raw === 'object' && raw !== null) return { ok: true, data: raw };
  try {
    return { ok: true, data: JSON.parse(raw) };
  } catch {
    const jsonMatch = String(raw).match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      try {
        return { ok: true, data: JSON.parse(jsonMatch[0]) };
      } catch {
        return { ok: false, error: 'Failed to extract JSON from response' };
      }
    }
    return { ok: false, error: 'Response is not valid JSON' };
  }
}

export function safeParseAIResponse(raw, schema, { language } = {}) {
  const jsonResult = safeParseJSON(raw);
  if (!jsonResult.ok) {
    return { ok: false, error: jsonResult.error, data: null };
  }

  const normalizedData = schema === SceneResponseSchema
    ? normalizeSceneResponseCandidate(jsonResult.data, language)
    : schema === CampaignResponseSchema
      ? normalizeCampaignResponseCandidate(jsonResult.data)
      : jsonResult.data;

  const parsed = schema.safeParse(normalizedData);
  if (parsed.success) {
    return { ok: true, data: parsed.data, error: null };
  }

  console.warn('[aiResponse/parse] Schema validation failed, using raw data with defaults:', parsed.error.issues?.slice(0, 5));

  // Second attempt: merge defaults under the data (data fields take priority)
  const withDefaults = { ...getSchemaDefaults(schema), ...normalizedData };
  const partial = schema.safeParse(withDefaults);
  if (partial.success) {
    return { ok: true, data: partial.data, error: null };
  }

  // Third attempt: fix specific fields that failed validation
  if (schema === SceneResponseSchema) {
    const defaults = getSchemaDefaults(schema);
    const patched = { ...withDefaults };
    for (const issue of (parsed.error?.issues || [])) {
      const topField = issue.path?.[0];
      if (topField && defaults[topField] !== undefined) {
        patched[topField] = defaults[topField];
      }
    }
    // Ensure suggestedActions has exactly 3 items
    if (!Array.isArray(patched.suggestedActions) || patched.suggestedActions.length !== 3) {
      patched.suggestedActions = defaults.suggestedActions;
    }
    // Ensure narrative is non-empty
    if (typeof patched.narrative !== 'string' || !patched.narrative.trim()) {
      patched.narrative = defaults.narrative;
    }
    const lastChance = schema.safeParse(patched);
    if (lastChance.success) {
      return { ok: true, data: lastChance.data, error: null };
    }
  }

  return {
    ok: false,
    data: normalizedData,
    error: `Schema validation failed — ${formatZodIssues(parsed.error?.issues) || 'raw JSON returned unvalidated'}`
  };
}

function formatZodIssues(issues = []) {
  if (!Array.isArray(issues) || issues.length === 0) return '';
  return issues
    .slice(0, 3)
    .map((issue) => {
      const path = Array.isArray(issue.path) && issue.path.length > 0
        ? issue.path.join('.')
        : 'root';
      return `${path}: ${issue.message}`;
    })
    .join('; ');
}

function normalizeSceneResponseCandidate(rawData, explicitLanguage) {
  if (!rawData || typeof rawData !== 'object') return rawData;

  const data = { ...rawData };
  const normalizeAction = (action) => String(action || '')
    .toLowerCase()
    .trim()
    .replace(/[.,!?;:()[\]{}"']/g, '')
    .replace(/\s+/g, ' ');

  if (data.dialogueSegments == null || !Array.isArray(data.dialogueSegments)) {
    data.dialogueSegments = [];
  } else {
    data.dialogueSegments = data.dialogueSegments
      .filter(Boolean)
      .map((segment) => {
        if (!segment || typeof segment !== 'object') {
          return { type: 'narration', text: String(segment ?? '') };
        }
        return {
          ...segment,
          type: segment.type === 'dialogue' ? 'dialogue' : 'narration',
          text: typeof segment.text === 'string' ? segment.text : String(segment.text ?? ''),
          ...(typeof segment.character === 'string' && hasNamedSpeaker(segment.character)
            ? { character: segment.character.trim() }
            : {}),
          ...(typeof segment.gender === 'string' ? { gender: segment.gender } : {}),
        };
      });
  }

  if (data.suggestedActions == null) {
    data.suggestedActions = extractFallbackActions(data, explicitLanguage) || undefined;
  } else if (Array.isArray(data.suggestedActions)) {
    const seen = new Set();
    const dedupedActions = data.suggestedActions
      .map((action) => (typeof action === 'string' ? action.trim() : String(action ?? '').trim()))
      .filter(Boolean)
      .filter((action) => {
        const key = normalizeAction(action);
        if (!key || seen.has(key)) return false;
        seen.add(key);
        return true;
      });
    data.suggestedActions = contextualizeSuggestedActions(dedupedActions, data).slice(0, 3);
    if (data.suggestedActions.length === 0) {
      data.suggestedActions = extractFallbackActions(data, explicitLanguage) || undefined;
    }
  } else if (typeof data.suggestedActions === 'string') {
    const single = data.suggestedActions.trim();
    data.suggestedActions = single
      ? contextualizeSuggestedActions([single], data).slice(0, 3)
      : extractFallbackActions(data, explicitLanguage) || undefined;
  } else {
    data.suggestedActions = extractFallbackActions(data, explicitLanguage) || undefined;
  }

  // Ensure suggestedActions always has exactly 3 items.
  const lang = explicitLanguage || inferNarrativeLanguage(data.narrative || '');
  const defaultActions = lang === 'pl'
    ? ['Rozglądam się dookoła', 'Badam okolicę', 'Pytam najbliższą osobę o szczegóły']
    : ['I look around', 'I investigate the area', 'I ask the nearest person for details'];
  const fallbackPool = extractFallbackActions(data) || [];
  const normalizedSeen = new Set();
  const completedActions = [];
  const appendUnique = (action) => {
    const trimmed = typeof action === 'string' ? action.trim() : '';
    if (!trimmed) return;
    const key = normalizeAction(trimmed);
    if (!key || normalizedSeen.has(key)) return;
    normalizedSeen.add(key);
    completedActions.push(trimmed);
  };
  if (Array.isArray(data.suggestedActions)) {
    data.suggestedActions.forEach(appendUnique);
  }
  fallbackPool.forEach(appendUnique);
  defaultActions.forEach(appendUnique);
  data.suggestedActions = completedActions.slice(0, 3);

  if (data.atmosphere == null || typeof data.atmosphere !== 'object' || Array.isArray(data.atmosphere)) {
    data.atmosphere = {};
  }

  // Filter non-object items from top-level questOffers
  if (Array.isArray(data.questOffers)) {
    data.questOffers = data.questOffers.filter(
      (item) => item && typeof item === 'object' && !Array.isArray(item)
    );
  }

  // diceRoll is resolved by the game engine, not AI — strip if AI returns it
  if (data.diceRoll !== undefined) {
    delete data.diceRoll;
  }

  if (data.stateChanges == null || typeof data.stateChanges !== 'object' || Array.isArray(data.stateChanges)) {
    data.stateChanges = {};
  }

  // Filter out non-object items from stateChanges arrays (AI sometimes returns plain strings)
  const arrayFields = ['codexUpdates', 'narrativeSeeds', 'npcAgendas', 'npcs', 'questUpdates', 'pendingCallbacks', 'questOffers'];
  for (const field of arrayFields) {
    if (Array.isArray(data.stateChanges[field])) {
      data.stateChanges[field] = data.stateChanges[field].filter(
        (item) => item && typeof item === 'object' && !Array.isArray(item)
      );
    }
  }

  const rawTimeAdvance = data.stateChanges?.timeAdvance;
  if (typeof rawTimeAdvance === 'number' && Number.isFinite(rawTimeAdvance)) {
    data.stateChanges.timeAdvance = { hoursElapsed: rawTimeAdvance, newDay: false };
  } else if (typeof rawTimeAdvance === 'string') {
    const parsedHours = Number(rawTimeAdvance);
    if (Number.isFinite(parsedHours)) {
      data.stateChanges.timeAdvance = { hoursElapsed: parsedHours, newDay: false };
    } else {
      data.stateChanges.timeAdvance = undefined;
    }
  } else if (rawTimeAdvance != null && (typeof rawTimeAdvance !== 'object' || Array.isArray(rawTimeAdvance))) {
    data.stateChanges.timeAdvance = undefined;
  }

  if (data.narrative != null && typeof data.narrative !== 'string') {
    data.narrative = String(data.narrative);
  }

  return data;
}

function normalizeCampaignResponseCandidate(rawData) {
  if (!rawData || typeof rawData !== 'object') return rawData;

  const data = { ...rawData };

  if (data.firstScene && typeof data.firstScene === 'object') {
    const fs = { ...data.firstScene };
    const normalizeAction = (action) => String(action || '')
      .toLowerCase()
      .trim()
      .replace(/[.,!?;:()[\]{}"']/g, '')
      .replace(/\s+/g, ' ');

    if (fs.atmosphere == null || typeof fs.atmosphere !== 'object' || Array.isArray(fs.atmosphere)) {
      fs.atmosphere = {};
    }

    if (fs.dialogueSegments == null || !Array.isArray(fs.dialogueSegments)) {
      fs.dialogueSegments = [];
    } else {
      fs.dialogueSegments = fs.dialogueSegments
        .filter(Boolean)
        .map((segment) => {
          if (!segment || typeof segment !== 'object') {
            return { type: 'narration', text: String(segment ?? '') };
          }
          return {
            ...segment,
            type: segment.type === 'dialogue' ? 'dialogue' : 'narration',
            text: typeof segment.text === 'string' ? segment.text : String(segment.text ?? ''),
            ...(typeof segment.character === 'string' && hasNamedSpeaker(segment.character)
              ? { character: segment.character.trim() }
              : {}),
            ...(typeof segment.gender === 'string' ? { gender: segment.gender } : {}),
          };
        });
    }

    if (Array.isArray(fs.suggestedActions)) {
      const seen = new Set();
      fs.suggestedActions = fs.suggestedActions
        .map((a) => (typeof a === 'string' ? a.trim() : String(a ?? '').trim()))
        .filter(Boolean)
        .filter((action) => {
          const key = normalizeAction(action);
          if (!key || seen.has(key)) return false;
          seen.add(key);
          return true;
        });
    }

    data.firstScene = fs;
  }

  if (data.initialQuest && typeof data.initialQuest === 'object') {
    if (!data.initialQuest.id) {
      data.initialQuest = {
        ...data.initialQuest,
        id: `quest_${Date.now()}_${shortId(5)}`,
      };
    }
    if (Array.isArray(data.initialQuest.objectives)) {
      data.initialQuest.objectives = data.initialQuest.objectives.map((obj, i) => {
        if (obj && typeof obj === 'object' && !obj.id) {
          return { ...obj, id: obj.id || `obj_${i + 1}` };
        }
        return obj;
      });
    }
    if (Array.isArray(data.initialQuest.questItems)) {
      data.initialQuest.questItems = data.initialQuest.questItems.map((item, i) => {
        if (item && typeof item === 'object' && !item.id) {
          return { ...item, id: item.id || `qitem_${i + 1}` };
        }
        return item;
      });
    }
  }

  if (Array.isArray(data.initialNPCs)) {
    data.initialNPCs = data.initialNPCs.filter(
      (npc) => npc && typeof npc === 'object' && typeof npc.name === 'string',
    );
  }

  return data;
}

const FALLBACK_ACTION_VARIANTS = {
  pl: {
    investigate: [
      'Przyglądam się uważnie temu miejscu',
      'Sprawdzam dokładnie, co tu się naprawdę dzieje',
      'Analizuję sytuację i szukam istotnych szczegółów',
      'Rozpoznaję teren, zanim podejmę kolejny krok',
    ],
    approach: [
      'Podchodzę ostrożnie bliżej źródła zamieszania',
      'Zbliżam się i próbuję zebrać więcej informacji',
      'Wchodzę bliżej, ale pozostaję czujny',
      'Przesuwam się naprzód, obserwując reakcje otoczenia',
    ],
    prepare: [
      'Szukam korzystniejszej pozycji, zanim ruszę dalej',
      'Przygotowuję się na możliwe kłopoty',
      'Sprawdzam drogę odwrotu i możliwe osłony',
      'Ustawiam się tak, by mieć przewagę, jeśli zrobi się gorąco',
    ],
    observe: [
      'Czekam chwilę i obserwuję rozwój wydarzeń',
      'Wstrzymuję się i nasłuchuję, co wydarzy się dalej',
      'Daję sytuacji moment i obserwuję reakcje ludzi',
      'Pozostaję w ukryciu i patrzę, kto wykona pierwszy ruch',
    ],
  },
  en: {
    investigate: [
      'I study the area carefully',
      'I examine what is really happening here',
      'I analyze the situation for useful details',
      'I scout the scene before making my next move',
    ],
    approach: [
      'I move closer with caution to gather more information',
      'I approach carefully and watch for reactions',
      'I step forward and try to understand the source of trouble',
      'I close the distance while staying alert',
    ],
    prepare: [
      'I look for a safer position before committing',
      'I get ready in case this turns dangerous',
      'I check my escape route and possible cover',
      'I position myself for an advantage if things escalate',
    ],
    observe: [
      'I wait a moment and observe how this unfolds',
      'I hold position and listen for what happens next',
      'I stay quiet and watch the people around me',
      'I keep to the side and see who acts first',
    ],
  },
};

function inferNarrativeLanguage(text = '') {
  if (!text || typeof text !== 'string') return 'en';
  const hasPolishDiacritics = /[ąćęłńóśźż]/i.test(text);
  if (hasPolishDiacritics) return 'pl';
  const polishSignals = /\b(i|oraz|się|jest|nie|czy|który|gdzie|teraz|wokół|ostrożnie|chwila)\b/i;
  return polishSignals.test(text) ? 'pl' : 'en';
}

const GENERIC_ACTION_PATTERNS = [
  // English
  /^(look around|keep going|move on|continue|wait|observe|investigate|explore|talk to (?:someone|npc)|ask around|check surroundings|search area)$/i,
  /^i (?:look around|keep going|move on|continue|wait|observe|investigate|explore|ask around|check surroundings|search the area)$/i,
  /^i talk to (?:someone|an npc|npc)$/i,
  // Polish
  /^(rozejrzyj się|idź dalej|kontynuuj|czekaj|obserwuj|zbadaj|eksploruj|porozmawiaj z kimś|popytaj|sprawdź okolicę)$/i,
  /^(rozglądam się|idę dalej|kontynuuję|czekam|obserwuję|badam|eksploruję|pytam (?:wokół|ludzi)|sprawdzam okolicę)$/i,
  /^mówię do kogoś$/i,
];

function summarizeNarrativeDetail(text = '', language = 'en') {
  const compact = String(text || '').replace(/\s+/g, ' ').trim();
  if (!compact) {
    return language === 'pl' ? 'to, co właśnie się wydarzyło' : 'what just happened';
  }
  const quoteMatch = compact.match(/[„"«]([^"”»„«]{8,90})[”"»]/);
  if (quoteMatch?.[1]) return quoteMatch[1].trim();
  const sentence = compact.split(/[.!?]\s+/).find(Boolean) || compact;
  return sentence.slice(0, 90).trim();
}

function buildActionAnchors(data) {
  const narrative = typeof data?.narrative === 'string' ? data.narrative : '';
  const language = inferNarrativeLanguage(narrative);
  const npcs = (data?.stateChanges?.npcs || [])
    .map((npc) => (typeof npc?.name === 'string' ? npc.name.trim() : ''))
    .filter(Boolean);
  const currentLocation = typeof data?.stateChanges?.currentLocation === 'string'
    ? data.stateChanges.currentLocation.trim()
    : '';
  const detail = summarizeNarrativeDetail(narrative, language);
  return {
    language,
    npc: npcs[0] || '',
    location: currentLocation,
    detail,
  };
}

function isGenericAction(action = '') {
  const normalized = String(action || '').trim();
  if (!normalized) return true;
  if (normalized.length <= 12) return true;
  return GENERIC_ACTION_PATTERNS.some((pattern) => pattern.test(normalized));
}

function contextualizeGenericAction(action, anchors, index = 0) {
  const language = anchors?.language || 'en';
  const npc = anchors?.npc || '';
  const location = anchors?.location || '';
  const detail = anchors?.detail || (language === 'pl' ? 'to, co się stało' : 'what happened');

  const plTemplates = [
    npc
      ? `Podchodzę do ${npc} i wypytuję o szczegóły: "${detail}".`
      : `Sprawdzam dokładnie szczegóły tego, co właśnie zaszło: "${detail}".`,
    location
      ? `Idę w stronę ${location} i badam ślady związane z: "${detail}".`
      : `Szukam źródła zamieszania i badam ślady związane z: "${detail}".`,
    npc
      ? `Mówię do ${npc}: "Powiedz mi dokładnie, co oznacza: ${detail}?"`
      : `Mówię: "Kto mi wyjaśni, co dokładnie się tu wydarzyło?"`,
    location
      ? `Przeszukuję ${location}, żeby znaleźć konkretne dowody dotyczące: "${detail}".`
      : `Rozglądam się za konkretnym tropem związanym z: "${detail}".`,
  ];

  const enTemplates = [
    npc
      ? `I approach ${npc} and press for details about "${detail}".`
      : `I inspect the scene closely to clarify "${detail}".`,
    location
      ? `I head to ${location} and investigate traces tied to "${detail}".`
      : `I track down the source of trouble linked to "${detail}".`,
    npc
      ? `I tell ${npc}: "Explain exactly what happened with ${detail}."`
      : 'I say: "Who saw what happened here? Start from the beginning."',
    location
      ? `I search ${location} for concrete evidence about "${detail}".`
      : `I look for a concrete lead connected to "${detail}".`,
  ];

  const pool = language === 'pl' ? plTemplates : enTemplates;
  return pool[index % pool.length];
}

function contextualizeSuggestedActions(actions, data) {
  if (!Array.isArray(actions) || actions.length === 0) return [];
  const anchors = buildActionAnchors(data);
  const normalized = actions.map((action, index) => (
    isGenericAction(action)
      ? contextualizeGenericAction(action, anchors, index)
      : String(action).trim()
  ));
  const seen = new Set();
  return normalized.filter((action) => {
    const key = String(action || '').toLowerCase().trim();
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function pickVariant(variants, seed, offset = 0) {
  if (!Array.isArray(variants) || variants.length === 0) return '';
  return variants[(seed + offset) % variants.length];
}

function extractFallbackActions(data, explicitLanguage) {
  if (!data?.narrative || typeof data.narrative !== 'string') return null;
  const text = data.narrative;
  const language = explicitLanguage || inferNarrativeLanguage(text);
  const npcs = (data.stateChanges?.npcs || []).map(n => n.name).filter(Boolean);
  const loc = data.stateChanges?.currentLocation;
  const firstQuestOffer = Array.isArray(data.questOffers) && data.questOffers.length > 0
    ? data.questOffers[0]
    : null;
  const questObjective = firstQuestOffer?.objectives?.[0]?.description || firstQuestOffer?.completionCondition || firstQuestOffer?.name || '';
  const detail = summarizeNarrativeDetail(text, language);
  const actions = [];
  const templates = FALLBACK_ACTION_VARIANTS[language] || FALLBACK_ACTION_VARIANTS.en;
  const seedBase = [...text].reduce((acc, ch) => acc + ch.charCodeAt(0), 0) + (npcs[0]?.length || 0) + (loc?.length || 0);

  if (npcs.length > 0) {
    actions.push(language === 'pl'
      ? `Podchodzę do ${npcs[0]} i zaczynam rozmowę`
      : `I approach ${npcs[0]} and start a conversation`);
  }
  if (loc) {
    actions.push(language === 'pl'
      ? `Idę zbadać ${loc} i sprawdzam, co tam nie pasuje do sytuacji`
      : `I head over to investigate ${loc} and verify what does not add up`);
  }
  if (questObjective) {
    actions.push(language === 'pl'
      ? `Skupiam się na celu questu: ${questObjective}`
      : `I focus on the active objective: ${questObjective}`);
  }

  actions.push(language === 'pl'
    ? `Analizuję konkretny trop z tej sceny: "${detail}".`
    : `I focus on a concrete lead from this scene: "${detail}".`);
  actions.push(pickVariant(templates.investigate, seedBase, 0));
  actions.push(pickVariant(templates.approach, seedBase, 1));
  actions.push(pickVariant(templates.prepare, seedBase, 2));
  actions.push(pickVariant(templates.observe, seedBase, 3));
  actions.push(language === 'pl'
    ? (npcs[0] ? `Mówię do ${npcs[0]}: "Spokojnie, opowiedz mi po kolei, co tu zaszło."` : 'Mówię: "Spokojnie, opowiedzcie mi po kolei, co tu zaszło."')
    : (npcs[0] ? `I tell ${npcs[0]}: "Easy now. Start from the beginning and tell me exactly what happened."` : 'I say: "Easy now. Start from the beginning and tell me exactly what happened."'));
  actions.push(language === 'pl'
    ? (npcs[0] ? `Krzyczę do ${npcs[0]}: "Na Sigmara, bez gierek - chcę prawdy, teraz!"` : 'Krzyczę: "Na Sigmara, bez gierek - chcę prawdy, teraz!"')
    : (npcs[0] ? `I shout to ${npcs[0]}: "By Sigmar, no games - I want the truth, now!"` : 'I shout: "By Sigmar, no games - I want the truth, now!"'));

  const uniqueActions = actions
    .map((action) => (typeof action === 'string' ? action.trim() : ''))
    .filter(Boolean)
    .filter((action, index, arr) => arr.indexOf(action) === index);

  return uniqueActions.length >= 1 ? uniqueActions.slice(0, 3) : null;
}

function getSchemaDefaults(schema) {
  if (schema === SceneResponseSchema) {
    return {
      narrative: '...',
      dialogueSegments: [],
      suggestedActions: ['Rozglądam się dookoła', 'Badam okolicę', 'Pytam najbliższą osobę o szczegóły'],
      questOffers: [],
      stateChanges: {},
      atmosphere: {},
    };
  }
  if (schema === CampaignResponseSchema) {
    return {
      name: 'Unnamed Campaign',
      worldDescription: 'A mysterious world.',
      hook: 'An adventure begins...',
      firstScene: { narrative: 'The adventure starts...', suggestedActions: [], dialogueSegments: [] },
      initialWorldFacts: [],
    };
  }
  return {};
}
