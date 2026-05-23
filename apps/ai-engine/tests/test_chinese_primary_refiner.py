from __future__ import annotations

from src.core.chinese_primary_refiner import refine_chinese_primary_transcript
from src.schemas import Sentence, Word


def _make_sentence(
    text: str,
    words: list[tuple[str, float, float, float]],
    *,
    start: float | None = None,
    end: float | None = None,
) -> Sentence:
    sentence_words = [
        Word(word=token, start=token_start, end=token_end, confidence=confidence)
        for token, token_start, token_end, confidence in words
    ]
    return Sentence(
        text=text,
        start=start if start is not None else sentence_words[0].start,
        end=end if end is not None else sentence_words[-1].end,
        words=sentence_words,
        detected_lang="zh",
    )


def test_refiner_preserves_spoken_english_gloss_with_restored_spacing() -> None:
    sentence = _make_sentence(
        "他们是通过相亲认识的。Theymetthroughablinddate.",
        [
            ("他", 0.0, 0.1, 0.95),
            ("们", 0.1, 0.2, 0.95),
            ("是", 0.2, 0.3, 0.95),
            ("通", 0.3, 0.4, 0.95),
            ("过", 0.4, 0.5, 0.95),
            ("相", 0.5, 0.6, 0.95),
            ("亲", 0.6, 0.7, 0.95),
            ("认", 0.7, 0.8, 0.95),
            ("识", 0.8, 0.9, 0.95),
            ("的", 0.9, 1.0, 0.95),
            ("。", 1.0, 1.1, 0.95),
            ("They", 1.2, 1.4, 0.05),
            ("met", 1.4, 1.6, 1.0),
            ("through", 1.6, 1.8, 1.0),
            ("a", 1.8, 1.9, 1.0),
            ("blind", 1.9, 2.1, 1.0),
            ("date.", 2.1, 2.3, 1.0),
        ],
    )

    result = refine_chinese_primary_transcript([sentence])

    assert [segment.text for segment in result.sentences] == [
        "他们是通过相亲认识的。They met through a blind date."
    ]
    assert result.dropped_spans == []


def test_refiner_splits_long_chinese_dialogue_on_sentence_punctuation() -> None:
    sentence = _make_sentence(
        "对,是我,第一次见面,幸会。幸会,等很久了吗?没有,我也是刚到。",
        [
            ("对", 0.0, 0.2, 0.98),
            (",", 0.2, 0.3, 0.98),
            ("是", 0.3, 0.4, 0.98),
            ("我", 0.4, 0.5, 0.98),
            (",", 0.5, 0.6, 0.98),
            ("第", 1.0, 1.1, 0.98),
            ("一", 1.1, 1.2, 0.98),
            ("次", 1.2, 1.3, 0.98),
            ("见", 1.3, 1.4, 0.98),
            ("面", 1.4, 1.5, 0.98),
            (",", 1.5, 1.6, 0.98),
            ("幸", 1.8, 2.0, 0.98),
            ("会", 2.0, 2.2, 0.98),
            ("。", 2.2, 2.4, 0.98),
            ("幸", 2.8, 3.0, 0.98),
            ("会", 3.0, 3.2, 0.98),
            (",", 3.2, 3.3, 0.98),
            ("等", 3.4, 3.6, 0.98),
            ("很", 3.6, 3.8, 0.98),
            ("久", 3.8, 4.0, 0.98),
            ("了", 4.0, 4.2, 0.98),
            ("吗", 4.2, 4.4, 0.98),
            ("?", 4.4, 4.5, 0.98),
            ("没", 5.0, 5.2, 0.98),
            ("有", 5.2, 5.4, 0.98),
            (",", 5.4, 5.5, 0.98),
            ("我", 5.6, 5.8, 0.98),
            ("也", 5.8, 6.0, 0.98),
            ("是", 6.0, 6.2, 0.98),
            ("刚", 6.2, 6.4, 0.98),
            ("到", 6.4, 6.6, 0.98),
            ("。", 6.6, 6.8, 0.98),
        ],
    )

    result = refine_chinese_primary_transcript([sentence])

    assert [segment.text for segment in result.sentences] == [
        "对,是我,第一次见面,幸会。",
        "幸会,等很久了吗?",
        "没有,我也是刚到。",
    ]
    assert all((segment.end - segment.start) <= 8.0 for segment in result.sentences)


def test_refiner_dedupes_repeated_nearby_chinese_phrases() -> None:
    sentence = _make_sentence(
        "这里环境不错,挺安静的。这里环境不错,挺安静的。是啊,我上网查了好久才决定这家。你挺细心的。",
        [
            ("这", 0.0, 0.1, 0.97),
            ("里", 0.1, 0.2, 0.97),
            ("环", 0.2, 0.3, 0.97),
            ("境", 0.3, 0.4, 0.97),
            ("不", 0.4, 0.5, 0.97),
            ("错", 0.5, 0.6, 0.97),
            (",", 0.6, 0.7, 0.97),
            ("挺", 0.7, 0.8, 0.97),
            ("安", 0.8, 0.9, 0.97),
            ("静", 0.9, 1.0, 0.97),
            ("的", 1.0, 1.1, 0.97),
            ("。", 1.1, 1.2, 0.97),
            ("这", 1.3, 1.4, 0.0),
            ("里", 1.4, 1.5, 0.0),
            ("环", 1.5, 1.6, 0.99),
            ("境", 1.6, 1.7, 0.99),
            ("不", 1.7, 1.8, 0.99),
            ("错", 1.8, 1.9, 0.99),
            (",", 1.9, 2.0, 0.99),
            ("挺", 2.0, 2.1, 0.99),
            ("安", 2.1, 2.2, 0.99),
            ("静", 2.2, 2.3, 0.99),
            ("的", 2.3, 2.4, 0.99),
            ("。", 2.4, 2.5, 0.99),
            ("是", 2.6, 2.7, 0.98),
            ("啊", 2.7, 2.8, 0.98),
            (",", 2.8, 2.9, 0.98),
            ("我", 3.0, 3.1, 0.98),
            ("上", 3.1, 3.2, 0.98),
            ("网", 3.2, 3.3, 0.98),
            ("查", 3.3, 3.4, 0.98),
            ("了", 3.4, 3.5, 0.98),
            ("好", 3.5, 3.6, 0.98),
            ("久", 3.6, 3.7, 0.98),
            ("才", 3.7, 3.8, 0.98),
            ("决", 3.8, 3.9, 0.98),
            ("定", 3.9, 4.0, 0.98),
            ("这", 4.0, 4.1, 0.98),
            ("家", 4.1, 4.2, 0.98),
            ("。", 4.2, 4.3, 0.98),
            ("你", 4.5, 4.6, 0.98),
            ("挺", 4.6, 4.7, 0.98),
            ("细", 4.7, 4.8, 0.98),
            ("心", 4.8, 4.9, 0.98),
            ("的", 4.9, 5.0, 0.98),
            ("。", 5.0, 5.1, 0.98),
        ],
    )

    result = refine_chinese_primary_transcript([sentence])
    texts = [segment.text for segment in result.sentences]

    assert texts == [
        "这里环境不错,挺安静的。",
        "是啊,我上网查了好久才决定这家。",
        "你挺细心的。",
    ]
    assert any(
        item["reason"] in {"adjacent_duplicate_clause", "nearby_duplicate_segment"}
        for item in [*result.dropped_spans, *result.deduped_spans]
    )


def test_refiner_applies_known_phrase_corrections() -> None:
    sentences = [
        _make_sentence(
            "请问你是王靖吗?",
            [("请", 0.0, 0.1, 0.98), ("问", 0.1, 0.2, 0.98), ("你", 0.2, 0.3, 0.98), ("是", 0.3, 0.4, 0.98), ("王", 0.4, 0.5, 0.98), ("靖", 0.5, 0.6, 0.98), ("吗", 0.6, 0.7, 0.98), ("?", 0.7, 0.8, 0.98)],
        ),
        _make_sentence(
            "那我请你吃饭当回吧。",
            [("那", 1.0, 1.1, 0.98), ("我", 1.1, 1.2, 0.98), ("请", 1.2, 1.3, 0.98), ("你", 1.3, 1.4, 0.98), ("吃", 1.4, 1.5, 0.98), ("饭", 1.5, 1.6, 0.98), ("当", 1.6, 1.7, 0.98), ("回", 1.7, 1.8, 0.98), ("吧", 1.8, 1.9, 0.98), ("。", 1.9, 2.0, 0.98)],
        ),
        _make_sentence(
            "感觉想完成任务。",
            [("感", 2.2, 2.3, 0.98), ("觉", 2.3, 2.4, 0.98), ("想", 2.4, 2.5, 0.98), ("完", 2.5, 2.6, 0.98), ("成", 2.6, 2.7, 0.98), ("任", 2.7, 2.8, 0.98), ("务", 2.8, 2.9, 0.98), ("。", 2.9, 3.0, 0.98)],
        ),
        _make_sentence(
            "有机会可以选你做的菜。",
            [("有", 3.2, 3.3, 0.98), ("机", 3.3, 3.4, 0.98), ("会", 3.4, 3.5, 0.98), ("可", 3.5, 3.6, 0.98), ("以", 3.6, 3.7, 0.98), ("选", 3.7, 3.8, 0.98), ("你", 3.8, 3.9, 0.98), ("做", 3.9, 4.0, 0.98), ("的", 4.0, 4.1, 0.98), ("菜", 4.1, 4.2, 0.98), ("。", 4.2, 4.3, 0.98)],
        ),
    ]

    result = refine_chinese_primary_transcript(sentences)
    texts = [segment.text for segment in result.sentences]

    assert "请问你是王静吗?" in texts
    assert "那我请你吃饭当回报。" in texts
    assert "感觉像完成任务。" in texts
    assert "有机会可以学你做的菜。" in texts
    assert result.normalization_hits


def test_refiner_repairs_opening_meeting_dialogue_jams() -> None:
    sentences = [
        _make_sentence(
            "你好，我是你是李雷吧。",
            [
                ("你", 0.0, 0.1, 0.98),
                ("好", 0.1, 0.2, 0.98),
                ("，", 0.2, 0.3, 0.98),
                ("我", 0.3, 0.4, 0.98),
                ("是", 0.4, 0.5, 0.98),
                ("你", 0.5, 0.6, 0.98),
                ("是", 0.6, 0.7, 0.98),
                ("李", 0.7, 0.8, 0.98),
                ("雷", 0.8, 0.9, 0.98),
                ("吧", 0.9, 1.0, 0.98),
                ("。", 1.0, 1.1, 0.98),
            ],
        ),
        _make_sentence(
            "对，是我第一次见面。",
            [
                ("对", 1.3, 1.4, 0.98),
                ("，", 1.4, 1.5, 0.98),
                ("是", 1.5, 1.6, 0.98),
                ("我", 1.6, 1.7, 0.98),
                ("第", 1.7, 1.8, 0.98),
                ("一", 1.8, 1.9, 0.98),
                ("次", 1.9, 2.0, 0.98),
                ("见", 2.0, 2.1, 0.98),
                ("面", 2.1, 2.2, 0.98),
                ("。", 2.2, 2.3, 0.98),
            ],
        ),
        _make_sentence(
            "幸会。",
            [
                ("幸", 2.5, 2.6, 0.98),
                ("会", 2.6, 2.7, 0.98),
                ("。", 2.7, 2.8, 0.98),
            ],
        ),
        _make_sentence(
            "信会等很久了吗？",
            [
                ("信", 3.0, 3.1, 0.98),
                ("会", 3.1, 3.2, 0.98),
                ("等", 3.2, 3.3, 0.98),
                ("很", 3.3, 3.4, 0.98),
                ("久", 3.4, 3.5, 0.98),
                ("了", 3.5, 3.6, 0.98),
                ("吗", 3.6, 3.7, 0.98),
                ("？", 3.7, 3.8, 0.98),
            ],
        ),
    ]

    result = refine_chinese_primary_transcript(sentences)

    assert [segment.text for segment in result.sentences] == [
        "你好，我是你是李雷吧？",
        "对，是我。第一次见面。",
        "幸会。",
        "幸会，等很久了吗？",
    ]
    assert any(
        "confirmation_turn_boundary_inserted" in hit
        for hit in result.normalization_hits
    )
    assert any("polite_wait_question_normalized" in hit for hit in result.normalization_hits)


def test_refiner_repairs_combined_first_meeting_politeness_chain() -> None:
    sentence = _make_sentence(
        "对是我第一次见面幸会。",
        [
            ("对", 0.0, 0.1, 0.98),
            ("是", 0.1, 0.2, 0.98),
            ("我", 0.2, 0.3, 0.98),
            ("第", 0.3, 0.4, 0.98),
            ("一", 0.4, 0.5, 0.98),
            ("次", 0.5, 0.6, 0.98),
            ("见", 0.6, 0.7, 0.98),
            ("面", 0.7, 0.8, 0.98),
            ("幸", 0.8, 0.9, 0.98),
            ("会", 0.9, 1.0, 0.98),
            ("。", 1.0, 1.1, 0.98),
        ],
    )

    result = refine_chinese_primary_transcript([sentence])

    assert [segment.text for segment in result.sentences] == [
        "对，是我。第一次见面，幸会。",
    ]


def test_refiner_preserves_mixed_script_vocabulary_with_restored_spaces() -> None:
    sentences = [
        _make_sentence(
            "第一次相亲firstblinddate",
            [
                ("第", 0.0, 0.1, 0.95),
                ("一", 0.1, 0.2, 0.95),
                ("次", 0.2, 0.3, 0.95),
                ("相", 0.3, 0.4, 0.95),
                ("亲", 0.4, 0.5, 0.95),
                ("first", 0.5, 0.7, 0.95),
                ("blind", 0.7, 0.9, 0.95),
                ("date", 0.9, 1.1, 0.95),
            ],
        ),
        _make_sentence(
            "我已经适应了新工作。I'vealreadyadaptedtothenewjob.",
            [
                ("我", 1.4, 1.5, 0.98),
                ("已", 1.5, 1.6, 0.98),
                ("经", 1.6, 1.7, 0.98),
                ("适", 1.7, 1.8, 0.98),
                ("应", 1.8, 1.9, 0.98),
                ("了", 1.9, 2.0, 0.98),
                ("新", 2.0, 2.1, 0.98),
                ("工", 2.1, 2.2, 0.98),
                ("作", 2.2, 2.3, 0.98),
                ("。", 2.3, 2.4, 0.98),
                ("I've", 2.5, 2.7, 0.95),
                ("already", 2.7, 2.9, 0.95),
                ("adapted", 2.9, 3.1, 0.95),
                ("to", 3.1, 3.2, 0.95),
                ("the", 3.2, 3.3, 0.95),
                ("new", 3.3, 3.4, 0.95),
                ("job.", 3.4, 3.6, 0.95),
            ],
        ),
    ]

    result = refine_chinese_primary_transcript(sentences)

    assert [segment.text for segment in result.sentences] == [
        "第一次相亲 first blind date",
        "我已经适应了新工作。I've already adapted to the new job."
    ]
    assert result.dropped_spans == []


def test_refiner_keeps_both_repeated_greetings_when_spoken_by_two_people() -> None:
    sentence = _make_sentence(
        "你好,请问你是王靖吗?你好,我是……你是李雷吧?",
        [
            ("你", 0.0, 0.1, 0.98),
            ("好", 0.1, 0.2, 0.98),
            (",", 0.2, 0.3, 0.98),
            ("请", 0.3, 0.4, 0.98),
            ("问", 0.4, 0.5, 0.98),
            ("你", 0.5, 0.6, 0.98),
            ("是", 0.6, 0.7, 0.98),
            ("王", 0.7, 0.8, 0.98),
            ("靖", 0.8, 0.9, 0.98),
            ("吗", 0.9, 1.0, 0.98),
            ("?", 1.0, 1.1, 0.98),
            ("你", 1.3, 1.4, 0.98),
            ("好", 1.4, 1.5, 0.98),
            (",", 1.5, 1.6, 0.98),
            ("我", 1.6, 1.7, 0.98),
            ("是", 1.7, 1.8, 0.98),
            ("……", 1.8, 1.9, 0.98),
            ("你", 1.9, 2.0, 0.98),
            ("是", 2.0, 2.1, 0.98),
            ("李", 2.1, 2.2, 0.98),
            ("雷", 2.2, 2.3, 0.98),
            ("吧", 2.3, 2.4, 0.98),
            ("?", 2.4, 2.5, 0.98),
        ],
    )

    result = refine_chinese_primary_transcript([sentence])

    assert [segment.text for segment in result.sentences] == [
        "你好,请问你是王静吗?",
        "你好,我是……你是李雷吧?",
    ]
    assert result.deduped_spans == []


def test_refiner_keeps_mixed_clause_gloss_attached_before_following_chinese_clause() -> None:
    sentence = _make_sentence(
        "第一次相亲。 First blind date.你好。",
        [
            ("第", 0.0, 0.1, 0.98),
            ("一", 0.1, 0.2, 0.98),
            ("次", 0.2, 0.3, 0.98),
            ("相", 0.3, 0.4, 0.98),
            ("亲", 0.4, 0.5, 0.98),
            ("。", 0.5, 0.6, 0.98),
            ("F", 0.6, 0.7, 0.9),
            ("i", 0.7, 0.8, 0.9),
            ("r", 0.8, 0.9, 0.9),
            ("s", 0.9, 1.0, 0.9),
            ("t", 1.0, 1.1, 0.9),
            ("b", 1.1, 1.2, 0.9),
            ("l", 1.2, 1.3, 0.9),
            ("i", 1.3, 1.4, 0.9),
            ("n", 1.4, 1.5, 0.9),
            ("d", 1.5, 1.6, 0.9),
            ("d", 1.6, 1.7, 0.9),
            ("a", 1.7, 1.8, 0.9),
            ("t", 1.8, 1.9, 0.9),
            ("e", 1.9, 2.0, 0.9),
            (".", 2.0, 2.1, 0.9),
            ("你", 2.1, 2.2, 0.98),
            ("好", 2.2, 2.3, 0.98),
            ("。", 2.3, 2.4, 0.98),
        ],
    )

    result = refine_chinese_primary_transcript([sentence])

    assert [segment.text for segment in result.sentences] == [
        "第一次相亲。 First blind date.",
        "你好。",
    ]
