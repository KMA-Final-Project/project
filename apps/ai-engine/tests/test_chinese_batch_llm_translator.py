from __future__ import annotations

import asyncio
import json
import time
from pathlib import Path
from types import SimpleNamespace
from typing import Any

import src.async_pipeline as async_mod
from src.core.chinese_batch_llm_translator import ChineseBatchLLMTranslator
from src.schemas import SegmentType, Sentence, VADSegment, Word
from tests.test_first_batch_streaming import (
    FakeAudioInspector,
    FakeAudioProcessor,
    FakeMerger,
    FakeVADManager,
)


def _noop(*args: Any, **kwargs: Any) -> None:
    return None


def _hint_count(text: str) -> int:
    return text.count("[split_hint]")


def _sentence(text: str, start: float, end: float, words: list[str]) -> Sentence:
    step = (end - start) / max(len(words), 1)
    sentence_words: list[Word] = []
    cursor = start
    for word in words:
        sentence_words.append(
            Word(word=word, start=cursor, end=cursor + step, confidence=0.95)
        )
        cursor += step
    return Sentence(
        text=text,
        start=start,
        end=end,
        detected_lang="zh",
        words=sentence_words,
    )


class _StubLLM:
    def __init__(self, response_payload: dict[str, Any] | None = None, *, error: Exception | None = None) -> None:
        self.response_payload = response_payload or {"segments": []}
        self.error = error
        self.calls: list[dict[str, Any]] = []

    def generate_ollama_structured(self, prompt: str, system_prompt: str, response_schema: dict[str, Any], **kwargs: Any) -> tuple[str, dict[str, Any]]:
        self.calls.append(
            {
                "prompt": prompt,
                "system_prompt": system_prompt,
                "response_schema": response_schema,
                "kwargs": kwargs,
            }
        )
        if self.error is not None:
            raise self.error
        return json.dumps(self.response_payload, ensure_ascii=False), {
            "model": kwargs["model_name"],
            "eval_count": 128,
        }


class _PromptAwareChineseRescueLLM(_StubLLM):
    def __init__(self) -> None:
        super().__init__({"segments": []})

    def generate_ollama_structured(
        self,
        prompt: str,
        system_prompt: str,
        response_schema: dict[str, Any],
        **kwargs: Any,
    ) -> tuple[str, dict[str, Any]]:
        self.calls.append(
            {
                "prompt": prompt,
                "system_prompt": system_prompt,
                "response_schema": response_schema,
                "kwargs": kwargs,
            }
        )
        target_segments = json.loads(prompt)["target_segments"]
        converted: list[dict[str, Any]] = []
        for item in target_segments:
            raw_text = item["raw_text"]
            if raw_text == "第一次相亲Firstblinddate":
                punctuated_source = "第一次相亲。 First blind date."
                translation = "Cuộc xem mắt đầu tiên."
            elif raw_text == "你好":
                punctuated_source = "你好。"
                translation = "Xin chào."
            elif raw_text == "请问你是王静吗":
                punctuated_source = "请问你是王静吗？"
                translation = "Xin hỏi bạn có phải là Vương Tĩnh không?"
            elif raw_text == "你好我是你是李雷吧？":
                punctuated_source = "你好，我是。你是李雷吧？"
                translation = "Xin chào, tôi đây. Bạn là Lý Lôi phải không?"
            else:
                punctuated_source = raw_text
                translation = f"vi:{raw_text}"
            converted.append(
                {
                    "id": item["id"],
                    "punctuated_source": punctuated_source,
                    "translation": translation,
                }
            )
        return json.dumps({"segments": converted}, ensure_ascii=False), {
            "model": kwargs["model_name"],
            "eval_count": 128,
        }


def test_assess_batch_triggers_on_punctuationless_dialogue() -> None:
    translator = ChineseBatchLLMTranslator(_StubLLM())
    batch = [
        _sentence("请问你是王静吗我们今天第一次见面", 0.0, 2.6, ["请", "问", "你", "是", "王", "静", "吗", "我", "们", "今", "天", "第", "一", "次", "见", "面"]),
        _sentence("你好我是李雷吧刚刚路上有一点堵车", 2.7, 5.8, ["你", "好", "我", "是", "李", "雷", "吧", "刚", "刚", "路", "上", "有", "一", "点", "堵", "车"]),
        _sentence("对是我第一次见面幸会希望今天聊天轻松一点", 5.9, 9.6, ["对", "是", "我", "第", "一", "次", "见", "面", "幸", "会", "希", "望", "今", "天", "聊", "天", "轻", "松", "一", "点"]),
    ]

    risk = translator.assess_batch(batch)

    assert risk.triggered is True
    assert "terminal_punctuation_missing_run" in risk.reasons
    assert "low_punctuation_density" in risk.reasons


def test_assess_batch_skips_well_punctuated_glossary_batch_without_dialogue() -> None:
    translator = ChineseBatchLLMTranslator(_StubLLM())
    batch = [
        _sentence("第一次相亲。 First blind date.", 0.0, 3.0, ["第", "一", "次", "相", "亲", "First", "blind", "date"]),
        _sentence("他们是通过相亲认识的。They met through a blind date.", 3.1, 6.5, ["他们", "是", "通过", "相亲", "认识的", "They", "met", "through", "a", "blind", "date"]),
        _sentence("幸会。 Nice to meet you for the first time.", 6.6, 8.8, ["幸", "会", "Nice", "to", "meet", "you"]),
    ]

    risk = translator.assess_batch(batch)

    assert risk.triggered is False
    assert risk.punctuation_density > 0.015


def test_assess_batch_triggers_on_mixed_script_dialogue_bridge() -> None:
    translator = ChineseBatchLLMTranslator(_StubLLM())
    target = [
        _sentence("第一次相亲。 First blind date.", 0.0, 3.0, ["第", "一", "次", "相", "亲", "First", "blind", "date"]),
        _sentence("你好。", 3.1, 4.1, ["你", "好"]),
        _sentence("请问你是王静吗？", 4.2, 6.6, ["请", "问", "你", "是", "王", "静", "吗"]),
        _sentence("你好，我是李雷吧。", 6.7, 9.5, ["你", "好", "我", "是", "李", "雷", "吧"]),
    ]

    risk = translator.assess_batch(target)

    assert risk.triggered is True
    assert "mixed_script_dialogue_bridge" in risk.reasons


def test_assess_batch_adds_structural_jamming_risk_for_hard_radar_matches() -> None:
    translator = ChineseBatchLLMTranslator(_StubLLM())
    batch = [_sentence("你好请问你是王静吗", 0.0, 2.4, ["你", "好", "请", "问", "你", "是", "王", "静", "吗"])]

    risk = translator.assess_batch(
        batch,
        source_lang="zh",
        actual_route="sensevoice_small",
    )
    target_segments = translator._build_prompt_target_segments(
        batch,
        source_lang="zh",
        actual_route="sensevoice_small",
    )

    assert risk.triggered is True
    assert "structural_jamming_risk" in risk.reasons
    assert "greeting_to_inquiry" in risk.reasons
    assert target_segments[0].text_with_hints == "你好[split_hint]请问你是王静吗"
    assert "structural_jamming_risk" in target_segments[0].radar_flags


def test_soft_risk_only_radar_marks_batch_without_injecting_hint() -> None:
    translator = ChineseBatchLLMTranslator(_StubLLM())
    batch = [_sentence("你好我是李雷", 0.0, 1.8, ["你", "好", "我", "是", "李", "雷"])]

    risk = translator.assess_batch(
        batch,
        source_lang="zh",
        actual_route="sensevoice_small",
    )
    target_segments = translator._build_prompt_target_segments(
        batch,
        source_lang="zh",
        actual_route="sensevoice_small",
    )

    assert risk.triggered is True
    assert "structural_jamming_risk" in risk.reasons
    assert "greeting_to_intro_soft" in risk.reasons
    assert target_segments[0].text_with_hints == "你好我是李雷"
    assert _hint_count(target_segments[0].text_with_hints) == 0


def test_negative_guard_examples_do_not_inject_radar_hints() -> None:
    translator = ChineseBatchLLMTranslator(_StubLLM())
    samples = [
        "是不是你先到的",
        "就是你先到的",
        "但是你先到的",
        "他们是通过相亲认识的",
    ]

    target_segments = translator._build_prompt_target_segments(
        [_sentence(text, float(index), float(index + 1), list(text)) for index, text in enumerate(samples)],
        source_lang="zh",
        actual_route="sensevoice_small",
    )

    assert [segment.text_with_hints for segment in target_segments] == samples
    assert all(not segment.radar_flags for segment in target_segments)


def test_radar_hint_caps_limit_per_segment_and_per_batch() -> None:
    translator = ChineseBatchLLMTranslator(_StubLLM())
    batch = [
        _sentence(
            "你好请问你是王静吗我是李雷",
            0.0,
            2.5,
            ["你", "好", "请", "问", "你", "是", "王", "静", "吗", "我", "是", "李", "雷"],
        ),
        _sentence(
            "幸会幸会等很久了吗你好请问",
            2.6,
            5.1,
            ["幸", "会", "幸", "会", "等", "很", "久", "了", "吗", "你", "好", "请", "问"],
        ),
    ]

    target_segments = translator._build_prompt_target_segments(
        batch,
        source_lang="zh",
        actual_route="sensevoice_small",
    )

    assert _hint_count(target_segments[0].text_with_hints) == 2
    assert _hint_count(target_segments[1].text_with_hints) == 1
    assert sum(_hint_count(segment.text_with_hints) for segment in target_segments) == 3


def test_mixed_script_opener_case_stays_unhinted_by_radar() -> None:
    translator = ChineseBatchLLMTranslator(_StubLLM())
    batch = [
        _sentence(
            "第一次相亲first blind date你好",
            0.0,
            2.6,
            ["第", "一", "次", "相", "亲", "first", "blind", "date", "你", "好"],
        )
    ]

    target_segments = translator._build_prompt_target_segments(
        batch,
        source_lang="zh",
        actual_route="sensevoice_small",
    )
    risk = translator.assess_batch(
        batch,
        source_lang="zh",
        actual_route="sensevoice_small",
    )

    assert target_segments[0].text_with_hints == "第一次相亲first blind date你好"
    assert not target_segments[0].radar_flags
    assert "structural_jamming_risk" not in risk.reasons


def test_hard_radar_windows_are_split_around_flagged_runs() -> None:
    translator = ChineseBatchLLMTranslator(_StubLLM())
    batch = [
        _sentence("第一次相亲。 First blind date.", 0.0, 3.0, ["第", "一", "次", "相", "亲", "First", "blind", "date"]),
        _sentence("你好", 3.1, 4.1, ["你", "好"]),
        _sentence("请问你是王静吗", 4.2, 6.6, ["请", "问", "你", "是", "王", "静", "吗"]),
        _sentence("你好我是你是李雷吧", 6.7, 9.5, ["你", "好", "我", "是", "你", "是", "李", "雷", "吧"]),
        _sentence("没有，我也是刚到。", 9.6, 12.4, ["没", "有", "我", "也", "是", "刚", "到"]),
    ]

    windows = translator._target_windows_for_translation(
        batch,
        source_lang="zh",
        actual_route="sensevoice_small",
    )

    assert windows == [(0, 2), (2, 4), (4, 5)]


def test_translate_batch_accepts_punctuation_only_changes_and_preserves_words() -> None:
    original = [
        _sentence(
            "请问你是王静吗我们今天第一次见面",
            0.0,
            2.6,
            ["请", "问", "你", "是", "王", "静", "吗", "我", "们", "今", "天", "第", "一", "次", "见", "面"],
        ),
        _sentence(
            "你好我是李雷吧刚刚路上有一点堵车",
            2.7,
            5.8,
            ["你", "好", "我", "是", "李", "雷", "吧", "刚", "刚", "路", "上", "有", "一", "点", "堵", "车"],
        ),
        _sentence(
            "对是我第一次见面幸会希望今天聊天轻松一点",
            5.9,
            9.6,
            ["对", "是", "我", "第", "一", "次", "见", "面", "幸", "会", "希", "望", "今", "天", "聊", "天", "轻", "松", "一", "点"],
        ),
    ]
    words_before = [word.model_dump() for word in original[0].words]
    llm = _StubLLM(
        {
            "segments": [
                {
                    "id": 0,
                    "punctuated_source": "请问你是王静吗？我们今天第一次见面。",
                    "translation": "Xin hỏi bạn có phải là Vương Tĩnh không? Hôm nay là lần đầu chúng ta gặp nhau.",
                },
                {
                    "id": 1,
                    "punctuated_source": "你好，我是李雷吧，刚刚路上有一点堵车。",
                    "translation": "Xin chào, tôi là Lý Lôi đây, vừa rồi trên đường hơi kẹt xe.",
                },
                {
                    "id": 2,
                    "punctuated_source": "对，是我。第一次见面，幸会，希望今天聊天轻松一点。",
                    "translation": "Đúng, là tôi. Lần đầu gặp mặt, hân hạnh, mong hôm nay nói chuyện thoải mái hơn.",
                },
            ]
        }
    )
    translator = ChineseBatchLLMTranslator(llm)

    result = translator.translate_batch(
        original,
        target_lang="vi",
        fallback_translate=lambda texts: [f"fallback:{text}" for text in texts],
        source_lang="zh",
        actual_route="sensevoice_small",
    )

    assert result.sub_batches[0].strategy_used == "llm_rescue"
    assert result.sentences[0].text == "请问你是王静吗？我们今天第一次见面。"
    assert result.sentences[0].translation == "Xin hỏi bạn có phải là Vương Tĩnh không? Hôm nay là lần đầu chúng ta gặp nhau."
    assert [word.model_dump() for word in result.sentences[0].words] == words_before


def test_translate_batch_salvages_valid_segments_and_falls_back_only_invalid_ones() -> None:
    sentence_a = _sentence("请问你是王静吗我们今天第一次见面", 0.0, 2.6, ["请", "问", "你", "是", "王", "静", "吗", "我", "们", "今", "天", "第", "一", "次", "见", "面"])
    sentence_b = _sentence("你好我是李雷吧刚刚路上有一点堵车", 2.7, 5.8, ["你", "好", "我", "是", "李", "雷", "吧", "刚", "刚", "路", "上", "有", "一", "点", "堵", "车"])
    sentence_c = _sentence("对是我第一次见面幸会希望今天聊天轻松一点", 5.9, 9.6, ["对", "是", "我", "第", "一", "次", "见", "面", "幸", "会", "希", "望", "今", "天", "聊", "天", "轻", "松", "一", "点"])
    llm = _StubLLM(
        {
            "segments": [
                {
                    "id": 0,
                    "punctuated_source": "请问你是王靖吗？我们今天第一次见面。",
                    "translation": "bad",
                },
                {
                    "id": 1,
                    "punctuated_source": "你好，我是李雷吧，刚刚路上有一点堵车。",
                    "translation": "good",
                },
                {
                    "id": 2,
                    "punctuated_source": "对，是我。第一次见面，幸会，希望今天聊天轻松一点。",
                    "translation": "good too",
                },
            ]
        }
    )
    translator = ChineseBatchLLMTranslator(llm)

    result = translator.translate_batch(
        [sentence_a, sentence_b, sentence_c],
        target_lang="vi",
        fallback_translate=lambda texts: [f"fallback:{text}" for text in texts],
        source_lang="zh",
        actual_route="sensevoice_small",
    )

    assert result.sub_batches[0].strategy_used == "llm_rescue_partial"
    assert result.sub_batches[0].validation.reason_code == "partial_segment_invalid"
    assert [sentence.text for sentence in result.sentences] == [
        "请问你是王静吗我们今天第一次见面",
        "你好，我是李雷吧，刚刚路上有一点堵车。",
        "对，是我。第一次见面，幸会，希望今天聊天轻松一点。",
    ]
    assert [sentence.translation for sentence in result.sentences] == [
        "fallback:请问你是王静吗我们今天第一次见面",
        "good",
        "good too",
    ]


def test_validate_llm_output_rejects_hint_leak_in_punctuated_source() -> None:
    translator = ChineseBatchLLMTranslator(_StubLLM())
    original = [_sentence("你好我是你是李雷吧", 0.0, 2.0, ["你", "好", "我", "是", "你", "是", "李", "雷", "吧"])]

    _, validation = translator._validate_llm_output(
        original,
        json.dumps(
            {
                "segments": [
                    {
                        "id": 0,
                        "punctuated_source": "你好我是[split_hint]你是李雷吧",
                        "translation": "Xin chao",
                    }
                ]
            },
            ensure_ascii=False,
        ),
    )

    assert validation.accepted is False
    assert validation.reason_code == "hint_token_leaked"
    assert validation.details[0]["field"] == "punctuated_source"


def test_validate_llm_output_rejects_hint_leak_in_translation() -> None:
    translator = ChineseBatchLLMTranslator(_StubLLM())
    original = [_sentence("你好我是你是李雷吧", 0.0, 2.0, ["你", "好", "我", "是", "你", "是", "李", "雷", "吧"])]

    _, validation = translator._validate_llm_output(
        original,
        json.dumps(
            {
                "segments": [
                    {
                        "id": 0,
                        "punctuated_source": "你好，我是。你是李雷吧？",
                        "translation": "Xin chao [split_hint] toi la...",
                    }
                ]
            },
            ensure_ascii=False,
        ),
    )

    assert validation.accepted is False
    assert validation.reason_code == "hint_token_leaked"
    assert validation.details[0]["field"] == "translation"


def test_validate_llm_output_accepts_canonical_match_without_hint_leak() -> None:
    translator = ChineseBatchLLMTranslator(_StubLLM())
    original = [_sentence("你好我是你是李雷吧", 0.0, 2.0, ["你", "好", "我", "是", "你", "是", "李", "雷", "吧"])]

    validated, validation = translator._validate_llm_output(
        original,
        json.dumps(
            {
                "segments": [
                    {
                        "id": 0,
                        "punctuated_source": "你好，我是。你是李雷吧？",
                        "translation": "Xin chao, toi la. Ban la Ly Loi phai khong?",
                    }
                ]
            },
            ensure_ascii=False,
        ),
    )

    assert validation.accepted is True
    assert validation.reason_code == "ok"
    assert validated[0].text == "你好，我是。你是李雷吧？"


def test_validate_llm_output_rejects_source_mutation_after_hint_strip() -> None:
    translator = ChineseBatchLLMTranslator(_StubLLM())
    original = [_sentence("你好我是你是李雷吧", 0.0, 2.0, ["你", "好", "我", "是", "你", "是", "李", "雷", "吧"])]

    _, validation = translator._validate_llm_output(
        original,
        json.dumps(
            {
                "segments": [
                    {
                        "id": 0,
                        "punctuated_source": "你好，我叫。你是李雷吧。",
                        "translation": "bad",
                    }
                ]
            },
            ensure_ascii=False,
        ),
    )

    assert validation.accepted is False
    assert validation.reason_code == "source_mutation_detected"


def test_validate_llm_output_rejects_fullwidth_spaced_hint_variants() -> None:
    translator = ChineseBatchLLMTranslator(_StubLLM())
    original = [_sentence("你好我是你是李雷吧", 0.0, 2.0, ["你", "好", "我", "是", "你", "是", "李", "雷", "吧"])]

    _, validation = translator._validate_llm_output(
        original,
        json.dumps(
            {
                "segments": [
                    {
                        "id": 0,
                        "punctuated_source": "你好，我是。你是李雷吧。",
                        "translation": "Xin chao 【 split-hint 】 toi la...",
                    }
                ]
            },
            ensure_ascii=False,
        ),
    )

    assert validation.accepted is False
    assert validation.reason_code == "hint_token_leaked"


class _ChineseRescueNMT:
    def __init__(self) -> None:
        self.calls: list[list[str]] = []

    def translate_batch(
        self,
        texts: list[str],
        source_lang: str,
        target_lang: str,
    ) -> list[str]:
        self.calls.append(list(texts))
        return [f"{target_lang}:{text}" for text in texts]


class _ChineseRescueNMTHolder:
    translator: _ChineseRescueNMT | None = None

    @staticmethod
    def get_instance() -> _ChineseRescueNMT:
        if _ChineseRescueNMTHolder.translator is None:
            raise AssertionError("translator not configured")
        return _ChineseRescueNMTHolder.translator

    @staticmethod
    def unload_instance(*, to_cpu: bool = False) -> None:
        return None


class _ChineseRescueAligner:
    def __init__(self) -> None:
        self.last_timing: dict[str, float] = {}
        self.last_route_usage: dict[str, Any] = {}
        self.last_probe_details: dict[str, Any] = {}

    def resolve_route(self, route_id: str) -> str:
        return route_id

    def route_decision_for_language(
        self,
        language: str | None,
        *,
        requested_policy: str,
        route_override: str | None = None,
    ) -> SimpleNamespace:
        normalized = async_mod.settings.normalize_language_tag(route_override or language)
        route_id = route_override or ("sensevoice_small" if normalized in {"zh", "yue"} else "distil_whisper_en")
        return SimpleNamespace(
            route_id=route_id,
            provider_id="sensevoice" if route_id == "sensevoice_small" else "whisper",
            model_id="SenseVoiceSmall" if route_id == "sensevoice_small" else "distil-large-v3.5",
            effective_policy="after_asr" if route_id == "sensevoice_small" else requested_policy,
            auto_downgraded=route_id == "sensevoice_small",
            fallback_chain=(route_id,),
        )

    def probe_source_language(
        self,
        file_path: Path,
        segments: list[VADSegment],
        *,
        audio_array=None,
        max_segments: int | None = None,
        max_seconds: float | None = None,
    ) -> str:
        del file_path, segments, audio_array, max_segments, max_seconds
        self.last_probe_details = {"winner": "en", "scores": {"en": 6.0, "zh": 4.6}}
        return "en"

    def unload_route(self, route: str, *, to_cpu: bool = False) -> str:
        return route

    def unload_all(self, *, to_cpu: bool = False) -> None:
        return None

    def process(
        self,
        file_path: Path,
        segments: list[VADSegment],
        profile: str = "standard",
        on_chunk=None,
        chunk_size: int = 8,
        audio_array=None,
        source_language: str | None = None,
        route_override: str | None = None,
    ) -> list[Sentence]:
        del file_path, segments, profile, chunk_size, audio_array, source_language
        batch = [
            _sentence("第一次相亲Firstblinddate", 0.0, 3.0, ["第", "一", "次", "相", "亲", "F", "i", "r", "s", "t", "b", "l", "i", "n", "d", "d", "a", "t", "e"]),
            _sentence("你好", 3.1, 4.1, ["你", "好"]),
            _sentence("请问你是王静吗", 4.2, 6.6, ["请", "问", "你", "是", "王", "静", "吗"]),
            _sentence("你好我是你是李雷吧", 6.7, 9.5, ["你", "好", "我", "是", "你", "是", "李", "雷", "吧"]),
        ]
        if on_chunk:
            on_chunk(batch, len(batch))
        route = route_override or "sensevoice_small"
        self.last_route_usage = {
            "requested_route": route,
            "actual_route": route,
            "provider_id": "sensevoice",
            "model_id": "SenseVoiceSmall",
            "fallback_chain": (route,),
            "fallback_used": False,
            "during_asr_certified": True,
            "diagnostics": {
                "avg_word_confidence": 0.98,
                "detected_lang": "zh",
            },
        }
        return batch


class _ChineseRescuePipeline:
    def __init__(self, llm: _StubLLM) -> None:
        self.audio_processor = FakeAudioProcessor()
        self.audio_inspector = FakeAudioInspector()
        self.vad_manager = FakeVADManager()
        self.aligner = _ChineseRescueAligner()
        self.merger = FakeMerger()
        self.llm = llm
        self.last_run_metrics: dict[str, Any] = {}


class _ChineseRescueMinio:
    def upload_chunk(
        self,
        media_id: str,
        chunk_index: int,
        data: list[dict[str, Any]],
    ) -> tuple[str, str]:
        return (
            f"{media_id}/chunks/{chunk_index}.json",
            f"http://fake/chunks/{chunk_index}.json",
        )

    def upload_translated_batch(self, media_id: str, batch) -> tuple[str, str]:
        return (
            f"{media_id}/translated_batches/{batch.batch_index}.json",
            f"http://fake/batches/{batch.batch_index}.json",
        )


def test_async_pipeline_uses_llm_rescue_for_flagged_chinese_batch(monkeypatch, tmp_path) -> None:
    llm = _PromptAwareChineseRescueLLM()
    pipeline = _ChineseRescuePipeline(llm)
    _ChineseRescueNMTHolder.translator = _ChineseRescueNMT()
    minio = _ChineseRescueMinio()

    monkeypatch.setattr(async_mod, "update_media_status", _noop)
    monkeypatch.setattr(async_mod, "publish_progress", _noop)
    monkeypatch.setattr(async_mod, "publish_chunk_ready", _noop)
    monkeypatch.setattr(async_mod, "publish_batch_ready", _noop)
    monkeypatch.setattr(async_mod, "NMTTranslator", _ChineseRescueNMTHolder)
    monkeypatch.setattr(async_mod.settings, "AI_ENABLE_LLM_REFINEMENT", False)
    monkeypatch.setattr(async_mod.settings, "AI_CHINESE_LLM_RESCUE_ENABLED", True)
    monkeypatch.setattr(async_mod.settings, "AI_CHINESE_LINGUISTIC_RADAR_ENABLED", True)
    monkeypatch.setattr(async_mod.settings, "AI_CHINESE_LLM_RESCUE_SPLIT_HINTS_ENABLED", True)
    monkeypatch.setattr(async_mod.settings, "AI_TRANSLATION_START_POLICY", "during_asr")
    monkeypatch.setattr(async_mod.settings, "AI_ENABLE_NMT_PREFETCH", False)

    audio_path = tmp_path / "input.wav"
    audio_path.write_bytes(b"fake-audio")

    output = asyncio.run(
        async_mod.run_v2_pipeline_async(
            pipeline,
            minio,
            audio_path,
            "media-llm-zh-123",
            user_id="user-123",
            started_at=time.time(),
            target_lang="vi",
            media_context={
                "title": "Mandarin Chinese lesson for beginners",
                "audioS3Key": "uploads/dialogue_sample.mp3",
            },
        )
    )

    assert llm.calls
    prompt_payload = json.loads(llm.calls[0]["prompt"])
    assert output.segments[0].text == "第一次相亲 F i r s t b l i n d d a t e"
    assert output.segments[1].text == "你好"
    assert output.segments[2].text == "请问你是王静吗？"
    assert output.segments[2].text.startswith(prompt_payload["target_segments"][0]["raw_text"])
    assert [segment.text for segment in output.segments[2:4]] == [
        "请问你是王静吗？",
        "你好，我是。你是李雷吧？",
    ]
    assert output.segments[2].translation == "Xin hỏi bạn có phải là Vương Tĩnh không?"
    assert pipeline.last_run_metrics["chinese_llm_rescue"][0]["llm_batches_used"] == 1
    jammed_segment = next(
        segment
        for segment in prompt_payload["target_segments"]
        if segment["raw_text"] == "你好我是你是李雷吧？"
    )
    assert jammed_segment["text_with_hints"] == "你好我是[split_hint]你是李雷吧？"
    assert "structural_jamming_risk" in jammed_segment["radar_flags"]
