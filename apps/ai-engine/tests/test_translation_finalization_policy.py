from src.core.translation_finalization_policy import select_finalization_policy
from src.core.translation_revision_windowing import FinalizationWindowPolicy
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


BASE_POLICY = FinalizationWindowPolicy(
    min_segment_count=16,
    target_segment_count=28,
    max_segment_count=36,
    min_source_tokens=180,
    target_source_tokens=360,
    max_request_tokens=2600,
    min_duration_seconds=20.0,
    target_duration_seconds=75.0,
    max_duration_seconds=120.0,
    overlap_segments=4,
    overlap_source_tokens=80,
)


def test_short_asset_selects_single_window_profile() -> None:
    selection = select_finalization_policy(
        sentences=[make_sentence(i, "hello there", i, i + 0.5) for i in range(12)],
        source_lang="en",
        duration_seconds=12.0,
        base_policy=BASE_POLICY,
        short_asset_max_segments=24,
        short_asset_max_source_tokens=520,
        sparse_segment_density_threshold=0.12,
        sparse_source_token_density_threshold=1.8,
        cjk_langs=("zh", "yue", "ja", "ko"),
    )
    assert selection.profile_name == "short_asset_single_window"
    assert selection.single_window is True


def test_dense_cjk_selects_cjk_profile() -> None:
    selection = select_finalization_policy(
        sentences=[make_sentence(i, "你好我是李雷请问你是谁", i * 0.8, i * 0.8 + 0.5) for i in range(30)],
        source_lang="zh",
        duration_seconds=24.0,
        base_policy=BASE_POLICY,
        short_asset_max_segments=24,
        short_asset_max_source_tokens=520,
        sparse_segment_density_threshold=0.12,
        sparse_source_token_density_threshold=1.8,
        cjk_langs=("zh", "yue", "ja", "ko"),
    )
    assert selection.profile_name == "dense_dialogue_cjk"
    assert selection.single_window is False


def test_sparse_longform_selects_sparse_profile() -> None:
    selection = select_finalization_policy(
        sentences=[
            make_sentence(0, "This is a lecture.", 0.0, 20.0),
            make_sentence(1, "There is a long pause.", 20.0, 40.0),
            make_sentence(2, "Another sparse line.", 40.0, 60.0),
            make_sentence(3, "Final sparse line.", 60.0, 80.0),
        ],
        source_lang="en",
        duration_seconds=80.0,
        base_policy=BASE_POLICY,
        short_asset_max_segments=3,
        short_asset_max_source_tokens=40,
        sparse_segment_density_threshold=0.12,
        sparse_source_token_density_threshold=1.8,
        cjk_langs=("zh", "yue", "ja", "ko"),
    )
    assert selection.profile_name == "sparse_longform"
    assert selection.policy.target_segment_count > BASE_POLICY.target_segment_count


def test_dense_general_selects_default_profile() -> None:
    selection = select_finalization_policy(
        sentences=[make_sentence(i, "hello there general kenobi", i * 0.7, i * 0.7 + 0.5) for i in range(28)],
        source_lang="en",
        duration_seconds=22.0,
        base_policy=BASE_POLICY,
        short_asset_max_segments=24,
        short_asset_max_source_tokens=520,
        sparse_segment_density_threshold=0.12,
        sparse_source_token_density_threshold=1.8,
        cjk_langs=("zh", "yue", "ja", "ko"),
    )
    assert selection.profile_name == "dense_dialogue_general"
    assert selection.single_window is False
