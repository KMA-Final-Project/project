from __future__ import annotations

import re

import eng_to_ipa
import pypinyin
from loguru import logger

from src.schemas import Sentence


def add_phonetic_annotations(sentences: list[Sentence], language: str) -> None:
    normalized = (language or "").strip().lower()
    if normalized not in {"zh", "en"}:
        return

    for sentence in sentences:
        for word in sentence.words:
            text = word.word.strip()
            if not text:
                continue
            try:
                if normalized == "zh":
                    if re.search(r"[\u4e00-\u9fff]", text):
                        pinyin = pypinyin.pinyin(
                            text,
                            style=pypinyin.Style.TONE,
                            heteronym=False,
                        )
                        word.phoneme = "".join(item[0] for item in pinyin)
                elif normalized == "en":
                    ipa = eng_to_ipa.convert(text)
                    if ipa and "*" not in ipa:
                        word.phoneme = ipa
            except Exception as exc:
                logger.warning(f"Phonetic error for '{text}': {exc}")

        sentence.phonetic = " ".join(
            phoneme.strip()
            for phoneme in (current.phoneme for current in sentence.words)
            if phoneme and phoneme.strip()
        )
