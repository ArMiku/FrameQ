import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { chmod, mkdir, mkdtemp, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

import {
  copyDenoFromArchive,
  defaultDenoArchiveUrl,
  parseArgs,
  requireBundledDeno,
  requiredDenoBinary,
} from "../build-installer.mjs";

async function tempRoot(name) {
  return mkdtemp(join(tmpdir(), `frameq-${name}-`));
}

async function createFakeDenoArchive(binaryName) {
  const root = await tempRoot("deno-archive");
  const source = join(root, "source");
  const archive = join(root, "deno.tar");
  await mkdir(source, { recursive: true });
  const binary = join(source, binaryName);
  await writeFile(binary, "#!/usr/bin/env sh\nprintf 'deno fake\\n'\n");
  await chmod(binary, 0o755);

  const result = spawnSync("tar", ["-cf", archive, "-C", source, binaryName], {
    stdio: "pipe",
    windowsHide: true,
  });
  assert.equal(
    result.status,
    0,
    `create fake deno archive: ${result.stderr.toString()}`,
  );
  return { root, archive };
}

test("maps supported targets to bundled Deno binary names", () => {
  assert.equal(requiredDenoBinary("windows-x64"), "deno.exe");
  assert.equal(requiredDenoBinary("macos-arm64"), "deno");
  assert.equal(requiredDenoBinary("macos-x64"), "deno");
});

test("builds official Deno release archive URLs per target", () => {
  assert.equal(
    defaultDenoArchiveUrl("windows-x64", "v2.9.1"),
    "https://github.com/denoland/deno/releases/download/v2.9.1/deno-x86_64-pc-windows-msvc.zip",
  );
  assert.equal(
    defaultDenoArchiveUrl("macos-arm64", "v2.9.1"),
    "https://github.com/denoland/deno/releases/download/v2.9.1/deno-aarch64-apple-darwin.zip",
  );
  assert.equal(
    defaultDenoArchiveUrl("macos-x64", "v2.9.1"),
    "https://github.com/denoland/deno/releases/download/v2.9.1/deno-x86_64-apple-darwin.zip",
  );
});

test("parseArgs accepts Deno archive and version overrides", () => {
  const options = parseArgs([
    "--target",
    "macos-arm64",
    "--deno-archive-url",
    "file:///tmp/deno.zip",
    "--deno-version",
    "v2.9.1",
  ]);

  assert.equal(options.target, "macos-arm64");
  assert.equal(options.denoArchiveUrl, "file:///tmp/deno.zip");
  assert.equal(options.denoVersion, "v2.9.1");
});

test("requireBundledDeno fails clearly when skip-download resources lack Deno", async () => {
  const root = await tempRoot("deno-required");
  try {
    await mkdir(root, { recursive: true });

    assert.throws(
      () => requireBundledDeno(root, "macos-arm64"),
      /Could not find bundled Deno runtime/,
    );

    await writeFile(join(root, "deno"), "");
    assert.doesNotThrow(() => requireBundledDeno(root, "macos-arm64"));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("copyDenoFromArchive extracts Deno into resources bin", async () => {
  const { root, archive } = await createFakeDenoArchive("deno");
  const destination = join(root, "resources-bin");

  try {
    await copyDenoFromArchive(archive, destination, "macos-arm64");

    const copied = join(destination, "deno");
    assert.equal(existsSync(copied), true);
    if (process.platform !== "win32") {
      const mode = (await stat(copied)).mode;
      assert.notEqual(mode & 0o111, 0);
    }
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
