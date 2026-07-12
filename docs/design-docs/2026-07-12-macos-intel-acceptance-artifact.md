# macOS Intel Acceptance Artifact Design

## Status

Approved for implementation on 2026-07-12. This is internal acceptance infrastructure, not a
production release or a change to FrameQ user behavior.

## Goal

Use a manually triggered GitHub Actions run on a real Intel macOS hosted runner to execute the
macOS Rust acceptance suite for permanent History deletion and produce an internal x86_64 FrameQ
DMG that can be downloaded from the workflow run.

## Scope and Boundaries

- Add one dedicated `workflow_dispatch` workflow. It has no push, tag, release, schedule, or pull
  request trigger.
- Run on GitHub's supported `macos-15-intel` label, which provides an x86_64 macOS VM.
- Grant only `contents: read`; do not create a tag, GitHub Release, updater manifest, deployment,
  signature, notarization request, or public download URL.
- Reuse the current macOS x64 runtime preparation and DMG scripts. Do not alter worker, server,
  payment, LLM, SourceIdentity, deletion behavior, or the production release workflow.
- Use the existing repository runtime archive secrets only as opaque environment variables. Never
  print their values or copy them into artifact names, logs, metadata, or checksums.

## Workflow

The workflow contains one serial job with a 90-minute timeout:

1. Check out the exact branch commit that triggered the manual run.
2. Install the repository's Node, Rust x86_64 Apple target, and uv toolchains.
3. Run `npm ci --prefix app`.
4. Run `cargo test --manifest-path app/src-tauri/Cargo.toml --target x86_64-apple-darwin`.
   This must execute the `cfg(unix)` process-group fixtures and the macOS filesystem deletion
   fixtures, including symlink rejection and real temporary-directory removal.
5. Run `node scripts/build-installer.mjs --target macos-x64 --skip-tauri-build` using the existing
   macOS x64 runtime archive secrets.
6. Build the ad-hoc-signed app bundle for `x86_64-apple-darwin` without an updater or release.
7. Verify the executable reports x86_64, bundled Python/worker imports succeed, Deno starts, the
   verification does not create `__pycache__` or `.pyc` files in the bundle, and deep code-sign
   verification succeeds for the existing ad-hoc identity.
8. Package the DMG with the existing `scripts/make-macos-dmg.sh` helper.
9. Write a SHA-256 file next to the DMG and upload both through `actions/upload-artifact@v4` with
   `if-no-files-found: error` and seven-day retention.

The artifact name includes only the run number and short commit identity. GitHub's artifact digest
remains visible in the workflow run in addition to the repository-generated SHA-256 file.

## Failure Semantics

- Any test, architecture, import, code-sign, mutation, DMG, checksum, or upload failure fails the
  job and produces no success claim.
- Missing runtime archive secrets fail at resource preparation. The workflow does not substitute
  arbitrary public downloads or expose the missing value.
- A green build proves the tested commit compiles and packages on GitHub's Intel macOS image. It
  does not prove Developer ID signing, Apple notarization, Gatekeeper first-launch behavior, real
  media download, real LLM use, payment availability, or installation on every Intel Mac version.

## Evidence and Plan Closure

After a green run, record the immutable workflow run URL, commit SHA, runner label, Rust test count,
DMG artifact name, size, and SHA-256 in the active permanent-deletion ExecPlan. The deletion plan
may close only when the macOS test log demonstrates the conditional deletion/link tests actually
ran. The internal DMG remains explicitly non-release and must not be described as production-ready.

## Security Review

- Least privilege: workflow-level `contents: read` only.
- No untrusted input is passed to a shell command; the workflow has no string inputs.
- Toolchain actions and upload action use fixed major versions already established by the
  repository.
- Runtime URLs stay in GitHub Secrets and are consumed only by the existing resource builder.
- The artifact contains application/runtime files and checksums only; no `.env`, credentials,
  logs, task outputs, user data, ASR model weights, or LLM key is added.
