# Translation Finalization Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a translation-only cloud-LLM finalization layer that writes additive `translation_revisions/` artifacts, overlays valid revisions onto the NMT base when building `final.json`, and records finalization metrics in the benchmark harness without changing the backend/mobile runtime contract.

**Architecture:** Keep `translated_batches/` as the latency layer and treat `translation_revisions/` as an internal quality layer. Phase 1 will run **incremental finalization after stable translated windows become available**, not as a fully offline post-completion pass: the AI Engine will accumulate NMT-backed source segments into hybrid semantic windows, send only the core segments for revision while supplying halo context to the LLM, timebox finalization with a media-duration-aware clamp budget, validate translation-only revision payloads, upload additive revision artifacts, and build `final.json` by overlaying winning revised `translation` values over the NMT base. Benchmarking remains backend-script driven and reads additive finalization telemetry plus per-segment provenance from `final.json.metadata` while reconstructing the NMT baseline from existing `translated_batches`.

**Tech Stack:** Python 3.12, Pydantic, asyncio, MinIO, Redis Pub/Sub, NestJS build scripts, TypeScript benchmark utilities, pytest, Jest-compatible TypeScript tests where practical.

---

## File Structure

### AI Engine

- Modify: `apps/ai-engine/src/config.py`
  - Add explicit finalization settings for enablement, window policy, timeboxing, retries, overlap, and provider/model selection.
- Modify: `apps/ai-engine/src/schemas.py`
  - Add strongly typed revision artifact models, finalization metadata models, and per-segment provenance models for benchmark/debug use.
- Modify: `apps/ai-engine/src/core/llm_provider.py`
  - Add a translation-only `finalize_translation_window()` entry point that accepts source segments plus optional NMT draft and returns structured per-segment translations.
- Create: `apps/ai-engine/src/core/translation_revision_windowing.py`
  - Own CJK-aware token estimation, hybrid window accumulation, density heuristics, real core/halo computation, overlap computation, and EOF drain logic.
- Create: `apps/ai-engine/src/core/translation_revision_overlay.py`
  - Own validation, conflict resolution, winning-candidate selection, fallback behavior, and final overlay application.
- Modify: `apps/ai-engine/src/minio_client.py`
  - Add canonical `translation_revisions/` object-key helpers and upload helpers.
- Modify: `apps/ai-engine/src/async_pipeline.py`
  - Collect stable NMT-backed segments, schedule timeboxed finalization windows, upload revision artifacts, aggregate finalization metrics, and build `final.json` from NMT base plus revision overlay.
- Modify: `apps/ai-engine/tests/test_streaming_contracts.py`
  - Extend artifact invariants for revision-free streaming stability and additive final metadata.
- Create: `apps/ai-engine/tests/test_translation_revision_windowing.py`
  - Cover hybrid window readiness, density-aware flushing, token caps, overlap, and EOF behavior.
- Create: `apps/ai-engine/tests/test_translation_revision_overlay.py`
  - Cover translation-only validation, overlap conflict resolution, fallback to NMT, and final overlay.
- Create: `apps/ai-engine/tests/test_translation_finalization_budgeting.py`
  - Cover per-window timeout, media-level deadline, retry limits, and partial-coverage export behavior.

### Backend Benchmark Harness

- Modify: `apps/backend-api/scripts/e2e-youtube-benchmark/types.ts`
  - Add translation-finalization telemetry types, reconstructed NMT baseline samples, per-segment provenance, and judge-eval result types.
- Modify: `apps/backend-api/scripts/e2e-youtube-benchmark/reporting.ts`
  - Add latency/finalization metrics, coverage, fallback, and judge summary sections.
- Modify: `apps/backend-api/scripts/e2e-youtube-pipeline-eval.ts`
  - Reconstruct the full NMT baseline from existing `translatedBatches`, extract finalization metrics from `final.json.metadata`, and emit judge inputs/results.
- Create: `apps/backend-api/scripts/e2e-youtube-benchmark/translation-judge.ts`
  - Provide judge-prompt construction, sample selection, provider response normalization, and aggregate scoring helpers.
- Create: `apps/backend-api/scripts/e2e-youtube-benchmark/translation-judge.spec.ts`
  - Lock the judge payload shape and score aggregation with deterministic mocks.

### Docs

- Modify: `CONTRACTS.md`
  - Document additive internal `translation_revisions/` semantics and phase-1 non-consumption by backend/mobile.
- Modify: `apps/ai-engine/CHECKPOINT.md`
  - Record the phase-1 translation-finalization layer, validation rules, and benchmark telemetry.
- Modify: `apps/backend-api/CHECKPOINT.md`
  - Record benchmark harness expansion for translation-finalization telemetry and judge-based translation quality comparisons.

---

### Task 1: Add Finalization Config And Artifact Models

**Files:**
- Modify: `apps/ai-engine/src/config.py`
- Modify: `apps/ai-engine/src/schemas.py`
- Test: `apps/ai-engine/tests/test_streaming_contracts.py`

- [ ] **Step 1: Write the failing schema/config tests**

```python
from src.config import settings
from src.schemas import (
    SegmentTranslationProvenance,
    SubtitleMetadata,
    TranslationFinalizationMetadata,
    TranslationRevisionArtifact,
    TranslationRevisionSegment,
)


def test_translation_finalization_settings_have_safe_defaults() -> None:
    assert settings.AI_ENABLE_LLM_FINALIZATION is False
    assert settings.AI_LLM_FINALIZATION_MIN_SEGMENTS == 12
    assert settings.AI_LLM_FINALIZATION_TARGET_SEGMENTS == 24
    assert settings.AI_LLM_FINALIZATION_MAX_SEGMENTS == 36
    assert settings.AI_LLM_FINALIZATION_BUDGET_RATIO_SECONDS_PER_MEDIA_SECOND == 0.2
    assert settings.AI_LLM_FINALIZATION_BUDGET_MIN_SECONDS == 20
    assert settings.AI_LLM_FINALIZATION_BUDGET_MAX_SECONDS == 120
    assert settings.AI_LLM_FINALIZATION_FAIL_OPEN is True


def test_translation_revision_artifact_is_translation_only() -> None:
    artifact = TranslationRevisionArtifact(
        revision_index=3,
        window_start_segment_index=40,
        window_end_segment_index=67,
        core_start_segment_index=44,
        core_end_segment_index=63,
        source_hash="abc123",
        provider="openai",
        model="gpt-4.1-mini",
        status="valid",
        validation_score=0.98,
        created_at="2026-06-10T08:00:00Z",
        segments=[
            TranslationRevisionSegment(segment_index=44, translation="Xin chao")
        ],
    )
    dumped = artifact.model_dump()
    assert dumped["segments"][0] == {
        "segment_index": 44,
        "translation": "Xin chao",
    }
    assert "text" not in dumped["segments"][0]


def test_subtitle_metadata_accepts_finalization_metrics() -> None:
    metadata = SubtitleMetadata(
        duration=120.0,
        source_lang="zh",
        target_lang="vi",
        translation_finalization=TranslationFinalizationMetadata(
            enabled=True,
            coverage_segments=18,
            coverage_duration_seconds=42.5,
            attempted_windows=2,
            completed_windows=1,
            timed_out_windows=1,
            fallback_segments=6,
            total_cost_usd=0.0175,
            finalization_deadline_hit=True,
            segment_provenance=[
                SegmentTranslationProvenance(
                    segment_index=0,
                    source="llm_revision",
                    revision_index=0,
                ),
                SegmentTranslationProvenance(
                    segment_index=1,
                    source="nmt",
                    revision_index=None,
                ),
            ],
        ),
    )
    assert metadata.translation_finalization.coverage_segments == 18
    assert metadata.translation_finalization.segment_provenance[0].source == "llm_revision"
```

- [ ] **Step 2: Run tests to verify they fail**

Run:

```powershell
cd apps/ai-engine
venv\Scripts\python.exe -m pytest tests/test_streaming_contracts.py -q
```

Expected: FAIL with import errors or missing settings/models for `TranslationRevisionArtifact`, `TranslationFinalizationMetadata`, and new finalization config keys.

- [ ] **Step 3: Add the finalization settings and models**

```python
# apps/ai-engine/src/config.py
AI_ENABLE_LLM_FINALIZATION: bool = Field(default=False)
AI_LLM_FINALIZATION_LANGS: str = Field(default="zh,yue")
AI_LLM_FINALIZATION_MIN_SEGMENTS: int = Field(default=12, ge=2)
AI_LLM_FINALIZATION_TARGET_SEGMENTS: int = Field(default=24, ge=4)
AI_LLM_FINALIZATION_MAX_SEGMENTS: int = Field(default=36, ge=4)
AI_LLM_FINALIZATION_MIN_SOURCE_TOKENS: int = Field(default=120, ge=1)
AI_LLM_FINALIZATION_TARGET_SOURCE_TOKENS: int = Field(default=260, ge=1)
AI_LLM_FINALIZATION_MAX_REQUEST_TOKENS: int = Field(default=1800, ge=128)
AI_LLM_FINALIZATION_MIN_DURATION_SECONDS: float = Field(default=20.0, ge=0.0)
AI_LLM_FINALIZATION_TARGET_DURATION_SECONDS: float = Field(default=45.0, ge=0.0)
AI_LLM_FINALIZATION_MAX_DURATION_SECONDS: float = Field(default=90.0, ge=1.0)
AI_LLM_FINALIZATION_OVERLAP_SEGMENTS: int = Field(default=4, ge=0)
AI_LLM_FINALIZATION_OVERLAP_SOURCE_TOKENS: int = Field(default=40, ge=0)
AI_LLM_FINALIZATION_TIMEOUT_SECONDS: int = Field(default=25, ge=1)
AI_LLM_FINALIZATION_MAX_RETRIES: int = Field(default=1, ge=0)
AI_LLM_FINALIZATION_MAX_CONCURRENCY: int = Field(default=2, ge=1)
AI_LLM_FINALIZATION_BUDGET_RATIO_SECONDS_PER_MEDIA_SECOND: float = Field(default=0.2, ge=0.0)
AI_LLM_FINALIZATION_BUDGET_MIN_SECONDS: int = Field(default=20, ge=1)
AI_LLM_FINALIZATION_BUDGET_MAX_SECONDS: int = Field(default=120, ge=1)
AI_LLM_FINALIZATION_FAIL_OPEN: bool = Field(default=True)
AI_LLM_FINALIZATION_PROVIDER: str = Field(default="gemini")
AI_LLM_FINALIZATION_MODEL_OPENAI: str = Field(default="gpt-4.1-mini")
AI_LLM_FINALIZATION_MODEL_GEMINI: str = Field(default="gemini-2.5-flash")

# apps/ai-engine/src/schemas.py
class TranslationRevisionSegment(BaseModel):
    segment_index: int
    translation: str = Field(default="")


class TranslationRevisionArtifact(BaseModel):
    revision_index: int
    window_start_segment_index: int
    window_end_segment_index: int
    core_start_segment_index: int
    core_end_segment_index: int
    source_hash: str
    provider: str
    model: str
    status: str
    validation_score: float = 0.0
    created_at: str
    segments: List[TranslationRevisionSegment]


class TranslationFinalizationMetadata(BaseModel):
    enabled: bool = False
    coverage_segments: int = 0
    coverage_duration_seconds: float = 0.0
    attempted_windows: int = 0
    completed_windows: int = 0
    timed_out_windows: int = 0
    invalid_windows: int = 0
    fallback_segments: int = 0
    total_cost_usd: float = 0.0
    finalization_deadline_hit: bool = False
    segment_provenance: List["SegmentTranslationProvenance"] = Field(
        default_factory=list
    )


class SegmentTranslationProvenance(BaseModel):
    segment_index: int
    source: str = Field(
        default="nmt",
        description="nmt or llm_revision",
    )
    revision_index: int | None = None


class SubtitleMetadata(BaseModel):
    duration: float = 0.0
    engine_profile: str = "MEDIUM"
    source_lang: str = ""
    target_lang: str = ""
    model_used: str = ""
    translation_finalization: TranslationFinalizationMetadata = Field(
        default_factory=TranslationFinalizationMetadata
    )
```

- [ ] **Step 4: Run the focused test suite**

Run:

```powershell
cd apps/ai-engine
venv\Scripts\python.exe -m pytest tests/test_streaming_contracts.py -q
```

Expected: PASS

- [ ] **Step 5: Commit**

```powershell
git add apps/ai-engine/src/config.py apps/ai-engine/src/schemas.py apps/ai-engine/tests/test_streaming_contracts.py
git commit -m "feat: add translation finalization config and schemas"
```

### Task 2: Implement Hybrid Revision Windowing

**Files:**
- Create: `apps/ai-engine/src/core/translation_revision_windowing.py`
- Test: `apps/ai-engine/tests/test_translation_revision_windowing.py`

- [ ] **Step 1: Write the failing windowing tests**

```python
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
    builder.add(make_sentence(2, "qing wen ni shi shui", 2.0, 4.5))
    ready = builder.pop_ready_windows(eof=False)
    assert len(ready) == 1
    assert [segment.segment_index for segment in ready[0].core_sentences] == [0, 1, 2]
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run:

```powershell
cd apps/ai-engine
venv\Scripts\python.exe -m pytest tests/test_translation_revision_windowing.py -q
```

Expected: FAIL because `translation_revision_windowing.py` does not exist.

- [ ] **Step 3: Implement the hybrid window builder**

```python
import re
import unicodedata
from dataclasses import dataclass, field
from hashlib import sha256
from typing import List

from src.schemas import Sentence


def estimate_source_tokens(text: str) -> int:
    normalized = unicodedata.normalize("NFKC", text)
    latin_chunks = re.findall(r"[A-Za-z0-9]+(?:['_-][A-Za-z0-9]+)*", normalized)
    cjk_chars = re.findall(r"[\u3400-\u4dbf\u4e00-\u9fff\u3040-\u30ff\uac00-\ud7af]", normalized)
    return max(1, len(latin_chunks) + len(cjk_chars))


@dataclass(slots=True)
class FinalizationWindowPolicy:
    min_segment_count: int
    target_segment_count: int
    max_segment_count: int
    min_source_tokens: int
    target_source_tokens: int
    max_request_tokens: int
    min_duration_seconds: float
    target_duration_seconds: float
    max_duration_seconds: float
    overlap_segments: int
    overlap_source_tokens: int


@dataclass(slots=True)
class FinalizationWindow:
    revision_index: int
    window_start_segment_index: int
    window_end_segment_index: int
    core_start_segment_index: int
    core_end_segment_index: int
    halo_before_sentences: List[Sentence]
    core_sentences: List[Sentence]
    halo_after_sentences: List[Sentence]
    source_token_count: int
    duration_seconds: float
    is_eof_flush: bool
    source_hash: str


@dataclass
class FinalizationWindowBuilder:
    policy: FinalizationWindowPolicy
    _buffer: List[Sentence] = field(default_factory=list)
    _revision_index: int = 0

    def add(self, sentence: Sentence) -> None:
        self._buffer.append(sentence)

    def is_empty(self) -> bool:
        return len(self._buffer) == 0

    def pop_ready_windows(self, eof: bool) -> List[FinalizationWindow]:
        windows: List[FinalizationWindow] = []
        while True:
            if not self._buffer:
                return windows
            if not eof and not self._is_ready():
                return windows
            window = self._build_window(is_eof_flush=eof)
            windows.append(window)
            self._trim_buffer(window, drain=eof)
            if eof:
                if not self._buffer:
                    return windows

    def _is_ready(self) -> bool:
        segment_count = len(self._buffer)
        token_count = sum(estimate_source_tokens(s.text) for s in self._buffer)
        duration = self._buffer[-1].end - self._buffer[0].start
        density = token_count / max(duration, 0.001)
        if segment_count >= self.policy.max_segment_count:
            return True
        if token_count >= self.policy.max_request_tokens:
            return True
        minimums_met = (
            segment_count >= self.policy.min_segment_count
            and token_count >= self.policy.min_source_tokens
        )
        if not minimums_met:
            return False
        if (
            duration >= self.policy.max_duration_seconds
            and minimums_met
        ):
            return True
        return (
            segment_count >= self.policy.target_segment_count
            or token_count >= self.policy.target_source_tokens
            or (
                duration >= self.policy.target_duration_seconds
                and density >= 0.35
            )
        )

    def _build_window(self, is_eof_flush: bool) -> FinalizationWindow:
        if is_eof_flush:
            sentences = list(self._buffer)
        else:
            sentences = list(self._buffer[: self.policy.max_segment_count])
        halo_before = [] if self._revision_index == 0 else sentences[: self.policy.overlap_segments]
        core_start_offset = len(halo_before)
        available_for_core = max(0, len(sentences) - core_start_offset)
        core_count = available_for_core if is_eof_flush else min(
            available_for_core,
            self.policy.target_segment_count,
        )
        core_end_offset = core_start_offset + core_count
        core_sentences = sentences[core_start_offset:core_end_offset]
        halo_after = [] if is_eof_flush else sentences[core_end_offset:]
        token_count = sum(estimate_source_tokens(s.text) for s in core_sentences)
        source_hash = sha256(
            "|".join(
                f"{s.segment_index}:{s.start:.3f}:{s.end:.3f}:{unicodedata.normalize('NFKC', s.text)}"
                for s in core_sentences
            ).encode("utf-8")
        ).hexdigest()[:16]
        return FinalizationWindow(
            revision_index=self._revision_index,
            window_start_segment_index=sentences[0].segment_index or 0,
            window_end_segment_index=sentences[-1].segment_index or 0,
            core_start_segment_index=core_sentences[0].segment_index or 0,
            core_end_segment_index=core_sentences[-1].segment_index or 0,
            halo_before_sentences=halo_before,
            core_sentences=core_sentences,
            halo_after_sentences=halo_after,
            source_token_count=token_count,
            duration_seconds=sentences[-1].end - sentences[0].start,
            is_eof_flush=is_eof_flush,
            source_hash=source_hash,
        )

    def _trim_buffer(self, window: FinalizationWindow, drain: bool) -> None:
        self._revision_index += 1
        if drain:
            self._buffer = []
            return
        carry_from_core = (
            window.core_sentences[-self.policy.overlap_segments :]
            if self.policy.overlap_segments > 0
            else []
        )
        consumed = (
            len(window.halo_before_sentences)
            + len(window.core_sentences)
            + len(window.halo_after_sentences)
        )
        remaining_tail = self._buffer[consumed:]
        self._buffer = list(carry_from_core) + list(window.halo_after_sentences) + list(remaining_tail)
```

- [ ] **Step 4: Run the focused test suite**

Run:

```powershell
cd apps/ai-engine
venv\Scripts\python.exe -m pytest tests/test_translation_revision_windowing.py -q
```

Expected: PASS

- [ ] **Step 5: Commit**

```powershell
git add apps/ai-engine/src/core/translation_revision_windowing.py apps/ai-engine/tests/test_translation_revision_windowing.py
git commit -m "feat: add hybrid translation revision windowing"
```

### Task 3: Implement Translation-Only Revision Validation And Overlay

**Files:**
- Create: `apps/ai-engine/src/core/translation_revision_overlay.py`
- Modify: `apps/ai-engine/src/core/llm_provider.py`
- Test: `apps/ai-engine/tests/test_translation_revision_overlay.py`
- Test: `apps/ai-engine/tests/test_translation_finalization_budgeting.py`

- [ ] **Step 1: Write the failing overlay and budgeting tests**

```python
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


def test_media_deadline_uses_completed_revisions_and_keeps_nmt_tail() -> None:
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run:

```powershell
cd apps/ai-engine
venv\Scripts\python.exe -m pytest tests/test_translation_revision_overlay.py tests/test_translation_finalization_budgeting.py -q
```

Expected: FAIL because `translation_revision_overlay.py` does not exist and `llm_provider.py` has no translation-only finalization API.

- [ ] **Step 3: Implement overlay validation, conflict resolution, and provider entry point**

```python
# apps/ai-engine/src/core/translation_revision_overlay.py
from dataclasses import dataclass
from typing import Dict, Iterable, List


@dataclass(frozen=True, slots=True)
class OverlayCandidate:
    segment_index: int
    translation: str
    revision_index: int
    in_core: bool
    validation_score: float


@dataclass(frozen=True, slots=True)
class ValidationResult:
    status: str
    accepted_segments: List[dict]
    failure_reason: str | None = None


def choose_best_translation(
    candidates: Iterable[OverlayCandidate], fallback_translation: str
) -> str:
    ranked = sorted(
        candidates,
        key=lambda c: (c.in_core, c.validation_score, c.revision_index),
        reverse=True,
    )
    if not ranked:
        return fallback_translation
    if len(ranked) >= 2:
        left, right = ranked[0], ranked[1]
        if (
            left.in_core == right.in_core
            and abs(left.validation_score - right.validation_score) < 1e-6
            and left.translation != right.translation
        ):
            return fallback_translation
    return ranked[0].translation


class TranslationRevisionOverlay:
    def validate_response_payload(
        self, expected_indexes: List[int], payload_segments: List[dict]
    ) -> ValidationResult:
        accepted: List[dict] = []
        if len(payload_segments) != len(expected_indexes):
            return ValidationResult(
                status="invalid",
                accepted_segments=[],
                failure_reason="segment_count_mismatch",
            )
        for expected, item in zip(expected_indexes, payload_segments):
            disallowed = {"text", "start", "end", "words", "phonetic", "detected_lang"}
            leaked_fields = disallowed.intersection(item.keys())
            if leaked_fields:
                return ValidationResult(
                    status="invalid",
                    accepted_segments=[],
                    failure_reason="disallowed_source_mutation_fields",
                )
            if item.get("segment_index") != expected:
                return ValidationResult(
                    status="invalid",
                    accepted_segments=[],
                    failure_reason="segment_index_mismatch",
                )
            translation = str(item.get("translation", "")).strip()
            if not translation:
                continue
            accepted.append({"segment_index": expected, "translation": translation})
        status = "valid" if len(accepted) == len(expected_indexes) else "partial"
        return ValidationResult(
            status=status,
            accepted_segments=accepted,
            failure_reason=None,
        )

    def apply_translations(
        self, base_segments: List[dict], candidates: Dict[int, List[OverlayCandidate]]
    ) -> List[dict]:
        merged: List[dict] = []
        for segment in base_segments:
            copied = dict(segment)
            segment_index = copied["segment_index"]
            copied["translation"] = choose_best_translation(
                candidates.get(segment_index, []),
                fallback_translation=copied["translation"],
            )
            merged.append(copied)
        return merged

# apps/ai-engine/src/core/llm_provider.py
def finalize_translation_window(
    self,
    *,
    source_language: str,
    target_lang: str,
    core_segments: list[dict],
    halo_before_segments: list[dict],
    halo_after_segments: list[dict],
    include_nmt_draft: bool,
    timeout_seconds: int,
) -> dict | None:
    system_prompt = (
        "You are revising subtitle translations. "
        "Source language and target language are provided explicitly. "
        "Halo segments are context only. "
        "You must return translations only for the expected core segment indexes. "
        "Do not return text, start, end, words, phonetic, or any rewritten source fields. "
        'Return strict JSON: {"segments":[{"segment_index":0,"translation":"..."}]}.'
    )
    user_payload = {
        "source_language": source_language,
        "target_language": target_lang,
        "expected_core_segment_indexes": [
            segment["segment_index"] for segment in core_segments
        ],
        "halo_before": halo_before_segments,
        "core_segments": core_segments,
        "halo_after": halo_after_segments,
        "include_nmt_draft": include_nmt_draft,
    }
    return self.generate(
        json.dumps(user_payload, ensure_ascii=False),
        system_prompt=system_prompt,
        capability="translation_finalization",
        timeout_seconds=timeout_seconds,
        response_schema=TRANSLATION_FINALIZATION_RESPONSE_SCHEMA,
        response_schema_name="translation_finalization",
    )
```

- [ ] **Step 4: Run the focused AI Engine tests**

Run:

```powershell
cd apps/ai-engine
venv\Scripts\python.exe -m pytest tests/test_translation_revision_overlay.py tests/test_translation_finalization_budgeting.py -q
```

Expected: PASS

- [ ] **Step 5: Commit**

```powershell
git add apps/ai-engine/src/core/translation_revision_overlay.py apps/ai-engine/src/core/llm_provider.py apps/ai-engine/tests/test_translation_revision_overlay.py apps/ai-engine/tests/test_translation_finalization_budgeting.py
git commit -m "feat: add translation revision overlay and llm finalizer"
```

### Task 4: Integrate Revision Uploads, Timeboxing, And Final Overlay Into The Pipeline

**Files:**
- Modify: `apps/ai-engine/src/minio_client.py`
- Modify: `apps/ai-engine/src/async_pipeline.py`
- Test: `apps/ai-engine/tests/test_streaming_contracts.py`
- Test: `apps/ai-engine/tests/test_translation_finalization_budgeting.py`

- [ ] **Step 1: Write the failing integration tests**

```python
from src.minio_client import MinioClient
from src.schemas import TranslationRevisionArtifact


def test_minio_translation_revision_key_is_stable() -> None:
    assert (
        MinioClient.translation_revision_object_key("media-1", 4)
        == "media-1/translation_revisions/4.json"
    )


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
            segments=[{"segment_index": 1, "translation": "llm-b"}],
        )
    ]
    final = build_final_segments(base, revisions)
    assert [segment["translation"] for segment in final] == ["nmt-a", "llm-b"]
    assert [segment["translation"] for segment in base] == ["nmt-a", "nmt-b"]


def test_media_deadline_exports_partial_revision_coverage() -> None:
    metrics = run_finalization_deadline_scenario(
        media_duration_seconds=526.0,
        completed_windows=1,
        timed_out_windows=2,
        fail_open=True,
    )
    assert metrics["finalization_deadline_hit"] is True
    assert metrics["completed_windows"] == 1
    assert metrics["timed_out_windows"] == 2
    assert metrics["fallback_segments"] > 0
```

- [ ] **Step 2: Run tests to verify they fail**

Run:

```powershell
cd apps/ai-engine
venv\Scripts\python.exe -m pytest tests/test_streaming_contracts.py tests/test_translation_finalization_budgeting.py -q
```

Expected: FAIL because MinIO has no `translation_revision_object_key()` and the pipeline has no `build_final_segments()` / deadline metrics path.

- [ ] **Step 3: Add revision uploads and pipeline scheduling**

```python
# apps/ai-engine/src/minio_client.py
@staticmethod
def translation_revision_object_key(media_id: str, revision_index: int) -> str:
    return f"{media_id}/translation_revisions/{revision_index}.json"


def upload_translation_revision(
    self, media_id: str, artifact: TranslationRevisionArtifact
) -> tuple[str, str]:
    object_key = self.translation_revision_object_key(media_id, artifact.revision_index)
    payload = json.dumps(
        artifact.model_dump(), ensure_ascii=False, indent=2
    ).encode("utf-8")
    self._put_processed_object(object_key, payload, "application/json")
    return object_key, self.get_presigned_url(object_key)

# apps/ai-engine/src/async_pipeline.py
finalization_budget_seconds = min(
    settings.AI_LLM_FINALIZATION_BUDGET_MAX_SECONDS,
    max(
        settings.AI_LLM_FINALIZATION_BUDGET_MIN_SECONDS,
        audio_duration * settings.AI_LLM_FINALIZATION_BUDGET_RATIO_SECONDS_PER_MEDIA_SECOND,
    ),
)
deadline_monotonic = _time.monotonic() + finalization_budget_seconds
revision_artifacts: list[TranslationRevisionArtifact] = []
overlay = TranslationRevisionOverlay()
window_builder = FinalizationWindowBuilder(
    FinalizationWindowPolicy(
        min_segment_count=settings.AI_LLM_FINALIZATION_MIN_SEGMENTS,
        target_segment_count=settings.AI_LLM_FINALIZATION_TARGET_SEGMENTS,
        max_segment_count=settings.AI_LLM_FINALIZATION_MAX_SEGMENTS,
        min_source_tokens=settings.AI_LLM_FINALIZATION_MIN_SOURCE_TOKENS,
        target_source_tokens=settings.AI_LLM_FINALIZATION_TARGET_SOURCE_TOKENS,
        max_request_tokens=settings.AI_LLM_FINALIZATION_MAX_REQUEST_TOKENS,
        min_duration_seconds=settings.AI_LLM_FINALIZATION_MIN_DURATION_SECONDS,
        target_duration_seconds=settings.AI_LLM_FINALIZATION_TARGET_DURATION_SECONDS,
        max_duration_seconds=settings.AI_LLM_FINALIZATION_MAX_DURATION_SECONDS,
        overlap_segments=settings.AI_LLM_FINALIZATION_OVERLAP_SEGMENTS,
        overlap_source_tokens=settings.AI_LLM_FINALIZATION_OVERLAP_SOURCE_TOKENS,
    )
)

# Phase 1 choice: incremental finalization after stable translated windows.
# Each translated batch contributes stable source+draft segments into the window builder
# as soon as batch upload succeeds. The LLM finalizer runs in the background under the
# media-level deadline, but `translated_batches/` remain unchanged and visible immediately.
async def _finalize_ready_windows(*, eof: bool) -> None:
    for window in window_builder.pop_ready_windows(eof=eof):
        if _time.monotonic() >= deadline_monotonic:
            finalization_metrics.finalization_deadline_hit = True
            break
        artifact = await _run_one_finalization_window(window)
        if artifact is not None:
            revision_artifacts.append(artifact)
            await asyncio.to_thread(minio.upload_translation_revision, media_id, artifact)

def _build_final_output() -> SubtitleOutput:
    candidates = collect_overlay_candidates(revision_artifacts)
    merged_segments = overlay.apply_translations(
        base_segments=[segment.model_dump() for segment in all_sentences],
        candidates=candidates,
    )
    final_sentences = [Sentence.model_validate(segment) for segment in merged_segments]
    segment_provenance = build_segment_provenance(
        base_segments=all_sentences,
        revision_artifacts=revision_artifacts,
        overlay_candidates=candidates,
    )
    metadata = SubtitleMetadata(
        duration=audio_duration,
        engine_profile=settings.AI_PERF_MODE,
        source_lang=src,
        target_lang=tgt,
        model_used=selected_model_name,
        translation_finalization=finalization_metrics.model_copy(
            update={"segment_provenance": segment_provenance}
        ),
    )
    return SubtitleOutput(metadata=metadata, segments=final_sentences)
```

- [ ] **Step 4: Run the AI Engine regression suite**

Run:

```powershell
cd apps/ai-engine
venv\Scripts\python.exe -m pytest tests/test_translation_revision_windowing.py tests/test_translation_revision_overlay.py tests/test_translation_finalization_budgeting.py tests/test_streaming_contracts.py tests/test_event_discipline.py -q
```

Expected: PASS

- [ ] **Step 5: Commit**

```powershell
git add apps/ai-engine/src/minio_client.py apps/ai-engine/src/async_pipeline.py apps/ai-engine/tests/test_streaming_contracts.py apps/ai-engine/tests/test_translation_finalization_budgeting.py
git commit -m "feat: integrate translation revisions into final export"
```

### Task 5: Extend Benchmarking For Finalization Metrics And Judge-Based Translation Delta

**Files:**
- Modify: `apps/backend-api/scripts/e2e-youtube-benchmark/types.ts`
- Modify: `apps/backend-api/scripts/e2e-youtube-benchmark/reporting.ts`
- Modify: `apps/backend-api/scripts/e2e-youtube-pipeline-eval.ts`
- Create: `apps/backend-api/scripts/e2e-youtube-benchmark/translation-judge.ts`
- Create: `apps/backend-api/scripts/e2e-youtube-benchmark/translation-judge.spec.ts`

- [ ] **Step 1: Write the failing benchmark tests**

```ts
import { describe, expect, it } from '@jest/globals';

import {
  buildJudgePrompt,
  summarizeJudgeResults,
} from './translation-judge';

describe('translation judge helpers', () => {
  it('builds a source/nmt/final comparison prompt', () => {
    const prompt = buildJudgePrompt({
      sourceSegments: ['你好', '请问你是王静吗？'],
      nmtTranslations: ['Xin chao', 'Ban co phai Vuong Tinh khong?'],
      finalTranslations: ['Chao ban', 'Cho minh hoi ban co phai Vuong Tinh khong?'],
      targetLanguage: 'vi',
    });

    expect(prompt).toContain('meaning preservation');
    expect(prompt).toContain('context consistency');
    expect(prompt).toContain('subtitle readability');
  });

  it('summarizes judge win rates and score deltas', () => {
    const summary = summarizeJudgeResults([
      {
        winner: 'llm_final',
        scores: { meaning: 5, fluency: 5, consistency: 4, readability: 5 },
      },
      {
        winner: 'tie',
        scores: { meaning: 4, fluency: 4, consistency: 4, readability: 4 },
      },
    ]);

    expect(summary.llmWinRate).toBe(0.5);
    expect(summary.tieRate).toBe(0.5);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run:

```powershell
cd apps/backend-api
pnpm test -- translation-judge.spec.ts
```

Expected: FAIL because `translation-judge.ts` does not exist.

- [ ] **Step 3: Implement benchmark telemetry extraction and judge helpers**

```ts
// apps/backend-api/scripts/e2e-youtube-benchmark/types.ts
export type TranslationFinalizationMetrics = {
  enabled: boolean;
  coverageSegments: number;
  coverageDurationSeconds: number;
  attemptedWindows: number;
  completedWindows: number;
  timedOutWindows: number;
  invalidWindows: number;
  fallbackSegments: number;
  totalCostUsd: number;
  finalizationDeadlineHit: boolean;
};

export type SegmentTranslationProvenance = {
  segmentIndex: number;
  source: 'nmt' | 'llm_revision';
  revisionIndex: number | null;
};

export type TranslationJudgeResult = {
  winner: 'nmt' | 'llm_final' | 'tie';
  scores: {
    meaning: number;
    fluency: number;
    consistency: number;
    readability: number;
  };
  rationale?: string;
};

// apps/backend-api/scripts/e2e-youtube-benchmark/translation-judge.ts
export function buildJudgePrompt(input: {
  sourceSegments: string[];
  nmtTranslations: string[];
  finalTranslations: string[];
  targetLanguage: string;
}): string {
  return [
    `Target language: ${input.targetLanguage}`,
    'Compare NMT vs LLM-final translations.',
    'Score meaning preservation, target-language fluency, context consistency, and subtitle readability on a 1-5 scale.',
    `SOURCE: ${input.sourceSegments.join(' | ')}`,
    `NMT: ${input.nmtTranslations.join(' | ')}`,
    `LLM_FINAL: ${input.finalTranslations.join(' | ')}`,
    'Return winner=nmt|llm_final|tie plus scores.',
  ].join('\n');
}

export function summarizeJudgeResults(results: TranslationJudgeResult[]) {
  const llmWins = results.filter((item) => item.winner === 'llm_final').length;
  const ties = results.filter((item) => item.winner === 'tie').length;
  return {
    llmWinRate: results.length === 0 ? 0 : llmWins / results.length,
    tieRate: results.length === 0 ? 0 : ties / results.length,
  };
}

// apps/backend-api/scripts/e2e-youtube-pipeline-eval.ts
const nmtBaselineSegments = await loadAllTranslatedBatchSegments(artifacts, input.api.http);
const finalizationMetrics =
  finalArtifact.metadata.translation_finalization ?? null;
const segmentProvenance =
  finalArtifact.metadata.translation_finalization?.segment_provenance ?? [];
const judgeSamples = buildJudgeSamples({
  sourceSegments: finalArtifact.segments,
  nmtSegments: nmtBaselineSegments,
  finalSegments: finalArtifact.segments,
  segmentProvenance,
});
```

- [ ] **Step 4: Run backend validation and a smoke E2E benchmark**

Run:

```powershell
cd apps/backend-api
pnpm build
pnpm test -- translation-judge.spec.ts
pnpm exec tsx scripts/e2e-youtube-pipeline-eval.ts --case-id chinese_kUzay3X1maA --output-dir ..\..\outputs\e2e-benchmarks\runs\translation-finalization-smoke
```

Expected:
- `pnpm build`: PASS
- `pnpm test -- translation-judge.spec.ts`: PASS
- smoke evaluator: completes one case and writes `evaluation.summary.json` with finalization telemetry fields, per-segment provenance, reconstructed NMT baseline samples, and judge output placeholders or live results when provider credentials are present.

- [ ] **Step 5: Commit**

```powershell
git add apps/backend-api/scripts/e2e-youtube-benchmark/types.ts apps/backend-api/scripts/e2e-youtube-benchmark/reporting.ts apps/backend-api/scripts/e2e-youtube-pipeline-eval.ts apps/backend-api/scripts/e2e-youtube-benchmark/translation-judge.ts apps/backend-api/scripts/e2e-youtube-benchmark/translation-judge.spec.ts
git commit -m "feat: benchmark translation finalization quality and latency"
```

### Task 6: Update Contracts, Checkpoints, And Run Final Validation

**Files:**
- Modify: `CONTRACTS.md`
- Modify: `apps/ai-engine/CHECKPOINT.md`
- Modify: `apps/backend-api/CHECKPOINT.md`

- [ ] **Step 1: Update the contract and checkpoints**

```md
<!-- CONTRACTS.md -->
- Internal additive artifact family: `processed/{mediaId}/translation_revisions/`
- Phase 1 rule: backend/mobile do not consume `translation_revisions/` directly.
- Phase 1 invariant: LLM may revise `translation` only; source text, timestamps, words, punctuation, segment indexes, and segmentation remain NMT-owned.
- `final.json` remains canonical and may include additive `metadata.translation_finalization`, including per-segment provenance used by benchmark/debug tooling.

<!-- apps/ai-engine/CHECKPOINT.md -->
- 2026-06-10 — Translation-finalization phase 1. Status: Working.
  - Changed: Added hybrid window-based cloud LLM finalization writing `translation_revisions/` and overlaying valid translations into `final.json`.
  - Why: improve final subtitle quality while keeping NMT latency artifacts unchanged.
  - Contract touched: Artifact | Language
  - Validation: `venv\Scripts\python.exe -m pytest ...`

<!-- apps/backend-api/CHECKPOINT.md -->
- 2026-06-10 — Translation-finalization benchmark telemetry. Status: Working.
  - Changed: E2E benchmark now reports finalization timing, coverage, fallback, cost, and judge-based NMT-vs-final translation deltas.
  - Why: translation quality must be measured separately from transcript WER.
  - Contract touched: none. Internal benchmark harness only.
```

- [ ] **Step 2: Run the final module-level validation commands**

Run:

```powershell
cd apps/ai-engine
venv\Scripts\python.exe -m pytest tests/test_translation_revision_windowing.py tests/test_translation_revision_overlay.py tests/test_translation_finalization_budgeting.py tests/test_streaming_contracts.py tests/test_event_discipline.py -q

cd ..\backend-api
pnpm build
pnpm test -- translation-judge.spec.ts
```

Expected: PASS

- [ ] **Step 3: Run one end-to-end smoke through the existing evaluator**

Run:

```powershell
cd apps/backend-api
pnpm exec tsx scripts/e2e-youtube-pipeline-eval.ts --case-id chinese_kUzay3X1maA --output-dir ..\..\outputs\e2e-benchmarks\runs\translation-finalization-phase1-smoke
```

Expected: completes and writes:
- `translated_batch.first.json` unchanged as the provisional layer
- `final.json` with `metadata.translation_finalization`
- `evaluation.summary.json` with finalization timing, coverage, fallback, cost, judge fields, and per-segment provenance

- [ ] **Step 4: Commit**

```powershell
git add CONTRACTS.md apps/ai-engine/CHECKPOINT.md apps/backend-api/CHECKPOINT.md
git commit -m "docs: record translation finalization phase 1"
```

---

## Self-Review

- Spec coverage:
  - Hybrid multi-constraint windowing: covered in Task 2.
  - Translation-only invariant: covered in Tasks 1, 3, and 6.
  - Timeboxed finalization with fail-open completion: covered in Tasks 3 and 4.
  - Overlap conflict resolution: covered in Task 3.
  - Incremental phase-1 execution mode after stable translated windows: covered in Task 4.
  - Additive `translation_revisions/` artifact path: covered in Tasks 1, 4, and 6.
  - No backend/mobile runtime contract changes in phase 1: enforced throughout, documented in Task 6.
  - Benchmark latency/coverage/fallback/cost/judge metrics and per-segment provenance: covered in Task 5.
- Placeholder scan:
  - No `TODO`, `TBD`, or “similar to” references remain.
- Type consistency:
  - Plan uses one artifact name: `TranslationRevisionArtifact`.
  - Plan uses one final metadata name: `TranslationFinalizationMetadata`.
  - Plan uses one internal overlay candidate name: `OverlayCandidate`.

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-06-10-translation-finalization-phase1.md`. Two execution options:

**1. Subagent-Driven (recommended)** - I dispatch a fresh subagent per task, review between tasks, fast iteration

**2. Inline Execution** - Execute tasks in this session using executing-plans, batch execution with checkpoints

**Which approach?**
