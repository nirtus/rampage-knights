# Feature Specification: Campaign Carryover Loop

## Goal

Allow players to retain their **Hero Loadout** and **Run Stats** after a **Campaign Clear**, looping directly into floor 0 (`forest`) of a newly seeded **Campaign** at the same mode and difficulty without patching `rampage_knights.exe` or modifying shipped `.nut.bin` files.

Domain terms follow [`GLOSSARY.md`](../../../GLOSSARY.md). Architectural seam constraints follow [ADR 0001 (`0001-plaintext-squirrel-override-seam.md`)](../../adr/0001-plaintext-squirrel-override-seam.md).

---

## Binary & Bytecode Grounding

### REA Evidence
- **Executable (`rampage_knights.exe`)**: Unsigned 32-bit x86 PE (`1,779,200` bytes, SHA-256 `d5cf9f77a40e55df8af87fa3599c4ea85c81839c790a0f1eb740bc47911e9f75`), 9 imported DLLs, no export table (`ev_55c2e4e8b0b163263c8f126305ce9a4f93c712b0439c9b791e0dead5f8929f63`, `ev_8afc87b6d2eb578445ff00b095ec4a3c44befc445cebbbb017ac2baebf4875e9`, `ev_d188f6702dd70a903e74180e986a6cc79700d184a5ec3cbe776e32659c0e563c`, `ev_4d9a80cabe8da3774eb81f5fcbc2c87bd3bb3923e01d0337fefc2260938754b1`, `ev_8102a48ae454ff9a1f4b941050e477051b33522d80f2290da5416a249cc1fa63`, `ev_f57babf6dd3de21f0137535cc0b4c8f50ba2a0d1b6924268e11cefde0d873553`).
- **Script closures (`scripts/*.nut.bin`)**: Low byte entropy (`4.0701` bits/byte on `scripts/SaveManager.nut.bin`, SHA-256 `aea847e14176a7da2d1a792c4b569b4866f9eb2aa4639b93603f074251ff9457`, `ev_21925fa451f92a39938f3fee789e769373e4eab23428f2f2bfa351bdeeec5a9e`), confirming unencrypted Squirrel 3.0.3 bytecode (`0xFAFA "SQIR"`).
- **Coverage note**: REA deep native decompilers (`ghidra`, `hopper`, `ida`, `kuna`) were unconfigured on the analysis host; x86 loader offsets and Squirrel closure opcodes below are static observations from `objdump` and Squirrel 3.0.3 closure parsing (target binary was not executed during static inspection).

### Vanilla Engine & Script Observations
1. **Plain-text `.nut` priority (`rampage_knights.exe` @ `0x4f3d30–0x4f4150`)**: `::System.run_script("scripts/<name>.nut")` attempts to read plain-text `scripts/<name>.nut` (`0x4978e0`) and compile it via embedded `sq_compile` (`0x447c40`) before appending `".bin"` (`0x56c110`) and calling `sq_readclosure` (`0x44a1a0`).
2. **Pre-lock bootstrap seam (`scripts/main.nut.bin`)**: `scripts/preload.nut` is loaded at byte offset `8338` — after `Hero.nut` (`2342`), `LevelScreen.nut` (`2993`), `World.nut` (`8136`), and `WorldState.nut` (`8161`), and immediately before `register_state_class` (`8372`) locks `StateObject` class layouts.
3. **Why gear and stats reset in vanilla**:
   - `WorldState.trigger_game_end()` (`scripts/WorldState.nut.bin`) transitions `m_game_state` from `0` to `5` and spawns `GameEnd` without calling `hero.save_hero_data_to_world()`.
   - `LevelScreen.finish_level()` (`scripts/LevelScreen.nut.bin`) branches to `what = 0` (`stop_game(); start_game();`) whenever `m_world.m_world_state.is_game_end()` is `true`, destroying `World` and `WorldState` (`m_hero_data_per_player`).
   - `World.switch_to_next_level(world_state)` (`scripts/World.nut.bin`) only advances finite **Campaign** modes (`0, 1, 3, 4`) when `m_gparam_level_index < 9`, and asserts `m_gparam_used_room_types_working_copy != null` (op `234–238`).

---

## Behavioral Requirements

### 1. Carryover Lifecycle
- **Seamless Carryover Loop**: Upon **Campaign Clear** (`is_game_end() == true`) in any finite 10-floor **Campaign** mode (`m_gparam_game_mode` in `{0, 1, 3, 4}`), completing or skipping the victory outro and theatre transitions directly into floor `0` (`forest`) of a new **Campaign** at the **same game mode and difficulty** instead of calling `start_game()`.
- **Mid-Run Save & Continue**: Entering floor `0` of a **Carryover Loop** writes a normal **Mid-Run Save** (`save.dat`, `csave.dat`, `osave.dat`) and Casual checkpoint (`savech.dat`, `csavech.dat`, `osavech.dat`) via the standard `finish_level()` next-floor pipeline (`create_checkpoint()` $\to$ `save_state()` $\to$ `stop_game()` $\to$ `start_next_level()`), while syncing unlocked feats and counters to the **Player Profile**.
- **Clean Reset & Permadeath Preserved**:
  - Selecting `New Game` from the Main Menu starts a fresh character as in vanilla.
  - Dying (`is_game_over() == true`) during a **Carryover Loop** obeys standard roguelike rules: Casual difficulty restores the current floor's checkpoint if present; otherwise Game Over ends the streak and resets to a fresh hero.

### 2. Retained Hero Loadout & Run Stats
- **Final-Floor Capture**: When `WorldState.trigger_game_end()` fires (`m_game_state == 0`), every live player (`p.is_live_player() && p.m_hero != null`) sets `p.m_hero.m_last_level_index = -1` and executes `p.m_hero.save_hero_data_to_world()`, serializing floor-9 state into `WorldState.m_hero_data_per_player`.
- **Full Fidelity Carryover**: Everything serialized by `Hero.save_hero_data_to_string()` and restored by `Hero.initialize_from_hero_data()` carries over verbatim:
  - **Hero Loadout**: Hero class (`m_hero_class`), equipped weapon (`m_weapon` with upgrades/damage/flags), slot-equipped gear (`m_items`), active consumables/scrolls/throwables (`m_inventory_slots`), familiars and their levels (`m_familiars`), gold coins (`m_coins`), and souls (`m_souls_to_collect`).
  - **Run Stats**: Current health (`m_health`), maximum health (`m_maximum_health`), extra lives (`m_lives`), permanent stat offsets (`m_vitality_offset`, `m_strength_offset`, `m_uncapped_vitality`, `m_uncapped_spell_damage`), all active status-effect stacks (`m_status_effects` — both blessings/elixirs and curses/diseases), and disease/curse counters (`m_treasure_phobia_counter`, `m_food_poisoning_counter`, `m_fat_counter`).

### 3. Mode-Specific Rules & Starting Camp
- **Normal Campaign (`game_mode == 0`)**: Floor `0` (`forest`) spawns players in the **Starting Camp** with their carried **Hero Loadout** and **Run Stats**. Players may proceed through the forest gate into Loop 2+, interact with class totems (which invoke vanilla `change_hero_class()` and drop class-incompatible gear), use the **Alchemist Reset** on Tim (`m_npc == 1`), or enter camp mode portals (carrying their build into **Endless Dungeon** or Mighty Foot; Dagger Mutation enforces its daggers-only rule as normal).
- **Alchemist Reset (`NPC.m_npc == 1` in Starting Camp)**:
  - Standing near Tim the Alchemist displays the proximity prompt `"%% to reset character"`.
  - Pressing Interact opens a native Camp `ListWindow` menu (`m_ingame_menu == 3`) with three options (`InputEvent(5)`):
    1. **Reset Character (Full)** (`m_value = 101`): Resets both **Hero Loadout** and **Run Stats** (including status effects, blessings, curses, diseases, stat offsets, coins, and souls) to starting class defaults, restores full base class HP, updates `m_hero_data_per_player`, and replenishes `WorldState` loot pools (filtering items held by any other active co-op player).
    2. **Reset Gear & Items Only** (`m_value = 102`): Resets **Hero Loadout** (weapon, equipped items, consumables, **Passive Modifiers**, familiars, coins, and souls) to starting class defaults while preserving **Run Stats**, updates `m_hero_data_per_player`, and replenishes `WorldState` loot pools.
    3. **Reset Stats & Effects Only** (`m_value = 103`): Resets **Run Stats** (vitality/strength/spell-damage offsets, blessings, curses, diseases, and lives) and restores base class HP while preserving current **Hero Loadout**, and updates `m_hero_data_per_player`.
- **Shadow World (`game_mode == 1`)**: Because `m_last_level_index` is reset to `-1` before floor `0`, `Hero.set_player()` invokes `randomize_shadow_world_hero()` on floor `0` just as on every floor of **Shadow World** — preserving carried gold coins, extra lives, maximum health, and souls while dealing a fresh random class, loadout, and status effects per floor.
- **Endless Dungeon (`game_mode == 2`) Difficulty Respawn & Manual Return to Starting Camp**:
  - **Difficulty Preservation**: Entering **Endless Dungeon** from the **Starting Camp** (`m_switch_to_game_mode == 2`) and advancing across Endless floors (including floor 13's `m_gparam_level_challenge == 2`) preserves the difficulty selected in the **Starting Camp** (`world_state.m_game_difficulty` and `m_gparam_generate_difficulty` in `{0, 1, 2, 3}`) instead of forcibly overwriting it to Hard (`2`) or Insane (`3`).
    - On **Casual (`0`)**, dying (`is_game_over() == true`) respawns players at the latest floor checkpoint (`m_checkpoint_blob`) via `LevelScreen.finish_level()` (`what = 1`), and entering a new floor restores full HP, matching **Campaign** Casual rules.
    - On **Normal / Hard / Insane (`1, 2, 3`)**, dying after exhausting extra lives triggers permadeath (`stop_game(); start_game()`), matching **Campaign** rules.
  - **Manual `"Return to Camp"` Pause Menu Option**:
    - When the active run is in **Endless Dungeon** (`game_mode == 2`), the Pause Menu (`MainSubMenu` with `m_menu_type == 1`) displays a `"Return to Camp"` button above `"Save & Quit"`.
    - Selecting `"Return to Camp"` closes the Pause Menu and transitions the run back to floor `0` (`forest`, `game_mode == 0` **Starting Camp**) via `world_state.begin_level_transition_to_game_mode(-1)` while carrying over every live player's current **Hero Loadout** and **Run Stats**, re-rolling the world seed, and replenishing `WorldState` loot pools.

### 4. Dungeon Seed & Loot Pool Replenishment
- **Fresh Dungeon Seed**: Wrapping from floor `9` to floor `0` advances the deterministic RNG (`rand()`) to re-seed `m_original_world_seed_0..3` so each **Carryover Loop** generates new dungeon layouts rather than replaying the prior loop's map seed.
- **Deck & Camp Rack Reset**: Wrapping resets `m_gparam_used_room_types_working_copy = []` (satisfying `World.switch_to_next_level`'s non-null assertion and clearing `m_gparam_used_room_types`), clears `world_state.m_altar_types_rand_list = []`, and regenerates `m_starting_weapon_for_class0..7` and `m_starting_throwable_for_assassin`.
- **Smart Loot Pool Replenishment**:
  - Call `Loot.initialize_world_loot(world_state)` to refill and shuffle all item pools and chest random lists.
  - Parse owned item and familiar identifiers from `world_state.m_hero_data_per_player` and remove already-owned **Passive Modifiers** from `world_state.m_mods_pool` and already-owned familiars from `world_state.m_familiars_pool` so chests and shops continue offering unowned upgrades. If filtering would empty a pool (players already own every item in that category), keep the refilled shuffled pool as a fallback.
- **Duplicate Passive Modifier Guard**: Extend `Hero.check_can_pick_item(item, play_nonono)` so holding an identical **Passive Modifier** (`is_mod(item)` matching an existing entry in `m_items`) is rejected via `init_no_endless_mod_pick` in finite **Campaign** modes just as in **Endless Dungeon**.

### 5. Multiplayer & Save Schema Invariants
- **Zero `StateObject` Schema Changes**: No `StateObject` serialized member attributes (`NEWSLOTA`) may be added, removed, or reordered. All carryover state lives inside existing `World` and `WorldState` fields.
- **Lockstep / Rollback Determinism**: All seed rolling and pool filtering during wrap-around must use the simulation's deterministic `rand()` (never wall-clock time or local `PlayerProfile` state) so Single-Player, Local Co-op, and modded Online Co-op maintain identical `get_state_crc` values.

---

## Module Design

Place a single deep **`CampaignCarryover` module** behind the `scripts/preload.nut` bootstrap **seam** (see [ADR 0001](../../adr/0001-plaintext-squirrel-override-seam.md) and [`docs/architecture-review-20261117-modding-crud-ui.html`](../../architecture-review-20261117-modding-crud-ui.html)):

### Interface

```squirrel
class CampaignCarryover {
    // Installs carryover method wrappers onto the supplied environment table.
    // Must be called after World, WorldState, LevelScreen, and Hero are defined
    // and before Network.register_state_class() locks StateObject classes.
    static function install(env = null)
}
```

- **`env` parameter (Seam for two adapters)**:
  1. **Runtime Adapter**: `getroottable()` at the bottom of `scripts/preload.nut`, wiring live `World`, `WorldState`, `LevelScreen`, `Hero`, `Loot`, `ProfileData`, and `rand`.
  2. **Stand-in Test Adapter**: A lightweight Squirrel/test table supplying fake `World`, `WorldState`, `LevelScreen`, `Hero`, `Loot`, and deterministic `rand` to test wrap-around, snapshot capture, pool filtering, and Game Over invariants offline without launching OpenGL/Steam.

### Internal Responsibilities (Hidden Implementation)
1. **`WorldState.trigger_game_end` wrapper**: Captures `m_last_level_index = -1` and `save_hero_data_to_world()` for all live players when `m_game_state == 0`, then delegates to base `trigger_game_end()`.
2. **`LevelScreen.finish_level` wrapper**: Intercepts `m_world.m_world_state.is_game_end() == true` when `m_world.get_game_mode()` is in `{0, 1, 3, 4}` via `_prepare_loop_states(root, this)` (so no `StateObject` references remain on `finish_level`'s stack frame when `stop_game()` calls `end_destroy_map()`), routing execution through the next-level transition (`create_checkpoint()` $\to$ `save_state()` $\to$ `stop_game()` $\to$ `start_next_level()`) instead of `start_game()`, while delegating all Game Over, Casual checkpoint, and non-campaign flows unchanged.
3. **`World.switch_to_next_level` wrapper**:
   - Detects `m_gparam_game_mode` in `{0, 1, 3, 4}` with `m_gparam_level_index >= 9` (and `world_state.m_switch_to_game_mode == 0`), or manual **Endless Dungeon** return to camp (`m_gparam_game_mode == 2` with `world_state.m_switch_to_game_mode == -1`), performs floor-`0` wrap-around (`m_gparam_game_mode = 0` when returning from Endless, `m_gparam_level_index = 0`, `m_gparam_level_type = "forest"`, `m_gparam_level_challenge = 0`, `m_gparam_generate_difficulty = world_state.m_game_difficulty`, fresh `m_original_world_seed_0..3`, `m_gparam_used_room_types = []`, `m_gparam_used_room_types_working_copy = null`, `m_frame_index = 0`), and refreshes `world_state` loot/altar/starting-weapon pools with owned **Passive Modifier** and familiar filtering.
   - Otherwise delegates to base `switch_to_next_level(world_state)` while preserving `world_state.m_game_difficulty` and `m_gparam_generate_difficulty` when transitioning into or advancing through **Endless Dungeon** (`m_gparam_game_mode == 2`).
4. **`Hero.check_can_pick_item` wrapper**: Rejects picking up a **Passive Modifier** already present in `this.m_items` (triggering `init_no_endless_mod_pick` when `play_nonono` is true) before delegating to base `check_can_pick_item(item, play_nonono)`.
5. **`HUDInteractPopup.get_tooltip_text_and_control` wrapper**: Returns `["%% to reset character", 17]` when `entity` is Tim the Alchemist (`NPC` with `m_npc == 1`), otherwise delegates to base `get_tooltip_text_and_control(hero, entity)`.
6. **`Hero.do_try_pick_item` wrapper**: Opens the **Alchemist Reset** menu (`m_ingame_menu = 3`) when interacting with Tim (`m_npc == 1`) and clears other local heroes' `m_ingame_menu = 0` in Local Co-op, otherwise delegates to base `do_try_pick_item()`.
7. **`HUDInGameMenuManager.update` wrapper**: Populates `m_ingame_menu == 3` with a `ListWindow` containing `CheatPanelCell` options `101`, `102`, and `103` (`InputEvent(5)`), then delegates to base `update(dt, player, player2)`.
8. **`Hero.update_input_events` wrapper**: Executes the selected **Alchemist Reset** (`101` Full, `102` Gear & Items Only, `103` Stats & Effects Only) on the interacting hero and syncs `WorldState` before delegating to base `update_input_events()`.
9. **`MainSubMenu.layout_buttons` wrapper**: When `m_menu_type == 1` (in-game Pause Menu) and the active run is in **Endless Dungeon** (`game_mode == 2`), inserts a `"Return to Camp"` button (`menu_event = 5`) above `"Save & Quit"` that closes the Pause Menu and triggers `world_state.begin_level_transition_to_game_mode(-1)`.

---

## Acceptance Scenarios

1. **Single-Player & Local Co-op Campaign Clear**: Clearing floor `9` (`end`) of Normal Campaign plays the victory outro and theatre, then loads floor `0` (`forest` **Starting Camp**) with each player's weapon upgrades, armor/equips, consumables, **Passive Modifiers**, familiars, coins, souls, HP, extra lives, blessings, and curses intact.
2. **Mid-Run Save Resume & Clean New Game**: Quitting to Main Menu in floor `0` after a **Carryover Loop** and selecting `Continue` restores the carried hero(es); selecting `New Game` starts a fresh level-1 hero with default gear.
3. **Fresh Layout & Filtered Pools**: Floor `0` of Loop 2 has a different dungeon seed from Loop 1, refilled weapon/equip pools, and excludes already-held **Passive Modifiers** and familiars from `m_mods_pool` and `m_familiars_pool` unless all are owned.
4. **Duplicate Passive Modifier Guard**: Attempting to pick up a second copy of an already-owned **Passive Modifier** in a **Campaign** triggers the hero refusal animation (`init_no_endless_mod_pick`) rather than stacking duplicates.
5. **Shadow World Carryover**: Clearing floor `9` of **Shadow World** loops to floor `0` of **Shadow World**, retaining coins, extra lives, max HP, and souls while `randomize_shadow_world_hero()` deals a fresh random class and floor loadout.
6. **Game Over Permadeath**: Dying without extra lives or Casual checkpoint on Loop 2 ends the run and starts a fresh hero.
7. **Clean Uninstall**: Deleting `scripts/preload.nut` leaves all shipped files untouched and restores vanilla behavior without corrupting existing `Mid-Run Save` or `Player Profile` files.

---

## Out of Scope

- Persistent **Profile Vault** carryover into Main Menu `New Game` after Game Over.
- Modifying `rampage_knights.exe` or recompiling `.nut.bin` closures.
- Multi-mod manifest UI and save-slot partitioning (tracked separately as broader platform candidates in `docs/architecture-review-20261117-modding-crud-ui.html`).
