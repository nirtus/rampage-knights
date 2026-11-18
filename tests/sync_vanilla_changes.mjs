import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

function parseManifest(manifestText) {
  const entries = [];
  for (const rawLine of manifestText.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const match = /^([0-9a-f]{64})  (.+)$/.exec(line);
    if (!match) {
      throw new Error(`Invalid manifest line: ${rawLine}`);
    }
    entries.push({ expectedSha256: match[1], relativePath: match[2] });
  }
  return entries;
}

function sha256File(filePath) {
  return crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
}

function getTrackedFiles(repoRoot) {
  const out = execFileSync("git", ["ls-files", "-z"], {
    cwd: repoRoot,
    encoding: "utf8",
  });
  return new Set(out.split("\0").filter(Boolean));
}

export function syncVanillaChanges({
  repoRoot = process.cwd(),
  manifestPath = path.join(repoRoot, "docs/vanilla-hashes.sha256"),
} = {}) {
  const entries = parseManifest(fs.readFileSync(manifestPath, "utf8"));
  const trackedFiles = getTrackedFiles(repoRoot);
  const staged = [];
  const untracked = [];

  for (const { expectedSha256, relativePath } of entries) {
    const fullPath = path.join(repoRoot, relativePath);
    if (!fs.existsSync(fullPath)) continue;
    const actualSha256 = sha256File(fullPath);
    if (actualSha256 !== expectedSha256) {
      staged.push(relativePath);
    } else if (trackedFiles.has(relativePath)) {
      untracked.push(relativePath);
    }
  }

  if (staged.length > 0) {
    execFileSync("git", ["add", "-f", "--", ...staged], { cwd: repoRoot, stdio: "pipe" });
  }
  if (untracked.length > 0) {
    execFileSync("git", ["rm", "-f", "--cached", "--", ...untracked], {
      cwd: repoRoot,
      stdio: "pipe",
    });
  }

  return { staged, untracked };
}

const PRE_COMMIT_HOOK_SCRIPT = `#!/bin/sh
set -e

if ! command -v node >/dev/null 2>&1; then
  if [ -d "$HOME/.nvm/versions/node" ]; then
    NVM_BIN=$(ls -1d "$HOME"/.nvm/versions/node/*/bin 2>/dev/null | tail -n 1)
    if [ -n "$NVM_BIN" ]; then
      PATH="$NVM_BIN:$PATH"
      export PATH
    fi
  fi
fi

if command -v node >/dev/null 2>&1; then
  exec node tests/sync_vanilla_changes.mjs
elif command -v wsl.exe >/dev/null 2>&1; then
  exec wsl.exe sh -c 'export PATH="$(ls -1d "$HOME"/.nvm/versions/node/*/bin 2>/dev/null | tail -n 1):$PATH"; node tests/sync_vanilla_changes.mjs'
else
  echo "pre-commit: node is required to run tests/sync_vanilla_changes.mjs" >&2
  exit 1
fi
`;

export function installPreCommitHook(repoRoot = process.cwd()) {
  const hookDir = path.join(repoRoot, ".git", "hooks");
  fs.mkdirSync(hookDir, { recursive: true });
  const hookPath = path.join(hookDir, "pre-commit");
  fs.writeFileSync(hookPath, PRE_COMMIT_HOOK_SCRIPT, { encoding: "utf8", mode: 0o755 });
  fs.chmodSync(hookPath, 0o755);
  return hookPath;
}

const isMain =
  process.argv[1] &&
  path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));

if (isMain) {
  if (process.argv.includes("--install-hook")) {
    const hookPath = installPreCommitHook(process.cwd());
    console.log(`Installed pre-commit hook at ${hookPath}`);
  }

  const { staged, untracked } = syncVanillaChanges();
  if (staged.length === 0 && untracked.length === 0) {
    console.log("Vanilla sync: 0 modified or reverted vanilla files.");
  } else {
    if (staged.length > 0) {
      console.log(`Vanilla sync: force-staged ${staged.length} modified vanilla file(s): ${staged.join(", ")}`);
    }
    if (untracked.length > 0) {
      console.log(`Vanilla sync: untracked ${untracked.length} restored vanilla file(s): ${untracked.join(", ")}`);
    }
  }
}

