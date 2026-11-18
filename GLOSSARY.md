# Rampage Knights

Domain language for *Rampage Knights* gameplay progression, run persistence, and script modding.

## Gameplay Modes & Progression

**Campaign**:
A finite 10-floor dungeon progression (`forest` through `end`) that culminates in a final boss encounter.
_Avoid_: Story mode

**Campaign Clear**:
Completing the final floor of a Campaign and finishing its victory outro and theatre sequence.
_Avoid_: Beat, victory screen

**Carryover Loop**:
Continuing directly from a Campaign Clear into floor 0 (`forest`) of a newly seeded Campaign in the same mode and difficulty while retaining each player's Hero Loadout and Run Stats.
_Avoid_: Prestige, profile vault

**Starting Camp**:
The safe area preceding floor 0 of a normal Campaign where players can change hero classes, swap cosmetics, pick starting weapons, use the Alchemist Reset, or enter alternate mode portals.
_Avoid_: Town, hub

**Alchemist Reset**:
An opt-in service provided by Tim the Alchemist in the Starting Camp that resets the interacting player's Hero Loadout, Run Stats, or both back to starting class defaults and replenishes world loot pools.
_Avoid_: Prestige reset, account wipe

**Shadow World**:
A 10-floor Campaign variant that replaces each player's class, equipment, and stat modifiers with a fresh random deal at the start of every floor.
_Avoid_: Chaos mode

**Endless Dungeon**:
An infinite floor-by-floor dungeon mode with no Campaign Clear.
_Avoid_: Survival mode

## Character State & Persistence

**Hero Loadout**:
The in-run inventory carried by a player between floors, comprising the main weapon (with upgrades), slot-equipped gear, active consumables and throwables, Passive Modifiers, familiars, gold coins, and souls.
_Avoid_: Account inventory, stash

**Passive Modifier**:
A slotless upgrade item held for the duration of a run that grants passive combat or utility effects without occupying an equipment slot.
_Avoid_: Perk

**Run Stats**:
Run-scoped character attributes accumulated during an active run, including current and maximum health, extra lives, vitality/strength/spell damage offsets, blessings, curses, and diseases.
_Avoid_: Lifetime stats

**Mid-Run Save**:
The resumable world and character snapshot written between floors (`save.dat`, `csave.dat`, `osave.dat`) for the Main Menu "Continue" option, cleared upon Game Over or starting a fresh game.
_Avoid_: Profile save

**Player Profile**:
Account-wide persistent progression (`profile`) tracking unlocked feats, Steam achievements, hero classes, skins, and lifetime counters across runs.
_Avoid_: Hero save
