# Rampage Knights — Mod & Community Update Overlay

This repository contains gameplay mods, scripts, tests, and documentation that overlay on top of an existing **Rampage Knights** installation without redistributing untouched original game assets.

## Included Features

- **Campaign Carryover Loop** ([`spec.md`](docs/features/campaign-carryover/spec.md)): Clearing the final floor of a 10-floor Campaign carries your full **Hero Loadout** (weapon, gear, consumables, **Passive Modifiers**, familiars, coins, souls) and **Run Stats** (health, extra lives, stat offsets, blessings, curses, diseases) directly into floor 0 (`forest`) of a newly seeded Campaign at the same mode and difficulty, with replenished loot pools that filter already-owned items.
- **Alchemist Reset in Starting Camp** ([`04-alchemist-camp-character-reset.md`](docs/features/campaign-carryover/issues/04-alchemist-camp-character-reset.md)): Talk to Tim the Alchemist in the Starting Camp to reset your full character, only your gear & items, or only your stats & status effects at any time.

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

Per [ADR 0001](docs/adr/0001-plaintext-squirrel-override-seam.md), gameplay mods should use plain-text Squirrel (`scripts/preload.nut`) rather than patching `rampage_knights.exe` or `scripts/*.nut.bin`. If a non-Squirrel asset or deliberate vanilla override is ever modified (intentionally departing from ADR 0001's zero-binary-touch default), `docs/vanilla-hashes.sha256` ensures the change is tracked automatically:

- **New files** (e.g., `scripts/*.nut`, `docs/**`, `tests/**`) are tracked by Git automatically.
- **Modified original game files** are automatically detected against `docs/vanilla-hashes.sha256` and staged (`git add -f`) by `.git/hooks/pre-commit` (or manually via `node tests/sync_vanilla_changes.mjs`). If you edit *only* an ignored vanilla file with no other staged changes, run `node tests/sync_vanilla_changes.mjs` before `git commit` (or run `git commit` twice once the hook stages it).
- **Reverted original game files** that match their original hash in `docs/vanilla-hashes.sha256` are automatically untracked from Git (`git rm --cached`) while remaining on disk.
- **Fresh clones**: run `node tests/sync_vanilla_changes.mjs --install-hook` once to install `.git/hooks/pre-commit`.
