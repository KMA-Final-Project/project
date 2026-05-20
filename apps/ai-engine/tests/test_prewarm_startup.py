from __future__ import annotations

import src.main as main_mod
import src.core.smart_aligner as smart_aligner_mod
from src.core.audio_inspector import AudioInspector
from src.core.smart_aligner import SmartAligner


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
    monkeypatch.setattr(
        "transformers.pipelines.pipeline",
        _fake_pipeline,
    )

    AudioInspector.prewarm()

    first = AudioInspector()._get_classifier()
    second = AudioInspector()._get_classifier()

    assert isinstance(first, FakePipeline)
    assert first is second


def test_prewarm_heavy_components_loads_selected_components(monkeypatch) -> None:
    calls: list[str] = []

    monkeypatch.setattr(main_mod.settings, "AI_TRANSLATION_START_POLICY", "after_asr")
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

    assert calls == ["aligner", "inspector", "vad"]


def test_smart_aligner_is_lazy_until_route_is_requested(monkeypatch) -> None:
    previous_instance = SmartAligner._instance
    previous_initialized = SmartAligner._initialized
    previous_turbo = SmartAligner._model_turbo
    previous_full = SmartAligner._model_full
    previous_batched_turbo = SmartAligner._batched_turbo
    previous_batched_full = SmartAligner._batched_full

    class FakeCt2Model:
        def __init__(self) -> None:
            self.model_is_loaded = True
            self.events: list[tuple[str, bool]] = []

        def load_model(self, keep_cache: bool = False) -> None:
            self.model_is_loaded = True
            self.events.append(("load_model", keep_cache))

        def unload_model(self, to_cpu: bool = False) -> None:
            self.model_is_loaded = False
            self.events.append(("unload_model", to_cpu))

    class FakeWhisperModel:
        def __init__(self, label: str) -> None:
            self.label = label
            self.model = FakeCt2Model()

    class FakeBatchedInferencePipeline:
        def __init__(self, model) -> None:
            self.model = model

    loads: list[str] = []

    try:
        SmartAligner._instance = None
        SmartAligner._initialized = False
        SmartAligner._model_turbo = None
        SmartAligner._model_full = None
        SmartAligner._batched_turbo = None
        SmartAligner._batched_full = None

        monkeypatch.setattr(
            smart_aligner_mod,
            "BatchedInferencePipeline",
            FakeBatchedInferencePipeline,
        )
        monkeypatch.setattr(
            SmartAligner,
            "_load_model",
            staticmethod(
                lambda model_name, compute_type, label: (
                    loads.append(label),
                    FakeWhisperModel(label),
                )[1]
            ),
        )

        aligner = SmartAligner()

        assert loads == []

        resolved = aligner.ensure_route_loaded("turbo")

        assert resolved == "turbo"
        assert loads == ["turbo"]
        assert aligner._model_turbo is not None
        assert aligner._batched_turbo is not None

        aligner.unload_route("turbo")

        assert aligner._model_turbo is not None
        assert aligner._model_turbo.model.model_is_loaded is False

        aligner.ensure_route_loaded("turbo")

        assert loads == ["turbo"]
        assert ("load_model", True) in aligner._model_turbo.model.events
    finally:
        SmartAligner._instance = previous_instance
        SmartAligner._initialized = previous_initialized
        SmartAligner._model_turbo = previous_turbo
        SmartAligner._model_full = previous_full
        SmartAligner._batched_turbo = previous_batched_turbo
        SmartAligner._batched_full = previous_batched_full
