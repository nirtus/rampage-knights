import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { SquirrelVM, SqClass, SqTable } from "./helpers/squirrel_vm.mjs";

const PRELOAD_PATH = path.resolve("scripts/preload.nut");

function createPreloadHostEnv() {
  const events = [];
  let nowMs = 1000;
  let screenSize = [1280, 720];

  const GameScreen = new SqClass("GameScreen");
  const View2d = new SqClass("View2d");
  View2d.newslot("viewport", null);
  View2d.newslot("canvas", null);
  View2d.newslot("set_viewport_size", function (s) {
    this.set("viewport", s);
  });
  View2d.newslot("set_canvas_size", function (s) {
    this.set("canvas", s);
  });

  const Scene = new SqClass("Scene");
  Scene.newslot("view", null);
  Scene.newslot("updates", 0);
  Scene.newslot("renders", 0);
  Scene.newslot("set_view", function (v) {
    this.set("view", v);
  });
  Scene.newslot("update", function (dt) {
    events.push(["scene_update", dt]);
  });
  Scene.newslot("render_2d", function () {
    events.push(["scene_render_2d"]);
  });

  const SceneObject = new SqClass("SceneObject");
  SceneObject.newslot("pos", null);
  SceneObject.newslot("clip", null);
  SceneObject.newslot("scale", null);
  SceneObject.newslot("set_scene", function () {});
  SceneObject.newslot("play_clip", function (name, loop) {
    this.set("clip", [name, loop]);
  });
  SceneObject.newslot("set_scale", function (sx, sy) {
    this.set("scale", [sx, sy]);
  });
  SceneObject.newslot("get_size", () => [80, 60]);
  SceneObject.newslot("set_position", function (x, y) {
    this.set("pos", [x, y]);
  });
  SceneObject.newslot("play", function () {});

  const vm = new SquirrelVM({
    GameScreen,
    View2d,
    Scene,
    SceneObject,
    System: {
      message: (a, b = "", c = "") => {
        events.push(["message", `${a}${b}${c}`]);
      },
      get_screen_size: () => screenSize,
      get_system_milliseconds: () => {
        nowMs += 10;
        return nowMs;
      },
      cache_resource: (type, name) => {
        events.push(["cache", type, name]);
      },
    },
    initialize_static_sprites: () => events.push(["init_static_sprites"]),
    initialize_skins: () => events.push(["init_skins"]),
    g_sound_defs: new SqTable({ snd_hit: new SqTable() }),
    g_texture_defs: new SqTable({
      tex_keep: new SqTable({ preload: true }),
      tex_skip: new SqTable({ preload: false }),
      tex_default: new SqTable(),
    }),
    g_font_defs: new SqTable({ orgy: new SqTable() }),
    g_sprite_defs: new SqTable({
      spr_ok: new SqTable({ texture: "tex_keep" }),
      spr_skip_self: new SqTable({ preload: false, texture: "tex_keep" }),
      spr_skip_tex: new SqTable({ texture: "tex_skip" }),
    }),
    g_emitter_defs: new SqTable({ fx_smoke: new SqTable() }),
  });

  return {
    vm,
    events,
    setScreenSize: (w, h) => {
      screenSize = [w, h];
    },
  };
}

test("Seam 1: preload_resources() enumerates preloadable defs, runs staged init, and caches resources", () => {
  const { vm, events, setScreenSize } = createPreloadHostEnv();
  vm.runFile(PRELOAD_PATH);

  const screenCls = vm.root.get("PreloadResourcesScreen");
  const screen = vm.invokeCallable(screenCls, null, []);
  vm.invokeCallable(screen.get("render"), screen, []);

  setScreenSize(1920, 1080);
  vm.invokeCallable(screen.get("screen_resolution_changed"), screen, []);
  assert.deepEqual(vm.unwrapToJS(screen.get("m_pr1").get("pos")), [1920 - 80 - 50.0 - 20, 1080 - 60 - 40.0 - 20]);

  events.length = 0;
  vm.invokeCallable(vm.root.get("preload_resources"), vm.root, []);

  const cached = events.filter((e) => e[0] === "cache").map((e) => `${e[1]}:${e[2]}`);
  assert.deepEqual(cached, [
    "sound:snd_hit",
    "texture:tex_keep",
    "texture:tex_default",
    "font:orgy",
    "sprite:spr_ok",
    "emitter:fx_smoke",
  ]);

  const initOrder = events
    .filter((e) => e[0] === "init_static_sprites" || e[0] === "init_skins" || e[0] === "cache")
    .map((e) => e[0]);
  assert.equal(initOrder[0], "init_static_sprites");
  assert.equal(initOrder[1], "init_skins");
  assert.equal(initOrder[2], "cache");
});
