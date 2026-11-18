# Implement `CampaignCarryover` Deep Module at the `preload.nut` Seam

Status: ready-for-agent
Blocked by: 01

## Context

Implement the `CampaignCarryover` module specified in [`spec.md`](../spec.md) and mount it at the bottom of `scripts/preload.nut` (from [Issue 01](./01-reconstruct-preload-bootstrap-seam.md)).

All domain terms follow [`GLOSSARY.md`](../../../../GLOSSARY.md) and seam constraints follow [ADR 0001](../../../adr/0001-plaintext-squirrel-override-seam.md).

## Deliverables

1. Disassemble the exact vanilla Squirrel bytecode of the four target methods to ensure complete fidelity to surrounding invariants:
   - `WorldState.trigger_game_end` (`scripts/WorldState.nut.bin`)
   - `LevelScreen.finish_level` (`scripts/LevelScreen.nut.bin`)
   - `World.switch_to_next_level` and `WorldState.initialize_new_game` (`scripts/World.nut.bin`, `scripts/WorldState.nut.bin`)
   - `Hero.check_can_pick_item` and `Hero.save_hero_data_to_string` (`scripts/entities/Hero_item.nut.bin`, `scripts/entities/Hero.nut.bin`)
2. Implement `CampaignCarryover` with narrow interface `CampaignCarryover.install(env = null)` in `scripts/preload.nut`:
   - **Zero `StateObject` schema changes**: Do not add, remove, or reorder serialized `StateObject` attributes (`NEWSLOTA`).
   - **Final-floor capture (`WorldState.trigger_game_end`)**: When `m_game_state == 0`, set `m_last_level_index = -1` and call `save_hero_data_to_world()` for every live player (`p.is_live_player() && p.m_hero != null`) before delegating to base `trigger_game_end()`.
   - **Carryover Loop transition (`LevelScreen.finish_level`)**: When `m_world.m_world_state.is_game_end()` is `true` and `m_world.get_game_mode()` is in `{0, 1, 3, 4}`, execute the next-level pipeline (`create_checkpoint()` $\to$ `save_state()` $\to$ `stop_game()` $\to$ `start_next_level(w_state, ws_state)`) instead of `stop_game(); start_game();`. Preserve Game Over, Casual checkpoint retry, and non-campaign flows unchanged.
   - **Campaign wrap-around (`World.switch_to_next_level`)**: When `m_gparam_game_mode` is in `{0, 1, 3, 4}`, `m_gparam_level_index >= 9`, and `world_state.m_switch_to_game_mode == 0`:
     - Reset `m_gparam_level_index = 0`, `m_gparam_level_type = "forest"`, `m_gparam_level_challenge = 0`, `m_gparam_generate_difficulty = world_state.m_game_difficulty`, `m_frame_index = 0`.
     - Re-roll `m_original_world_seed_0..3` using deterministic `rand()` so Loop 2+ generates a fresh dungeon layout.
     - Reset `m_gparam_used_room_types = []` and `m_gparam_used_room_types_working_copy = null` (avoiding the vanilla `m_gparam_used_room_types_working_copy != null` assertion failure) and invoke `MapGenerator.update_list_of_used_rooms_on_level_transition(m_gparam_used_room_types)`.
     - Replenish `world_state` pools via `Loot.initialize_world_loot(world_state)`, clear `world_state.m_altar_types_rand_list = []`, regenerate `m_starting_weapon_for_class0..7` and `m_starting_throwable_for_assassin`, and filter already-owned **Passive Modifiers** (`m_mods_pool`) and familiars (`m_familiars_pool`) parsed from `world_state.m_hero_data_per_player` (keeping the unfiltered pool as fallback if all items in that category are already owned).
   - **Duplicate Passive Modifier guard (`Hero.check_can_pick_item`)**: Reject picking up a **Passive Modifier** (`is_mod(item)`) whose `m_def._name` already exists in `this.m_items` across all modes (calling `init_no_endless_mod_pick` when `play_nonono` is true and returning `false`), matching **Endless Dungeon** behavior.
3. Verify `CampaignCarryover.install(standInEnv)` against a stand-in test adapter covering:
   - Floor-9 `trigger_game_end` hero snapshot capture (`m_last_level_index == -1` and `m_hero_data_per_player` populated).
   - `finish_level` routing `is_game_end() == true` to `start_next_level` and `is_game_over() == true` (non-Casual) to `start_game`.
   - `switch_to_next_level` wrapping floor `9 -> 0` (`forest`), re-rolling seeds, preserving difficulty/mode, and filtering owned **Passive Modifiers** & familiars with full-pool fallback when exhausted.
   - `check_can_pick_item` blocking duplicate **Passive Modifiers** while allowing normal equipment swaps.

## Acceptance Criteria

- `CampaignCarryover.install()` mounts cleanly at the end of `scripts/preload.nut` with zero edits to `*.nut.bin` or `rampage_knights.exe`.
- Stand-in adapter tests pass for all four wrapped seams and edge cases (Shadow World `m_last_level_index = -1`, Casual checkpoint creation, pool-exhaustion fallback, Game Over reset).

## Comments

- Implemented `CampaignCarryover.install(env)` in `scripts/preload.nut` covering `WorldState.trigger_game_end`, `LevelScreen.finish_level`, `World.switch_to_next_level` (with seed re-roll, deck/rack reset, and owned `Passive Modifier`/familiar pool filtering + fallback), and `Hero.check_can_pick_item` duplicate `Passive Modifier` guard; verified via `tests/campaign_carryover.test.mjs` against both standalone `standInEnv` and root-table adapters.
