# Create `.gitignore` and Vanilla Baseline Hash Manifest

Status: ready-for-agent
Blocked by: none

## Context

Per [`spec.md`](../spec.md), the GitHub repository (`origin/main`) must exclude all 1,123 untouched original *Rampage Knights* files while preserving a deterministic SHA-256 baseline manifest (`docs/vanilla-hashes.sha256`) so future modifications to any original game file can be detected automatically.

## Deliverables

1. **Create `.gitignore`** at the repository root ignoring untouched vanilla game files and runtime artifacts:
   - `/rampage_knights.exe`
   - `/*.dll` (`SDL2.dll`, `bass.dll`, `steam_api.dll`)
   - `/boot.config`
   - `/gamecontrollerdb.txt`
   - `/readme.txt`
   - `/data/`
   - `scripts/**/*.nut.bin`
   - **Mid-Run Save** files, checkpoints, and logs (`*.dat`, `*.log`, `steam_appid.txt`)
2. **Generate `docs/vanilla-hashes.sha256`** containing `<sha256>  <relative-posix-path>` sorted lexicographically by path for all 1,123 original game files:
   - Root vanilla files (`SDL2.dll`, `bass.dll`, `boot.config`, `gamecontrollerdb.txt`, `rampage_knights.exe`, `readme.txt`, `steam_api.dll`)
   - All files under `data/**`
   - All compiled Squirrel closures matching `scripts/**/*.nut.bin`

## Acceptance Criteria

- `git status --short` lists only project/mod files (`.gitignore`, `AGENTS.md`, `GLOSSARY.md`, `README.md`, `docs/`, `scripts/preload.nut`, `tests/`) and zero untouched vanilla game files.
- `docs/vanilla-hashes.sha256` contains 1,123 valid SHA-256 entries matching the shipped files on disk.

## Comments

- Created `.gitignore` and generated `docs/vanilla-hashes.sha256` (1,123 vanilla game file SHA-256 entries); verified `git status --short -uall` excludes all untouched vanilla files.
