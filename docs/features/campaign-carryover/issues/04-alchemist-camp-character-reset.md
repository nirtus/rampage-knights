# Add Alchemist Character, Gear, and Stats Reset Menu in Starting Camp

Status: ready-for-agent
Blocked by: 02

## Context

In the **Starting Camp**, Tim the Alchemist (`NPC` with `m_npc == 1`) has an unused interaction branch in `Hero.do_try_pick_item()` (`scripts/entities/Hero_item.nut.bin` op `251–255`), no proximity prompt in `HUDInteractPopup.get_tooltip_text_and_control()` (`scripts/hud/HUD_interact.nut.bin`), and an unused menu slot `m_ingame_menu == 3` in `HUDInGameMenuManager.update()` (`scripts/hud/HUD_ingame_menu.nut.bin` op `151–157`).

Per [`spec.md`](../spec.md) and [`GLOSSARY.md`](../../../../GLOSSARY.md), wire Tim to provide an **Alchemist Reset** menu so players on a **Carryover Loop** (or any **Starting Camp** visit) can reset their character, gear, or stats on demand.

## Deliverables

1. **Proximity Tooltip (`HUDInteractPopup.get_tooltip_text_and_control`)**:
   - When `entity instanceof NPC && entity.m_npc == 1`, display `"%% to reset character"` with the standard interact control icon (`17`).
2. **Alchemist Interaction (`Hero.do_try_pick_item`)**:
   - When interacting with an `NPC` where `m_npc == 1`, set `this.m_ingame_menu = 3` (and clear other local players' `m_ingame_menu = 0` in Local Co-op, matching other Camp NPC menus).
3. **Alchemist Menu (`HUDInGameMenuManager.update`)**:
   - Populate `m_ingame_menu == 3` with a native `ListWindow` (`"camp_shop_title_class"`) containing three `CheatPanelCell` entries that emit `InputEvent(5)`:
     - `101`: `"Reset Character (Full)"`
     - `102`: `"Reset Gear & Items Only"`
     - `103`: `"Reset Stats & Effects Only"`
4. **Reset Execution (`Hero.update_input_events`)**:
   - Handle `InputEvent(5)` values `101`, `102`, and `103` on the interacting hero only:
     - `101` (**Full Reset**): Clear all status effects (`remove_all_status_effects_for_shadow_world()`), zero stat offsets (`m_vitality_offset`, `m_strength_offset`, `m_uncapped_vitality`, `m_uncapped_spell_damage`, `m_souls_to_collect`, `m_extra_lives`), reset disease counters, call `initialize_from_class()` + `refresh_hero_after_item_without_action()`, restore `m_health = m_maximum_health`, save hero data to `WorldState` (`save_hero_data_to_world()`), and replenish `WorldState` loot pools while filtering items held by any other active co-op player.
     - `102` (**Gear & Items Only**): Preserve **Run Stats** and status effects; reset coins (to `reward_starting_coins` if unlocked else `0`) and souls (`0`), call `reset_all_hero_items()` + `add_default_hero_items()` + `refresh_hero_after_item_without_action()`, clamp `m_health` to `m_maximum_health`, save hero data to `WorldState`, and replenish `WorldState` loot pools.
     - `103` (**Stats & Effects Only**): Preserve **Hero Loadout** (weapon, equipped items, consumables, **Passive Modifiers**, familiars, coins, souls); clear all status effects (`remove_all_status_effects_for_shadow_world()`), zero stat offsets (`m_vitality_offset`, `m_strength_offset`, `m_uncapped_vitality`, `m_uncapped_spell_damage`), reset base `m_lives` (`1` for Warlock or multiplayer, `2` for single-player) while preserving item-granted `m_extra_lives`, reset disease counters, call `refresh_hero_after_item_without_action()`, restore `m_health = m_maximum_health`, and save hero data to `WorldState`.
   - Remove the temporary `running_in_developer_mode` test hook from `PreloadResourcesScreen.constructor()`.
5. **Stand-In Adapter Tests (`tests/campaign_carryover.test.mjs`)**:
   - Verify Alchemist tooltip, menu opening (`m_ingame_menu == 3`), and all three reset modes (`101`, `102`, `103`) including co-op partner item preservation in refilled loot pools.

## Acceptance Criteria

- Interacting with Tim in the **Starting Camp** opens the Alchemist menu and executes the selected reset (`101`, `102`, or `103`) deterministically.
- All unit/seam tests pass (`node --test tests/*.test.mjs`).

## Comments

- Implemented Alchemist Reset (`HUDInteractPopup.get_tooltip_text_and_control`, `Hero.do_try_pick_item`, `HUDInGameMenuManager.update`, `Hero.update_input_events`) in `scripts/preload.nut` and verified with `Seam 2E` in `tests/campaign_carryover.test.mjs`.
