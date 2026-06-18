# SenseVoice Long Audio VAD Plan

## Goal

Improve SenseVoice Small transcription quality for long local audio by using FunASR's VAD-assisted long-audio settings and removing SenseVoice control tags from user-facing transcripts.

## Context

- `work/7624469060838853914.wav` is valid 16 kHz mono PCM audio and is about 425 seconds long.
- The previous SenseVoice adapter called `generate()` on the full WAV without VAD/merge parameters.
- The resulting transcript was very short for the audio duration and exposed tags such as `<|zh|><|HAPPY|><|BGM|><|withitn|>`.

## Implementation

- [x] Add regression coverage for SenseVoice VAD model initialization, long-audio generate parameters, and tag cleanup.
- [x] Enable `vad_model="fsmn-vad"` and `vad_kwargs={"max_single_segment_time": 30000}` by default for SenseVoice.
- [x] Pass `batch_size_s=60`, `merge_vad=True`, `merge_length_s=15`, and `cache={}` to SenseVoice `generate()`.
- [x] Strip SenseVoice `<|...|>` control tags before transcript validation and file output.

## Validation

- `uv run pytest worker\tests`: 55 passed.
- `uv run ruff check worker`: passed.
