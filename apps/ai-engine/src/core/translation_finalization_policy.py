from __future__ import annotations

from dataclasses import dataclass, replace
from typing import Sequence

from src.core.translation_revision_windowing import (
    FinalizationWindowPolicy,
    estimate_source_tokens,
)
from src.schemas import Sentence


@dataclass(frozen=True, slots=True)
class FinalizationProfileSelection:
    profile_name: str
    policy: FinalizationWindowPolicy
    single_window: bool
    total_segments: int
    total_source_tokens: int
    segment_density: float
    source_token_density: float


def select_finalization_policy(
    *,
    sentences: Sequence[Sentence],
    source_lang: str,
    duration_seconds: float,
    base_policy: FinalizationWindowPolicy,
    short_asset_max_segments: int,
    short_asset_max_source_tokens: int,
    sparse_segment_density_threshold: float,
    sparse_source_token_density_threshold: float,
    cjk_langs: Sequence[str],
) -> FinalizationProfileSelection:
    total_segments = len(sentences)
    total_source_tokens = sum(estimate_source_tokens(sentence.text) for sentence in sentences)
    safe_duration = max(duration_seconds, 0.001)
    segment_density = total_segments / safe_duration
    source_token_density = total_source_tokens / safe_duration

    if (
        total_segments <= short_asset_max_segments
        and total_source_tokens <= min(base_policy.max_request_tokens, short_asset_max_source_tokens)
    ):
        return FinalizationProfileSelection(
            profile_name="short_asset_single_window",
            policy=base_policy,
            single_window=True,
            total_segments=total_segments,
            total_source_tokens=total_source_tokens,
            segment_density=segment_density,
            source_token_density=source_token_density,
        )

    normalized_source_lang = source_lang.strip().lower()
    cjk_lang_set = {lang.strip().lower() for lang in cjk_langs if lang.strip()}
    if (
        segment_density <= sparse_segment_density_threshold
        and source_token_density <= sparse_source_token_density_threshold
    ):
        sparse_policy = replace(
            base_policy,
            target_segment_count=min(base_policy.max_segment_count, base_policy.target_segment_count + 4),
            target_source_tokens=base_policy.target_source_tokens + 120,
            target_duration_seconds=base_policy.target_duration_seconds + 30.0,
            max_duration_seconds=base_policy.max_duration_seconds + 60.0,
            overlap_segments=max(1, base_policy.overlap_segments - 1),
            overlap_source_tokens=max(0, base_policy.overlap_source_tokens - 20),
        )
        return FinalizationProfileSelection(
            profile_name="sparse_longform",
            policy=sparse_policy,
            single_window=False,
            total_segments=total_segments,
            total_source_tokens=total_source_tokens,
            segment_density=segment_density,
            source_token_density=source_token_density,
        )

    if normalized_source_lang in cjk_lang_set:
        cjk_policy = replace(
            base_policy,
            overlap_segments=max(base_policy.overlap_segments, 4),
            overlap_source_tokens=max(base_policy.overlap_source_tokens, 80),
        )
        return FinalizationProfileSelection(
            profile_name="dense_dialogue_cjk",
            policy=cjk_policy,
            single_window=False,
            total_segments=total_segments,
            total_source_tokens=total_source_tokens,
            segment_density=segment_density,
            source_token_density=source_token_density,
        )

    return FinalizationProfileSelection(
        profile_name="dense_dialogue_general",
        policy=base_policy,
        single_window=False,
        total_segments=total_segments,
        total_source_tokens=total_source_tokens,
        segment_density=segment_density,
        source_token_density=source_token_density,
    )
