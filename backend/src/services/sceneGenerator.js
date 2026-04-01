import { prisma } from '../lib/prisma.js';
import { requireServerApiKey } from './apiKeyService.js';
import { parseProviderError, toClientAiError, AIServiceError } from './aiErrors.js';
import {
  CONTEXT_TOOLS_OPENAI,
  CONTEXT_TOOLS_ANTHROPIC,
  executeToolCall,
} from './aiContextTools.js';
import {
  embedText,
  buildSceneEmbeddingText,
  buildKnowledgeEmbeddingText,
  buildNPCEmbeddingText,
  buildCodexEmbeddingText,
} from './embeddingService.js';
import { writeEmbedding } from './vectorSearchService.js';

const MAX_TOOL_ROUNDS = 3;

/**
 * Build a lean system prompt from the campaign's core state and recent scenes.
 */
function buildLeanSystemPrompt(coreState, recentScenes, language = 'pl') {
  const cs = coreState;
  const campaign = cs.campaign || {};
  const character = cs.character || {};
  const world = cs.world || {};
  const quests = cs.quests || {};

  const sections = [];

  // Campaign info
  sections.push(
    `You are the Game Master (DM) for a WFRP 4th Edition RPG campaign.
Campaign: "${campaign.name || 'Unnamed'}"
Genre: ${campaign.genre || 'Fantasy'} | Tone: ${campaign.tone || 'Dark'} | Style: ${campaign.style || 'Narrative'}
Difficulty: ${campaign.difficulty || 'Normal'}
World: ${campaign.worldDescription || 'A dark fantasy world.'}
Hook: ${campaign.hook || ''}`,
  );

  // Character summary
  const charLines = [`Player Character: ${character.name || 'Unknown'}`];
  if (character.species) charLines.push(`Species: ${character.species}`);
  if (character.career) charLines.push(`Career: ${character.career.name || ''} (${character.career.tierName || ''})`);
  if (character.characteristics) {
    const chars = character.characteristics;
    charLines.push(
      `Stats: WS:${chars.ws || 0} BS:${chars.bs || 0} S:${chars.s || 0} T:${chars.t || 0} I:${chars.i || 0} AG:${chars.ag || 0} DEX:${chars.dex || 0} INT:${chars.int || 0} WP:${chars.wp || 0} FEL:${chars.fel || 0}`,
    );
  }
  charLines.push(`Wounds: ${character.wounds ?? 0}/${character.maxWounds ?? 0}`);
  if (character.fate != null) charLines.push(`Fate: ${character.fate} Fortune: ${character.fortune ?? 0}`);
  if (character.skills && Object.keys(character.skills).length > 0) {
    charLines.push(`Skills: ${Object.entries(character.skills).map(([k, v]) => `${k}(${v})`).join(', ')}`);
  }
  if (character.talents?.length) charLines.push(`Talents: ${character.talents.join(', ')}`);
  if (character.inventory?.length) {
    charLines.push(`Inventory: ${character.inventory.map((i) => i.name || i).join(', ')}`);
  }
  sections.push(charLines.join('\n'));

  // Current world state
  const worldLines = [];
  if (world.currentLocation) worldLines.push(`Current Location: ${world.currentLocation}`);
  if (world.timeState) {
    const ts = world.timeState;
    worldLines.push(`Time: Day ${ts.day || 1}, ${ts.time || '12:00'}, ${ts.season || 'spring'}`);
  }
  if (world.factions?.length) {
    worldLines.push(`Factions: ${world.factions.map((f) => `${f.name}(rep:${f.reputation || 0})`).join(', ')}`);
  }
  if (worldLines.length) sections.push(worldLines.join('\n'));

  // Active quests (names + objectives only)
  if (quests.active?.length) {
    const questLines = ['Active Quests:'];
    for (const q of quests.active.slice(0, 5)) {
      questLines.push(`- ${q.name}: ${q.description || ''}`);
      if (q.objectives?.length) {
        for (const obj of q.objectives) {
          questLines.push(`  ${obj.completed ? '[X]' : '[ ]'} ${obj.description}`);
        }
      }
    }
    sections.push(questLines.join('\n'));
  }

  // Recent scenes
  if (recentScenes.length > 0) {
    const sceneLines = ['Recent History:'];
    for (const scene of recentScenes) {
      const action = scene.chosenAction ? `Player: ${scene.chosenAction}\n` : '';
      const narrative =
        scene.narrative.length > 500
          ? scene.narrative.slice(0, 500) + '...'
          : scene.narrative;
      sceneLines.push(`[Scene ${scene.sceneIndex}] ${action}${narrative}`);
    }
    sections.push(sceneLines.join('\n\n'));
  }

  // Tool instructions
  sections.push(
    `IMPORTANT: You have access to tools to look up campaign information. Use them when you need:
- Past events or story details: use search_campaign_memory
- NPC details: use get_npc_details
- Quest details: use get_quest_details
- Location info: use get_location_history
- Lore/codex: use get_codex_entry

You do NOT need to use tools for every response. Only use them when the player's action references something you need more context about.`,
  );

  // Response format
  sections.push(
    `RESPONSE FORMAT: Return a valid JSON object with these fields:
{
  "narrative": "Scene narration text (required)",
  "dialogueSegments": [{"type": "narration"|"dialogue", "text": "...", "character": "...", "gender": "male"|"female"}],
  "suggestedActions": ["action1", "action2", "action3"],
  "stateChanges": { /* wounds, items, quests, npcs, etc. */ },
  "scenePacing": "exploration"|"combat"|"dialogue"|"travel_montage"|"dramatic"|"rest"|"celebration"|"chase"|"stealth"|"dream"|"cutscene",
  "diceRoll": null or {"type":"...", "skill":"...", "characteristic":"ws"|"bs"|"s"|"t"|"i"|"ag"|"dex"|"int"|"wp"|"fel", "target": N, "roll": N, "sl": N, "success": bool},
  "atmosphere": {"weather":"...", "mood":"...", "lighting":"...", "particles":"none", "transition":"dissolve"},
  "sceneGrid": null,
  "imagePrompt": "short image description for scene illustration",
  "soundEffect": null,
  "musicPrompt": null
}

Language: ${language === 'pl' ? 'Write narrative in Polish.' : 'Write narrative in English.'}`,
  );

  return sections.join('\n\n---\n\n');
}

/**
 * Call OpenAI API with tools support.
 */
async function callOpenAI(messages, { tools = [], model = 'gpt-5.4', temperature = 0.8, maxTokens = 4096 } = {}) {
  const apiKey = requireServerApiKey('openai', 'OpenAI');

  const body = {
    model,
    messages,
    temperature,
    max_tokens: maxTokens,
  };

  if (tools.length > 0) {
    body.tools = tools;
    body.tool_choice = 'auto';
  } else {
    body.response_format = { type: 'json_object' };
  }

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    await parseProviderError(response, 'openai');
  }

  return await response.json();
}

/**
 * Call Anthropic API with tools support.
 */
async function callAnthropic(messages, { tools = [], model = 'claude-sonnet-4-20250514', temperature = 0.8, maxTokens = 4096, system = null } = {}) {
  const apiKey = requireServerApiKey('anthropic', 'Anthropic');

  const body = {
    model,
    max_tokens: maxTokens,
    messages,
    temperature,
  };

  if (system) body.system = system;
  if (tools.length > 0) body.tools = tools;

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    await parseProviderError(response, 'anthropic');
  }

  return await response.json();
}

/**
 * Generate a scene using AI with tool-use loop.
 * AI gets a lean base context and can dynamically fetch more via tools.
 */
export async function generateScene(campaignId, playerAction, { provider = 'openai', model, language = 'pl' } = {}) {
  // 1. Load campaign core state
  const campaign = await prisma.campaign.findUnique({
    where: { id: campaignId },
    select: { coreState: true },
  });

  if (!campaign) throw new Error('Campaign not found');
  const coreState = JSON.parse(campaign.coreState);

  // 2. Load recent scenes
  const recentScenes = await prisma.campaignScene.findMany({
    where: { campaignId },
    orderBy: { sceneIndex: 'desc' },
    take: 3,
  });
  recentScenes.reverse(); // chronological order

  // 3. Build lean system prompt
  const systemPrompt = buildLeanSystemPrompt(coreState, recentScenes, language);

  // 4. Run tool-use loop
  const apiKey = provider === 'openai'
    ? requireServerApiKey('openai', 'OpenAI')
    : requireServerApiKey('anthropic', 'Anthropic');

  let sceneResult;
  if (provider === 'openai') {
    sceneResult = await runOpenAIToolLoop(campaignId, systemPrompt, playerAction, apiKey, model);
  } else {
    sceneResult = await runAnthropicToolLoop(campaignId, systemPrompt, playerAction, apiKey, model);
  }

  // 5. Save scene to database
  const lastScene = recentScenes[recentScenes.length - 1];
  const newSceneIndex = lastScene ? lastScene.sceneIndex + 1 : 0;

  const savedScene = await prisma.campaignScene.create({
    data: {
      campaignId,
      sceneIndex: newSceneIndex,
      narrative: sceneResult.narrative || '',
      chosenAction: playerAction,
      suggestedActions: JSON.stringify(sceneResult.suggestedActions || []),
      dialogueSegments: JSON.stringify(sceneResult.dialogueSegments || []),
      imagePrompt: sceneResult.imagePrompt || null,
      soundEffect: sceneResult.soundEffect || null,
      diceRoll: sceneResult.diceRoll ? JSON.stringify(sceneResult.diceRoll) : null,
      stateChanges: sceneResult.stateChanges ? JSON.stringify(sceneResult.stateChanges) : null,
      scenePacing: sceneResult.scenePacing || 'exploration',
    },
  });

  // 6. Generate embedding async (fire and forget)
  generateSceneEmbedding(savedScene).catch((err) =>
    console.error('Failed to generate scene embedding:', err.message),
  );

  // 7. Process stateChanges - update normalized collections
  if (sceneResult.stateChanges) {
    processStateChanges(campaignId, sceneResult.stateChanges, apiKey).catch((err) =>
      console.error('Failed to process state changes:', err.message),
    );
  }

  return {
    scene: sceneResult,
    sceneIndex: newSceneIndex,
    sceneId: savedScene.id,
  };
}

/**
 * OpenAI tool-use loop.
 */
async function runOpenAIToolLoop(campaignId, systemPrompt, playerAction, apiKey, model) {
  const messages = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: playerAction },
  ];

  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    const isLastRound = round === MAX_TOOL_ROUNDS - 1;
    const tools = isLastRound ? [] : CONTEXT_TOOLS_OPENAI;

    const response = await callOpenAI(messages, { tools, model });
    const choice = response.choices?.[0];

    if (!choice) throw new Error('No response from OpenAI');

    // If AI finished (no tool calls), parse JSON
    if (choice.finish_reason === 'stop' || !choice.message.tool_calls?.length) {
      return parseAIResponse(choice.message.content);
    }

    // Process tool calls
    messages.push(choice.message);

    for (const tc of choice.message.tool_calls) {
      const args = JSON.parse(tc.function.arguments);
      const result = await executeToolCall(campaignId, tc.function.name, args, apiKey);
      messages.push({
        role: 'tool',
        tool_call_id: tc.id,
        content: result,
      });
    }
  }

  // Fallback: force response without tools
  const response = await callOpenAI(messages, { tools: [] });
  return parseAIResponse(response.choices[0].message.content);
}

/**
 * Anthropic tool-use loop.
 */
async function runAnthropicToolLoop(campaignId, systemPrompt, playerAction, apiKey, model) {
  const messages = [{ role: 'user', content: playerAction }];

  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    const isLastRound = round === MAX_TOOL_ROUNDS - 1;
    const tools = isLastRound ? [] : CONTEXT_TOOLS_ANTHROPIC;

    const response = await callAnthropic(messages, { tools, system: systemPrompt, model });

    if (response.stop_reason === 'end_turn' || !response.content?.some((c) => c.type === 'tool_use')) {
      // Extract text content
      const textBlock = response.content?.find((c) => c.type === 'text');
      if (textBlock) return parseAIResponse(textBlock.text);
      throw new Error('No text response from Anthropic');
    }

    // Process tool calls
    messages.push({ role: 'assistant', content: response.content });

    const toolResults = [];
    for (const block of response.content) {
      if (block.type === 'tool_use') {
        const result = await executeToolCall(campaignId, block.name, block.input, apiKey);
        toolResults.push({
          type: 'tool_result',
          tool_use_id: block.id,
          content: result,
        });
      }
    }

    messages.push({ role: 'user', content: toolResults });
  }

  // Fallback
  const response = await callAnthropic(messages, { tools: [], system: systemPrompt });
  const textBlock = response.content?.find((c) => c.type === 'text');
  if (textBlock) return parseAIResponse(textBlock.text);
  throw new Error('No response from Anthropic after tool loop');
}

/**
 * Parse AI response text as JSON, with basic cleanup.
 */
function parseAIResponse(text) {
  if (!text) throw new Error('Empty AI response');

  // Try to extract JSON from markdown code blocks
  let jsonStr = text;
  const jsonMatch = text.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
  if (jsonMatch) {
    jsonStr = jsonMatch[1];
  }

  try {
    const parsed = JSON.parse(jsonStr.trim());

    // Ensure required fields have defaults
    return {
      narrative: parsed.narrative || '',
      suggestedActions: parsed.suggestedActions || ['Look around', 'Move forward', 'Wait'],
      stateChanges: parsed.stateChanges || {},
      dialogueSegments: parsed.dialogueSegments || [],
      scenePacing: parsed.scenePacing || 'exploration',
      diceRoll: parsed.diceRoll || null,
      atmosphere: parsed.atmosphere || { weather: 'clear', mood: 'peaceful', lighting: 'natural' },
      sceneGrid: parsed.sceneGrid || null,
      imagePrompt: parsed.imagePrompt || null,
      soundEffect: parsed.soundEffect || null,
      musicPrompt: parsed.musicPrompt || null,
      questOffers: parsed.questOffers || [],
      cutscene: parsed.cutscene || null,
      dilemma: parsed.dilemma || null,
    };
  } catch (err) {
    throw new Error(`Failed to parse AI response as JSON: ${err.message}\nResponse: ${text.slice(0, 500)}`);
  }
}

/**
 * Generate and store embedding for a saved scene (async, fire-and-forget).
 */
async function generateSceneEmbedding(scene) {
  const embeddingText = buildSceneEmbeddingText(scene);
  if (!embeddingText) return;

  const embedding = await embedText(embeddingText);
  if (embedding) {
    await writeEmbedding('CampaignScene', scene.id, embedding, embeddingText);
  }
}

/**
 * Process stateChanges from AI response - update normalized collections.
 */
async function processStateChanges(campaignId, stateChanges, apiKey) {
  // Update NPCs
  if (stateChanges.npcs?.length) {
    for (const npcChange of stateChanges.npcs) {
      if (!npcChange.name) continue;

      const npcId = npcChange.name.toLowerCase().replace(/\s+/g, '_');

      try {
        const existing = await prisma.campaignNPC.findUnique({
          where: { campaignId_npcId: { campaignId, npcId } },
        });

        if (existing) {
          const updateData = {};
          if (npcChange.attitude) updateData.attitude = npcChange.attitude;
          if (npcChange.disposition != null) updateData.disposition = npcChange.disposition;
          if (npcChange.alive != null) updateData.alive = npcChange.alive;
          if (npcChange.lastLocation) updateData.lastLocation = npcChange.lastLocation;
          if (npcChange.factionId) updateData.factionId = npcChange.factionId;
          if (npcChange.relationships) {
            updateData.relationships = JSON.stringify(npcChange.relationships);
          }

          if (Object.keys(updateData).length > 0) {
            const updated = await prisma.campaignNPC.update({
              where: { id: existing.id },
              data: updateData,
            });
            // Re-embed
            const embText = buildNPCEmbeddingText(updated);
            const emb = await embedText(embText, apiKey);
            if (emb) writeEmbedding('CampaignNPC', updated.id, emb, embText);
          }
        } else if (npcChange.action === 'introduce' || !existing) {
          const created = await prisma.campaignNPC.create({
            data: {
              campaignId,
              npcId,
              name: npcChange.name,
              gender: npcChange.gender || 'unknown',
              role: npcChange.role || null,
              personality: npcChange.personality || null,
              attitude: npcChange.attitude || 'neutral',
              disposition: npcChange.disposition ?? 0,
              factionId: npcChange.factionId || null,
              relationships: JSON.stringify(npcChange.relationships || []),
              relatedQuestIds: JSON.stringify(npcChange.relatedQuestIds || []),
            },
          });
          // Embed new NPC
          const embText = buildNPCEmbeddingText(created);
          const emb = await embedText(embText, apiKey);
          if (emb) writeEmbedding('CampaignNPC', created.id, emb, embText);
        }
      } catch (err) {
        console.error(`Failed to process NPC change for ${npcChange.name}:`, err.message);
      }
    }
  }

  // Update knowledge base entries
  if (stateChanges.knowledgeUpdates) {
    const ku = stateChanges.knowledgeUpdates;
    const entries = [];

    if (ku.events?.length) {
      for (const e of ku.events) {
        entries.push({ entryType: 'event', summary: e.summary || e, content: JSON.stringify(e), importance: e.importance, tags: JSON.stringify(e.tags || []) });
      }
    }
    if (ku.decisions?.length) {
      for (const d of ku.decisions) {
        entries.push({ entryType: 'decision', summary: `${d.choice} -> ${d.consequence}`, content: JSON.stringify(d), importance: d.importance, tags: JSON.stringify(d.tags || []) });
      }
    }

    for (const entry of entries) {
      try {
        const created = await prisma.campaignKnowledge.create({
          data: { campaignId, ...entry },
        });
        const embText = buildKnowledgeEmbeddingText(created);
        const emb = await embedText(embText, apiKey);
        if (emb) writeEmbedding('CampaignKnowledge', created.id, emb, embText);
      } catch (err) {
        console.error('Failed to save knowledge entry:', err.message);
      }
    }
  }

  // Update codex entries
  if (stateChanges.codexUpdates?.length) {
    for (const cu of stateChanges.codexUpdates) {
      if (!cu.id || !cu.name) continue;

      try {
        const existing = await prisma.campaignCodex.findUnique({
          where: { campaignId_codexKey: { campaignId, codexKey: cu.id } },
        });

        if (existing) {
          const existingFragments = JSON.parse(existing.fragments || '[]');
          if (cu.fragment) existingFragments.push(cu.fragment);

          const updated = await prisma.campaignCodex.update({
            where: { id: existing.id },
            data: {
              fragments: JSON.stringify(existingFragments),
              tags: JSON.stringify(cu.tags || JSON.parse(existing.tags || '[]')),
            },
          });
          const embText = buildCodexEmbeddingText(updated);
          const emb = await embedText(embText, apiKey);
          if (emb) writeEmbedding('CampaignCodex', updated.id, emb, embText);
        } else {
          const created = await prisma.campaignCodex.create({
            data: {
              campaignId,
              codexKey: cu.id,
              name: cu.name,
              category: cu.category || 'concept',
              tags: JSON.stringify(cu.tags || []),
              fragments: JSON.stringify(cu.fragment ? [cu.fragment] : []),
              relatedEntries: JSON.stringify(cu.relatedEntries || []),
            },
          });
          const embText = buildCodexEmbeddingText(created);
          const emb = await embedText(embText, apiKey);
          if (emb) writeEmbedding('CampaignCodex', created.id, emb, embText);
        }
      } catch (err) {
        console.error(`Failed to process codex update for ${cu.id}:`, err.message);
      }
    }
  }
}
