from __future__ import annotations

import src.main as main_mod
import src.core.smart_aligner as smart_aligner_mod
import src.core.asr.providers.whisper_provider as whisper_provider_mod
from src.core.audio_inspector import AudioInspector
from src.core.smart_aligner import SmartAligner


def test_audio_inspector_prewarm_loads_shared_classifier(monkeypatch) -> None:
    class FakePipeline:
        pass

    AudioInspector._shared_classifier = None
    AudioInspector._classifier_unavailable = False

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


def test_audio_inspector_disabled_skips_prewarm(monkeypatch) -> None:
    calls: list[str] = []

    AudioInspector._shared_classifier = None
    AudioInspector._classifier_unavailable = False

    monkeypatch.setattr("src.config.settings.AI_AUDIO_INSPECTOR_ENABLED", False)
    monkeypatch.setattr(
        "transformers.pipeline",
        lambda *args, **kwargs: calls.append("pipeline"),
    )
    monkeypatch.setattr(
        "transformers.pipelines.pipeline",
        lambda *args, **kwargs: calls.append("pipeline"),
    )

    AudioInspector.prewarm()

    assert calls == []


def test_audio_inspector_fails_open_after_loader_error(monkeypatch, tmp_path) -> None:
    attempts: list[str] = []

    AudioInspector._shared_classifier = None
    AudioInspector._classifier_unavailable = False

    def _broken_pipeline(*args, **kwargs):
        attempts.append("pipeline")
        raise RuntimeError("network unavailable")

    monkeypatch.setattr(
        "transformers.pipeline",
        _broken_pipeline,
    )
    monkeypatch.setattr(
        "transformers.pipelines.pipeline",
        _broken_pipeline,
    )

    sample = tmp_path / "sample.wav"
    sample.write_bytes(b"not-a-real-wav")

    inspector = AudioInspector()
    assert inspector.inspect(sample) == "standard"
    assert inspector.inspect(sample) == "standard"
    assert attempts == ["pipeline"]


def test_prewarm_heavy_components_loads_selected_components(monkeypatch) -> None:
    calls: list[str] = []

    class FakeAligner:
        def __init__(self) -> None:
            calls.append("aligner")

        def prewarm_route_ids(self) -> tuple[str, ...]:
            return ()

        def ensure_route_loaded(self, route: str) -> str:
            calls.append(f"route:{route}")
            return route

    monkeypatch.setattr(main_mod, "SmartAligner", FakeAligner)
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

        monkeypatch.setattr(
            whisper_provider_mod,
            "BatchedInferencePipeline",
            FakeBatchedInferencePipeline,
        )
        monkeypatch.setattr(
            whisper_provider_mod,
            "WhisperModel",
            lambda model_name, device, compute_type: (
                loads.append(model_name),
                FakeWhisperModel(model_name),
            )[1],
        )

        aligner = SmartAligner()

        assert loads == []

        resolved = aligner.ensure_route_loaded("turbo")

        assert resolved == "whisper_turbo"
        assert loads == [smart_aligner_mod.settings.WHISPER_MODEL_TURBO]
        provider = aligner._providers["whisper_turbo"]
        assert provider._model is not None
        assert provider._batched is not None

        aligner.unload_route("turbo")

        assert provider._model is not None
        assert provider._model.model.model_is_loaded is False

        aligner.ensure_route_loaded("turbo")

        assert loads == [smart_aligner_mod.settings.WHISPER_MODEL_TURBO]
        assert ("load_model", True) in provider._model.model.events
    finally:
        SmartAligner._instance = previous_instance
        SmartAligner._initialized = previous_initialized
