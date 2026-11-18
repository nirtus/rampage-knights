::preloaded_resources <- null;

class PreloadResourcesScreen extends ::GameScreen
{
    m_skip_preload = false;
    m_done = false;
    m_init_counter = 3;
    m_index = 0;
    m_scene = null;
    m_view = null;
    m_pr1 = null;
    m_pr2 = null;
    m_time = 0.0;
    m_frame_counter = 0;

    constructor()
    {
        ::System.message(">>> Preloading resources...");
        local list = [];
        enumerate_resources(list);
        ::preloaded_resources = list;

        local s = ::System.get_screen_size();
        m_view = ::View2d();
        m_view.set_viewport_size(s);
        m_view.set_canvas_size(s);

        m_scene = ::Scene();
        m_scene.set_view(m_view);

        m_pr1 = ::SceneObject();
        m_pr1.set_scene(m_scene);
        m_pr1.play_clip("fire_bowl", true);
        m_pr1.set_scale(0.7, 0.7);
        local prs = m_pr1.get_size();
        m_pr1.set_position(s[0] - prs[0] - 100.0, s[1] - prs[1] - 50.0);
        m_pr1.play();

        m_pr2 = ::SceneObject();
        m_pr2.set_scene(m_scene);
        m_pr2.set_position(s[0] - prs[0] - 50.0 + 36.0 - 90, s[1] - prs[1] - 40.0 + 34.0 + 12);

        m_time = 0.0;
    }

    function screen_resolution_changed()
    {
        local s = ::System.get_screen_size();
        m_view.set_viewport_size(s);
        m_view.set_canvas_size(s);
        local prs = m_pr1.get_size();
        m_pr1.set_position(s[0] - prs[0] - 50.0 - 20, s[1] - prs[1] - 40.0 - 20);
        m_pr2.set_position(s[0] - prs[0] - 50.0 + 36.0 - 90, s[1] - prs[1] - 40.0 + 34.0 + 12);
    }

    function render()
    {
        if (m_scene)
        {
            m_scene.render_2d();
        }
    }

    function update(frame_duration)
    {
        if (m_done)
        {
            return;
        }
        if (m_scene)
        {
            m_scene.update(frame_duration);
        }
        m_time += frame_duration;
        if (m_init_counter > 0)
        {
            m_init_counter--;
            if (m_init_counter > 0)
            {
                return;
            }
        }
        m_frame_counter++;
        if (m_frame_counter == 1)
        {
            ::initialize_static_sprites();
            return;
        }
        else if (m_frame_counter == 2)
        {
            ::initialize_skins();
            return;
        }

        local list = ::preloaded_resources;
        local t = ::System.get_system_milliseconds();
        while (m_index < list.len() && !m_skip_preload)
        {
            local type = list[m_index];
            local name = list[m_index + 1];
            m_index += 2;
            ::System.cache_resource(type, name);
            local e = ::System.get_system_milliseconds() - t;
            if (e >= 100)
            {
                return;
            }
        }

        ::System.message(">>> Preloaded ", list.len(), " resources.");
        m_done = true;
        m_pr2 = null;
        m_pr1 = null;
        m_scene = null;
        m_view = null;
    }

    function enumerate_resources(list)
    {
        foreach (k, v in ::g_sound_defs)
        {
            list.push("sound");
            list.push(k);
        }
        foreach (k, v in ::g_texture_defs)
        {
            local preload = true;
            if ("preload" in v && !v.preload)
            {
                preload = false;
            }
            if (preload)
            {
                list.push("texture");
                list.push(k);
            }
        }
        foreach (k, v in ::g_font_defs)
        {
            list.push("font");
            list.push(k);
        }
        foreach (k, v in ::g_sprite_defs)
        {
            local preload = true;
            if ("preload" in v && !v.preload)
            {
                preload = false;
            }
            if ("texture" in v && v.texture in ::g_texture_defs)
            {
                local texture_def = ::g_texture_defs[v.texture];
                if ("preload" in texture_def && !texture_def.preload)
                {
                    preload = false;
                }
            }
            if (preload)
            {
                list.push("sprite");
                list.push(k);
            }
        }
        foreach (k, v in ::g_emitter_defs)
        {
            list.push("emitter");
            list.push(k);
        }
    }
}

function preload_resources()
{
    local s = ::PreloadResourcesScreen();
    while (!s.m_done)
    {
        s.update(0.0);
    }
}

class CampaignCarryover
{
    static function _is_finite_campaign_mode(mode)
    {
        return mode == 0 || mode == 1 || mode == 3 || mode == 4;
    }

    static function _fill_player_slots(generator_fn)
    {
        local slots = ::array(4, null);
        for (local i = 0; i < 4; i++)
        {
            slots[i] = generator_fn();
        }
        return slots;
    }

    static function _collect_owned_items(root, world_state)
    {
        local owned = {};
        if (world_state == null || world_state.m_hero_data_per_player == null)
        {
            return owned;
        }
        foreach (hdata in world_state.m_hero_data_per_player)
        {
            if (hdata != null)
            {
                local pd = root.ProfileData();
                pd.load_from_string(hdata);
                foreach (entry in pd.m_data)
                {
                    if (entry.m_key == "item")
                    {
                        local item_name = entry.as_string(0);
                        if (item_name != "")
                        {
                            owned[item_name] <- true;
                        }
                    }
                }
            }
        }
        return owned;
    }

    static function _filter_pool_with_fallback(pool, owned)
    {
        if (pool == null)
        {
            return pool;
        }
        local filtered = [];
        foreach (name in pool)
        {
            if (!(name in owned))
            {
                filtered.push(name);
            }
        }
        if (filtered.len() > 0)
        {
            return filtered;
        }
        return pool;
    }

    static function _refresh_world_state_for_loop(root, world_state)
    {
        root.Loot.initialize_world_loot(world_state);
        world_state.m_altar_types_rand_list = [];

        local owned = ::CampaignCarryover._collect_owned_items(root, world_state);
        world_state.m_mods_pool = ::CampaignCarryover._filter_pool_with_fallback(world_state.m_mods_pool, owned);
        world_state.m_familiars_pool = ::CampaignCarryover._filter_pool_with_fallback(world_state.m_familiars_pool, owned);

        for (local hero_class = 0; hero_class < 8; hero_class++)
        {
            local cls = hero_class;
            local prop = "m_starting_weapon_for_class" + cls;
            world_state[prop] = ::CampaignCarryover._fill_player_slots(function() {
                return root.Loot.generate_start_weapon(cls);
            });
        }

        world_state.m_starting_throwable_for_assassin = ::CampaignCarryover._fill_player_slots(function() {
            return root.Loot.generate_throwable();
        });
    }

    static function _prepare_loop_states(root, level_screen)
    {
        if (level_screen.m_world == null || level_screen.m_world.m_world_state == null)
        {
            return null;
        }
        local ws = level_screen.m_world.m_world_state;
        local mode = level_screen.m_world.get_game_mode();
        if (!ws.is_game_end() || ws.is_game_over() || !::CampaignCarryover._is_finite_campaign_mode(mode))
        {
            return null;
        }
        level_screen.create_checkpoint();
        return [level_screen.m_world.save_state(), ws.save_state()];
    }

    static function _is_alchemist_npc(root, entity)
    {
        return entity != null && "NPC" in root && entity instanceof root.NPC && entity.m_npc == 1;
    }

    static function _is_endless_run_active(root)
    {
        if ("is_endless_mode" in root)
        {
            return root.is_endless_mode();
        }
        if ("g_level_screen" in root && root.g_level_screen != null && root.g_level_screen.m_world != null)
        {
            return root.g_level_screen.m_world.get_game_mode() == 2;
        }
        return false;
    }

    static function _relink_menu_buttons(buttons)
    {
        local count = buttons.len();
        for (local i = 0; i < count; i++)
        {
            local prev_idx = i - 1;
            if (i == 0)
            {
                prev_idx = count - 1;
            }
            local next_idx = (i + 1) % count;
            local prev = buttons[prev_idx];
            local cur = buttons[i];
            local next = buttons[next_idx];
            prev.m_next_control = cur.weakref();
            next.m_previous_control = cur.weakref();
        }
    }

    static function _return_to_starting_camp(root)
    {
        if ("play_game_sound" in root)
        {
            root.play_game_sound("menu_confirm");
        }
        if ("g_game" in root && root.g_game != null && "remove_top_game_screen" in root.g_game)
        {
            root.g_game.remove_top_game_screen();
        }
        if ("g_level_screen" in root && root.g_level_screen != null && root.g_level_screen.m_world != null && root.g_level_screen.m_world.m_world_state != null)
        {
            root.g_level_screen.m_world.m_world_state.begin_level_transition_to_game_mode(-1);
        }
    }

    static function _create_alchemist_cell(root, id, text)
    {
        local cell = root.CheatPanelCell(id, text, true);
        local ev = root.InputEvent(5);
        ev.m_value = id;
        cell.m_input_event = ev;
        return cell;
    }

    static function _reset_hero_stats_and_effects(root, hero)
    {
        hero.remove_all_status_effects_for_shadow_world();
        hero.m_vitality_offset = 0;
        hero.m_strength_offset = 0;
        hero.m_uncapped_vitality = 0;
        hero.m_uncapped_spell_damage = 0;
        hero.reset_treasure_chest_phobia_counter();
        if ("gparams" in root && root.gparams != null)
        {
            if ("disease_food_poisoning_counter" in root.gparams)
            {
                hero.m_food_poisoning_counter = root.gparams.disease_food_poisoning_counter();
            }
            if ("disease_fat_counter" in root.gparams)
            {
                hero.m_fat_counter = root.gparams.disease_fat_counter();
            }
        }
        if ("get_play_mode" in root && root.get_play_mode() == 0 && hero.m_hero_class != 4)
        {
            hero.m_lives = 2;
        }
        else
        {
            hero.m_lives = 1;
        }
    }

    static function _sync_and_refresh_after_reset(root, hero, refresh_pools)
    {
        if (hero.m_room != null && "m_heroes" in hero.m_room && hero.m_room.m_heroes != null)
        {
            foreach (h in hero.m_room.m_heroes)
            {
                if (h != null)
                {
                    h.save_hero_data_to_world();
                }
            }
        }
        else
        {
            hero.save_hero_data_to_world();
        }
        if (refresh_pools)
        {
            local ws = null;
            if (hero.m_room != null && "m_level" in hero.m_room && hero.m_room.m_level != null && "m_world_state" in hero.m_room.m_level)
            {
                ws = hero.m_room.m_level.m_world_state;
            }
            else if ("g_level_screen" in root && root.g_level_screen != null && root.g_level_screen.m_world != null)
            {
                ws = root.g_level_screen.m_world.m_world_state;
            }
            if (ws != null)
            {
                ::CampaignCarryover._refresh_world_state_for_loop(root, ws);
            }
        }
    }

    static function _apply_alchemist_reset(root, hero, reset_id)
    {
        local refresh_pools = false;
        local restore_full_health = false;
        if (reset_id == 101)
        {
            ::CampaignCarryover._reset_hero_stats_and_effects(root, hero);
            hero.m_souls_to_collect = 0;
            hero.m_extra_lives = 0;
            hero.initialize_from_class();
            refresh_pools = true;
            restore_full_health = true;
        }
        else if (reset_id == 102)
        {
            if (hero.is_reward_unlocked(80) && "gparams" in root && root.gparams != null && "reward_starting_coins" in root.gparams)
            {
                hero.m_coins = root.gparams.reward_starting_coins;
            }
            else
            {
                hero.m_coins = 0;
            }
            hero.m_souls_to_collect = 0;
            hero.reset_all_hero_items();
            hero.add_default_hero_items();
            refresh_pools = true;
        }
        else if (reset_id == 103)
        {
            ::CampaignCarryover._reset_hero_stats_and_effects(root, hero);
            restore_full_health = true;
        }
        else
        {
            return;
        }

        hero.refresh_hero_after_item_without_action();
        if (restore_full_health || hero.m_health > hero.m_maximum_health)
        {
            hero.m_health = hero.m_maximum_health;
        }
        ::CampaignCarryover._sync_and_refresh_after_reset(root, hero, refresh_pools);
    }

    static function install(env = null)
    {
        local root = env;
        if (root == null)
        {
            root = ::getroottable();
        }
        if ("_campaign_carryover_installed" in root && root._campaign_carryover_installed)
        {
            return;
        }
        root._campaign_carryover_installed <- true;

        local base_trigger_game_end = root.WorldState.trigger_game_end;
        root.WorldState.trigger_game_end <- function()
        {
            if (m_game_state == 0 && "g_level_screen" in root && root.g_level_screen != null)
            {
                foreach (p in root.g_level_screen.m_players)
                {
                    if (p != null && p.is_live_player() && p.m_hero != null)
                    {
                        p.m_hero.m_last_level_index = -1;
                        p.m_hero.save_hero_data_to_world();
                    }
                }
            }
            return base_trigger_game_end.call(this);
        };

        local base_finish_level = root.LevelScreen.finish_level;
        root.LevelScreen.finish_level <- function()
        {
            local states = ::CampaignCarryover._prepare_loop_states(root, this);
            if (states != null)
            {
                stop_game();
                start_next_level(states[0], states[1]);
                return;
            }
            return base_finish_level.call(this);
        };

        local base_switch_to_next_level = root.World.switch_to_next_level;
        root.World.switch_to_next_level <- function(world_state)
        {
            local is_campaign_wrap = ::CampaignCarryover._is_finite_campaign_mode(m_gparam_game_mode) && m_gparam_level_index >= 9 && world_state != null && world_state.m_switch_to_game_mode == 0;
            local is_endless_return = m_gparam_game_mode == 2 && world_state != null && world_state.m_switch_to_game_mode == -1;
            if (is_campaign_wrap || is_endless_return)
            {
                if (is_endless_return)
                {
                    m_gparam_game_mode = 0;
                }
                m_gparam_level_index = 0;
                m_gparam_level_type = "forest";
                m_gparam_level_challenge = 0;
                m_gparam_generate_difficulty = world_state.m_game_difficulty;

                root.rand(0, 1000);
                m_original_world_seed_0 = root.g_random_generator.get_seed(0);
                m_original_world_seed_1 = root.g_random_generator.get_seed(1);
                m_original_world_seed_2 = root.g_random_generator.get_seed(2);
                m_original_world_seed_3 = root.g_random_generator.get_seed(3);

                m_gparam_used_room_types = [];
                m_gparam_used_room_types_working_copy = null;
                root.MapGenerator.update_list_of_used_rooms_on_level_transition(m_gparam_used_room_types);
                m_frame_index = 0;

                ::CampaignCarryover._refresh_world_state_for_loop(root, world_state);
                return;
            }
            local prev_difficulty = null;
            if (world_state != null)
            {
                prev_difficulty = world_state.m_game_difficulty;
            }
            local res = base_switch_to_next_level.call(this, world_state);
            if (m_gparam_game_mode == 2 && world_state != null && prev_difficulty != null)
            {
                world_state.m_game_difficulty = prev_difficulty;
                m_gparam_generate_difficulty = prev_difficulty;
            }
            return res;
        };

        local base_check_can_pick_item = root.Hero.check_can_pick_item;
        root.Hero.check_can_pick_item <- function(item, play_nonono)
        {
            if (item != null && item.is_mod() && m_items != null)
            {
                foreach (existing in m_items)
                {
                    if (existing != null && existing.m_def._name == item.m_def._name)
                    {
                        if (play_nonono)
                        {
                            set_state("state_interact", root.HeroInteractState().init_no_endless_mod_pick(this));
                        }
                        return false;
                    }
                }
            }
            return base_check_can_pick_item.call(this, item, play_nonono);
        };

        if ("HUDInteractPopup" in root && root.HUDInteractPopup != null && "get_tooltip_text_and_control" in root.HUDInteractPopup)
        {
            local base_get_tooltip_text_and_control = root.HUDInteractPopup.get_tooltip_text_and_control;
            root.HUDInteractPopup.get_tooltip_text_and_control <- function(hero, entity)
            {
                if (::CampaignCarryover._is_alchemist_npc(root, entity))
                {
                    return ["%% to reset character", 17];
                }
                return base_get_tooltip_text_and_control.call(this, hero, entity);
            };
        }

        if ("do_try_pick_item" in root.Hero)
        {
            local base_do_try_pick_item = root.Hero.do_try_pick_item;
            root.Hero.do_try_pick_item <- function()
            {
                local entity = find_best_item_to_pick();
                if (::CampaignCarryover._is_alchemist_npc(root, entity))
                {
                    m_ingame_menu = 3;
                    if ("is_local_coop_play_mode" in root && root.is_local_coop_play_mode() && m_room != null && "m_heroes" in m_room && m_room.m_heroes != null)
                    {
                        foreach (h in m_room.m_heroes)
                        {
                            if (h != null && h != this)
                            {
                                h.m_ingame_menu = 0;
                            }
                        }
                    }
                    return false;
                }
                return base_do_try_pick_item.call(this);
            };
        }

        if ("HUDInGameMenuManager" in root && root.HUDInGameMenuManager != null && "update" in root.HUDInGameMenuManager)
        {
            local base_menu_manager_update = root.HUDInGameMenuManager.update;
            root.HUDInGameMenuManager.update <- function(dt, player, player2)
            {
                local target_player = null;
                if (player != null && player.m_hero != null && player.m_hero.m_ingame_menu == 3)
                {
                    target_player = player;
                }
                else if (player2 != null && player2.m_hero != null && player2.m_hero.m_ingame_menu == 3)
                {
                    target_player = player2;
                }
                if (target_player != null && (m_ingame_menu != 3 || m_player != target_player))
                {
                    if (m_ingame_menu != 0)
                    {
                        close_menu();
                    }
                    m_player = target_player;
                    m_ingame_menu = 3;
                    local cells = [
                        ::CampaignCarryover._create_alchemist_cell(root, 101, "Reset Character (Full)"),
                        ::CampaignCarryover._create_alchemist_cell(root, 102, "Reset Gear & Items Only"),
                        ::CampaignCarryover._create_alchemist_cell(root, 103, "Reset Stats & Effects Only")
                    ];
                    m_menu_window = root.ListWindow(m_player, "camp_shop_title_class", cells, m_menu_view, "ui_select_cheat", "ui_close", 0, 0);
                    resolution_changed();
                }
                return base_menu_manager_update.call(this, dt, player, player2);
            };
        }

        if ("update_input_events" in root.Hero)
        {
            local base_update_input_events = root.Hero.update_input_events;
            root.Hero.update_input_events <- function()
            {
                local events = get_input_events();
                if (events != null)
                {
                    foreach (e in events)
                    {
                        if (e != null && e.m_type == 5 && (e.m_value == 101 || e.m_value == 102 || e.m_value == 103))
                        {
                            ::CampaignCarryover._apply_alchemist_reset(root, this, e.m_value);
                        }
                    }
                }
                return base_update_input_events.call(this);
            };
        }

        if ("MainSubMenu" in root && root.MainSubMenu != null && "layout_buttons" in root.MainSubMenu)
        {
            local base_layout_buttons = root.MainSubMenu.layout_buttons;
            root.MainSubMenu.layout_buttons <- function()
            {
                if (m_menu_type == 1 && m_buttons != null && m_buttons.len() > 0 && ::CampaignCarryover._is_endless_run_active(root))
                {
                    local has_return_btn = false;
                    foreach (b in m_buttons)
                    {
                        if (b != null && b.m_menu_event == 5)
                        {
                            has_return_btn = true;
                        }
                    }
                    if (!has_return_btn)
                    {
                        local save_btn = m_buttons.pop();
                        local return_btn = add_button("Return to Camp", 5, function() {
                            ::CampaignCarryover._return_to_starting_camp(root);
                        });
                        return_btn.m_extra_padding = save_btn.m_extra_padding;
                        save_btn.m_extra_padding = 0.0;
                        m_buttons.push(save_btn);
                        ::CampaignCarryover._relink_menu_buttons(m_buttons);
                    }
                }
                return base_layout_buttons.call(this);
            };
        }
    }
}

if ("World" in ::getroottable() && "WorldState" in ::getroottable() && "LevelScreen" in ::getroottable() && "Hero" in ::getroottable())
{
    ::CampaignCarryover.install(::getroottable());
}
