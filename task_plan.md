# Task Plan

## Goal

Complete the Bilibili ordinary public-video fallback described by the active ExecPlan, keeping the existing single-input transcription workflow and safety boundary.

## Steps

1. [x] Read the governing docs, active ExecPlan, and current Bilibili scope.
2. [x] Inspect EasyDownload Bilibili reference code and current FrameQ worker/frontend implementation.
3. [x] Add focused failing tests for Bilibili input, parsing, APIs, DASH selection, download/merge, pipeline integration, and UI errors.
4. [x] Implement the worker, frontend, bundled resource, and documentation changes needed for those tests.
5. [x] Run validation gates and archive the Bilibili ExecPlan when complete.
