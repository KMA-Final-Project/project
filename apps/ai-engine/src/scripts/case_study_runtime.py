from __future__ import annotations

from dataclasses import dataclass

from src.config import settings

_CJK_LANG_HINTS = {"zh", "ja", "ko"}
_VALID_WORKER_MODEL_MODES = {"auto", "turbo_only", "full_only"}


@dataclass(frozen=True)
class CaseStudyRuntimeConfig:
    source_lang_hint: str
    worker_model_mode: str
    merge_provider: str
    remote_fallback_enabled: bool


def _normalize_source_lang_hint(source_lang_hint: str) -> str:
    normalized = source_lang_hint.strip().lower()
    return normalized or "en"


def _resolve_worker_model_mode(
    source_lang_hint: str,
    worker_model_mode: str | None,
) -> str:
    if worker_model_mode is not None:
        normalized = worker_model_mode.strip().lower()
        if normalized not in _VALID_WORKER_MODEL_MODES:
            raise ValueError(
                "worker_model_mode must be one of auto, turbo_only, full_only"
            )
        return normalized

    if source_lang_hint in _CJK_LANG_HINTS:
        return "full_only"
    return "turbo_only"


def apply_case_study_runtime(
    *,
    source_lang_hint: str = "en",
    worker_model_mode: str | None = None,
) -> CaseStudyRuntimeConfig:
    normalized_hint = _normalize_source_lang_hint(source_lang_hint)
    resolved_mode = _resolve_worker_model_mode(normalized_hint, worker_model_mode)

    settings.WORKER_MODEL_MODE = resolved_mode
    settings.DEFAULT_LLM_PROVIDER_FOR_MERGER = "ollama"
    settings.LLM_REMOTE_TO_OLLAMA_FALLBACK = False

    return CaseStudyRuntimeConfig(
        source_lang_hint=normalized_hint,
        worker_model_mode=resolved_mode,
        merge_provider=settings.DEFAULT_LLM_PROVIDER_FOR_MERGER,
        remote_fallback_enabled=settings.LLM_REMOTE_TO_OLLAMA_FALLBACK,
    )
