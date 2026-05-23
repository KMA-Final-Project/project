from __future__ import annotations

from src.core.asr.base import ASRRouteConfig
from src.core.asr.router import ASRRouter


def _routes() -> dict[str, ASRRouteConfig]:
    return {
        "distil_whisper_en": ASRRouteConfig(
            route_id="distil_whisper_en",
            provider_id="whisper",
            model_id="distil-large-v3.5",
            display_name="Distil",
            worker_modes=frozenset({"auto", "turbo_only"}),
            fallback_route_ids=("whisper_turbo",),
            forced_language="en",
            during_asr_certified=True,
        ),
        "whisper_turbo": ASRRouteConfig(
            route_id="whisper_turbo",
            provider_id="whisper",
            model_id="large-v3-turbo",
            display_name="Turbo",
            worker_modes=frozenset({"auto", "turbo_only"}),
            fallback_route_ids=(),
            during_asr_certified=True,
        ),
        "whisper_full": ASRRouteConfig(
            route_id="whisper_full",
            provider_id="whisper",
            model_id="large-v3",
            display_name="Full",
            worker_modes=frozenset({"auto", "full_only"}),
            fallback_route_ids=("whisper_turbo",),
            during_asr_certified=False,
        ),
        "sensevoice_small": ASRRouteConfig(
            route_id="sensevoice_small",
            provider_id="sensevoice",
            model_id="iic/SenseVoiceSmall",
            display_name="SenseVoice",
            worker_modes=frozenset({"auto", "full_only"}),
            fallback_route_ids=("whisper_full",),
            during_asr_certified=True,
        ),
        "paraformer_zh": ASRRouteConfig(
            route_id="paraformer_zh",
            provider_id="paraformer",
            model_id="paraformer-zh",
            display_name="Paraformer",
            worker_modes=frozenset({"auto", "full_only"}),
            fallback_route_ids=("whisper_full",),
            during_asr_certified=False,
        ),
    }


def test_router_selects_distil_for_english(monkeypatch) -> None:
    monkeypatch.setattr("src.config.settings.AI_ASR_ENABLE_EXPERIMENTAL_ZH_ROUTE", False)
    router = ASRRouter(_routes())

    assert router.route_for_language("en") == "distil_whisper_en"


def test_router_selects_sensevoice_for_chinese_default_route(
    monkeypatch,
) -> None:
    monkeypatch.setattr("src.config.settings.AI_ASR_ENABLE_EXPERIMENTAL_ZH_ROUTE", False)
    router = ASRRouter(_routes())

    assert router.route_for_language("zh") == "sensevoice_small"
    assert router.route_for_language("yue") == "sensevoice_small"


def test_router_respects_paraformer_when_set_as_chinese_default(monkeypatch) -> None:
    monkeypatch.setattr("src.config.settings.AI_ASR_ENABLE_EXPERIMENTAL_ZH_ROUTE", False)
    monkeypatch.setattr("src.config.settings.AI_ASR_DEFAULT_ROUTE_ZH", "paraformer_zh")
    router = ASRRouter(_routes())

    assert router.route_for_language("zh") == "paraformer_zh"
    assert router.route_for_language("yue") == "paraformer_zh"


def test_router_selects_experimental_chinese_route_when_enabled(monkeypatch) -> None:
    monkeypatch.setattr("src.config.settings.AI_ASR_ENABLE_EXPERIMENTAL_ZH_ROUTE", True)
    router = ASRRouter(_routes())

    assert router.route_for_language("zh") == "sensevoice_small"


def test_router_keeps_during_asr_for_certified_english_route(monkeypatch) -> None:
    monkeypatch.setattr("src.config.settings.AI_ASR_ENABLE_EXPERIMENTAL_ZH_ROUTE", False)
    router = ASRRouter(_routes())

    decision = router.decision_for_language("en", requested_policy="during_asr")

    assert decision.route_id == "distil_whisper_en"
    assert decision.effective_policy == "during_asr"
    assert decision.auto_downgraded is False


def test_router_keeps_during_asr_for_certified_chinese_route(monkeypatch) -> None:
    monkeypatch.setattr("src.config.settings.AI_ASR_ENABLE_EXPERIMENTAL_ZH_ROUTE", False)
    monkeypatch.setattr("src.config.settings.AI_ASR_ALLOW_AUTO_POLICY_DOWNGRADE", True)
    router = ASRRouter(_routes())

    decision = router.decision_for_language("zh", requested_policy="during_asr")

    assert decision.route_id == "sensevoice_small"
    assert decision.effective_policy == "during_asr"
    assert decision.auto_downgraded is False
