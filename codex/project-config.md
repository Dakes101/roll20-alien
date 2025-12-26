# Codex Project Configuration: Roll20 Alien Typhon

Codex is used to generate and update:

- roll20/api/alien-npc-importer.js
- JSON config maps for Alien attributes/skills
- Markdown NPCs in data/typhon/npcs

Primary Script
--------------
`roll20/api/alien-npc-importer.js` used in Roll20 API:
!alien-npc-from-md --handout "NPC: Name"

Rules
-----
- Strict mode
- No imports (Roll20 sandbox)
- Use ATTR_MAP & SKILL_MAP
- Snake_case for sheet keys
- Human-friendly labels in .md
