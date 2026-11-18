# Reconstruct Plain-Text `scripts/preload.nut` Bootstrap Seam

Status: ready-for-agent
Blocked by: none

## Context

Per [ADR 0001](../../adr/0001-plaintext-squirrel-override-seam.md) and [`spec.md`](../spec.md), `rampage_knights.exe` (`0x4f3d30–0x4f4150`) compiles plain-text `scripts/preload.nut` before falling back to `scripts/preload.nut.bin`. Because `scripts/main.nut.bin` executes `scripts/preload.nut` right after all gameplay classes are defined and right before `register_state_class` locks `StateObject` schemas, `scripts/preload.nut` is our single-file mod seam.

To replace `scripts/preload.nut.bin` (`8,022` bytes) non-destructively, `scripts/preload.nut` must faithfully reproduce vanilla `PreloadResourcesScreen` (`constructor`, `screen_resolution_changed`, `render`, `update`, `enumerate_resources`, `preload_resources`) so asset preloading behaves identically to the shipped bytecode.

## Deliverables

1. Disassemble all closures in `scripts/preload.nut.bin` (Squirrel 3.0.3 `0xFAFA "SQIR"` format) and reconstruct `PreloadResourcesScreen` in plain-text `scripts/preload.nut` (leaving `scripts/preload.nut.bin` untouched on disk).
2. Expose a clean bootstrap hook at the bottom of `scripts/preload.nut` where `CampaignCarryover.install()` will attach in Issue `02`.
3. Verify that every literal, member slot, and method signature of `PreloadResourcesScreen` in `scripts/preload.nut` matches `scripts/preload.nut.bin` (`preloaded_resources`, `m_skip_preload`, `m_done`, `m_init_counter`, `m_index`, `m_scene`, `m_view`, `m_pr1`, `m_pr2`, `m_time`, `m_frame_counter`, and all 6 methods).

## Acceptance Criteria

- `scripts/preload.nut.bin` and `rampage_knights.exe` remain unmodified (`git status` shows no binary modifications).
- `scripts/preload.nut` is valid Squirrel 3.0.3 syntax and reproduces all `PreloadResourcesScreen` slots and control flow from `scripts/preload.nut.bin`.

## Comments

- Reconstructed `PreloadResourcesScreen` and `preload_resources()` in plain-text `scripts/preload.nut` from `scripts/preload.nut.bin` closure disassembly; verified via `tests/preload.test.mjs`.
