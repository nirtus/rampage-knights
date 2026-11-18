# Use Plain-Text `scripts/preload.nut` as the Gameplay Mod Seam

Status: accepted

*Rampage Knights* ships compiled Squirrel 3.0.3 closures (`scripts/*.nut.bin`), but static disassembly of `rampage_knights.exe` (`0x4f3d30–0x4f4150`) shows `::System.run_script("scripts/<name>.nut")` probes disk for plain-text `scripts/<name>.nut` first and compiles it via the embedded Squirrel compiler (`0x447c40`), falling back to `.nut.bin` (`0x44a1a0`) only when no `.nut` file exists. Furthermore, `scripts/main.nut.bin` loads `scripts/preload.nut` (offset `8338`) immediately after all gameplay classes (`Hero`, `LevelScreen`, `World`, `WorldState`, `Loot`) are defined and immediately before `register_state_class` (offset `8372`) locks `StateObject` schemas for rollback networking and binary serialization. We therefore mount gameplay mods by reconstructing `scripts/preload.nut` as plain text and installing method overrides on existing classes before `register_state_class` runs, without adding or reordering `StateObject` fields.

## Considered Options

- **Plain-text `scripts/preload.nut` class-method seam (chosen)**: Touch zero `.exe` or `.nut.bin` bytes; override methods on `World`, `WorldState`, `LevelScreen`, and `Hero` in one drop-in file; deleting `scripts/preload.nut` cleanly restores vanilla.
- **Decompile and replace individual `scripts/*.nut` files (`World.nut`, `WorldState.nut`, `LevelScreen.nut`, `Hero_item.nut`)**: Spreads changes across four large reconstructed files and increases risk of decompilation drift in unrelated combat or netcode logic.
- **Patch `rampage_knights.exe` or inject a PE32 proxy DLL**: Unnecessary native complexity when gameplay state transitions live entirely in Squirrel closures.

## Consequences

- Mods mounted at `scripts/preload.nut` must not add, remove, or reorder `StateObject` member attributes (`NEWSLOTA` declarations) so `Mid-Run Save` blobs (`save.dat`, `csave.dat`, `osave.dat`), Casual checkpoints, and co-op `get_state_crc` checks remain binary-compatible with vanilla.
- When a future `ModCatalog` module (see `docs/architecture-review-20261117-modding-crud-ui.html`) is introduced, `scripts/preload.nut` serves as the single bootstrap seam that delegates to `ModCatalog` rather than requiring per-file overrides.
