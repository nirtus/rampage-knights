# Rampage Knights — Mod & Community Update Overlay

This repository contains gameplay mods, scripts, tests, and documentation that overlay on top of an existing **Rampage Knights** installation without redistributing untouched original game assets.

## How Players Install & Update

You must already own **Rampage Knights** installed via Steam (typically `.../SteamLibrary/steamapps/common/Rampage Knights`).

### Option 1: Git In-Place Updater (Recommended)

Open a terminal / PowerShell inside your `Rampage Knights` installation folder and run this one-time setup:

```bash
git init
git remote add origin https://github.com/nirtus/rampage-knights.git
git fetch origin
git checkout -f -t origin/main
```

Whenever new changes are published, update your game with:

```bash
git pull
```

### Option 2: Manual ZIP Update

1. Click **Code → Download ZIP** on GitHub.
2. Extract the archive contents directly into your `Rampage Knights` installation folder, overwriting existing mod files when prompted.

### Reverting to Vanilla

Delete `scripts/preload.nut` (and restore any tracked vanilla overrides via Steam's *Verify integrity of game files*).

---

## Maintainer Workflow

Original game files (`rampage_knights.exe`, `*.dll`, `data/`, `scripts/**/*.nut.bin`) are ignored by `.gitignore` and hashed in `docs/vanilla-hashes.sha256`:

- **New files** (e.g., `scripts/*.nut`, `docs/**`, `tests/**`) are tracked by Git automatically.
- **Modified original game files** are automatically detected against `docs/vanilla-hashes.sha256` and staged (`git add -f`) by `.git/hooks/pre-commit` (or manually via `node tests/sync_vanilla_changes.mjs`). If you edit *only* an ignored vanilla file with no other staged changes, run `node tests/sync_vanilla_changes.mjs` before `git commit` (or run `git commit` twice once the hook stages it).
- **Reverted original game files** that match their original hash in `docs/vanilla-hashes.sha256` are automatically untracked from Git (`git rm --cached`) while remaining on disk.
- **Fresh clones**: run `node tests/sync_vanilla_changes.mjs --install-hook` once to install `.git/hooks/pre-commit`.
