# Desktop Diagnostics Logs

## Purpose

FrameQ should leave enough local evidence for desktop support debugging when a
clean installer behaves differently across operating systems. The first target
case is YouTube extraction on macOS Apple Silicon, where `yt-dlp` can require a
JavaScript runtime to evaluate YouTube player code.

## User Experience

- Normal processing remains unchanged. Users still submit one public video URL
  and see the existing task monitor and result workspace.
- The desktop app writes a local diagnostic log under app-local data
  `logs/frameq-desktop.log`.
- The log is for support and debugging. It is not uploaded to FrameQ servers and
  is not exposed as a normal result artifact.
- Failures should still return structured UI errors. Logs are supplemental
  evidence when the UI error is not enough.

## Boundaries

- Logs may include desktop lifecycle events, worker command kind, exit status,
  app-local/resource paths, task id, structured worker error code, and sanitized
  short error messages.
- Logs must not include LLM API keys, desktop session tokens, cookies, sensitive
  headers, or full volatile YouTube media/CDN URLs.
- YouTube extraction must continue to avoid browser cookies, login automation,
  proxies for bypass, CAPTCHA solving, and account-assisted download.
- The bundled Deno runtime is a local executable dependency only. It must not add
  login, cookie, proxy, or remote code-fetch behavior.

## Acceptance

- A failed worker run leaves a readable app-local log entry with timestamp,
  worker invocation, exit status, and sanitized error summary.
- YouTube `yt-dlp` invocations explicitly enable supported JavaScript runtimes
  so a packaged or installed runtime can be used without asking users to import
  cookies.
- Release packaging bundles Deno as the supported local JS runtime for clean
  macOS Apple Silicon machines.
