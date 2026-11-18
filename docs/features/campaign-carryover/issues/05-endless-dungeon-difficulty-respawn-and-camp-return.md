# Preserve Campaign Difficulty Respawn Rules and Add Manual Return to Camp in Endless Dungeon

Status: ready-for-agent
Blocked by: 02

## Context

In vanilla `World.switch_to_next_level()` (`scripts/World.nut.bin` ops `109–141` and `224–230`), stepping into the **Endless Dungeon** portal (`m_switch_to_game_mode == 2`) forcibly overwrites `world_state.m_game_difficulty = 2` (Hard), and advancing to Endless floor 13 (`m_gparam_level_challenge == 2`) overwrites `world_state.m_game_difficulty = 3` (Insane). Because `LevelScreen.finish_level()` (`scripts/LevelScreen.nut.bin` ops `12–25`) only restores the floor checkpoint (`m_checkpoint_blob`) when `get_difficulty() == 0` (Casual), dying in **Endless Dungeon** always triggers permadeath (`stop_game(); start_game()`), even when the player started on Casual.

Additionally, because **Endless Dungeon** has no final boss floor (`end`), players on Casual (or at any point during an Endless run) need a manual way to leave **Endless Dungeon** and return to the **Starting Camp** (`forest`, floor `0`) while retaining their **Hero Loadout** and **Run Stats**.

## Deliverables

1. **Preserve Difficulty Across Endless Dungeon (`World.switch_to_next_level`)**:
   - Capture `prev_difficulty = world_state.m_game_difficulty` before delegating to base `World.switch_to_next_level(world_state)`.
   - When the resulting `m_gparam_game_mode == 2` (**Endless Dungeon**), restore `world_state.m_game_difficulty = prev_difficulty` and `m_gparam_generate_difficulty = prev_difficulty` so Casual (`0`) respawns at `m_checkpoint_blob` on death (`LevelScreen.finish_level()`), while Normal (`1`), Hard (`2`), and Insane (`3`) use permadeath.
2. **Manual Return to Starting Camp Transition (`World.switch_to_next_level`)**:
   - Support sentinel `world_state.m_switch_to_game_mode == -1` when `m_gparam_game_mode == 2`:
     - Set `m_gparam_game_mode = 0`, `m_gparam_level_index = 0`, `m_gparam_level_type = "forest"`, `m_gparam_level_challenge = 0`, `m_gparam_generate_difficulty = world_state.m_game_difficulty`, `m_frame_index = 0`.
     - Re-roll `m_original_world_seed_0..3`, reset `m_gparam_used_room_types`, and invoke `_refresh_world_state_for_loop(root, world_state)` (after which vanilla `WorldState.switch_to_next_level()` resets `m_switch_to_game_mode = 0`).
3. **Pause Menu `"Return to Camp"` Button (`MainSubMenu.layout_buttons`)**:
   - When `m_menu_type == 1` (in-game Pause Menu) and the active run is in **Endless Dungeon** (`game_mode == 2`), insert a `"Return to Camp"` button (`menu_event = 5`) immediately above `"Save & Quit"` and relink `m_next_control` / `m_previous_control`.
   - Clicking `"Return to Camp"` plays `"menu_confirm"`, removes the Pause Menu (`g_game.remove_top_game_screen()`), and triggers `world_state.begin_level_transition_to_game_mode(-1)`.
4. **Stand-In Adapter Tests (`tests/campaign_carryover.test.mjs`)**:
   - Verify entering **Endless Dungeon** on Casual (`0`) preserves `m_game_difficulty == 0` (including across floor 13's `m_gparam_level_challenge == 2`) and respawns at the latest floor checkpoint (`m_checkpoint_blob`) on Game Over, whereas dying on Normal/Hard/Insane (`1, 2, 3`) resets via `start_game()`.
   - Verify the Pause Menu (`MainSubMenu` with `m_menu_type == 1`) adds `"Return to Camp"` in **Endless Dungeon** and clicking it transitions the run back to floor `0` (`forest`, `game_mode == 0`) with **Hero Loadout** and **Run Stats** carried over.

## Acceptance Criteria

- In **Endless Dungeon** on Casual (`0`), dying respawns at the start of the current Endless floor (`m_checkpoint_blob`); on Normal/Hard/Insane (`1–3`), dying triggers permadeath.
- Opening the Pause Menu (`Esc` / Start) in **Endless Dungeon** shows `"Return to Camp"`, and selecting it transitions back to the **Starting Camp** (`forest`, floor `0`) with carried gear and stats intact.
- All unit/seam tests pass (`node --test tests/*.test.mjs`).

## Comments

- Implemented Endless Dungeon difficulty preservation (`World.switch_to_next_level`) and manual Pause Menu `"Return to Camp"` transition (`MainSubMenu.layout_buttons` + `begin_level_transition_to_game_mode(-1)`) in `scripts/preload.nut`; verified with `Seam 2F` in `tests/campaign_carryover.test.mjs`.
