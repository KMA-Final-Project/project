from src.core.translation_revision_overlay import (
    OverlayCandidate,
    TranslationRevisionOverlay,
    choose_best_translation,
)


def test_core_region_beats_overlap_region() -> None:
    overlap = OverlayCandidate(
        segment_index=7,
        translation="ban overlap",
        revision_index=1,
        in_core=False,
        validation_score=0.95,
    )
    core = OverlayCandidate(
        segment_index=7,
        translation="ban core",
        revision_index=2,
        in_core=True,
        validation_score=0.82,
    )
    winner = choose_best_translation([overlap, core], fallback_translation="ban nmt")
    assert winner == "ban core"


def test_conflicting_equal_candidates_fall_back_to_nmt() -> None:
    left = OverlayCandidate(
        segment_index=11,
        translation="toi rat vui",
        revision_index=3,
        in_core=True,
        validation_score=0.91,
    )
    right = OverlayCandidate(
        segment_index=11,
        translation="minh rat vui",
        revision_index=4,
        in_core=True,
        validation_score=0.91,
    )
    winner = choose_best_translation([left, right], fallback_translation="nmt draft")
    assert winner == "nmt draft"


def test_validation_rejects_structural_mutation() -> None:
    overlay = TranslationRevisionOverlay()
    result = overlay.validate_response_payload(
        expected_indexes=[20, 21],
        payload_segments=[
            {"segment_index": 20, "translation": "xin chao"},
            {"segment_index": 21, "translation": "toi la lee", "text": "MUTATED"},
        ],
    )
    assert result.status == "invalid"
    assert result.accepted_segments == []


def test_validation_rejects_segment_index_mutation() -> None:
    overlay = TranslationRevisionOverlay()
    result = overlay.validate_response_payload(
        expected_indexes=[20],
        payload_segments=[
            {"segment_index": 22, "translation": "sai roi"},
        ],
    )
    assert result.status == "invalid"
    assert result.failure_reason == "segment_index_mismatch"


def test_media_deadline_exports_partial_revision_coverage() -> None:
    overlay = TranslationRevisionOverlay()
    final_segments = overlay.apply_translations(
        base_segments=[
            {"segment_index": 0, "translation": "nmt-0"},
            {"segment_index": 1, "translation": "nmt-1"},
            {"segment_index": 2, "translation": "nmt-2"},
        ],
        candidates={
            0: [OverlayCandidate(0, "llm-0", 0, True, 0.9)],
            1: [OverlayCandidate(1, "llm-1", 0, True, 0.9)],
        },
    )
    assert [segment["translation"] for segment in final_segments] == [
        "llm-0",
        "llm-1",
        "nmt-2",
    ]
