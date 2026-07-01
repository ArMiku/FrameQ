#!/usr/bin/env node

// Fails if any bundled macOS library still depends on a path outside the app
// bundle (Homebrew/MacPorts prefixes). Such references resolve on the CI runner
// but are missing on clean user Macs, which is exactly how the bundled Python
// runtime shipped a libllvmlite.dylib linked against /usr/local/opt/zstd.
//
// This is static analysis via `delocate-listdeps`, so it catches the leak on the
// Homebrew-rich runner where an `import` smoke test would falsely pass.

import { existsSync } from "node:fs";
import { readdir } from "node:fs/promises";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

const FORBIDDEN_PREFIXES = ["/usr/local/", "/opt/homebrew/", "/opt/local/"];

async function findSitePackagesDirectories(pythonRoot) {
  const directories = [];

  const windowsSitePackages = join(pythonRoot, "Lib", "site-packages");
  if (existsSync(windowsSitePackages)) {
    directories.push(windowsSitePackages);
  }

  const unixLib = join(pythonRoot, "lib");
  if (existsSync(unixLib)) {
    for (const entry of await readdir(unixLib, { withFileTypes: true })) {
      if (entry.isDirectory() && /^python3\.\d+$/.test(entry.name)) {
        const sitePackages = join(unixLib, entry.name, "site-packages");
        if (existsSync(sitePackages)) {
          directories.push(sitePackages);
        }
      }
    }
  }

  return directories;
}

function listDependencies(path) {
  const result = spawnSync("uvx", ["--from", "delocate", "delocate-listdeps", "--all", path], {
    encoding: "utf8",
  });

  if (result.error) {
    if (result.error.code === "ENOENT") {
      throw new Error("uvx (uv) is required to verify macOS bundle self-containment.");
    }
    throw result.error;
  }
  if (result.status !== 0) {
    throw new Error(
      `delocate-listdeps failed for ${path} (exit ${result.status}).\n${result.stderr ?? ""}`,
    );
  }

  return result.stdout ?? "";
}

function findLeaks(output) {
  const leaks = new Set();
  for (const line of output.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (FORBIDDEN_PREFIXES.some((prefix) => trimmed.includes(prefix))) {
      leaks.add(trimmed);
    }
  }
  return leaks;
}

async function main() {
  const pythonRoot = process.argv[2];
  if (!pythonRoot) {
    throw new Error("Usage: node scripts/verify-macos-self-contained.mjs <python-root>");
  }

  const sitePackagesDirectories = await findSitePackagesDirectories(pythonRoot);
  if (sitePackagesDirectories.length === 0) {
    throw new Error(`No site-packages directory found under ${pythonRoot}`);
  }

  const leaks = new Set();
  for (const directory of sitePackagesDirectories) {
    for (const leak of findLeaks(listDependencies(directory))) {
      leaks.add(leak);
    }
  }

  if (leaks.size > 0) {
    console.error(
      "Bundled macOS libraries depend on non-bundled paths and will fail on clean Macs:",
    );
    for (const leak of [...leaks].sort()) {
      console.error(`  ${leak}`);
    }
    process.exitCode = 1;
    return;
  }

  console.log(`macOS runtime is self-contained: ${sitePackagesDirectories.join(", ")}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
