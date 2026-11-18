# Stage Overlay Files and Verify Clean Repository Commit

Status: ready-for-agent
Blocked by: 01, 02

## Context

Once `.gitignore`, `docs/vanilla-hashes.sha256`, `tests/sync_vanilla_changes.mjs`, and `.git/hooks/pre-commit` are in place (from [Create `.gitignore` and Vanilla Baseline Hash Manifest](01-gitignore-and-vanilla-hash-manifest.md) and [Implement Vanilla Diff Sync Script, Pre-Commit Hook, and Tests](02-vanilla-diff-sync-script-and-hook.md)), stage and commit the overlay repository so it is ready to push to `origin/main`.

## Deliverables

1. Run `node tests/sync_vanilla_changes.mjs` and `node --test tests/*.test.mjs`.
2. Stage all tracked project/mod files (`git add .`).
3. Verify via `git status` and `git diff --cached --stat` that only overlay files (`.gitignore`, `AGENTS.md`, `GLOSSARY.md`, `README.md`, `docs/**`, `scripts/preload.nut`, `tests/**`) are staged and zero untouched vanilla binaries/assets are included.
4. Create the commit on `main` (and push to `origin/main` if credentials permit, or report readiness for `git push`).

## Acceptance Criteria

- `git status` is completely clean (`working tree clean`) with all vanilla game files still present on disk.
- `git ls-files` contains only the overlay mod/project files and no untouched vanilla game files.

## Comments

- Staged all overlay project/mod files, verified zero untouched vanilla files in `git ls-files`, and ran code review and full test suite (`node --test tests/*.test.mjs`).
