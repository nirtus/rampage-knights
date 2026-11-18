# Verify In-Game Campaign Carryover Loop & Save Compatibility

Status: ready-for-human
Blocked by: 02

## Context

After [Issue 02](./02-implement-campaign-carryover-module.md) delivers `scripts/preload.nut`, run an interactive playtest in *Rampage Knights* to confirm live runtime behavior, **Mid-Run Save** persistence, **Shadow World** interaction, and clean removal.

See [`spec.md`](../spec.md) Acceptance Scenarios.

## Verification Checklist

1. **Boot & Preload**: Launch *Rampage Knights* with `scripts/preload.nut` present; confirm the loading screen (`PreloadResourcesScreen`) completes with no Squirrel compile/runtime error.
2. **Normal Campaign Clear $\to$ Carryover Loop**: Complete floor `9` (`end`) of a Normal **Campaign** (or skip to floor `9` in developer mode and defeat the final boss); watch/skip the outro & theatre and confirm you spawn in floor `0` (`forest` **Starting Camp**) with all weapon upgrades, armor/equips, consumables, **Passive Modifiers**, familiars, coins, souls, HP, extra lives, blessings, and curses retained, and a newly generated floor-`0` layout.
3. **Mid-Run Save (`Continue`) vs. `New Game`**: Exit to Main Menu from floor `0` of Loop 2; verify `Continue` resumes the carried hero, then verify `New Game` starts a fresh hero.
4. **Shadow World Loop**: Clear floor `9` of **Shadow World** and verify floor `0` retains coins, extra lives, max HP, and souls while randomizing class and floor equipment as normal.
5. **Clean Uninstall**: Move or delete `scripts/preload.nut`, relaunch *Rampage Knights*, and confirm vanilla behavior and existing **Player Profile** / **Mid-Run Save** integrity.

## Comments
