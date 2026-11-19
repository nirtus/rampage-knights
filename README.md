# Rampage Knights — Community Mod Overlay

## Disclaimer

This is an unofficial community mod overlay for **Rampage Knights**. It does not redistribute original game assets and requires a legitimate copy of the game installed via Steam. Use at your own risk; backing up your save files before installing is recommended.

## Included Features

- **Campaign Carryover Loop**: Beating the final boss starts a new Campaign run on the same difficulty while keeping all of your equipped gear, items, passive perks, familiars, coins, souls, and stats. Loot pools refresh and filter out items you already own.
- **Alchemist Character Reset**: Talk to Tim the Alchemist in the Starting Camp to reset your entire character, only your gear and items, or only your stats and curses/blessings.
- **Endless Dungeon Difficulty & Return to Camp**: Endless Dungeon now respects the difficulty chosen in the Starting Camp (Casual allows checkpoint respawns and healing between floors; Normal and above use permadeath). Also adds a **"Return to Camp"** option to the pause menu to bring your current loadout and stats back to camp.

## Installation & Uninstallation

Requires **Rampage Knights** installed via Steam (typically `.../SteamLibrary/steamapps/common/Rampage Knights`).

### Install (Option 1: Git — Recommended)

Open a terminal or PowerShell inside your `Rampage Knights` installation folder and run:

```bash
git init
git remote add origin https://github.com/nirtus/rampage-knights.git
git fetch origin
git checkout -f -t origin/main
```

To update later, run `git pull` in the same folder.

### Install (Option 2: Manual ZIP)

1. Click **Code → Download ZIP** on GitHub.
2. Extract the contents directly into your `Rampage Knights` installation folder, overwriting files if prompted.

### Uninstall

1. Delete `scripts/preload.nut` from your `Rampage Knights` folder.
2. *(Optional)* Remove the `.git`, `docs`, and `tests` folders, or run **Verify integrity of game files** in Steam.
