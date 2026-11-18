## Destination

Configure the repository as a lightweight GitHub overlay (`https://github.com/nirtus/rampage-knights.git`) that ignores untouched vanilla *Rampage Knights* files, automatically tracks new or modified files (including modified vanilla files via a SHA-256 baseline manifest and `pre-commit` hook), and lets players update their existing game installation in-place via `git pull` or ZIP extraction.

## Notes

- Spec: [`docs/features/github-overlay-repo/spec.md`](spec.md)
- Domain glossary: [`GLOSSARY.md`](../../../GLOSSARY.md)
- Issue tracker conventions: [`docs/agents/issue-tracker.md`](../../agents/issue-tracker.md)

## Decisions so far

- **Player Update Mechanism**: Support both in-place Git overlay (`git init` + `git fetch` + `git checkout -f -t origin/main`, then `git pull`) and GitHub ZIP download in `README.md`.
- **Published Repository Scope**: Track all project and mod files (`scripts/preload.nut`, `README.md`, `GLOSSARY.md`, `AGENTS.md`, `docs/`, `tests/`, `.gitignore`) while excluding untouched original game files.
- **Modified Vanilla File Detection**: Record SHA-256 checksums of all 1,123 shipped vanilla game files in `docs/vanilla-hashes.sha256`; use `tests/sync_vanilla_changes.mjs` + `.git/hooks/pre-commit` to automatically `git add -f` any modified vanilla file and `git rm --cached` any vanilla file restored to its original checksum.

## Not yet specified

None — all design decisions are resolved and broken into implementation issues under [`issues/`](issues/).

## Out of scope

- Standalone installer binaries (`.exe` / `.sh` GUI updaters) or GitHub Actions release packaging workflows.
- Redistributing untouched vanilla *Rampage Knights* binaries or assets on GitHub.
