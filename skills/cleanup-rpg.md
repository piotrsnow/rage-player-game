# Skill: Cleanup RPG System (Warhammer → Custom)

Goal:
Refactor and clean up legacy code from the old Warhammer-based system and align it with the new custom RPG system.
New custom settings are in RPG_SYSTEM.md. Obsidian references current codebase. CLAUDE.MD is outdated and might be useless if we're using obsidian now.
---

## Instructions

1. Identify legacy elements:
- Warhammer-specific mechanics
- outdated enums, classes, or functions
- unused code and dead branches
- duplicated logic

2. For each file:
- simplify logic
- remove unnecessary abstractions
- rename unclear variables to match new system terminology
- ensure consistency with the new RPG system

3. Migration rules:
- DO NOT break existing functionality
- if unsure → mark with comment instead of deleting
- preserve behavior unless explicitly safe to change

4. Refactoring:
- extract reusable logic into clean functions
- reduce nesting
- remove magic numbers
- improve naming

5. Dependencies:
- check where legacy code is used
- update all references

---

## Obsidian integration (VERY IMPORTANT)

After changes:

1. Update or create notes in:
- knowledge/patterns/
- knowledge/decisions/
- knowledge/before-after/

2. Document:
- what was removed
- what was changed
- why

3. Add links:
Use [[...]] to connect related concepts

Example:
- [[combat-system]]
- [[damage-calculation]]
- [[legacy-warhammer]]

---

## Output format

For each file:
1. Show diff or updated code
2. Explain changes briefly

At the end:
3. List removed legacy elements
4. List potential risks
5. Suggest further cleanup opportunities