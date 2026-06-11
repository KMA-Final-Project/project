from __future__ import annotations

import json

from src.config import settings
from src.core.llm_provider import LLMProvider


def test_translation_finalization_provider_prefers_finalization_setting(
    monkeypatch,
) -> None:
    monkeypatch.setattr(
        settings, "DEFAULT_LLM_PROVIDER_FOR_TRANSLATION_FINALIZATION", "gemini"
    )
    monkeypatch.setattr(settings, "AI_LLM_FINALIZATION_PROVIDER", "openai")

    assert settings.llm_provider_for("translation_finalization") == "openai"


def test_finalize_translation_window_parses_json_response(monkeypatch) -> None:
    provider = object.__new__(LLMProvider)

    def _fake_generate_with_provider(*args, **kwargs):
        return (
            json.dumps(
                {
                    "segments": [
                        {"segment_index": 3, "translation": "Xin chao"},
                        {"segment_index": 4, "translation": "Toi la Li Lei"},
                    ]
                }
            ),
            {
                "model": "gpt-4.1-mini",
                "prompt_tokens": 120,
                "completion_tokens": 32,
                "total_tokens": 152,
            },
        )

    monkeypatch.setattr(provider, "_generate_with_provider", _fake_generate_with_provider)

    result = provider.finalize_translation_window(
        source_language="zh",
        target_lang="vi",
        core_segments=[
            {"segment_index": 3, "text": "你好", "translation": "NMT-1"},
            {"segment_index": 4, "text": "我是李雷", "translation": "NMT-2"},
        ],
        halo_before_segments=[],
        halo_after_segments=[],
        include_nmt_draft=True,
    )

    assert result is not None
    assert result.payload == {
        "segments": [
            {"segment_index": 3, "translation": "Xin chao"},
            {"segment_index": 4, "translation": "Toi la Li Lei"},
        ]
    }
    assert result.model == "gpt-4.1-mini"
    assert result.prompt_tokens == 120
    assert result.completion_tokens == 32
    assert result.total_tokens == 152
