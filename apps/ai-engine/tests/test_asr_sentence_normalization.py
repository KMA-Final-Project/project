from __future__ import annotations

from src.core.asr.phonetics import add_phonetic_annotations
from src.core.asr.base import ASRRouteConfig
from src.core.asr.providers.paraformer_provider import ParaformerZhASRProvider
from src.core.asr.providers.sensevoice_provider import SenseVoiceASRProvider
from src.schemas import SegmentType, Sentence, VADSegment, Word


def _segment() -> VADSegment:
    return VADSegment(start=2.0, end=3.0, type=SegmentType.HAPPY_CASE, duration=1.0)


def test_sensevoice_timestamp_normalization_uses_supplied_timestamps() -> None:
    provider = SenseVoiceASRProvider(
        ASRRouteConfig(
            route_id="sensevoice_small",
            provider_id="sensevoice",
            model_id="iic/SenseVoiceSmall",
            display_name="SenseVoice",
            worker_modes=frozenset({"auto"}),
        )
    )

    words = provider._words_from_timestamps(
        text="你好",
        segment=_segment(),
        timestamps=[[0, 250], [250, 500]],
    )

    assert [word.word for word in words] == ["你", "好"]
    assert words[0].start == 2.0
    assert words[-1].end == 2.5


def test_sensevoice_timestamp_normalization_falls_back_to_equal_split() -> None:
    provider = SenseVoiceASRProvider(
        ASRRouteConfig(
            route_id="sensevoice_small",
            provider_id="sensevoice",
            model_id="iic/SenseVoiceSmall",
            display_name="SenseVoice",
            worker_modes=frozenset({"auto"}),
        )
    )

    words = provider._words_from_timestamps(
        text="世界",
        segment=_segment(),
        timestamps=[[0, 500]],
    )

    assert [word.word for word in words] == ["世", "界"]
    assert words[0].start == 2.0
    assert words[1].end == 3.0


def test_paraformer_timestamp_normalization_falls_back_to_equal_split() -> None:
    provider = ParaformerZhASRProvider(
        ASRRouteConfig(
            route_id="paraformer_zh",
            provider_id="paraformer",
            model_id="paraformer-zh",
            display_name="Paraformer",
            worker_modes=frozenset({"auto"}),
        )
    )

    words = provider._words_from_timestamps("你好啊", _segment(), None)

    assert [word.word for word in words] == ["你", "好", "啊"]
    assert words[0].start == 2.0
    assert words[-1].end == 3.0


def test_add_phonetic_annotations_fills_chinese_words_and_sentence() -> None:
    sentence = Sentence(
        text="你好",
        start=0.0,
        end=0.4,
        words=[
            Word(word="你", start=0.0, end=0.2, confidence=0.9),
            Word(word="好", start=0.2, end=0.4, confidence=0.9),
        ],
        detected_lang="zh",
    )

    add_phonetic_annotations([sentence], "zh")

    assert sentence.words[0].phoneme
    assert sentence.words[1].phoneme
    assert sentence.phonetic


def test_sensevoice_sanitizes_emojis_and_control_tokens() -> None:
    provider = SenseVoiceASRProvider(
        ASRRouteConfig(
            route_id="sensevoice_small",
            provider_id="sensevoice",
            model_id="iic/SenseVoiceSmall",
            display_name="SenseVoice",
            worker_modes=frozenset({"auto"}),
        )
    )

    cleaned = provider._sanitize_text("<|HAPPY|> 你好呀 😊 ♪")

    assert cleaned == "你好呀"
