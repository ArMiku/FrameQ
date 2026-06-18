from __future__ import annotations

import os
import re
from collections.abc import Callable
from dataclasses import dataclass
from os import PathLike
from pathlib import Path
from typing import Any, Protocol

QWEN_ASR_MODEL = "Qwen/Qwen3-ASR-0.6B"
SENSEVOICE_SMALL_MODEL = "iic/SenseVoiceSmall"
DEFAULT_ASR_MODEL = SENSEVOICE_SMALL_MODEL
DEFAULT_MODEL_CACHE_ENV = "FRAMEQ_MODEL_DIR"
MODELSCOPE_CACHE_ENV = "MODELSCOPE_CACHE"
SENSEVOICE_VAD_MODEL = "fsmn-vad"
SENSEVOICE_VAD_MAX_SEGMENT_TIME_MS = 30000
SENSEVOICE_TAG_PATTERN = re.compile(r"<\|[^|>]+?\|>")


class ASRError(RuntimeError):
    code = "ASR_ERROR"


class ASRDependencyError(ASRError):
    code = "ASR_DEPENDENCY_MISSING"


class ASRRuntimeError(ASRError):
    code = "ASR_RUNTIME_ERROR"


class ASREmptyTranscriptError(ASRRuntimeError):
    code = "ASR_EMPTY_TRANSCRIPT"


class ASRUnsupportedModelError(ASRRuntimeError):
    code = "ASR_MODEL_UNSUPPORTED"


@dataclass(frozen=True)
class Transcript:
    text: str
    language: str = "Chinese"


@dataclass(frozen=True)
class TranscriptArtifacts:
    text: str
    txt_path: Path
    md_path: Path


class Transcriber(Protocol):
    def transcribe(self, audio_path: Path, language: str = "Chinese") -> Transcript:
        pass


ModelFactory = Callable[..., Any]


@dataclass(frozen=True)
class AsrModelSpec:
    name: str
    family: str
    display_name: str


SUPPORTED_ASR_MODELS: tuple[AsrModelSpec, ...] = (
    AsrModelSpec(SENSEVOICE_SMALL_MODEL, "sensevoice", "SenseVoice Small"),
    AsrModelSpec(QWEN_ASR_MODEL, "qwen", "Qwen3-ASR-0.6B"),
)


def supported_asr_model_names() -> list[str]:
    return [model.name for model in SUPPORTED_ASR_MODELS]


def resolve_asr_model_name(model_name: str | None) -> str:
    candidate = (model_name or "").strip() or DEFAULT_ASR_MODEL
    if candidate in supported_asr_model_names():
        return candidate
    raise ASRUnsupportedModelError(f"Unsupported ASR model: {candidate}")


def asr_model_display_name(model_name: str) -> str:
    resolved = resolve_asr_model_name(model_name)
    for model in SUPPORTED_ASR_MODELS:
        if model.name == resolved:
            return model.display_name
    return resolved


def asr_model_family(model_name: str) -> str:
    resolved = resolve_asr_model_name(model_name)
    for model in SUPPORTED_ASR_MODELS:
        if model.name == resolved:
            return model.family
    raise ASRUnsupportedModelError(f"Unsupported ASR model: {model_name}")


def resolve_model_cache_dir(
    project_root: Path,
    environ: dict[str, str] | None = None,
) -> Path:
    env = environ if environ is not None else {}
    configured_path = env.get(DEFAULT_MODEL_CACHE_ENV)
    if configured_path:
        return Path(configured_path)
    return project_root / "models"


def build_qwen_asr_transcriber(
    model_name: str = QWEN_ASR_MODEL,
    cache_dir: str | PathLike[str] | Path | None = None,
) -> QwenAsrTranscriber:
    model_kwargs: dict[str, Any] = {}
    if cache_dir is not None:
        resolved_cache_dir = Path(cache_dir)
        resolved_cache_dir.mkdir(parents=True, exist_ok=True)
        model_kwargs["cache_dir"] = resolved_cache_dir.as_posix()

    return QwenAsrTranscriber(model_name=model_name, model_kwargs=model_kwargs)


def build_sensevoice_transcriber(
    model_name: str,
    cache_dir: str | PathLike[str] | Path | None = None,
) -> SenseVoiceTranscriber:
    model_kwargs: dict[str, Any] = {
        "vad_model": SENSEVOICE_VAD_MODEL,
        "vad_kwargs": {"max_single_segment_time": SENSEVOICE_VAD_MAX_SEGMENT_TIME_MS},
    }
    if cache_dir is not None:
        configure_modelscope_cache_dir(cache_dir)

    return SenseVoiceTranscriber(model_name=model_name, model_kwargs=model_kwargs)


def build_asr_transcriber(
    model_name: str = DEFAULT_ASR_MODEL,
    cache_dir: str | PathLike[str] | Path | None = None,
) -> Transcriber:
    resolved_model = resolve_asr_model_name(model_name)
    family = asr_model_family(resolved_model)
    if family == "qwen":
        return build_qwen_asr_transcriber(model_name=resolved_model, cache_dir=cache_dir)
    if family == "sensevoice":
        return build_sensevoice_transcriber(model_name=resolved_model, cache_dir=cache_dir)
    raise ASRUnsupportedModelError(f"Unsupported ASR model: {resolved_model}")


def configure_modelscope_cache_dir(cache_dir: str | PathLike[str] | Path) -> Path:
    resolved_cache_dir = Path(cache_dir)
    resolved_cache_dir.mkdir(parents=True, exist_ok=True)
    os.environ[MODELSCOPE_CACHE_ENV] = resolved_cache_dir.as_posix()
    return resolved_cache_dir


class QwenAsrTranscriber:
    def __init__(
        self,
        model_name: str = QWEN_ASR_MODEL,
        model_factory: ModelFactory | None = None,
        max_inference_batch_size: int = 4,
        max_new_tokens: int = 4096,
        model_kwargs: dict[str, Any] | None = None,
    ) -> None:
        self.model_name = model_name
        self._model_factory = model_factory or self._load_default_model
        self.max_inference_batch_size = max_inference_batch_size
        self.max_new_tokens = max_new_tokens
        self.model_kwargs = model_kwargs or {}
        self._model: Any | None = None

    def transcribe(self, audio_path: Path, language: str = "Chinese") -> Transcript:
        model = self._get_model()
        try:
            results = model.transcribe(audio=audio_path.as_posix(), language=language)
        except Exception as exc:  # noqa: BLE001 - wraps third-party model failures.
            raise ASRRuntimeError(str(exc)) from exc

        text = _extract_text(results)
        if not text.strip():
            raise ASREmptyTranscriptError("ASR returned an empty transcript.")

        return Transcript(text=text.strip(), language=language)

    def _get_model(self) -> Any:
        if self._model is None:
            try:
                self._model = self._model_factory(
                    model_name=self.model_name,
                    max_inference_batch_size=self.max_inference_batch_size,
                    max_new_tokens=self.max_new_tokens,
                    **self.model_kwargs,
                )
            except ModuleNotFoundError as exc:
                raise ASRDependencyError(
                    _missing_dependency_message(exc, runtime_name="Qwen ASR")
                ) from exc
        return self._model

    def _load_default_model(
        self,
        model_name: str,
        max_inference_batch_size: int,
        max_new_tokens: int,
        **model_kwargs: Any,
    ) -> Any:
        from qwen_asr import Qwen3ASRModel

        return Qwen3ASRModel.from_pretrained(
            model_name,
            max_inference_batch_size=max_inference_batch_size,
            max_new_tokens=max_new_tokens,
            **model_kwargs,
        )


class SenseVoiceTranscriber:
    def __init__(
        self,
        model_name: str = SENSEVOICE_SMALL_MODEL,
        model_factory: ModelFactory | None = None,
        model_kwargs: dict[str, Any] | None = None,
    ) -> None:
        self.model_name = model_name
        self._model_factory = model_factory or self._load_default_model
        self.model_kwargs = {
            "vad_model": SENSEVOICE_VAD_MODEL,
            "vad_kwargs": {"max_single_segment_time": SENSEVOICE_VAD_MAX_SEGMENT_TIME_MS},
            **(model_kwargs or {}),
        }
        self._model: Any | None = None

    def transcribe(self, audio_path: Path, language: str = "Chinese") -> Transcript:
        model = self._get_model()
        try:
            results = model.generate(
                input=audio_path.as_posix(),
                language=_sensevoice_language(language),
                use_itn=True,
                batch_size_s=60,
                merge_vad=True,
                merge_length_s=15,
                cache={},
            )
        except Exception as exc:  # noqa: BLE001 - wraps third-party model failures.
            raise ASRRuntimeError(str(exc)) from exc

        text = _clean_sensevoice_text(_extract_text(results))
        if not text.strip():
            raise ASREmptyTranscriptError("ASR returned an empty transcript.")

        return Transcript(text=text.strip(), language=language)

    def _get_model(self) -> Any:
        if self._model is None:
            try:
                self._model = self._model_factory(
                    model=self.model_name,
                    trust_remote_code=True,
                    **self.model_kwargs,
                )
            except ModuleNotFoundError as exc:
                raise ASRDependencyError(
                    _missing_dependency_message(exc, runtime_name="SenseVoice ASR")
                ) from exc
        return self._model

    def _load_default_model(
        self,
        model: str,
        trust_remote_code: bool,
        **model_kwargs: Any,
    ) -> Any:
        from funasr import AutoModel

        return AutoModel(model=model, trust_remote_code=trust_remote_code, **model_kwargs)


def transcribe_and_write(
    audio_path: Path,
    output_dir: Path,
    output_stem: str,
    transcriber: Transcriber,
    language: str = "Chinese",
    model: str = DEFAULT_ASR_MODEL,
    source_url: str | None = None,
) -> TranscriptArtifacts:
    transcript = transcriber.transcribe(audio_path, language=language)
    return write_transcript_files(
        text=transcript.text,
        output_dir=output_dir,
        output_stem=output_stem,
        model=model,
        source_url=source_url,
    )


def write_transcript_files(
    text: str,
    output_dir: Path,
    output_stem: str,
    model: str,
    source_url: str | None = None,
) -> TranscriptArtifacts:
    cleaned_text = text.strip()
    if not cleaned_text:
        raise ASREmptyTranscriptError("ASR returned an empty transcript.")

    output_dir.mkdir(parents=True, exist_ok=True)
    txt_path = output_dir / f"{output_stem}_transcript.txt"
    md_path = output_dir / f"{output_stem}_transcript.md"

    txt_path.write_text(f"{cleaned_text}\n", encoding="utf-8")
    md_path.write_text(
        _format_transcript_markdown(
            text=cleaned_text,
            model=model,
            source_url=source_url,
        ),
        encoding="utf-8",
    )

    return TranscriptArtifacts(text=cleaned_text, txt_path=txt_path, md_path=md_path)


def _extract_text(results: object) -> str:
    if isinstance(results, list) and results:
        first = results[0]
        if isinstance(first, dict):
            return str(first.get("text", ""))
        return str(getattr(first, "text", ""))
    if isinstance(results, dict):
        return str(results.get("text", ""))
    return str(getattr(results, "text", ""))


def _sensevoice_language(language: str) -> str:
    normalized = language.strip().lower()
    if normalized in {"chinese", "zh", "zh-cn", "mandarin"}:
        return "zh"
    if normalized in {"english", "en"}:
        return "en"
    return "auto"


def _clean_sensevoice_text(text: str) -> str:
    return SENSEVOICE_TAG_PATTERN.sub("", text).strip()


def _missing_dependency_message(exc: ModuleNotFoundError, runtime_name: str) -> str:
    missing_name = exc.name or str(exc).removeprefix("No module named ").strip("'\"")
    return (
        f"Missing ASR runtime dependency: {missing_name}. "
        f"Install project dependencies with `uv sync` before running {runtime_name}."
    )


def _format_transcript_markdown(text: str, model: str, source_url: str | None) -> str:
    source_line = f"\n- Source: {source_url}" if source_url else ""
    return f"""# 视频文字稿

## Metadata

- Model: {model}{source_line}

## Transcript

{text}
"""
