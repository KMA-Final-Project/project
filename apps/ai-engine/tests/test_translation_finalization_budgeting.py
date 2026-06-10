from __future__ import annotations

from src.core.translation_revision_overlay import TranslationRevisionOverlay, OverlayCandidate
from src.schemas import TranslationRevisionArtifact, TranslationRevisionSegment


def test_final_export_keeps_translated_batches_unchanged_and_overlays_final_only() -> None:
    base = [
        {"segment_index": 0, "text": "A", "translation": "nmt-a"},
        {"segment_index": 1, "text": "B", "translation": "nmt-b"},
    ]
    revisions = [
        TranslationRevisionArtifact(
            revision_index=0,
            window_start_segment_index=0,
            window_end_segment_index=1,
            core_start_segment_index=0,
            core_end_segment_index=1,
            source_hash="abc",
            provider="gemini",
            model="gemini-2.5-flash",
            status="valid",
            validation_score=0.9,
            created_at="2026-06-10T08:00:00Z",
            segments=[TranslationRevisionSegment(segment_index=1, translation="llm-b")],
        )
    ]
    overlay = TranslationRevisionOverlay()
    candidates: dict[int, list[OverlayCandidate]] = {}
    for artifact in revisions:
        for seg in artifact.segments:
            candidates.setdefault(seg.segment_index, []).append(
                OverlayCandidate(
                    segment_index=seg.segment_index,
                    translation=seg.translation,
                    revision_index=artifact.revision_index,
                    in_core=True,
                    validation_score=artifact.validation_score,
                )
            )
    final = overlay.apply_translations(base, candidates)
    assert [segment["translation"] for segment in final] == ["nmt-a", "llm-b"]
    assert [segment["translation"] for segment in base] == ["nmt-a", "nmt-b"]  # base unchanged
