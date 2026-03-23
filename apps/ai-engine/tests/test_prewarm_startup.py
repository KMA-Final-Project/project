from __future__ import annotations

import src.main as main_mod
from src.core.audio_inspector import AudioInspector


def test_audio_inspector_prewarm_loads_shared_classifier(monkeypatch) -> None:
    class FakePipeline:
        pass

    AudioInspector._shared_classifier = None

    def _fake_pipeline(*args, **kwargs):
        return FakePipeline()

    monkeypatch.setattr(
        "transformers.pipeline",
        _fake_pipeline,
    )

    AudioInspector.prewarm()

    first = AudioInspector()._get_classifier()
    second = AudioInspector()._get_classifier()

    assert isinstance(first, FakePipeline)
    assert first is second


def test_prewarm_heavy_components_loads_selected_components(monkeypatch) -> None:
    calls: list[str] = []

    monkeypatch.setattr(main_mod, "SmartAligner", lambda: calls.append("aligner"))
    monkeypatch.setattr(
        main_mod,
        "AudioInspector",
        type(
            "FakeAudioInspector",
            (),
            {"prewarm": staticmethod(lambda: calls.append("inspector"))},
        ),
    )
    monkeypatch.setattr(
        main_mod,
        "NMTTranslator",
        type(
            "FakeNMT", (), {"get_instance": staticmethod(lambda: calls.append("nmt"))}
        ),
    )
    monkeypatch.setattr(main_mod, "VADManager", lambda: calls.append("vad"))

    main_mod.prewarm_heavy_components()

    assert calls == ["aligner", "inspector", "nmt", "vad"]
