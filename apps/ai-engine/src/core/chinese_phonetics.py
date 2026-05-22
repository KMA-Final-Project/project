from __future__ import annotations

import re

import pypinyin
from loguru import logger

from src.schemas import Sentence

_HAN_RE = re.compile(r"[\u4e00-\u9fff]")


def apply_chinese_pinyin(sentences: list[Sentence]) -> None:
    """Populate the existing sentence-level phonetic field with tone-mark pinyin."""
    for sentence in sentences:
        phonetic_tokens: list[str] = []
        for word in sentence.words:
            text = str(word.word or "").strip()
            if not text or not _HAN_RE.search(text):
                continue
            try:
                pinyin = pypinyin.lazy_pinyin(
                    text,
                    style=pypinyin.Style.TONE,
                    strict=False,
                    neutral_tone_with_five=True,
                )
            except Exception as exc:
                logger.warning(f"Chinese pinyin error for '{text}': {exc}")
                continue
            token = "".join(item for item in pinyin if item).strip()
            if not token:
                continue
            word.phoneme = token
            phonetic_tokens.append(token)

        if not phonetic_tokens and _HAN_RE.search(sentence.text):
            try:
                phonetic_tokens = [
                    item
                    for item in pypinyin.lazy_pinyin(
                        sentence.text,
                        style=pypinyin.Style.TONE,
                        strict=False,
                        neutral_tone_with_five=True,
                    )
                    if item
                ]
            except Exception as exc:
                logger.warning(f"Chinese sentence pinyin error for '{sentence.text}': {exc}")
                phonetic_tokens = []

        sentence.phonetic = " ".join(token.strip() for token in phonetic_tokens if token.strip())
