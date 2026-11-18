# Feature Specification: GitHub Overlay Repository & Vanilla Diff Tracker

## Goal

Publish only new or modified project/mod files to the GitHub repository (`https://github.com/nirtus/rampage-knights.git`), excluding untouched original *Rampage Knights* game files while:
1. Allowing players who own the game to install and update changes in-place inside their `Rampage Knights` directory (`git pull` or ZIP extraction).
2. Automatically detecting and staging any original vanilla game file whose bytes differ from the shipped Steam baseline, and untracking it (`git rm --cached`) if reverted to vanilla.

---

## Architecture & Components

### 1. `.gitignore` (Ignore Vanilla by Default)
Ignore all shipped *Rampage Knights* binaries, compiled scripts, assets, and runtime save files by default:
- `/rampage_knights.exe`
- `/*.dll`
- `/boot.config`
- `/gamecontrollerdb.txt`
- `/readme.txt`
- `/data/`
- `scripts/**/*.nut.bin`
- Runtime saves and logs (`*.dat`, `*.log`, `steam_appid.txt`)

New non-vanilla files (`scripts/**/*.nut`, `docs/**`, `tests/**`, `*.md`, `.gitignore`) remain un-ignored and appear in `git status` automatically.

### 2. Vanilla Baseline Manifest (`docs/vanilla-hashes.sha256`)
A deterministic SHA-256 manifest recording `<sha256>  <relative-path>` for all 1,123 original game files (`rampage_knights.exe`, `SDL2.dll`, `bass.dll`, `steam_api.dll`, `boot.config`, `gamecontrollerdb.txt`, `readme.txt`, `data/**`, and `scripts/**/*.nut.bin`).

### 3. Automatic Vanilla Diff Tracker (`tests/sync_vanilla_changes.mjs` & `.git/hooks/pre-commit`)
A zero-dependency Node ESM script invoked both manually (`node tests/sync_vanilla_changes.mjs`) and automatically via `.git/hooks/pre-commit`:
1. Reads `docs/vanilla-hashes.sha256`.
2. Hashes each listed vanilla path currently on disk:
   - **Modified (`current_sha256 !== vanilla_sha256`)**: Runs `git add -f -- <path>` so the modified vanilla file is staged and tracked in Git despite matching `.gitignore`.
   - **Unchanged (`current_sha256 === vanilla_sha256`) and currently tracked in Git index**: Runs `git rm --cached -- <path>` so reverted vanilla files are removed from the repository index while remaining intact on disk.
3. Prints a summary of any force-staged or untracked vanilla files.

### 4. Player Installation & Update Workflow (`README.md`)
Document two supported workflows for players updating an existing *Rampage Knights* installation:
1. **Git In-Place Update (Recommended)**:
   ```bash
   git init
   git remote add origin https://github.com/nirtus/rampage-knights.git
   git fetch origin
   git checkout -f -t origin/main
   ```
   Subsequent updates require only `git pull`.
2. **ZIP Overlay**:
   Download the repository ZIP from GitHub and extract its contents directly into the `Rampage Knights` installation folder.

---

## Verification Criteria
- `git status --short` shows only project/mod files (`AGENTS.md`, `GLOSSARY.md`, `README.md`, `.gitignore`, `docs/**`, `scripts/preload.nut`, `tests/**`) and zero untouched vanilla game files.
- Modifying any vanilla file recorded in `docs/vanilla-hashes.sha256` and running `node tests/sync_vanilla_changes.mjs` (or `git commit`) automatically stages that file with `git add -f`.
- Restoring that vanilla file to its original bytes and running `node tests/sync_vanilla_changes.mjs` (or `git commit`) automatically removes it from the Git index (`git rm --cached`) while leaving the file on disk.
