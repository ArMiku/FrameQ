# YouTube JavaScript Runtime Packaging

## Purpose

Clean macOS Apple Silicon installs must not depend on a user-installed
JavaScript runtime when `yt-dlp` needs one for public YouTube extraction.
FrameQ should ship a small local runtime in the ordinary desktop package so the
same public-link workflow works on clean Windows and macOS machines.

## User Experience

- Users still submit one public video URL in the existing workflow.
- There is no YouTube-specific login, cookie, account, proxy, or stream picker
  UI.
- YouTube failures continue to use the existing structured result workspace and
  local diagnostic log path.
- Users do not need to install Deno, Node.js, Bun, QuickJS, Python, `yt-dlp`,
  or media tools manually.

## Packaging Requirements

- The release resource build bundles Deno into `resources/bin` for
  `windows-x64`, `macos-arm64`, and `macos-x64`.
- The bundled binary name is `deno.exe` on Windows and `deno` on macOS.
- The installer resource preparation step verifies that the bundled Deno binary
  can run `deno eval` before building the Tauri package.
- The packaged app smoke test verifies Deno from the app bundle in addition to
  Python, `yt-dlp`, `ffmpeg`, and `ffprobe`.
- Release operators may override the Deno archive URL or Deno version through
  build-time environment variables, but ordinary users do not configure this.

## Boundaries

- Deno is a local executable dependency for `yt-dlp` JavaScript evaluation only.
- Bundling Deno must not add browser cookie import, YouTube login automation,
  CAPTCHA solving, proxy bypass, playlist batching, or private-content scraping.
- Deno must not be used to fetch remote application code at runtime.
- Diagnostic logs may report whether `deno` is available on `PATH`, but must not
  log cookies, sensitive headers, LLM keys, session tokens, or volatile YouTube
  media URLs.

## Acceptance

- `scripts/build-installer.mjs` prepares `resources/bin/deno` or
  `resources/bin/deno.exe` for all supported release targets.
- `--skip-downloads` fails clearly if existing resources do not contain Deno.
- macOS Apple Silicon packages include an executable Deno binary under the app
  resource `resources/bin` directory.
- The worker's YouTube `yt-dlp` command can use `--js-runtimes deno` from the
  packaged resource `PATH`.
