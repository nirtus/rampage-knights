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

test("Seam 1: syncVanillaChanges ignores untouched vanilla files, stages newly modified ones once, and skips already-staged ones", (t) => {
  const { repoRoot, manifestPath } = createTempOverlayRepo(t);

  assert.deepEqual(syncVanillaChanges({ repoRoot, manifestPath }), {
    staged: [],
    untracked: [],
  });
  assert.equal(git(repoRoot, ["ls-files"]), "");

  fs.writeFileSync(path.join(repoRoot, "data/gparams.txt.bin"), "abc-modded", "utf8");

  assert.deepEqual(syncVanillaChanges({ repoRoot, manifestPath }), {
    staged: ["data/gparams.txt.bin"],
    untracked: [],
  });
  assert.equal(git(repoRoot, ["ls-files"]), "data/gparams.txt.bin");

  // Re-running with no further edits does not re-stage or re-report the already-staged file
  assert.deepEqual(syncVanillaChanges({ repoRoot, manifestPath }), {
    staged: [],
    untracked: [],
  });
});

test("Seam 1: syncVanillaChanges untracks restored vanilla files while preserving them on disk", (t) => {
  const { repoRoot, manifestPath } = createTempOverlayRepo(t);

  const verifyModifyAndRestore = (relPath, originalBytes, commitBeforeRestore) => {
    fs.writeFileSync(path.join(repoRoot, relPath), `${originalBytes}-modded`, "utf8");
    syncVanillaChanges({ repoRoot, manifestPath });
    if (commitBeforeRestore) {
      git(repoRoot, ["commit", "-m", `Commit modded ${relPath}`]);
    }
    assert.equal(git(repoRoot, ["ls-files"]), relPath);

    fs.writeFileSync(path.join(repoRoot, relPath), originalBytes, "utf8");
    assert.deepEqual(syncVanillaChanges({ repoRoot, manifestPath }), {
      staged: [],
      untracked: [relPath],
    });
    assert.equal(git(repoRoot, ["ls-files"]), "");
    assert.equal(fs.readFileSync(path.join(repoRoot, relPath), "utf8"), originalBytes);
  };

  verifyModifyAndRestore("data/gparams.txt.bin", "abc", true);
  verifyModifyAndRestore("scripts/World.nut.bin", "hello", false);
});

test("Seam 2: pre-commit hook and CLI work from subdirectories and commit/untrack vanilla changes", (t) => {
  const { repoRoot } = createTempOverlayRepo(t);

  fs.mkdirSync(path.join(repoRoot, "tests"), { recursive: true });
  fs.copyFileSync(
    path.join(THIS_DIR, "sync_vanilla_changes.mjs"),
    path.join(repoRoot, "tests/sync_vanilla_changes.mjs"),
  );

  // CLI invoked from a subdirectory resolves repoRoot and installs hook cleanly
  execFileSync("node", ["../tests/sync_vanilla_changes.mjs", "--install-hook"], {
    cwd: path.join(repoRoot, "docs"),
    encoding: "utf8",
  });

  git(repoRoot, ["add", "."]);
  git(repoRoot, ["commit", "-m", "Initial overlay"]);
  assert.deepEqual(git(repoRoot, ["ls-tree", "-r", "--name-only", "HEAD"]).split("\n"), [
    ".gitignore",
    "docs/vanilla-hashes.sha256",
    "tests/sync_vanilla_changes.mjs",
  ]);

  // Case 1: Solo vanilla edit + `git commit` stages via pre-commit (then commits on retry)
  fs.writeFileSync(path.join(repoRoot, "scripts/World.nut.bin"), "hello-solo", "utf8");
  assert.throws(() => git(repoRoot, ["commit", "-m", "Solo vanilla edit"]));
  assert.equal(git(repoRoot, ["diff", "--cached", "--name-only"]), "scripts/World.nut.bin");
  git(repoRoot, ["commit", "-m", "Solo vanilla edit"]);
  assert.ok(
    git(repoRoot, ["ls-tree", "-r", "--name-only", "HEAD"])
      .split("\n")
      .includes("scripts/World.nut.bin"),
  );

  // Case 2: Vanilla edit alongside staged mod change under minimal PATH -> committed in one step
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

  // Case 3: Revert tracked vanilla files -> `git add . && git commit` untracks them while keeping disk files
  fs.writeFileSync(path.join(repoRoot, "data/gparams.txt.bin"), "abc", "utf8");
  fs.writeFileSync(path.join(repoRoot, "scripts/World.nut.bin"), "hello", "utf8");
  git(repoRoot, ["add", "."]);
  git(repoRoot, ["commit", "-m", "Revert vanilla files to baseline"]);

  const revertedTree = git(repoRoot, ["ls-tree", "-r", "--name-only", "HEAD"]).split("\n");
  assert.ok(!revertedTree.includes("data/gparams.txt.bin"));
  assert.ok(!revertedTree.includes("scripts/World.nut.bin"));
  assert.equal(fs.readFileSync(path.join(repoRoot, "data/gparams.txt.bin"), "utf8"), "abc");
  assert.equal(fs.readFileSync(path.join(repoRoot, "scripts/World.nut.bin"), "utf8"), "hello");
});
