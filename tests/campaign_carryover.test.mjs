import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { SquirrelVM, SqClass, SqTable } from "./helpers/squirrel_vm.mjs";

const PRELOAD_PATH = path.resolve("scripts/preload.nut");

const STAND_IN_CLASSES_SOURCE = `
  class ProfileDataEntry
  {
      m_key = "";
      m_values = null;
      constructor(key)
      {
          m_key = key;
          m_values = [];
      }
      function add_string_value(v) { m_values.push(v); }
      function add_int_value(v) { m_values.push(v); }
      function as_string(idx) { return "" + m_values[idx]; }
      function as_int(idx) { return m_values[idx]; }
  }

  class ProfileData
  {
      m_data = null;
      constructor() { m_data = []; }
      function add_string(key, val)
      {
          local e = ::__env.ProfileDataEntry(key);
          e.add_string_value(val);
          m_data.push(e);
          return e;
      }
      function add_int(key, val)
      {
          local e = ::__env.ProfileDataEntry(key);
          e.add_int_value(val);
          m_data.push(e);
          return e;
      }
      function save_to_string()
      {
          local out = "";
          foreach (e in m_data)
          {
              local line = e.m_key;
              foreach (v in e.m_values)
              {
                  line = line + " " + v;
              }
              out = out + line + "\\n";
          }
          return out;
      }
      function load_from_string(str)
      {
          m_data = [];
          if (!str) return true;
          local start = 0;
          local n = str.len();
          while (start < n)
          {
              local nl = str.find("\\n", start);
              if (nl == null) nl = n;
              local line = str.slice(start, nl);
              start = nl + 1;
              if (line.len() > 0)
              {
                  local sp = line.find(" ", 0);
                  if (sp != null)
                  {
                      local key = line.slice(0, sp);
                      local rest = line.slice(sp + 1);
                      local sp2 = rest.find(" ", 0);
                      local firstTok = rest;
                      if (sp2 != null)
                      {
                          firstTok = rest.slice(0, sp2);
                      }
                      add_string(key, firstTok);
                  }
              }
          }
          return true;
      }
  }

  class Loot
  {
      static function initialize_world_loot(ws)
      {
          ws.m_weapon_1_pool = ["club", "cleaver"];
          ws.m_equips_pool = ["iron_helm", "plate_armor"];
          ws.m_mods_pool = ["mechanical_arms", "molten_mittens", "nightcrawlers_eye"];
          ws.m_familiars_pool = ["familiar_skull", "familiar_imp"];
          ws.m_wooden_chest_rand_list = [];
          ws.m_forest_t_loot_rand_list = [];
          ws.m_treasure_t_loot_rand_list = [];
      }
      static function generate_start_weapon(hero_class)
      {
          return "start_wpn_" + hero_class;
      }
      static function generate_throwable()
      {
          return "throwing_knife";
      }
  }

  class HeroInteractState
  {
      m_reason = "";
      function init_no_endless_mod_pick(hero)
      {
          m_reason = "no_endless_mod_pick";
          return this;
      }
  }

  class NPC
  {
      m_npc = 0;
      constructor(npc_id = 0)
      {
          m_npc = npc_id;
      }
  }

  class InputEvent
  {
      m_type = 0;
      m_value = 0;
      constructor(t)
      {
          m_type = t;
      }
  }

  class CheatPanelCell
  {
      m_cheat_id = 0;
      m_text = "";
      m_enabled = true;
      m_input_event = null;
      constructor(id, text, enabled = true)
      {
          m_cheat_id = id;
          m_text = text;
          m_enabled = enabled;
      }
  }

  class ListWindow
  {
      m_player = null;
      m_title = null;
      m_cells = null;
      constructor(player, title, cells, view, ok_text, cancel_text, sel_idx, layout_type)
      {
          m_player = player;
          m_title = title;
          m_cells = cells;
      }
      function update(player, dt) {}
  }

  class HUDInteractPopup
  {
      function get_tooltip_text_and_control(hero, entity)
      {
          return [null, 17];
      }
  }

  class HUDInGameMenuManager
  {
      m_player = null;
      m_menu_view = "menu_view";
      m_ingame_menu = 0;
      m_menu_window = null;
      function close_menu()
      {
          m_menu_window = null;
          m_ingame_menu = 0;
      }
      function resolution_changed() {}
      function update(dt, player, player2)
      {
          if (m_menu_window)
          {
              m_menu_window.update(m_player, dt);
          }
      }
  }

  class MainMenuButton
  {
      m_title = "";
      m_menu_event = 0;
      m_menu_event_arg = null;
      m_extra_padding = 0.0;
      m_next_control = null;
      m_previous_control = null;
      constructor(title, menu_event, menu_event_arg = null)
      {
          m_title = title;
          m_menu_event = menu_event;
          m_menu_event_arg = menu_event_arg;
      }
      function weakref()
      {
          return this;
      }
  }

  class MainSubMenu
  {
      m_menu_type = 0;
      m_buttons = null;
      constructor(menu_type)
      {
          m_menu_type = menu_type;
          m_buttons = [];
          if (menu_type == 1)
          {
              add_button("Continue", 6);
              add_button("Options", 3);
              add_button("How to Play", 31);
              local b = add_button("Save & Quit", 2);
              b.m_extra_padding = 100.0;
          }
          layout_buttons();
      }
      function add_button(title, menu_event, menu_event_arg = null, tooltip_text_id = null)
      {
          local b = ::__env.MainMenuButton(title, menu_event, menu_event_arg);
          m_buttons.push(b);
          return b;
      }
      function layout_buttons() {}
  }
`;

function buildStandInAdapter({ installOnRoot = false } = {}) {
  const calls = [];
  let rngState = [101, 202, 303, 404];
  let rngStep = 0;

  const vm = new SquirrelVM({
    GameScreen: new SqClass("GameScreen"),
  });

  // Load preload.nut first when testing standalone non-root adapter;
  // or load stand-in classes onto root first when testing root auto-bootstrap.
  if (!installOnRoot) {
    vm.runFile(PRELOAD_PATH);
  }

  const targetEnv = installOnRoot ? vm.root : new SqTable();
  const hostHelpers = {
    rand: (min = 0) => {
      rngStep++;
      rngState = [
        (rngState[0] + 17 + rngStep) | 0,
        (rngState[1] + 31 + rngStep) | 0,
        (rngState[2] + 47 + rngStep) | 0,
        (rngState[3] + 61 + rngStep) | 0,
      ];
      return min;
    },
    g_random_generator: {
      get_seed: (idx) => rngState[idx.v ?? idx],
      set_seed: (s0, s1, s2, s3) => {
        rngState = [s0.v ?? s0, s1.v ?? s1, s2.v ?? s2, s3.v ?? s3];
        calls.push(["set_seed", ...rngState]);
      },
    },
    GameEnd: {
      spawn: (room) => {
        calls.push(["GameEnd.spawn", room]);
        if (Array.isArray(room)) {
          const cmdCls = targetEnv.get("IngameCinematicCommand");
          room.push(vm.invokeCallable(cmdCls, null, []));
        }
      },
    },
    Network: {
      map_destroyed: () => {
        const stateClasses = new Set(["World", "WorldState", "IngameCinematicCommand"]);
        const alive = vm.findReachableInstances((inst) => stateClasses.has(inst.cls.name));
        if (alive.length > 0) {
          const hasCmd = alive.some((inst) => inst.cls.name === "IngameCinematicCommand");
          const sampleType = hasCmd ? "IngameCinematicCommand" : alive[0].cls.name;
          throw new Error(`1696 state object(s) still alive in end_destroy_map(), one of them of type ${sampleType} (error)`);
        }
      },
    },
    MapGenerator: {
      update_list_of_used_rooms_on_level_transition: (used) => {
        calls.push(["MapGenerator.update_used_rooms", [...used]]);
      },
    },
  };

  for (const [k, v] of Object.entries(hostHelpers)) {
    targetEnv.newslot(k, vm.wrapFromJS(v));
  }

  // Evaluate stand-in classes and bind them onto targetEnv
  vm.root.newslot("__env", targetEnv);
  vm.runSource(`
    ${STAND_IN_CLASSES_SOURCE}

    __env.ProfileDataEntry <- ProfileDataEntry;
    __env.ProfileData <- ProfileData;
    __env.Loot <- Loot;
    __env.HeroInteractState <- HeroInteractState;
    __env.NPC <- NPC;
    __env.InputEvent <- InputEvent;
    __env.CheatPanelCell <- CheatPanelCell;
    __env.ListWindow <- ListWindow;
    __env.HUDInteractPopup <- HUDInteractPopup;
    __env.HUDInGameMenuManager <- HUDInGameMenuManager;
    __env.MainMenuButton <- MainMenuButton;
    __env.MainSubMenu <- MainSubMenu;
    __env.g_difficulty <- 1;
    __env.g_endless <- false;
    __env.g_play_mode <- 0;
    __env.g_local_coop <- false;
    __env.g_level_screen <- null;
    __env.g_top_screen_removed <- false;
    __env.g_game <- {
        remove_top_game_screen = function() { ::__env.g_top_screen_removed = true; }
    };
    __env.get_play_mode <- function() { return ::__env.g_play_mode; };
    __env.is_local_coop_play_mode <- function() { return ::__env.g_local_coop; };
    __env.is_endless_mode <- function() {
        if (::__env.g_level_screen != null && ::__env.g_level_screen.m_world != null)
        {
            return ::__env.g_level_screen.m_world.get_game_mode() == 2;
        }
        return ::__env.g_endless;
    };
    __env.get_difficulty <- function() {
        if (::__env.g_level_screen != null && ::__env.g_level_screen.m_world != null && ::__env.g_level_screen.m_world.m_world_state != null)
        {
            return ::__env.g_level_screen.m_world.m_world_state.m_game_difficulty;
        }
        return ::__env.g_difficulty;
    };
    __env.gparams <- {
        reward_starting_coins = 50,
        disease_food_poisoning_counter = function() { return 3; },
        disease_fat_counter = function() { return 5; }
    };

    class IngameCinematicCommand
    {
        m_cmd = 0;
    }
    __env.IngameCinematicCommand <- IngameCinematicCommand;

    class WorldState
    {
        m_game_state = 0;
        m_game_difficulty = 1;
        m_switch_to_game_mode = 0;
        m_overlay_room = null;
        m_hero_data_per_player = null;
        m_altar_types_rand_list = null;
        m_weapon_1_pool = null;
        m_equips_pool = null;
        m_mods_pool = null;
        m_familiars_pool = null;
        m_wooden_chest_rand_list = null;
        m_forest_t_loot_rand_list = null;
        m_treasure_t_loot_rand_list = null;
        m_starting_weapon_for_class0 = null;
        m_starting_weapon_for_class1 = null;
        m_starting_weapon_for_class2 = null;
        m_starting_weapon_for_class3 = null;
        m_starting_weapon_for_class4 = null;
        m_starting_weapon_for_class5 = null;
        m_starting_weapon_for_class6 = null;
        m_starting_weapon_for_class7 = null;
        m_starting_throwable_for_assassin = null;

        constructor()
        {
            m_overlay_room = [];
            m_hero_data_per_player = ::array(4, null);
            m_altar_types_rand_list = [1, 2];
        }

        function store_hero_data(player_index, hero_data)
        {
            m_hero_data_per_player[player_index] = hero_data;
        }

        function access_hero_data(player_index)
        {
            return m_hero_data_per_player[player_index];
        }

        function is_game_over() { return m_game_state == 4; }
        function is_game_end() { return m_game_state >= 5 && m_game_state <= 8; }

        function trigger_game_end()
        {
            if (m_game_state == 0)
            {
                m_game_state = 5;
                ::__env.GameEnd.spawn(m_overlay_room);
            }
        }

        function begin_level_transition_to_game_mode(game_mode)
        {
            if (m_game_state == 0)
            {
                m_switch_to_game_mode = game_mode;
                m_game_state = 1;
            }
        }

        function complete_level_transition_to_game_mode()
        {
            if (m_game_state == 1 && m_switch_to_game_mode != 0)
            {
                foreach (p in ::__env.g_level_screen.m_players)
                {
                    if (p != null && p.is_live_player() && p.m_hero != null)
                    {
                        p.m_hero.m_last_level_index = -1;
                        p.m_hero.save_hero_data_to_world();
                    }
                }
                m_game_state = 3;
            }
        }

        function switch_to_next_level()
        {
            m_game_state = 0;
            m_switch_to_game_mode = 0;
        }

        function save_state()
        {
            return {
                m_game_state = m_game_state,
                m_game_difficulty = m_game_difficulty,
                m_switch_to_game_mode = m_switch_to_game_mode,
                m_hero_data_per_player = clone m_hero_data_per_player,
                m_altar_types_rand_list = clone m_altar_types_rand_list
            };
        }

        function restore_state(state)
        {
            foreach (k, v in state)
            {
                this[k] = v;
            }
        }
    }

    class World
    {
        m_world_state = null;
        m_gparam_game_mode = 0;
        m_gparam_level_index = 0;
        m_gparam_level_type = "forest";
        m_gparam_level_challenge = 0;
        m_gparam_generate_difficulty = 1;
        m_original_world_seed_0 = 11;
        m_original_world_seed_1 = 22;
        m_original_world_seed_2 = 33;
        m_original_world_seed_3 = 44;
        m_tick_seed_0 = 1;
        m_tick_seed_1 = 2;
        m_tick_seed_2 = 3;
        m_tick_seed_3 = 4;
        m_gparam_used_room_types = null;
        m_gparam_used_room_types_working_copy = null;
        m_frame_index = 500;

        constructor()
        {
            m_gparam_used_room_types = ["room_a"];
            m_gparam_used_room_types_working_copy = ["room_a", "room_b"];
        }

        function get_game_mode() { return m_gparam_game_mode; }
        function is_shadow_world() { return m_gparam_game_mode == 1; }

        function select_campaign_level_type_from_level_index(idx)
        {
            if (idx == 0) return "forest";
            if (idx == 4) return "boss";
            if (idx == 9) return "end";
            return "dungeon";
        }

        function switch_to_next_level(world_state)
        {
            if (m_gparam_game_mode == 0 || m_gparam_game_mode == 1 || m_gparam_game_mode == 3 || m_gparam_game_mode == 4)
            {
                if (m_gparam_level_index < 9)
                {
                    m_gparam_level_index = m_gparam_level_index + 1;
                    m_gparam_level_type = select_campaign_level_type_from_level_index(m_gparam_level_index);
                    m_gparam_level_challenge = 0;
                }
            }
            else if (m_gparam_game_mode == 2)
            {
                m_gparam_level_index = m_gparam_level_index + 1;
                if (m_gparam_level_index == 13)
                {
                    m_gparam_level_type = "boss";
                    m_gparam_level_challenge = 2;
                }
                else
                {
                    m_gparam_level_type = "endless_normal";
                    m_gparam_level_challenge = 0;
                }
            }
            if (m_gparam_game_mode == 0 && world_state.m_switch_to_game_mode == 2)
            {
                m_gparam_game_mode = 2;
                m_gparam_level_index = 0;
                m_gparam_level_type = "forest";
                m_gparam_level_challenge = 1;
                world_state.m_game_difficulty = 2;
            }
            if (m_gparam_level_challenge == 2)
            {
                world_state.m_game_difficulty = 3;
            }
            m_gparam_generate_difficulty = world_state.m_game_difficulty;
            assert(m_gparam_used_room_types_working_copy != null);
            m_gparam_used_room_types = m_gparam_used_room_types_working_copy;
            m_gparam_used_room_types_working_copy = null;
            if (m_gparam_level_type != "boss" && m_gparam_level_type != "paladin")
            {
                ::__env.MapGenerator.update_list_of_used_rooms_on_level_transition(m_gparam_used_room_types);
            }
            m_frame_index = 0;
        }

        function save_state()
        {
            return {
                m_gparam_game_mode = m_gparam_game_mode,
                m_gparam_level_index = m_gparam_level_index,
                m_gparam_level_type = m_gparam_level_type,
                m_gparam_level_challenge = m_gparam_level_challenge,
                m_gparam_generate_difficulty = m_gparam_generate_difficulty,
                m_original_world_seed_0 = m_original_world_seed_0,
                m_original_world_seed_1 = m_original_world_seed_1,
                m_original_world_seed_2 = m_original_world_seed_2,
                m_original_world_seed_3 = m_original_world_seed_3,
                m_tick_seed_0 = m_tick_seed_0,
                m_tick_seed_1 = m_tick_seed_1,
                m_tick_seed_2 = m_tick_seed_2,
                m_tick_seed_3 = m_tick_seed_3,
                m_gparam_used_room_types = m_gparam_used_room_types,
                m_gparam_used_room_types_working_copy = m_gparam_used_room_types_working_copy,
                m_frame_index = m_frame_index
            };
        }

        function restore_state(state)
        {
            foreach (k, v in state)
            {
                this[k] = v;
            }
        }
    }

    class Hero
    {
        m_player_index = 0;
        m_hero_class = 0;
        m_last_level_index = 9;
        m_coins = 250;
        m_souls_to_collect = 4;
        m_lives = 2;
        m_extra_lives = 1;
        m_health = 85;
        m_maximum_health = 140;
        m_vitality_offset = 30;
        m_strength_offset = 15;
        m_uncapped_vitality = 20;
        m_uncapped_spell_damage = 10;
        m_treasure_phobia_counter = 2;
        m_food_poisoning_counter = 1;
        m_fat_counter = 1;
        m_weapon = "epic_sword";
        m_items = null;
        m_inventory_slots = null;
        m_familiars = null;
        m_status_effects = null;
        m_ingame_menu = 0;
        m_room = null;
        m_best_pick = null;
        m_pending_events = null;
        m_state_name = "";
        m_state_obj = null;
        m_base_pick_calls = 0;
        m_shadow_randomized = false;

        constructor()
        {
            m_items = [];
            m_inventory_slots = [null, null, null, null];
            m_familiars = [];
            m_status_effects = [];
            m_pending_events = [];
        }

        function set_state(name, obj)
        {
            m_state_name = name;
            m_state_obj = obj;
        }

        function find_best_item_to_pick()
        {
            return m_best_pick;
        }

        function do_try_pick_item()
        {
            return false;
        }

        function get_input_events()
        {
            return m_pending_events;
        }

        function update_input_events()
        {
            foreach (e in m_pending_events)
            {
                if (e != null && e.m_type == 5)
                {
                    m_ingame_menu = 0;
                }
            }
        }

        function is_reward_unlocked(id)
        {
            return false;
        }

        function remove_all_status_effects_for_shadow_world()
        {
            m_status_effects = [];
        }

        function reset_treasure_chest_phobia_counter()
        {
            m_treasure_phobia_counter = 0;
        }

        function reset_all_hero_items()
        {
            m_weapon = null;
            m_items = [];
            m_inventory_slots = [null, null, null, null];
            m_familiars = [];
        }

        function add_default_hero_items()
        {
            m_weapon = "rusty_sword";
            m_items = [{ m_def = { _name = "boots_start" } }];
        }

        function initialize_from_class()
        {
            if (::__env.get_play_mode() == 0 && m_hero_class != 4)
            {
                m_lives = 2;
            }
            else
            {
                m_lives = 1;
            }
            m_coins = 0;
            reset_all_hero_items();
            add_default_hero_items();
        }

        function refresh_hero_after_item_without_action()
        {
            m_maximum_health = 100 + m_vitality_offset;
        }

        function save_hero_data_to_string()
        {
            local pd = ::__env.ProfileData();
            pd.add_int("lives", m_lives);
            pd.add_int("max_health", m_maximum_health);
            pd.add_int("health", m_health);
            pd.add_int("vitality_offset", m_vitality_offset);
            pd.add_int("strength_offset", m_strength_offset);
            pd.add_int("coins", m_coins);
            pd.add_int("souls_to_collect", m_souls_to_collect);
            pd.add_int("last_level_index", m_last_level_index);
            foreach (it in m_items)
            {
                local e = pd.add_string("item", it.m_def._name);
                e.add_int_value(1);
            }
            return pd.save_to_string();
        }

        function save_hero_data_to_world()
        {
            local data = save_hero_data_to_string();
            ::__env.g_level_screen.m_world.m_world_state.store_hero_data(m_player_index, data);
        }

        function initialize_from_hero_data(pd)
        {
            foreach (entry in pd.m_data)
            {
                if (entry.m_key == "lives") m_lives = entry.as_string(0);
                if (entry.m_key == "max_health") m_maximum_health = entry.as_string(0);
                if (entry.m_key == "health") m_health = entry.as_string(0);
                if (entry.m_key == "coins") m_coins = entry.as_string(0);
                if (entry.m_key == "souls_to_collect") m_souls_to_collect = entry.as_string(0);
                if (entry.m_key == "last_level_index") m_last_level_index = entry.as_string(0);
            }
        }

        function randomize_shadow_world_hero()
        {
            m_shadow_randomized = true;
            m_vitality_offset = 0;
            m_strength_offset = 0;
            m_items = [{ m_def = { _name = "shadow_random_sword" } }];
        }

        function spawn_on_level(world, level_index)
        {
            local hdata = world.m_world_state.access_hero_data(m_player_index);
            if (hdata != null)
            {
                local pd = ::__env.ProfileData();
                pd.load_from_string(hdata);
                initialize_from_hero_data(pd);
            }
            if (m_last_level_index != "" + level_index && ::__env.get_difficulty() == 0)
            {
                m_health = m_maximum_health;
            }
            if (m_last_level_index != "" + level_index && world.is_shadow_world())
            {
                randomize_shadow_world_hero();
            }
        }

        function check_can_pick_item(item, play_nonono)
        {
            m_base_pick_calls = m_base_pick_calls + 1;
            if (!item) return true;
            if (::__env.g_endless && item.is_mod())
            {
                foreach (existing in m_items)
                {
                    if (existing.m_def._name == item.m_def._name)
                    {
                        if (play_nonono)
                        {
                            set_state("state_interact", ::__env.HeroInteractState().init_no_endless_mod_pick(this));
                        }
                        return false;
                    }
                }
            }
            return true;
        }
    }

    class LevelScreen
    {
        m_world = null;
        m_players = null;
        m_checkpoint_blob = null;
        m_actions = null;

        constructor()
        {
            m_players = [];
            m_actions = [];
        }

        function create_checkpoint()
        {
            m_checkpoint_blob = [m_world.save_state(), m_world.m_world_state.save_state()];
            m_actions.push("create_checkpoint");
        }

        function unpack_checkpoint_state()
        {
            m_actions.push("unpack_checkpoint_state");
            return m_checkpoint_blob;
        }

        function stop_game()
        {
            m_actions.push("stop_game");
            m_players = ::array(4, null);
            m_world = null;
            ::__env.Network.map_destroyed();
        }

        function start_game()
        {
            m_actions.push("start_game");
        }

        function start_next_level(w_state, ws_state)
        {
            m_actions.push("start_next_level");
            m_world = ::__env.World();
            local world_state = ::__env.WorldState();
            m_world.restore_state(w_state);
            world_state.restore_state(ws_state);
            m_world.switch_to_next_level(world_state);
            world_state.switch_to_next_level();
            m_world.m_world_state = world_state;
        }

        function finish_level()
        {
            local game_over = m_world.m_world_state.is_game_over();
            local game_end = m_world.m_world_state.is_game_end();
            local what = 0;
            if (game_end)
            {
                what = 0;
            }
            else if (game_over)
            {
                if (::__env.get_difficulty() == 0 && m_checkpoint_blob != null)
                {
                    what = 1;
                }
                else
                {
                    what = 0;
                }
            }
            else if (m_world.get_game_mode() == 5)
            {
                what = 0;
            }
            else
            {
                what = 2;
            }

            if (what == 0)
            {
                stop_game();
                start_game();
            }
            else if (what == 1)
            {
                local state = unpack_checkpoint_state();
                local w_state = state[0];
                local ws_state = state[1];
                ::__env.g_random_generator.set_seed(w_state.m_tick_seed_0, w_state.m_tick_seed_1, w_state.m_tick_seed_2, w_state.m_tick_seed_3);
                stop_game();
                start_next_level(w_state, ws_state);
            }
            else
            {
                create_checkpoint();
                local w_state = m_world.save_state();
                local ws_state = m_world.m_world_state.save_state();
                stop_game();
                start_next_level(w_state, ws_state);
            }
        }
    }

    __env.WorldState <- WorldState;
    __env.World <- World;
    __env.Hero <- Hero;
    __env.LevelScreen <- LevelScreen;
  `);

  if (!installOnRoot) {
    // Remove classes from root so standalone targetEnv proves zero hidden root dependency
    for (const k of ["ProfileDataEntry", "ProfileData", "Loot", "HeroInteractState", "NPC", "InputEvent", "CheatPanelCell", "ListWindow", "HUDInteractPopup", "HUDInGameMenuManager", "MainMenuButton", "MainSubMenu", "IngameCinematicCommand", "WorldState", "World", "Hero", "LevelScreen"]) {
      vm.root.slots.delete(k);
    }
    const carryover = vm.root.get("CampaignCarryover");
    vm.invokeCallable(carryover.get("install"), carryover, [targetEnv]);
  }

  return { vm, env: targetEnv, calls };
}

test("Seam 2A: WorldState.trigger_game_end snapshots live players into m_hero_data_per_player with m_last_level_index = -1 on a standalone env table", () => {
  const { vm, calls } = buildStandInAdapter({ installOnRoot: false });

  const res = vm.runSource(`
    local ls = __env.LevelScreen();
    local w = __env.World();
    local ws = __env.WorldState();
    w.m_world_state = ws;
    ls.m_world = w;
    __env.g_level_screen = ls;

    local h0 = __env.Hero();
    h0.m_player_index = 0;
    h0.m_last_level_index = 9;
    h0.m_coins = 777;
    h0.m_items.push({ m_def = { _name = "mechanical_arms" } });

    local h1 = __env.Hero();
    h1.m_player_index = 1;
    h1.m_last_level_index = 9;
    h1.m_coins = 333;

    ls.m_players = [
      { m_hero = h0, is_live_player = function() { return true; } },
      { m_hero = h1, is_live_player = function() { return false; } }
    ];

    ws.trigger_game_end();
    return [ws.m_game_state, h0.m_last_level_index, ws.access_hero_data(0), ws.access_hero_data(1)];
  `);

  const [gameState, lastLevelIdx, p0Data, p1Data] = vm.unwrapToJS(res);
  assert.equal(gameState, 5);
  assert.equal(lastLevelIdx, -1);
  assert.match(p0Data, /coins 777/);
  assert.match(p0Data, /last_level_index -1/);
  assert.match(p0Data, /item mechanical_arms/);
  assert.equal(p1Data, null);
  assert.equal(calls.length, 1);
  assert.equal(calls[0][0], "GameEnd.spawn");
});

test("Seam 2B: End-to-end floor-9 Campaign Clear (Normal & Shadow World) loops to floor 0 via start_next_level while preserving Game Over and Casual checkpoints", () => {
  const { vm } = buildStandInAdapter({ installOnRoot: false });

  const res = vm.runSource(`
    // 1. End-to-end Shadow World (mode 1) floor-9 Campaign Clear -> floor 0 with carried coins/lives/max_health/souls & randomized floor loadout
    local lsShadow = __env.LevelScreen();
    lsShadow.m_world = __env.World();
    lsShadow.m_world.m_gparam_game_mode = 1;
    lsShadow.m_world.m_gparam_level_index = 9;
    lsShadow.m_world.m_gparam_level_type = "end";
    lsShadow.m_world.m_world_state = __env.WorldState();
    __env.g_level_screen = lsShadow;

    local shadowHero = __env.Hero();
    shadowHero.m_coins = 999;
    shadowHero.m_lives = 3;
    shadowHero.m_maximum_health = 180;
    shadowHero.m_souls_to_collect = 7;
    lsShadow.m_players = [{ m_hero = shadowHero, is_live_player = function() { return true; } }];
    shadowHero = null;

    lsShadow.m_world.m_world_state.trigger_game_end();
    lsShadow.m_world.m_world_state.m_game_state = 8; // outro + theatre finished
    lsShadow.finish_level();

    local nextShadowHero = __env.Hero();
    nextShadowHero.spawn_on_level(lsShadow.m_world, lsShadow.m_world.m_gparam_level_index);
    local shadowActions = lsShadow.m_actions;
    local shadowModeAfter = lsShadow.m_world.m_gparam_game_mode;
    local shadowLevelIdxAfter = lsShadow.m_world.m_gparam_level_index;
    local shadowLevelTypeAfter = lsShadow.m_world.m_gparam_level_type;
    lsShadow = null;
    __env.g_level_screen = null;

    // 2. Game Over on Normal difficulty -> permadeath reset via start_game
    local lsDeath = __env.LevelScreen();
    lsDeath.m_world = __env.World();
    lsDeath.m_world.m_world_state = __env.WorldState();
    __env.g_difficulty = 1;
    lsDeath.m_world.m_world_state.m_game_state = 4;
    lsDeath.m_checkpoint_blob = [lsDeath.m_world.save_state(), lsDeath.m_world.m_world_state.save_state()];
    lsDeath.finish_level();
    local deathActions = lsDeath.m_actions;
    lsDeath = null;

    // 3. Game Over on Casual difficulty with checkpoint -> retry via unpack_checkpoint_state
    local lsCasual = __env.LevelScreen();
    lsCasual.m_world = __env.World();
    lsCasual.m_world.m_world_state = __env.WorldState();
    __env.g_difficulty = 0;
    lsCasual.m_world.m_world_state.m_game_state = 4;
    lsCasual.m_checkpoint_blob = [lsCasual.m_world.save_state(), lsCasual.m_world.m_world_state.save_state()];
    lsCasual.finish_level();
    local casualActions = lsCasual.m_actions;
    lsCasual = null;

    return [
      shadowActions,
      shadowModeAfter,
      shadowLevelIdxAfter,
      shadowLevelTypeAfter,
      nextShadowHero.m_coins,
      nextShadowHero.m_lives,
      nextShadowHero.m_maximum_health,
      nextShadowHero.m_souls_to_collect,
      nextShadowHero.m_shadow_randomized,
      deathActions,
      casualActions
    ];
  `);

  const [
    shadowActions,
    shadowMode,
    shadowLevelIdx,
    shadowLevelType,
    shadowCoins,
    shadowLives,
    shadowMaxHp,
    shadowSouls,
    shadowRandomized,
    normalDeathActions,
    casualDeathActions,
  ] = vm.unwrapToJS(res);

  assert.deepEqual(shadowActions, ["create_checkpoint", "stop_game", "start_next_level"]);
  assert.equal(shadowMode, 1);
  assert.equal(shadowLevelIdx, 0);
  assert.equal(shadowLevelType, "forest");
  assert.equal(shadowCoins, "999");
  assert.equal(shadowLives, "3");
  assert.equal(shadowMaxHp, "180");
  assert.equal(shadowSouls, "7");
  assert.equal(shadowRandomized, true);
  assert.deepEqual(normalDeathActions, ["stop_game", "start_game"]);
  assert.deepEqual(casualDeathActions, ["unpack_checkpoint_state", "stop_game", "start_next_level"]);
});

test("Seam 2C: World.switch_to_next_level wraps floor 9 -> 0 (forest), re-rolls seeds, resets Starting Camp weapon racks & decks, filters owned Passive Modifiers & familiars with fallback, and keeps <9 floors vanilla", () => {
  const { vm } = buildStandInAdapter({ installOnRoot: false });

  const res = vm.runSource(`
    local w = __env.World();
    local ws = __env.WorldState();
    w.m_gparam_game_mode = 3;
    w.m_gparam_level_index = 9;
    w.m_gparam_level_type = "end";
    w.m_gparam_used_room_types_working_copy = null;
    ws.m_game_difficulty = 2;

    local pd0 = __env.ProfileData();
    pd0.add_string("item", "mechanical_arms");
    pd0.add_string("item", "familiar_skull");
    ws.store_hero_data(0, pd0.save_to_string());

    local pd1 = __env.ProfileData();
    pd1.add_string("item", "molten_mittens");
    ws.store_hero_data(1, pd1.save_to_string());

    local oldSeed0 = w.m_original_world_seed_0;
    w.switch_to_next_level(ws);

    // Pool exhaustion fallback when players already own all familiars in pool
    local wAll = __env.World();
    local wsAll = __env.WorldState();
    wAll.m_gparam_game_mode = 0;
    wAll.m_gparam_level_index = 9;
    local pdAll = __env.ProfileData();
    pdAll.add_string("item", "familiar_skull");
    pdAll.add_string("item", "familiar_imp");
    wsAll.store_hero_data(0, pdAll.save_to_string());
    wAll.switch_to_next_level(wsAll);

    // Mid-Campaign floor 3 -> 4 (boss) stays vanilla
    local wMid = __env.World();
    local wsMid = __env.WorldState();
    wMid.m_gparam_game_mode = 0;
    wMid.m_gparam_level_index = 3;
    wMid.switch_to_next_level(wsMid);

    return [
      w.m_gparam_game_mode,
      w.m_gparam_level_index,
      w.m_gparam_level_type,
      w.m_gparam_generate_difficulty,
      w.m_original_world_seed_0 != oldSeed0,
      w.m_gparam_used_room_types,
      w.m_gparam_used_room_types_working_copy,
      ws.m_altar_types_rand_list,
      ws.m_mods_pool,
      ws.m_familiars_pool,
      ws.m_starting_weapon_for_class0.len(),
      ws.m_starting_throwable_for_assassin.len(),
      ws.access_hero_data(0) != null,
      wsAll.m_familiars_pool,
      wMid.m_gparam_level_index,
      wMid.m_gparam_level_type
    ];
  `);

  const [
    mode,
    levelIdx,
    levelType,
    genDiff,
    seedChanged,
    usedRooms,
    workingCopy,
    altars,
    modsPool,
    familiarsPool,
    startWpnLen,
    assassinThrowLen,
    hero0Preserved,
    exhaustedFallbackFamiliars,
    midIdx,
    midType,
  ] = vm.unwrapToJS(res);

  assert.equal(mode, 3);
  assert.equal(levelIdx, 0);
  assert.equal(levelType, "forest");
  assert.equal(genDiff, 2);
  assert.equal(seedChanged, true);
  assert.deepEqual(usedRooms, []);
  assert.equal(workingCopy, null);
  assert.deepEqual(altars, []);
  assert.deepEqual(modsPool, ["nightcrawlers_eye"]);
  assert.deepEqual(familiarsPool, ["familiar_imp"]);
  assert.equal(startWpnLen, 4);
  assert.equal(assassinThrowLen, 4);
  assert.equal(hero0Preserved, true);
  assert.deepEqual(exhaustedFallbackFamiliars, ["familiar_skull", "familiar_imp"]);
  assert.equal(midIdx, 4);
  assert.equal(midType, "boss");
});

test("Seam 2D: Hero.check_can_pick_item blocks duplicate Passive Modifiers before base delegation (allowing familiars & equipment swaps), auto-installs at root bootstrap, and mutates zero StateObject field schemas", () => {
  const { vm } = buildStandInAdapter({ installOnRoot: true });

  const beforeFields = {
    World: [...vm.root.get("World").fields.keys()],
    WorldState: [...vm.root.get("WorldState").fields.keys()],
    LevelScreen: [...vm.root.get("LevelScreen").fields.keys()],
    Hero: [...vm.root.get("Hero").fields.keys()],
  };

  vm.runFile(PRELOAD_PATH);

  const afterFields = {
    World: [...vm.root.get("World").fields.keys()],
    WorldState: [...vm.root.get("WorldState").fields.keys()],
    LevelScreen: [...vm.root.get("LevelScreen").fields.keys()],
    Hero: [...vm.root.get("Hero").fields.keys()],
  };
  assert.deepEqual(afterFields, beforeFields);

  const res = vm.runSource(`
    ::g_endless = false;
    local hero = Hero();
    hero.m_items.push({ m_def = { _name = "mechanical_arms" } });
    hero.m_items.push({ m_def = { _name = "familiar_skull" } });

    local dupMod = {
      m_def = { _name = "mechanical_arms" },
      is_mod = function() { return true; },
      is_familiar_item = function() { return false; }
    };
    local newMod = {
      m_def = { _name = "molten_mittens" },
      is_mod = function() { return true; },
      is_familiar_item = function() { return false; }
    };
    local dupFamiliar = {
      m_def = { _name = "familiar_skull" },
      is_mod = function() { return false; },
      is_familiar_item = function() { return true; }
    };
    local slotEquip = {
      m_def = { _name = "mechanical_arms" },
      is_mod = function() { return false; },
      is_familiar_item = function() { return false; }
    };

    local canDupModSilent = hero.check_can_pick_item(dupMod, false);
    local baseCallsAfterDupMod = hero.m_base_pick_calls;
    local stateAfterSilent = hero.m_state_name;
    local canDupModLoud = hero.check_can_pick_item(dupMod, true);
    local stateAfterLoud = hero.m_state_name;
    local reasonAfterLoud = hero.m_state_obj.m_reason;
    local canFamiliar = hero.check_can_pick_item(dupFamiliar, true);
    local canNewMod = hero.check_can_pick_item(newMod, true);
    local canSlotEquip = hero.check_can_pick_item(slotEquip, true);

    return [
      canDupModSilent,
      baseCallsAfterDupMod,
      stateAfterSilent,
      canDupModLoud,
      stateAfterLoud,
      reasonAfterLoud,
      canFamiliar,
      canNewMod,
      canSlotEquip
    ];
  `);

  const [
    canDupModSilent,
    baseCallsAfterDupMod,
    stateAfterSilent,
    canDupModLoud,
    stateAfterLoud,
    reasonAfterLoud,
    canFamiliar,
    canNewMod,
    canSlotEquip,
  ] = vm.unwrapToJS(res);

  assert.equal(canDupModSilent, false);
  assert.equal(baseCallsAfterDupMod, 0);
  assert.equal(stateAfterSilent, "");
  assert.equal(canDupModLoud, false);
  assert.equal(stateAfterLoud, "state_interact");
  assert.equal(reasonAfterLoud, "no_endless_mod_pick");
  assert.equal(canFamiliar, true);
  assert.equal(canNewMod, true);
  assert.equal(canSlotEquip, true);
});

test("Seam 2E: Alchemist Reset in Starting Camp shows prompt on Tim (m_npc == 1), opens 3-option Camp menu (m_ingame_menu == 3), and resets Stats Only (103), Gear Only (102), or Full Character (101) while preserving co-op partner items in loot pools", () => {
  const { vm } = buildStandInAdapter({ installOnRoot: false });

  const res = vm.runSource(`
    local ls = __env.LevelScreen();
    ls.m_world = __env.World();
    ls.m_world.m_world_state = __env.WorldState();
    __env.Loot.initialize_world_loot(ls.m_world.m_world_state);
    __env.g_level_screen = ls;
    __env.g_local_coop = true;

    local h0 = __env.Hero();
    h0.m_player_index = 0;
    h0.m_coins = 500;
    h0.m_souls_to_collect = 6;
    h0.m_lives = 4;
    h0.m_extra_lives = 1;
    h0.m_vitality_offset = 40;
    h0.m_strength_offset = 25;
    h0.m_uncapped_vitality = 15;
    h0.m_uncapped_spell_damage = 12;
    h0.m_health = 60;
    h0.m_maximum_health = 140;
    h0.m_weapon = "legendary_axe";
    h0.m_items = [
      { m_def = { _name = "mechanical_arms" } },
      { m_def = { _name = "familiar_skull" } }
    ];
    h0.m_status_effects = ["curse_blind", "bless_str"];

    local h1 = __env.Hero();
    h1.m_player_index = 1;
    h1.m_ingame_menu = 2; // Partner has another camp menu open
    h1.m_items = [{ m_def = { _name = "molten_mittens" } }];

    local room = { m_heroes = [h0, h1], m_level = { m_world_state = ls.m_world.m_world_state } };
    h0.m_room = room;
    h1.m_room = room;
    local p0 = { m_hero = h0, is_live_player = function() { return true; } };
    local p1 = { m_hero = h1, is_live_player = function() { return true; } };
    ls.m_players = [p0, p1];
    h0.save_hero_data_to_world();
    h1.save_hero_data_to_world();

    // 1. Proximity tooltip for Alchemist (m_npc == 1) vs other NPC (m_npc == 2)
    local popup = __env.HUDInteractPopup();
    local tim = __env.NPC(1);
    local knight = __env.NPC(2);
    local timTooltip = popup.get_tooltip_text_and_control(h0, tim);
    local knightTooltip = popup.get_tooltip_text_and_control(h0, knight);

    // 2. Interacting with Tim opens m_ingame_menu == 3 and closes co-op partner's menu
    h0.m_best_pick = tim;
    h0.do_try_pick_item();
    local menuAfterInteract = h0.m_ingame_menu;
    local partnerMenuAfterInteract = h1.m_ingame_menu;

    local mgr = __env.HUDInGameMenuManager();
    mgr.update(0.016, p0, p1);
    local cellCount = mgr.m_menu_window.m_cells.len();
    local cellIds = [
      mgr.m_menu_window.m_cells[0].m_input_event.m_value,
      mgr.m_menu_window.m_cells[1].m_input_event.m_value,
      mgr.m_menu_window.m_cells[2].m_input_event.m_value
    ];

    // 3. Option 103: Reset Stats & Effects Only (keeps gear/coins/souls, resets stats & status effects)
    local evStats = __env.InputEvent(5);
    evStats.m_value = 103;
    h0.m_pending_events = [evStats];
    h0.update_input_events();
    local afterStatsOnly = [
      h0.m_vitality_offset,
      h0.m_strength_offset,
      h0.m_uncapped_vitality,
      h0.m_uncapped_spell_damage,
      h0.m_status_effects.len(),
      h0.m_health,
      h0.m_maximum_health,
      h0.m_weapon,
      h0.m_coins,
      h0.m_souls_to_collect
    ];

    // Re-buff stats, then test Option 102: Reset Gear & Items Only (keeps stats/effects, resets gear/coins/souls & refills pools excluding partner's molten_mittens)
    h0.m_vitality_offset = 50;
    h0.m_strength_offset = 20;
    h0.m_status_effects = ["bless_str"];
    local evGear = __env.InputEvent(5);
    evGear.m_value = 102;
    h0.m_pending_events = [evGear];
    h0.update_input_events();
    local afterGearOnly = [
      h0.m_vitality_offset,
      h0.m_strength_offset,
      h0.m_status_effects.len(),
      h0.m_weapon,
      h0.m_items.len(),
      h0.m_coins,
      h0.m_souls_to_collect,
      ls.m_world.m_world_state.m_mods_pool
    ];

    // Re-buff everything, then test Option 101: Reset Character (Full)
    h0.m_vitality_offset = 60;
    h0.m_strength_offset = 30;
    h0.m_extra_lives = 2;
    h0.m_lives = 5;
    h0.m_coins = 900;
    h0.m_souls_to_collect = 9;
    h0.m_weapon = "legendary_axe";
    h0.m_items = [{ m_def = { _name = "nightcrawlers_eye" } }];
    h0.m_status_effects = ["curse_blind"];
    local evFull = __env.InputEvent(5);
    evFull.m_value = 101;
    h0.m_pending_events = [evFull];
    h0.update_input_events();
    local afterFull = [
      h0.m_vitality_offset,
      h0.m_strength_offset,
      h0.m_extra_lives,
      h0.m_lives,
      h0.m_status_effects.len(),
      h0.m_health,
      h0.m_maximum_health,
      h0.m_weapon,
      h0.m_items[0].m_def._name,
      h0.m_coins,
      h0.m_souls_to_collect,
      ls.m_world.m_world_state.m_mods_pool
    ];

    ls = null;
    __env.g_level_screen = null;

    return [
      timTooltip,
      knightTooltip,
      menuAfterInteract,
      partnerMenuAfterInteract,
      cellCount,
      cellIds,
      afterStatsOnly,
      afterGearOnly,
      afterFull
    ];
  `);

  const [
    timTooltip,
    knightTooltip,
    menuAfterInteract,
    partnerMenuAfterInteract,
    cellCount,
    cellIds,
    afterStatsOnly,
    afterGearOnly,
    afterFull,
  ] = vm.unwrapToJS(res);

  assert.deepEqual(timTooltip, ["%% to reset character", 17]);
  assert.deepEqual(knightTooltip, [null, 17]);
  assert.equal(menuAfterInteract, 3);
  assert.equal(partnerMenuAfterInteract, 0);
  assert.equal(cellCount, 3);
  assert.deepEqual(cellIds, [101, 102, 103]);

  assert.deepEqual(afterStatsOnly, [
    0,
    0,
    0,
    0,
    0,
    100,
    100,
    "legendary_axe",
    500,
    6,
  ]);

  assert.deepEqual(afterGearOnly, [
    50,
    20,
    1,
    "rusty_sword",
    1,
    0,
    0,
    ["mechanical_arms", "nightcrawlers_eye"],
  ]);

  assert.deepEqual(afterFull, [
    0,
    0,
    0,
    2,
    0,
    100,
    100,
    "rusty_sword",
    "boots_start",
    0,
    0,
    ["mechanical_arms", "nightcrawlers_eye"],
  ]);
});

test("Seam 2F: Endless Dungeon preserves Starting Camp difficulty (Casual checkpoint respawn vs Normal+ permadeath, including across floor 13) and adds a Pause Menu Return to Camp button that carries Hero Loadout and Run Stats back to Starting Camp", () => {
  const { vm } = buildStandInAdapter({ installOnRoot: false });

  const res = vm.runSource(`
    // 1. Enter Endless Dungeon from Starting Camp on Casual (0) -> difficulty stays 0 (not overwritten to 2)
    local lsCasual = __env.LevelScreen();
    lsCasual.m_world = __env.World();
    lsCasual.m_world.m_gparam_game_mode = 0;
    lsCasual.m_world.m_gparam_level_index = 0;
    lsCasual.m_world.m_world_state = __env.WorldState();
    lsCasual.m_world.m_world_state.m_game_difficulty = 0; // Casual
    __env.Loot.initialize_world_loot(lsCasual.m_world.m_world_state);
    __env.g_level_screen = lsCasual;

    local h0 = __env.Hero();
    h0.m_player_index = 0;
    h0.m_coins = 888;
    h0.m_lives = 2;
    h0.m_maximum_health = 160;
    h0.m_souls_to_collect = 5;
    h0.m_items = [{ m_def = { _name = "mechanical_arms" } }];
    lsCasual.m_players = [{ m_hero = h0, is_live_player = function() { return true; } }];

    // Step into Endless portal (m_switch_to_game_mode = 2)
    lsCasual.m_world.m_world_state.begin_level_transition_to_game_mode(2);
    lsCasual.m_world.m_world_state.complete_level_transition_to_game_mode();
    h0 = null;
    lsCasual.finish_level();

    local endlessMode0 = lsCasual.m_world.m_gparam_game_mode;
    local endlessLevel0 = lsCasual.m_world.m_gparam_level_index;
    local endlessDiff0 = lsCasual.m_world.m_world_state.m_game_difficulty;
    local endlessGenDiff0 = lsCasual.m_world.m_gparam_generate_difficulty;

    // Die on Endless floor 0 on Casual -> respawns at checkpoint (unpack_checkpoint_state -> start_next_level)
    lsCasual.m_actions = [];
    lsCasual.m_world.m_world_state.m_game_state = 4; // Game Over
    lsCasual.finish_level();
    local casualDeathActions = clone lsCasual.m_actions;
    local endlessDiffAfterRespawn = lsCasual.m_world.m_world_state.m_game_difficulty;

    // Advance to Endless floor 13 (m_gparam_level_challenge == 2) -> difficulty still stays 0 (not overwritten to 3)
    lsCasual.m_world.m_gparam_level_index = 12;
    lsCasual.m_world.m_gparam_used_room_types_working_copy = ["room_a"];
    lsCasual.m_world.switch_to_next_level(lsCasual.m_world.m_world_state);
    local endlessLevel13 = lsCasual.m_world.m_gparam_level_index;
    local endlessChallenge13 = lsCasual.m_world.m_gparam_level_challenge;
    local endlessDiff13 = lsCasual.m_world.m_world_state.m_game_difficulty;

    // 2. Pause Menu in Endless Dungeon shows "Return to Camp" above "Save & Quit", while Campaign Pause Menu does not
    local hEndless = __env.Hero();
    hEndless.m_player_index = 0;
    hEndless.m_coins = 999;
    hEndless.m_lives = 3;
    hEndless.m_maximum_health = 200;
    hEndless.m_health = 50; // Damaged hero in Endless on Casual (0) -> restored to full HP (200) on entering next floor
    hEndless.m_souls_to_collect = 8;
    hEndless.m_items = [{ m_def = { _name = "molten_mittens" } }];
    lsCasual.m_players = [{ m_hero = hEndless, is_live_player = function() { return true; } }];

    local pauseEndless = __env.MainSubMenu(1);
    local endlessBtnTitles = [];
    local returnBtn = null;
    foreach (b in pauseEndless.m_buttons)
    {
        endlessBtnTitles.push(b.m_title);
        if (b.m_title == "Return to Camp")
        {
            returnBtn = b;
        }
    }

    // Invoke "Return to Camp" button callback
    __env.g_top_screen_removed = false;
    returnBtn.m_menu_event_arg.call(pauseEndless);
    local topScreenRemoved = __env.g_top_screen_removed;
    local switchModePending = lsCasual.m_world.m_world_state.m_switch_to_game_mode;
    lsCasual.m_world.m_world_state.complete_level_transition_to_game_mode();
    hEndless = null;
    lsCasual.finish_level();

    local campHero = __env.Hero();
    campHero.spawn_on_level(lsCasual.m_world, lsCasual.m_world.m_gparam_level_index);
    local modeAfterReturn = lsCasual.m_world.m_gparam_game_mode;
    local levelIdxAfterReturn = lsCasual.m_world.m_gparam_level_index;
    local levelTypeAfterReturn = lsCasual.m_world.m_gparam_level_type;
    local diffAfterReturn = lsCasual.m_world.m_world_state.m_game_difficulty;
    local modsPoolAfterReturn = lsCasual.m_world.m_world_state.m_mods_pool;

    // Pause menu in Campaign mode (mode 0) does NOT show "Return to Camp"
    local pauseCampaign = __env.MainSubMenu(1);
    local campaignBtnTitles = [];
    foreach (b in pauseCampaign.m_buttons)
    {
        campaignBtnTitles.push(b.m_title);
    }

    // 3. Enter Endless Dungeon on Normal (1) and die -> permadeath via start_game
    lsCasual.m_world.m_gparam_used_room_types_working_copy = clone lsCasual.m_world.m_gparam_used_room_types;
    lsCasual.m_world.m_world_state.m_game_difficulty = 1;
    lsCasual.m_world.m_world_state.begin_level_transition_to_game_mode(2);
    lsCasual.m_world.m_world_state.complete_level_transition_to_game_mode();
    lsCasual.finish_level();
    local normalEndlessDiff = lsCasual.m_world.m_world_state.m_game_difficulty;
    lsCasual.m_actions = [];
    lsCasual.m_world.m_world_state.m_game_state = 4;
    lsCasual.finish_level();
    local normalEndlessDeathActions = lsCasual.m_actions;

    lsCasual = null;
    __env.g_level_screen = null;

    return [
      endlessMode0,
      endlessLevel0,
      endlessDiff0,
      endlessGenDiff0,
      casualDeathActions,
      endlessDiffAfterRespawn,
      endlessLevel13,
      endlessChallenge13,
      endlessDiff13,
      endlessBtnTitles,
      campaignBtnTitles,
      topScreenRemoved,
      switchModePending,
      modeAfterReturn,
      levelIdxAfterReturn,
      levelTypeAfterReturn,
      diffAfterReturn,
      campHero.m_coins,
      campHero.m_lives,
      campHero.m_health,
      campHero.m_maximum_health,
      campHero.m_souls_to_collect,
      modsPoolAfterReturn,
      normalEndlessDiff,
      normalEndlessDeathActions
    ];
  `);

  const [
    endlessMode0,
    endlessLevel0,
    endlessDiff0,
    endlessGenDiff0,
    casualDeathActions,
    endlessDiffAfterRespawn,
    endlessLevel13,
    endlessChallenge13,
    endlessDiff13,
    endlessBtnTitles,
    campaignBtnTitles,
    topScreenRemoved,
    switchModePending,
    modeAfterReturn,
    levelIdxAfterReturn,
    levelTypeAfterReturn,
    diffAfterReturn,
    campCoins,
    campLives,
    campHp,
    campMaxHp,
    campSouls,
    modsPoolAfterReturn,
    normalEndlessDiff,
    normalEndlessDeathActions,
  ] = vm.unwrapToJS(res);

  assert.equal(endlessMode0, 2);
  assert.equal(endlessLevel0, 0);
  assert.equal(endlessDiff0, 0);
  assert.equal(endlessGenDiff0, 0);
  assert.deepEqual(casualDeathActions, ["unpack_checkpoint_state", "stop_game", "start_next_level"]);
  assert.equal(endlessDiffAfterRespawn, 0);
  assert.equal(endlessLevel13, 13);
  assert.equal(endlessChallenge13, 2);
  assert.equal(endlessDiff13, 0);

  assert.deepEqual(endlessBtnTitles, ["Continue", "Options", "How to Play", "Return to Camp", "Save & Quit"]);
  assert.deepEqual(campaignBtnTitles, ["Continue", "Options", "How to Play", "Save & Quit"]);
  assert.equal(topScreenRemoved, true);
  assert.equal(switchModePending, -1);
  assert.equal(modeAfterReturn, 0);
  assert.equal(levelIdxAfterReturn, 0);
  assert.equal(levelTypeAfterReturn, "forest");
  assert.equal(diffAfterReturn, 0);
  assert.equal(campCoins, "999");
  assert.equal(campLives, "3");
  assert.equal(campHp, "200");
  assert.equal(campMaxHp, "200");
  assert.equal(campSouls, "8");
  assert.deepEqual(modsPoolAfterReturn, ["mechanical_arms", "nightcrawlers_eye"]);

  assert.equal(normalEndlessDiff, 1);
  assert.deepEqual(normalEndlessDeathActions, ["stop_game", "start_game"]);
});
