# Implement Vanilla Diff Sync Script, Pre-Commit Hook, and Tests

Status: ready-for-agent
Blocked by: 01

## Context

Because `.gitignore` ignores vanilla game files by default, Git alone will not notice if an ignored original game file (such as a file in `data/` or a `.nut.bin` file) is modified in-place. Per [`spec.md`](../spec.md), `tests/sync_vanilla_changes.mjs` and `.git/hooks/pre-commit` bridge this gap using `docs/vanilla-hashes.sha256`.

## Deliverables

1. **Implement `tests/sync_vanilla_changes.mjs`**:
   - Read and parse `docs/vanilla-hashes.sha256`.
   - Compute current SHA-256 hashes for all listed vanilla files on disk.
   - Query currently tracked files in the Git index (`git ls-files`).
   - For any vanilla file whose on-disk SHA-256 differs from `docs/vanilla-hashes.sha256`: run `git add -f -- <path>` so the modified file is staged.
   - For any vanilla file whose on-disk SHA-256 equals `docs/vanilla-hashes.sha256` AND is currently tracked in the Git index: run `git rm --cached -- <path>` so the restored file is untracked while remaining intact on disk.
   - Export reusable helper functions so automated tests can exercise the logic in an isolated temporary Git repo or fixture.
2. **Install `.git/hooks/pre-commit`**:
   - Configure `.git/hooks/pre-commit` (executable shell script) to invoke `node tests/sync_vanilla_changes.mjs` before each commit.
3. **Add Automated Tests (`tests/sync_vanilla_changes.test.mjs`)**:
   - Verify that untouched vanilla files remain ignored.
   - Verify that modifying a vanilla file causes `sync_vanilla_changes` to force-stage it (`git add -f`).
   - Verify that reverting a tracked vanilla file back to its baseline hash causes `sync_vanilla_changes` to untrack it (`git rm --cached`) while leaving the file on disk.

## Acceptance Criteria

- `node tests/sync_vanilla_changes.mjs` completes cleanly with 0 modified vanilla files on the current untouched baseline.
- `node --test tests/*.test.mjs` passes all existing and new tests.
- `.git/hooks/pre-commit` is present and executable.

## Comments

- Implemented `syncVanillaChanges` and `installPreCommitHook` in `tests/sync_vanilla_changes.mjs`, installed `.git/hooks/pre-commit`, and verified Seam 1 and Seam 2 in `tests/sync_vanilla_changes.test.mjs` (`9/9` total tests passing).
