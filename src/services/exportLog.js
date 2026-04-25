function triggerDownload(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function sanitizeFilename(name) {
  return name.replace(/[^a-zA-Z0-9_\-\u00C0-\u024F\u0400-\u04FF ]/g, '').trim().replace(/\s+/g, '_');
}

function buildFilename(campaignName, ext) {
  const safe = sanitizeFilename(campaignName || 'campaign');
  const date = new Date().toISOString().slice(0, 10);
  return `${safe}_${date}.${ext}`;
}

export function exportAsJson(campaignState) {
  const { isLoading, error, isGeneratingScene, isGeneratingImage, ...data } = campaignState;
  const json = JSON.stringify(data, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  triggerDownload(blob, buildFilename(data.campaign?.name, 'json'));
}

export function exportAsMarkdown(campaignState) {
  const { campaign, character, scenes, chatHistory, quests, world } = campaignState;
  const lines = [];

  lines.push(`# ${campaign?.name || 'Untitled Campaign'}`);
  lines.push('');

  if (campaign) {
    lines.push('## Campaign');
    lines.push('');
    if (campaign.genre) lines.push(`- **Genre:** ${campaign.genre}`);
    if (campaign.tone) lines.push(`- **Tone:** ${campaign.tone}`);
    if (campaign.style) lines.push(`- **Style:** ${campaign.style}`);
    if (campaign.difficulty) lines.push(`- **Difficulty:** ${campaign.difficulty}`);
    if (campaign.worldDescription) {
      lines.push('');
      lines.push(`> ${campaign.worldDescription}`);
    }
    if (campaign.hook) {
      lines.push('');
      lines.push(`*${campaign.hook}*`);
    }
    lines.push('');
  }

  if (character) {
    lines.push('## Character');
    lines.push('');
    lines.push(`- **Name:** ${character.name}`);
    lines.push(`- **Species:** ${character.species || 'Human'}`);
    lines.push(`- **Level:** ${character.characterLevel || 1}`);
    lines.push(`- **Wounds:** ${character.wounds}/${character.maxWounds}`);
    if (character.attributes) {
      const a = character.attributes;
      lines.push(`- **Attributes:** Sił ${a.sila} | Int ${a.inteligencja} | Cha ${a.charyzma} | Zrę ${a.zrecznosc} | Wyt ${a.wytrzymalosc} | Szc ${a.szczescie}`);
    }
    if (character.inventory?.length) {
      lines.push('');
      lines.push('### Inventory');
      lines.push('');
      character.inventory.forEach((item) => {
        lines.push(`- ${item.name}${item.rarity ? ` (${item.rarity})` : ''} — ${item.description || item.type || ''}`);
      });
    }
    if (character.backstory) {
      lines.push('');
      lines.push('### Backstory');
      lines.push('');
      lines.push(character.backstory);
    }
    lines.push('');
  }

  if (scenes?.length) {
    lines.push('---');
    lines.push('');
    lines.push('## Game Log');
    lines.push('');

    scenes.forEach((scene, i) => {
      lines.push(`### Scene ${i + 1}`);
      lines.push('');
      if (scene.timestamp) {
        lines.push(`*${new Date(scene.timestamp).toLocaleString()}*`);
        lines.push('');
      }
      if (scene.chosenAction) {
        lines.push(`**Player:** ${scene.chosenAction}`);
        lines.push('');
      }
      if (scene.diceRoll) {
        const d = scene.diceRoll;
        const outcome = d.success ? 'Success' : 'Failure';
        lines.push(`**Dice Roll:** ${d.skill} — d50 roll ${d.roll} vs target ${d.target || d.dc} — margin ${d.margin ?? 0} — ${outcome}`);
        lines.push('');
      }
      if (scene.narrative) {
        lines.push(scene.narrative);
        lines.push('');
      }
      if (scene.actions?.length) {
        lines.push('*Suggested actions:*');
        scene.actions.forEach((a) => {
          const label = typeof a === 'string' ? a : a.label || a.text || JSON.stringify(a);
          lines.push(`- ${label}`);
        });
        lines.push('');
      }
    });
  }

  if (quests) {
    const hasActive = quests.active?.length > 0;
    const hasCompleted = quests.completed?.length > 0;
    if (hasActive || hasCompleted) {
      lines.push('---');
      lines.push('');
      lines.push('## Quests');
      lines.push('');
      if (hasActive) {
        lines.push('### Active');
        lines.push('');
        quests.active.forEach((q) => lines.push(`- **${q.name}** — ${q.description || ''}`));
        lines.push('');
      }
      if (hasCompleted) {
        lines.push('### Completed');
        lines.push('');
        quests.completed.forEach((q) => lines.push(`- **${q.name}** — ${q.description || ''}`));
        lines.push('');
      }
    }
  }

  if (world?.facts?.length) {
    lines.push('---');
    lines.push('');
    lines.push('## World Facts');
    lines.push('');
    world.facts.forEach((f) => lines.push(`- ${f}`));
    lines.push('');
  }

  const md = lines.join('\n');
  const blob = new Blob([md], { type: 'text/markdown;charset=utf-8' });
  triggerDownload(blob, buildFilename(campaign?.name, 'md'));
}
