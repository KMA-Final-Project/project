from __future__ import annotations

from src.core.chinese_phonetics import apply_chinese_pinyin
from src.core.chinese_word_segmenter import segment_chinese_sentence_words
from src.schemas import Sentence, Word


def _char_sentence(text: str, tokens: list[str], start: float = 0.0, step: float = 0.1) -> Sentence:
    words: list[Word] = []
    cursor = start
    for token in tokens:
        next_cursor = round(cursor + step, 3)
        words.append(
            Word(
                word=token,
                start=round(cursor, 3),
                end=next_cursor,
                confidence=0.95,
            )
        )
        cursor = next_cursor
    return Sentence(
        text=text,
        start=words[0].start,
        end=words[-1].end,
        words=words,
        detected_lang="zh",
    )


def test_segment_chinese_sentence_words_groups_character_level_hanzi() -> None:
    sentence = _char_sentence(
        "请问你是王静吗？我们今天第一次见面。",
        ["请", "问", "你", "是", "王", "静", "吗", "我", "们", "今", "天", "第", "一", "次", "见", "面"],
    )

    changed = segment_chinese_sentence_words(sentence)

    assert changed is True
    assert [word.word for word in sentence.words] == [
        "请问",
        "你",
        "是",
        "王静",
        "吗",
        "我们",
        "今天",
        "第一次",
        "见面",
    ]
    assert sentence.words[0].start == 0.0
    assert sentence.words[0].end == 0.2
    assert sentence.words[3].start == 0.4
    assert sentence.words[3].end == 0.6
    assert sentence.words[-1].end == 1.6


def test_segment_chinese_sentence_words_groups_mixed_script_runs() -> None:
    sentence = _char_sentence(
        "第一次相亲。 First blind date.",
        ["第", "一", "次", "相", "亲", "F", "i", "r", "s", "t", "b", "l", "i", "n", "d", "d", "a", "t", "e"],
    )

    changed = segment_chinese_sentence_words(sentence)

    assert changed is True
    assert [word.word for word in sentence.words] == [
        "第一次",
        "相亲",
        "First",
        "blind",
        "date",
    ]


def test_segment_chinese_sentence_words_keeps_grouped_words_and_refreshes_pinyin() -> None:
    sentence = _char_sentence("我们小时", ["我们", "小时"], step=0.2)

    changed = segment_chinese_sentence_words(sentence)
    apply_chinese_pinyin([sentence])

    assert changed is False
    assert [word.word for word in sentence.words] == ["我们", "小时"]
    assert [word.phoneme for word in sentence.words] == ["wǒmen", "xiǎoshí"]
    assert sentence.phonetic == "wǒmen xiǎoshí"
