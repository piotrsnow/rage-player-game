#!/usr/bin/env node
/**
 * One-time backfill: migrate custom (AI-invented) spells out of
 * Character.spells.known[] into a proper CustomSpell table + customKnown[].
 *
 * For each Character:
 *   - Walk `known[]` entries.
 *   - If the name matches a canonical spell in rpgMagic.js → leave it.
 *   - Otherwise → upsert a CustomSpell row, move UUID to customKnown[],
 *     remove from known[], clean up details/schools/icons.
 *
 * Run once after the 20260510200000_custom_spell_uuid_pk migration:
 *   node backend/src/scripts/backfillCustomSpells.js
 *
 * Idempotent: safe to run multiple times.
 */

import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { findSpell } from '../../../src/data/rpgMagic.js';

const prisma = new PrismaClient();

async function main() {
  const characters = await prisma.character.findMany({
    select: { id: true, spells: true },
  });

  let totalMigrated = 0;
  let totalCharsUpdated = 0;

  for (const char of characters) {
    const spells = char.spells;
    if (!spells || !Array.isArray(spells.known) || spells.known.length === 0) continue;

    const canonicalKnown = [];
    const customKnown = [...(spells.customKnown || [])];
    let changed = false;

    for (const spellName of spells.known) {
      const canonical = findSpell(spellName);
      if (canonical) {
        canonicalKnown.push(spellName);
        continue;
      }

      const school = spells.schools?.[spellName] || null;
      const details = spells.details?.[spellName];
      const icon = spells.icons?.[spellName] || null;
      const description = typeof details === 'string' ? details
        : (details?.description || details?.effect || null);
      const manaCost = details?.manaCost || 2;

      const row = await prisma.customSpell.upsert({
        where: { name: spellName },
        create: {
          name: spellName,
          school,
          description,
          icon,
          manaCost,
          globallyActive: true,
        },
        update: {},
        select: { id: true },
      });

      if (!customKnown.includes(row.id)) {
        customKnown.push(row.id);
      }

      changed = true;
      totalMigrated++;
    }

    if (!changed) continue;

    const updatedSpells = { ...spells, known: canonicalKnown, customKnown };

    if (updatedSpells.schools) {
      const cleanedSchools = { ...updatedSpells.schools };
      for (const name of spells.known) {
        if (!canonicalKnown.includes(name)) delete cleanedSchools[name];
      }
      updatedSpells.schools = Object.keys(cleanedSchools).length > 0 ? cleanedSchools : undefined;
    }
    if (updatedSpells.icons) {
      const cleanedIcons = { ...updatedSpells.icons };
      for (const name of spells.known) {
        if (!canonicalKnown.includes(name)) delete cleanedIcons[name];
      }
      updatedSpells.icons = Object.keys(cleanedIcons).length > 0 ? cleanedIcons : undefined;
    }
    if (updatedSpells.details) {
      const cleanedDetails = { ...updatedSpells.details };
      for (const name of spells.known) {
        if (!canonicalKnown.includes(name)) delete cleanedDetails[name];
      }
      updatedSpells.details = Object.keys(cleanedDetails).length > 0 ? cleanedDetails : undefined;
    }

    await prisma.character.update({
      where: { id: char.id },
      data: { spells: updatedSpells },
    });
    totalCharsUpdated++;
  }

  console.log(`Backfill complete: ${totalMigrated} custom spells migrated across ${totalCharsUpdated} characters.`);
}

main()
  .catch((err) => {
    console.error('Backfill failed:', err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
