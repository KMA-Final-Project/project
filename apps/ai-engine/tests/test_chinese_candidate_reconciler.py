from __future__ import annotations

from src.core.chinese_candidate_reconciler import (
    CandidateSnapshot,
    reconcile_chinese_candidate_sentences,
)
from src.schemas import Sentence, Word


def _sentence(
    text: str,
    start: float,
    end: float,
    words: list[tuple[str, float, float, float]],
) -> Sentence:
    return Sentence(
        text=text,
        start=start,
        end=end,
        detected_lang="zh",
        words=[
            Word(word=token, start=word_start, end=word_end, confidence=confidence)
            for token, word_start, word_end, confidence in words
        ],
    )


def test_reconciler_restores_richer_opening_gloss_from_alternate_candidate() -> None:
    trusted = [
        _sentence(
            "第一次相亲。",
            0.0,
            1.78,
            [
                ("第", 0.0, 0.17, 0.87),
                ("一", 0.17, 0.34, 0.87),
                ("次", 0.34, 0.86, 0.99),
                ("相", 0.86, 1.26, 0.99),
                ("亲", 1.26, 1.52, 0.97),
                ("。", 1.52, 1.78, 0.97),
            ],
        )
    ]
    alternate = CandidateSnapshot(
        route="sensevoice_small",
        provider="sensevoice",
        sentences=[
            _sentence(
                "第一次相亲 first blind date",
                0.0,
                1.9,
                [
                    ("第", 0.0, 0.1, 0.95),
                    ("一", 0.1, 0.2, 0.95),
                    ("次", 0.2, 0.3, 0.95),
                    ("相", 0.3, 0.4, 0.95),
                    ("亲", 0.4, 0.5, 0.95),
                    ("first", 0.5, 0.8, 0.95),
                    ("blind", 0.8, 1.2, 0.95),
                    ("date", 1.2, 1.6, 0.95),
                ],
            )
        ],
    )

    result = reconcile_chinese_candidate_sentences(trusted, [alternate])

    assert [sentence.text for sentence in result.sentences] == [
        "第一次相亲 first blind date"
    ]
    assert result.replacements


def test_reconciler_restores_missing_opening_greeting_from_alternate_candidate() -> None:
    trusted = [
        _sentence(
            "请问你是王静吗?",
            9.9,
            11.65,
            [
                ("请", 9.9, 10.13, 0.98),
                ("问", 10.13, 10.41, 1.0),
                ("你", 10.41, 10.66, 0.86),
                ("是", 10.66, 10.91, 0.86),
                ("王", 10.91, 11.17, 0.99),
                ("静", 11.17, 11.49, 0.83),
                ("吗", 11.49, 11.57, 1.0),
                ("?", 11.57, 11.65, 1.0),
            ],
        ),
        _sentence(
            "你好,我是……你是李雷吧?",
            12.31,
            15.09,
            [
                ("你", 12.31, 12.49, 0.99),
                ("好", 12.49, 12.67, 0.99),
                (",", 12.67, 12.85, 0.99),
                ("我", 13.01, 13.21, 0.99),
                ("是", 13.21, 13.41, 0.99),
                ("……", 13.41, 13.69, 0.21),
                ("你", 13.69, 14.05, 0.99),
                ("是", 14.05, 14.41, 0.99),
                ("李", 14.41, 14.67, 0.99),
                ("雷", 14.67, 14.97, 0.83),
                ("吧", 14.97, 15.03, 1.0),
                ("?", 15.03, 15.09, 1.0),
            ],
        ),
    ]
    alternate = CandidateSnapshot(
        route="sensevoice_small",
        provider="sensevoice",
        sentences=[
            _sentence(
                "你好,请问你是王静吗?",
                9.42,
                11.7,
                [
                    ("你", 9.42, 9.6, 0.95),
                    ("好", 9.6, 9.78, 0.95),
                    (",", 9.78, 9.88, 0.95),
                    ("请", 9.88, 10.12, 0.95),
                    ("问", 10.12, 10.38, 0.95),
                    ("你", 10.38, 10.62, 0.95),
                    ("是", 10.62, 10.9, 0.95),
                    ("王", 10.9, 11.16, 0.95),
                    ("静", 11.16, 11.48, 0.95),
                    ("吗", 11.48, 11.58, 0.95),
                    ("?", 11.58, 11.7, 0.95),
                ],
            )
        ],
    )

    result = reconcile_chinese_candidate_sentences(trusted, [alternate])

    assert [sentence.text for sentence in result.sentences[:2]] == [
        "你好,请问你是王静吗?",
        "你好,我是……你是李雷吧?",
    ]
    assert result.replacements


def test_reconciler_keeps_trusted_segment_when_alternate_is_weaker() -> None:
    trusted = [
        _sentence(
            "这里环境不错,挺安静的。",
            26.8,
            29.68,
            [
                ("这", 26.8, 26.94, 0.98),
                ("里", 26.94, 27.08, 0.98),
                ("环", 27.08, 27.8, 1.0),
                ("境", 27.8, 28.02, 1.0),
                ("不", 28.02, 28.16, 1.0),
                ("错", 28.16, 28.29, 1.0),
                (",", 28.29, 28.42, 1.0),
                ("挺", 28.5, 28.9, 1.0),
                ("安", 28.9, 29.2, 1.0),
                ("静", 29.2, 29.48, 1.0),
                ("的", 29.48, 29.58, 1.0),
                ("。", 29.58, 29.68, 1.0),
            ],
        )
    ]
    alternate = CandidateSnapshot(
        route="sensevoice_small",
        provider="sensevoice",
        sentences=[
            _sentence(
                "这里环境。",
                26.9,
                29.4,
                [
                    ("这", 26.9, 27.1, 0.95),
                    ("里", 27.1, 27.3, 0.95),
                    ("环", 27.3, 27.8, 0.4),
                    ("境", 27.8, 28.1, 0.4),
                    ("。", 28.1, 28.3, 0.95),
                ],
            )
        ],
    )

    result = reconcile_chinese_candidate_sentences(trusted, [alternate])

    assert [sentence.text for sentence in result.sentences] == [
        "这里环境不错,挺安静的。"
    ]
    assert result.replacements == []
