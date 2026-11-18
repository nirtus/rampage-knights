import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { installPreCommitHook, syncVanillaChanges } from "./sync_vanilla_changes.mjs";

const THIS_DIR = path.dirname(fileURLToPath(import.meta.url));

// NIST / standard SHA-256 vectors (independent literals, not computed at runtime)
const SHA256_ABC = "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad";
const SHA256_HELLO = "2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824";

function git(cwd, args) {
  return execFileSync("git", args, { cwd, encoding: "utf8" }).trim();
}

function createTempOverlayRepo(t) {
  const baseTmp = fs.existsSync("/tmp/opencode") ? "/tmp/opencode" : os.tmpdir();
  const repoRoot = fs.mkdtempSync(path.join(baseTmp, "rk-overlay-test-"));
  t.after(() => {
    fs.rmSync(repoRoot, { recursive: true, force: true });
  });

  git(repoRoot, ["init"]);
  git(repoRoot, ["config", "user.name", "nirtus"]);
  git(repoRoot, ["config", "user.email", "nirtulys@gmail.com"]);

  fs.writeFileSync(
    path.join(repoRoot, ".gitignore"),
    "/data/\nscripts/**/*.nut.bin\n",
    "utf8",
  );

  fs.mkdirSync(path.join(repoRoot, "data"), { recursive: true });
  fs.mkdirSync(path.join(repoRoot, "scripts"), { recursive: true });
  fs.mkdirSync(path.join(repoRoot, "docs"), { recursive: true });

  fs.writeFileSync(path.join(repoRoot, "data/gparams.txt.bin"), "abc", "utf8");
  fs.writeFileSync(path.join(repoRoot, "scripts/World.nut.bin"), "hello", "utf8");

  const manifestPath = path.join(repoRoot, "docs/vanilla-hashes.sha256");
  fs.writeFileSync(
    manifestPath,
    `${SHA256_ABC}  data/gparams.txt.bin\n${SHA256_HELLO}  scripts/World.nut.bin\n`,
    "utf8",
  );

  return { repoRoot, manifestPath };
}

test("Seam 1: syncVanillaChanges ignores untouched vanilla files and force-stages modified vanilla files", (t) => {
  const { repoRoot, manifestPath } = createTempOverlayRepo(t);

  // Untouched baseline: neither ignored vanilla file is staged
  const cleanResult = syncVanillaChanges({ repoRoot, manifestPath });
  assert.deepEqual(cleanResult, { staged: [], untracked: [] });
  assert.equal(git(repoRoot, ["ls-files"]), "");

  // Modify one ignored vanilla file on disk
  fs.writeFileSync(path.join(repoRoot, "data/gparams.txt.bin"), "abc-modded", "utf8");

  const dirtyResult = syncVanillaChanges({ repoRoot, manifestPath });
  assert.deepEqual(dirtyResult, { staged: ["data/gparams.txt.bin"], untracked: [] });
  assert.equal(git(repoRoot, ["ls-files"]), "data/gparams.txt.bin");
});

test("Seam 1: syncVanillaChanges untracks restored vanilla files while preserving them on disk", (t) => {
  const { repoRoot, manifestPath } = createTempOverlayRepo(t);

  // Case A: Modified, committed, then reverted to baseline bytes
  fs.writeFileSync(path.join(repoRoot, "data/gparams.txt.bin"), "abc-modded", "utf8");
  syncVanillaChanges({ repoRoot, manifestPath });
  git(repoRoot, ["commit", "-m", "Commit modded vanilla file"]);
  assert.equal(git(repoRoot, ["ls-files"]), "data/gparams.txt.bin");

  fs.writeFileSync(path.join(repoRoot, "data/gparams.txt.bin"), "abc", "utf8");
  const revertCommitted = syncVanillaChanges({ repoRoot, manifestPath });
  assert.deepEqual(revertCommitted, { staged: [], untracked: ["data/gparams.txt.bin"] });
  assert.equal(git(repoRoot, ["ls-files"]), "");
  assert.equal(fs.readFileSync(path.join(repoRoot, "data/gparams.txt.bin"), "utf8"), "abc");

  // Case B: Modified and staged (uncommitted), then reverted to baseline bytes before commit
  fs.writeFileSync(path.join(repoRoot, "scripts/World.nut.bin"), "hello-modded", "utf8");
  syncVanillaChanges({ repoRoot, manifestPath });
  assert.equal(git(repoRoot, ["ls-files"]), "scripts/World.nut.bin");

  fs.writeFileSync(path.join(repoRoot, "scripts/World.nut.bin"), "hello", "utf8");
  const revertStaged = syncVanillaChanges({ repoRoot, manifestPath });
  assert.deepEqual(revertStaged, { staged: [], untracked: ["scripts/World.nut.bin"] });
  assert.equal(git(repoRoot, ["ls-files"]), "");
  assert.equal(fs.readFileSync(path.join(repoRoot, "scripts/World.nut.bin"), "utf8"), "hello");
});

test("Seam 2: pre-commit hook automatically commits modified vanilla files and untracks reverted ones", (t) => {
  const { repoRoot } = createTempOverlayRepo(t);

  fs.mkdirSync(path.join(repoRoot, "tests"), { recursive: true });
  fs.copyFileSync(
    path.join(THIS_DIR, "sync_vanilla_changes.mjs"),
    path.join(repoRoot, "tests/sync_vanilla_changes.mjs"),
  );

  installPreCommitHook(repoRoot);

  // Initial overlay commit: untouched vanilla files must not enter HEAD tree
  git(repoRoot, ["add", "."]);
  git(repoRoot, ["commit", "-m", "Initial overlay"]);
  const initialTree = git(repoRoot, ["ls-tree", "-r", "--name-only", "HEAD"]).split("\n");
  assert.deepEqual(initialTree, [
    ".gitignore",
    "docs/vanilla-hashes.sha256",
    "tests/sync_vanilla_changes.mjs",
  ]);

  // Case 1: Modify an ignored vanilla file alongside a staged project change -> committed in one step
  // Also run under minimal PATH to verify non-interactive shell node discovery
  fs.writeFileSync(path.join(repoRoot, "scripts/preload.nut"), "// mod v1\n", "utf8");
  fs.writeFileSync(path.join(repoRoot, "data/gparams.txt.bin"), "abc-custom", "utf8");
  git(repoRoot, ["add", "."]);
  execFileSync("git", ["commit", "-m", "Add mod and modified vanilla gparams"], {
    cwd: repoRoot,
    env: { ...process.env, PATH: "/usr/local/bin:/usr/bin:/bin" },
    encoding: "utf8",
  });

  const moddedTree = git(repoRoot, ["ls-tree", "-r", "--name-only", "HEAD"]).split("\n");
  assert.ok(moddedTree.includes("scripts/preload.nut"));
  assert.ok(moddedTree.includes("data/gparams.txt.bin"));

  // Case 2: Revert tracked vanilla file back to original bytes -> `git add . && git commit` untracks it in one step
  fs.writeFileSync(path.join(repoRoot, "data/gparams.txt.bin"), "abc", "utf8");
  git(repoRoot, ["add", "."]);
  git(repoRoot, ["commit", "-m", "Revert vanilla gparams to baseline"]);

  const revertedTree = git(repoRoot, ["ls-tree", "-r", "--name-only", "HEAD"]).split("\n");
  assert.ok(!revertedTree.includes("data/gparams.txt.bin"));
  assert.equal(fs.readFileSync(path.join(repoRoot, "data/gparams.txt.bin"), "utf8"), "abc");
});


