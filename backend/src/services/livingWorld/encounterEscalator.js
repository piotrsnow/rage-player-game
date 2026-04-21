// Living World Phase 3 — encounter escalation hints.
//
// Pure function that turns a reputation profile (from getReputationProfile)
// into an encounter-mode hint for systemPrompt injection. No DB, no LLM —
// just deterministic bucket mapping. contextSection renders the resulting
// hint into the Living World block.

const LABEL_SEVERITY = {
  wanted_criminal: 5,
  outlaw: 4,
  suspicious: 3,
  neutral: 2,
  respected: 1,
  hero: 0,
};

/**
 * Pick the worst label across all scopes (lowest severity = hero, highest = wanted).
 */
export function worstLabel(rows) {
  if (!rows?.length) return 'neutral';
  let worst = 'neutral';
  let worstSev = LABEL_SEVERITY.neutral;
  for (const r of rows) {
    const sev = LABEL_SEVERITY[r.reputationLabel] ?? LABEL_SEVERITY.neutral;
    if (sev > worstSev) {
      worst = r.reputationLabel;
      worstSev = sev;
    }
  }
  return worst;
}

/**
 * Pick the best label across all scopes (for positive-context weight).
 */
export function bestLabel(rows) {
  if (!rows?.length) return 'neutral';
  let best = 'neutral';
  let bestSev = LABEL_SEVERITY.neutral;
  for (const r of rows) {
    const sev = LABEL_SEVERITY[r.reputationLabel] ?? LABEL_SEVERITY.neutral;
    if (sev < bestSev) {
      best = r.reputationLabel;
      bestSev = sev;
    }
  }
  return best;
}

/**
 * Map reputation state → encounter mode hint. The hint is a structured
 * prompt fragment injected into the Living World context block.
 *
 * `profile` shape: `{ rows, labels }` from getReputationProfile + optional
 * global bounty amount + vendetta flag.
 *
 * Returns:
 *   {
 *     mode: 'neutral' | 'cautious' | 'guards_question' | 'guards_arrest' | 'bounty_hunters' | 'vendetta' | 'celebrated',
 *     intensity: 0..3,
 *     narrativeHint: string | null,
 *     bountyAmount: number,        // SK
 *     vendettaActive: boolean,
 *     worstLabel: string,
 *     bestLabel: string,
 *   }
 */
export function suggestEncounterMode(profile) {
  const rows = profile?.rows || [];
  const global = rows.find((r) => r.scope === 'global' && (r.scopeKey === '' || r.scopeKey == null));
  const vendettaActive = global?.vendettaActive === true;
  const bountyAmount = global?.bountyAmount || 0;

  const worst = worstLabel(rows);
  const best = bestLabel(rows);

  if (vendettaActive) {
    return {
      mode: 'vendetta',
      intensity: 3,
      narrativeHint:
        'Gracz ma czynną vendettę. Frakcje mogą zasadzić ambush, najemnicy tropią. Otwarte starcie w miastach możliwe.',
      bountyAmount,
      vendettaActive,
      worstLabel: worst,
      bestLabel: best,
    };
  }

  if (worst === 'wanted_criminal') {
    return {
      mode: bountyAmount > 0 ? 'bounty_hunters' : 'guards_arrest',
      intensity: 3,
      narrativeHint:
        bountyAmount > 0
          ? `Rozesłana nagroda ${bountyAmount} SK. Łowcy nagród mogą nadejść, strażnicy atakują na widok.`
          : 'Strażnicy atakują na widok. Cywile uciekają lub donoszą.',
      bountyAmount,
      vendettaActive,
      worstLabel: worst,
      bestLabel: best,
    };
  }

  if (worst === 'outlaw') {
    return {
      mode: 'guards_arrest',
      intensity: 2,
      narrativeHint:
        'Strażnicy próbują pojmać (nie atakują od razu). Kupcy podbijają ceny +50%. NPC informatorzy milczą.',
      bountyAmount,
      vendettaActive,
      worstLabel: worst,
      bestLabel: best,
    };
  }

  if (worst === 'suspicious') {
    return {
      mode: 'guards_question',
      intensity: 1,
      narrativeHint:
        'Strażnicy zatrzymują na krótką rozmowę przy bramach. Kupcy nieufni. Tawerny cichną na widok gracza.',
      bountyAmount,
      vendettaActive,
      worstLabel: worst,
      bestLabel: best,
    };
  }

  if (best === 'hero') {
    return {
      mode: 'celebrated',
      intensity: 0,
      narrativeHint:
        'Gracz jest lokalnym bohaterem. Darmowe informacje, zniżki u kupców, chętnie przyjmowany przez frakcje.',
      bountyAmount,
      vendettaActive,
      worstLabel: worst,
      bestLabel: best,
    };
  }

  if (best === 'respected') {
    return {
      mode: 'cautious',
      intensity: 0,
      narrativeHint:
        'Gracza szanują. Łagodniejsze ceny, więcej informacji od rozmówców niż standardowo.',
      bountyAmount,
      vendettaActive,
      worstLabel: worst,
      bestLabel: best,
    };
  }

  return {
    mode: 'neutral',
    intensity: 0,
    narrativeHint: null,
    bountyAmount,
    vendettaActive,
    worstLabel: worst,
    bestLabel: best,
  };
}
