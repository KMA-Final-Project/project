from src.core.translation_revision_windowing import (
    FinalizationWindowBuilder,
    FinalizationWindowPolicy,
)
from src.schemas import Sentence, Word


def make_sentence(index: int, text: str, start: float, end: float) -> Sentence:
    return Sentence(
        text=text,
        start=start,
        end=end,
        words=[Word(word=text, start=start, end=end, confidence=0.9)],
        translation=f"draft-{index}",
        segment_index=index,
    )


def test_window_waits_for_min_segments_and_tokens() -> None:
    policy = FinalizationWindowPolicy(
        min_segment_count=3,
        target_segment_count=5,
        max_segment_count=8,
        min_source_tokens=6,
        target_source_tokens=12,
        max_request_tokens=50,
        min_duration_seconds=4.0,
        target_duration_seconds=10.0,
        max_duration_seconds=30.0,
        overlap_segments=1,
        overlap_source_tokens=4,
    )
    builder = FinalizationWindowBuilder(policy)
    builder.add(make_sentence(0, "ni hao", 0.0, 1.0))
    builder.add(make_sentence(1, "wo shi li lei", 1.0, 2.0))
    assert builder.pop_ready_windows(eof=False) == []
    # Add enough segments to reach target tokens (12) or target segments (5)
    builder.add(make_sentence(2, "qing wen ni shi shui", 2.0, 4.5))
    builder.add(make_sentence(3, "wo ye hen hao", 4.5, 6.0))
    builder.add(make_sentence(4, "xie xie ni", 6.0, 7.5))
    ready = builder.pop_ready_windows(eof=False)
    assert len(ready) == 1
    assert len(ready[0].core_sentences) == 5  # target_segment_count
    assert ready[0].halo_before_sentences == []


def test_cjk_token_estimator_counts_han_without_whitespace() -> None:
    policy = FinalizationWindowPolicy(
        min_segment_count=2,
        target_segment_count=3,
        max_segment_count=6,
        min_source_tokens=6,
        target_source_tokens=12,
        max_request_tokens=18,
        min_duration_seconds=10.0,
        target_duration_seconds=45.0,
        max_duration_seconds=90.0,
        overlap_segments=1,
        overlap_source_tokens=4,
    )
    builder = FinalizationWindowBuilder(policy)
    builder.add(make_sentence(0, "你好我是李雷", 0.0, 1.0))
    builder.add(make_sentence(1, "请问你是王静吗", 1.0, 2.0))
    ready = builder.pop_ready_windows(eof=False)
    assert len(ready) == 1
    assert ready[0].source_token_count >= 10


def test_dense_dialogue_flushes_by_tokens_before_duration() -> None:
    policy = FinalizationWindowPolicy(
        min_segment_count=4,
        target_segment_count=6,
        max_segment_count=7,
        min_source_tokens=10,
        target_source_tokens=18,
        max_request_tokens=18,
        min_duration_seconds=20.0,
        target_duration_seconds=45.0,
        max_duration_seconds=90.0,
        overlap_segments=2,
        overlap_source_tokens=6,
    )
    builder = FinalizationWindowBuilder(policy)
    for i in range(6):
        builder.add(make_sentence(i, "a b c d", i * 0.7, i * 0.7 + 0.5))
    ready = builder.pop_ready_windows(eof=False)
    assert len(ready) == 1
    assert ready[0].source_token_count >= 18
    assert ready[0].duration_seconds < 20.0


def test_duration_guard_does_not_force_flush_without_minimum_semantic_readiness() -> None:
    policy = FinalizationWindowPolicy(
        min_segment_count=4,
        target_segment_count=6,
        max_segment_count=20,
        min_source_tokens=20,
        target_source_tokens=30,
        max_request_tokens=100,
        min_duration_seconds=10.0,
        target_duration_seconds=30.0,
        max_duration_seconds=35.0,
        overlap_segments=2,
        overlap_source_tokens=8,
    )
    builder = FinalizationWindowBuilder(policy)
    builder.add(make_sentence(0, "hi", 0.0, 18.0))
    builder.add(make_sentence(1, "ok", 18.0, 36.0))
    assert builder.pop_ready_windows(eof=False) == []


def test_core_halo_semantics_make_each_segment_authoritative_once() -> None:
    policy = FinalizationWindowPolicy(
        min_segment_count=3,
        target_segment_count=4,
        max_segment_count=6,
        min_source_tokens=6,
        target_source_tokens=10,
        max_request_tokens=50,
        min_duration_seconds=4.0,
        target_duration_seconds=10.0,
        max_duration_seconds=30.0,
        overlap_segments=1,
        overlap_source_tokens=4,
    )
    builder = FinalizationWindowBuilder(policy)
    for i in range(8):
        builder.add(make_sentence(i, "a b c", float(i), float(i) + 0.7))
    first = builder.pop_ready_windows(eof=False)[0]
    second = builder.pop_ready_windows(eof=False)[0]
    assert [segment.segment_index for segment in first.core_sentences] == [0, 1, 2, 3]
    assert [segment.segment_index for segment in second.halo_before_sentences] == [3]
    assert [segment.segment_index for segment in second.core_sentences] == [4, 5, 6, 7]


def test_eof_flushes_incomplete_tail() -> None:
    policy = FinalizationWindowPolicy(
        min_segment_count=5,
        target_segment_count=8,
        max_segment_count=10,
        min_source_tokens=20,
        target_source_tokens=30,
        max_request_tokens=60,
        min_duration_seconds=15.0,
        target_duration_seconds=40.0,
        max_duration_seconds=90.0,
        overlap_segments=2,
        overlap_source_tokens=8,
    )
    builder = FinalizationWindowBuilder(policy)
    builder.add(make_sentence(9, "xin chao", 9.0, 10.0))
    builder.add(make_sentence(10, "rat vui duoc gap", 10.0, 11.0))
    ready = builder.pop_ready_windows(eof=True)
    assert len(ready) == 1
    assert ready[0].is_eof_flush is True
    assert builder.pop_ready_windows(eof=True) == []
    assert builder.is_empty() is True


def test_eof_ignores_overlap_only_tail_after_full_core_coverage() -> None:
    policy = FinalizationWindowPolicy(
        min_segment_count=3,
        target_segment_count=4,
        max_segment_count=6,
        min_source_tokens=6,
        target_source_tokens=10,
        max_request_tokens=50,
        min_duration_seconds=4.0,
        target_duration_seconds=10.0,
        max_duration_seconds=30.0,
        overlap_segments=1,
        overlap_source_tokens=4,
    )
    builder = FinalizationWindowBuilder(policy)
    for i in range(8):
        builder.add(make_sentence(i, "a b c", float(i), float(i) + 0.7))

    first = builder.pop_ready_windows(eof=False)
    second = builder.pop_ready_windows(eof=False)
    assert len(first) == 1
    assert len(second) == 1

    eof_ready = builder.pop_ready_windows(eof=True)
    assert eof_ready == []
    assert builder.is_empty() is True
