from __future__ import annotations

from src.core.chinese_candidate_normalizer import normalize_chinese_candidate_sentences
from src.core.chinese_window_profiler import profile_chinese_transcript_windows
from src.core.chinese_window_repairer import (
    CandidateSnapshot,
    repair_chinese_candidate_windows,
)
from src.core.transcript_trust_gate import ChineseTranscriptTrustGate
from src.core.chinese_prior import ChineseRoutePrior
from src.schemas import Sentence, Word


def _sentence(
    text: str,
    start: float,
    end: float,
    words: list[tuple[str, float, float, float]],
    detected_lang: str = "zh",
) -> Sentence:
    return Sentence(
        text=text,
        start=start,
        end=end,
        detected_lang=detected_lang,
        words=[
            Word(word=word, start=word_start, end=word_end, confidence=confidence)
            for word, word_start, word_end, confidence in words
        ],
    )


def test_window_profiler_splits_on_gap_and_code_switch_density_shift() -> None:
    normalized = normalize_chinese_candidate_sentences(
        [
            _sentence("你好", 0.0, 1.0, [("你", 0.0, 0.5, 0.98), ("好", 0.5, 1.0, 0.98)]),
            _sentence("请坐", 1.1, 2.0, [("请", 1.1, 1.5, 0.98), ("坐", 1.5, 2.0, 0.98)]),
            _sentence(
                "第一次相亲 first blind date",
                2.1,
                4.0,
                [
                    ("第一", 2.1, 2.5, 0.98),
                    ("次", 2.5, 2.8, 0.98),
                    ("相亲", 2.8, 3.2, 0.98),
                    ("first", 3.2, 3.4, 0.9),
                    ("blind", 3.4, 3.7, 0.9),
                    ("date", 3.7, 4.0, 0.9),
                ],
            ),
            _sentence("我们开始吧", 5.4, 6.2, [("我们", 5.4, 5.8, 0.98), ("开始吧", 5.8, 6.2, 0.98)]),
        ]
    )

    windows = profile_chinese_transcript_windows(normalized.sentences)

    assert len(windows) == 3
    assert windows[0].sentence_indexes == (0, 1)
    assert windows[1].sentence_indexes == (2,)
    assert windows[1].mixed_script is True
    assert windows[2].gap_from_previous >= 1.0


def test_window_repairer_swaps_whole_sentence_window_only() -> None:
    base = normalize_chinese_candidate_sentences(
        [
            _sentence("第一次相亲。", 0.0, 1.5, [("第一次", 0.0, 0.8, 0.9), ("相亲", 0.8, 1.3, 0.9), ("。", 1.3, 1.5, 1.0)]),
            _sentence("请问你是王静吗?", 1.6, 3.0, [("请问", 1.6, 2.0, 0.98), ("你是", 2.0, 2.4, 0.98), ("王静吗", 2.4, 2.8, 0.98), ("?", 2.8, 3.0, 1.0)]),
            _sentence("你好,我是李雷。", 4.4, 6.0, [("你好", 4.4, 4.8, 0.98), ("我是", 4.8, 5.2, 0.98), ("李雷", 5.2, 5.7, 0.98), ("。", 5.7, 6.0, 1.0)]),
        ]
    ).sentences
    alternate = CandidateSnapshot(
        route="sensevoice_small",
        provider="sensevoice",
        sentences=normalize_chinese_candidate_sentences(
            [
                _sentence(
                    "第一次相亲 first blind date。",
                    0.0,
                    1.8,
                    [
                        ("第一次", 0.0, 0.6, 0.98),
                        ("相亲", 0.6, 0.9, 0.98),
                        ("first", 0.9, 1.2, 0.9),
                        ("blind", 1.2, 1.5, 0.9),
                        ("date", 1.5, 1.7, 0.9),
                        ("。", 1.7, 1.8, 1.0),
                    ],
                ),
                _sentence(
                    "你好,请问你是王静吗?",
                    1.8,
                    3.4,
                    [
                        ("你好", 1.8, 2.0, 0.98),
                        ("请问", 2.0, 2.3, 0.98),
                        ("你是", 2.3, 2.7, 0.98),
                        ("王静吗", 2.7, 3.1, 0.98),
                        ("?", 3.1, 3.4, 1.0),
                    ],
                ),
                _sentence("你好,我是李雷。", 4.4, 6.0, [("你好", 4.4, 4.8, 0.98), ("我是", 4.8, 5.2, 0.98), ("李雷", 5.2, 5.7, 0.98), ("。", 5.7, 6.0, 1.0)]),
            ]
        ).sentences,
    )

    result = repair_chinese_candidate_windows(base, [alternate], [0])

    assert len(result.replacements) == 1
    assert result.sentences[0].text == "第一次相亲 first blind date。"
    assert result.sentences[1].text == "你好,请问你是王静吗?"
    assert result.sentences[2].text == "你好,我是李雷。"


def test_trust_gate_keeps_mixed_script_learning_window_chinese_owned() -> None:
    prior = ChineseRoutePrior(
        prior_score=3.5,
        suspected_family="zh",
        confidence_band="medium",
        sources=("title_keywords", "audio_probe_near_tie"),
        title="Mandarin Chinese lesson",
        filename="lesson.mp3",
        probe_source_lang="zh",
        probe_scores=(("zh", 5.1), ("en", 4.6)),
        probe_near_tie=True,
    )
    normalized = normalize_chinese_candidate_sentences(
        [
            _sentence(
                "第一次相亲 first blind date。",
                0.0,
                2.0,
                [
                    ("第一次", 0.0, 0.5, 0.98),
                    ("相亲", 0.5, 0.8, 0.98),
                    ("first", 0.8, 1.2, 0.9),
                    ("blind", 1.2, 1.6, 0.9),
                    ("date", 1.6, 1.9, 0.9),
                    ("。", 1.9, 2.0, 1.0),
                ],
            ),
            _sentence(
                "他们是通过相亲认识的。They met through a blind date.",
                2.1,
                5.0,
                [
                    ("他们", 2.1, 2.5, 0.98),
                    ("是通过", 2.5, 3.0, 0.98),
                    ("相亲", 3.0, 3.3, 0.98),
                    ("认识的", 3.3, 3.8, 0.98),
                    ("。", 3.8, 3.9, 1.0),
                    ("They", 3.9, 4.1, 0.9),
                    ("met", 4.1, 4.3, 0.9),
                    ("through", 4.3, 4.5, 0.9),
                    ("a", 4.5, 4.6, 0.9),
                    ("blind", 4.6, 4.8, 0.9),
                    ("date", 4.8, 4.9, 0.9),
                    (".", 4.9, 5.0, 1.0),
                ],
            ),
        ]
    )
    windows = profile_chinese_transcript_windows(normalized.sentences)

    decision = ChineseTranscriptTrustGate().evaluate(
        prior=prior,
        sentences=normalized.sentences,
        route_id="sensevoice_small",
        diagnostics={"avg_word_confidence": 0.91, "detected_lang": "zh"},
        probe_details={"scores": {"zh": 5.1, "en": 4.6}},
        stage="sensevoice_recovery",
        duration_seconds=30.0,
        windows=windows,
    )

    assert decision.ownership_trusted is True
    assert decision.verdict in {"trusted", "trusted_repair"}
    assert "route_mismatch" not in decision.reasons
