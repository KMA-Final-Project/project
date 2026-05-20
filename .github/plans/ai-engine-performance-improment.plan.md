# AI Engine Performance Improvement Plan

> **Scope:** `apps/ai-engine` — pipeline throughput, latency, UX, and multi-instance support  
> **Goal:** Cut per-job processing time by ~40-60%, improve subtitle UX with shorter sentences, and enable dual-instance deployment on a single GPU.

---

## Phase 1 — Quick Wins & Removals (Low Risk, High Impact)

### Step 1.1: Remove LLM Homophone Correction

**Priority:** P0 — User request. Saves 2-5s per CJK batch (Ollama round-trip).

**What to change:**

- `src/async_pipeline.py` — In `_flush_cjk_buffer()` (~line 313-328), when `needs_merge()` returns `False`, the code currently calls `merger.correct_homophones(buf, context_style=context_style)` (line 327). **Replace this with a direct passthrough** — return `list(buf)` without calling the LLM.
- `src/core/semantic_merger.py` — The `correct_homophones()` method (lines 179-220) can be left in place (no deletion needed) but will no longer be called from the pipeline. Optionally mark it `@deprecated`.

**Behavior change:**

- CJK sentences that pass `needs_merge()=False` now skip the LLM entirely instead of getting homophone correction.
- CJK sentences that DO need merging still go through `merger.process()` which uses the CJK prompt (includes homophone correction in the same LLM call). This is acceptable since merge is already needed.

**Decision:** Keep `merger.process()` with its CJK prompt unchanged — the homophone hints in the merge prompt are free since the LLM call is already happening. Only eliminate the **standalone** homophone correction path.

---

### Step 1.2: Per-Stage Timing Instrumentation

**Priority:** P0 — Needed before any optimization to measure impact.

**What to change:**

- `src/core/smart_aligner.py` — Add `time.perf_counter()` around:
  - Total `process()` call (line 146)
  - Each `_transcribe_segment()` call (line 195) — accumulate total transcription time
  - Each `_add_phonemes()` call (line 239) — accumulate total phoneme time
  - Each `_split_cjk_words()` + `_apply_silence_splitting()` — accumulate post-processing time
  - Log a summary at end of `process()`: `"SmartAligner: transcription={X}s, phonemes={Y}s, post_proc={Z}s, overhead={W}s, total={T}s"`

- `src/async_pipeline.py` — Add timing around:
  - Each `_flush_cjk_buffer()` call (lines 368, 340)
  - Each `_translate_and_upload()` call — already partially timed for NMT (line 449), add total wall time
  - `consumer()` total time
  - Producer wait time (time spent blocked on `queue.put()` backpressure)
  - Log summary at end: `"Consumer: merge={X}s, nmt={Y}s, upload={Z}s, idle={W}s, total={T}s"`

- `src/main.py` — Add timing around the full `transcribe_translate()` call and log alongside existing profiler report.

**Output:** Structured `loguru` info lines with consistent prefix (e.g., `⏱️`) for easy grep/parsing. No schema change needed.

---

### Step 1.3: Audio Array Reuse

**Priority:** P1 — Eliminates a redundant `librosa.load()` that takes 1-3s for large files.

**Current state:**

- `vad_manager.py` loads audio via `librosa.load(path, sr=16000)` for VAD
- `smart_aligner.py` line 152 loads **the same file** again via `librosa.load(str(path), sr=16000)`

**What to change:**

- `src/core/smart_aligner.py` — Add an optional `audio_array: np.ndarray | None = None` parameter to `process()` (line 146). When provided, skip the `librosa.load()` on line 152 and use the passed array. When `None`, load as before (backward compat).
- `src/async_pipeline.py` — In the producer setup, the VAD step already produces audio. After VAD completes, pass the audio array to `pipeline.aligner.process(..., audio_array=audio_array)`.
- **Requires:** VADManager to expose the loaded audio array. Check if `vad_manager.py` already returns it or if we need to add a return value. The VAD step is called in `pipelines.py` `PipelineOrchestrator` — trace the call path.

**Risk:** Low — numpy arrays are memory-shared, not copied. The audio is already in memory.

---

## Phase 2 — SmartAligner Batching Fix (High Impact, Moderate Risk)

### Step 2.1: Batch Multiple VAD Segments into Whisper

**Priority:** P0 — Estimated 40-60% reduction in transcription time. This is the single biggest win.

**Current bottleneck:** `smart_aligner.py` lines 177-248. Each VAD segment (5-15s) is transcribed individually via `_transcribe_segment()` (line 195). The `BatchedInferencePipeline.transcribe()` API (line 265) receives a single audio array per call. The `batch_size` parameter controls internal sliding-window parallelism within that single audio, NOT cross-segment batching.

**Key insight:** `BatchedInferencePipeline.transcribe()` from faster-whisper is designed to handle one audio at a time with internal batching. True multi-segment batching requires **concatenating multiple short VAD segments into a single longer audio** before transcription, then splitting the results back.

**Proposed approach — Segment Concatenation with Silence Markers:**

1. **Group consecutive VAD segments** that use the same model (anchor language already known after first few segments). Group sizes of 3-5 segments (~30-60s total audio) balance throughput vs. memory.

2. **Concatenate audio arrays** with a small silence gap (0.3s of zeros at 16kHz = 4800 samples) between segments. Track the offset positions for timestamp remapping.

3. **Single `transcribe()` call** on the concatenated audio. The internal `batch_size` now operates on a longer audio, producing real batching benefits.

4. **Remap timestamps** in the returned segments back to the original per-VAD-segment timelines using the tracked offsets.

5. **Post-process per original segment** — apply CJK splitting, silence splitting, phoneme generation, and feed to `on_chunk` as before.

**What to change:**

- `src/core/smart_aligner.py`:
  - Add a `_group_segments()` method that groups VAD segments into batches of N (configurable, default 4). Segments using different models (pre-anchor vs post-anchor) should not be grouped together.
  - Add a `_concatenate_audio()` method that joins audio arrays with silence gaps and returns the concatenated array plus an offset map.
  - Add a `_remap_timestamps()` method that adjusts Whisper output timestamps back to original segment timelines.
  - Refactor the main loop (lines 177-248) to iterate over **groups** instead of individual segments. Inside each group: concatenate → transcribe once → remap → post-process each segment's results.
  - The anchor language detection (lines 200-228) needs to work on the first group's results rather than the first segment's results. Once anchor is set, all subsequent groups use the anchored model.

- `src/config.py`:
  - Add `SMART_ALIGNER_GROUP_SIZE: int = 4` setting (env: `AI_ALIGNER_GROUP_SIZE`)

**Risks and mitigations:**

- **Timestamp accuracy:** Whisper word-level timestamps are relative to audio start. With concatenation, we must precisely track segment boundaries. The silence gap (0.3s) acts as a natural boundary marker.
- **Anchor detection delay:** The first group must be processed before anchor is known. First group uses `language=None` (auto-detect). This is the same as current behavior for the first segment.
- **Edge case — last group:** May have fewer segments than `GROUP_SIZE`. Handle gracefully (just concatenate what's available).
- **Fallback mechanism:** If a group transcription fails, retry segments individually (current behavior).

**Validation:** Compare transcription output of batched vs. unbatched on the same audio file. Word-level timestamps should differ by <50ms. Use the phoneme and text output as quality gates.

---

### Step 2.2: Sentence Length Splitting

**Priority:** P1 — User request. Long sentences are bad for subtitle UX.

**Current state:** No maximum sentence length enforcement anywhere in the pipeline. Whisper can produce arbitrarily long segments. The only splitting is:

- Silence splitting: `_apply_silence_splitting()` — splits on >1.0s word gaps (line 384)
- CJK char splitting: breaks multi-char words into individual characters (cosmetic, not sentence-level)

**Proposed approach — Add a `_split_long_sentences()` post-processing step:**

1. **Place in pipeline:** After `_apply_silence_splitting()` and before `_add_phonemes()` in the SmartAligner loop (between current lines 237 and 239).

2. **Logic:**
   - For CJK sentences: split if `len(text) > MAX_CJK_CHARS` (suggested default: 25 characters)
   - For non-CJK sentences: split if `len(text.split()) > MAX_WORDS` (suggested default: 15 words)
   - Split at the word boundary closest to the midpoint (or at punctuation if available within the target zone).
   - Each sub-sentence inherits the appropriate subset of `words` with correct timestamps.

3. **Constants to add in `config.py`:**
   - `SUBTITLE_MAX_CJK_CHARS: int = 25`
   - `SUBTITLE_MAX_WORDS: int = 15`

**What to change:**

- `src/core/smart_aligner.py`:
  - Add `_split_long_sentences(self, sentence: Sentence) -> List[Sentence]` method
  - Call it in the main loop after silence splitting (line 237), before phoneme generation
  - The method uses `sentence.words` list to find split points respecting word boundaries
  - For CJK: count characters, split at nearest word boundary to midpoint
  - For non-CJK: count words, prefer splitting at punctuation (., !, ?, ;, —) if within ±3 words of midpoint, else split at midpoint

- `src/config.py`:
  - Add the two max-length settings

**Validation:** Run on a test file with known long sentences. Verify all resulting sentences are under the limits. Verify word-level timestamps are preserved correctly.

---

## Phase 3 — Consumer Pipeline Optimization (Moderate Impact)

### Step 3.1: Overlap NMT Translation with MinIO Upload

**Priority:** P2 — Saves ~0.5-1s per batch (network I/O overlap).

**Current state:** In `_translate_and_upload()` (async_pipeline.py line 429), translation and upload are strictly sequential:

1. NMT translate → 2. LLM refine (optional) → 3. Assign segment_index → 4. MinIO upload → 5. Publish event

**What to change:**

- `src/async_pipeline.py`:
  - Split `_translate_and_upload()` into `_translate()` and `_upload_batch()`.
  - `_translate()` does NMT + optional LLM refinement, returns translated sentences.
  - `_upload_batch()` does segment_index assignment, MinIO upload, event publishing.
  - In the consumer loop, after `_translate()` completes, start `_upload_batch()` as a fire-and-forget `asyncio.create_task()` while the consumer proceeds to the next chunk. Use an upload semaphore (max 2) to prevent unbounded upload backlog.

**Risk:** Upload failures become async. Need error handling in the upload task that logs and continues (uploads are retried by mobile via `/media/:id/artifacts` endpoint anyway).

---

### Step 3.2: Reduce Silence Split Threshold

**Priority:** P2 — Quick config change, improves sentence granularity.

**Current state:** `_apply_silence_splitting()` uses a hardcoded `1.0s` gap threshold (smart_aligner.py line 384).

**What to change:**

- `src/core/smart_aligner.py`: Extract `1.0` to a constant `SILENCE_SPLIT_GAP_S = 0.8` and reference it in `_apply_silence_splitting()`.
- `src/config.py`: Add `SILENCE_SPLIT_GAP: float = 0.8` (env: `AI_SILENCE_SPLIT_GAP`). Slightly lower than current 1.0s to produce more natural breaks.

**Validation:** Compare sentence counts before/after on test files. Should increase by ~10-20%.

---

## Phase 4 — VRAM Limiting & Dual-Instance Support (High Impact, Higher Risk)

### Step 4.1: Application-Level VRAM Limiting

**Priority:** P2 — User request for 2 instances on 1 GPU.

**Current state:** No VRAM limiting. Profiler shows ~16GB VRAM usage at peak (full `auto` mode with both Whisper models + NMT). Docker Compose has `count: all` GPU allocation with no memory limits. Docker Compose does NOT support per-GPU memory limits — must be done at application level.

**Strategy for dual-instance on single GPU:**

- Each instance gets ~8GB VRAM budget
- Use `turbo_only` or `full_only` model mode (not `auto`) — ~3-5GB for Whisper
- Use `int8` NMT compute type — ~1.7GB for NLLB
- Total per instance: ~5-7GB, leaving headroom

**What to change:**

- `src/config.py`:
  - Add `MAX_VRAM_FRACTION: float = 0.5` (env: `AI_MAX_VRAM_FRACTION`, default 0.5 for dual-instance)
  - Add `MAX_VRAM_MB: int = 0` (env: `AI_MAX_VRAM_MB`, 0 = use fraction instead)

- `src/main.py` — After prewarm but before job processing:

  ```
  torch.cuda.set_per_process_memory_fraction(settings.MAX_VRAM_FRACTION)
  ```

  This is a hard PyTorch-level limit that throws OOM if exceeded. Set it early, once.

- `docker-compose.yml` — Add a second service definition (`ai-engine-2`) with:
  - Same image
  - `CUDA_VISIBLE_DEVICES=0` (same GPU)
  - `AI_MAX_VRAM_FRACTION=0.5`
  - `WORKER_MODEL_MODE=turbo_only` (or `full_only` — one of each for quality balance)
  - `NMT_COMPUTE_TYPE=int8`
  - Different BullMQ queue consumer name to avoid duplicate processing
  - Different profiler output directory

- `src/core/nmt_translator.py` — In `__init__()` (line 65-90), after model load, add a VRAM usage assertion:
  ```
  if settings.MAX_VRAM_MB > 0:
      assert vram_mb < settings.MAX_VRAM_MB, f"NMT loaded {vram_mb}MB exceeding limit {settings.MAX_VRAM_MB}MB"
  ```

**Risks:**

- PyTorch `set_per_process_memory_fraction()` is per-process, not per-model. Two Docker containers on the same GPU each get their fraction.
- CTranslate2 (NMT) allocates VRAM outside PyTorch's allocator. The fraction limit only constrains PyTorch allocations (Whisper via faster-whisper). CTranslate2 VRAM is uncontrolled. Using `int8` quantization keeps it small (~1.7GB).
- If both instances run heavy inference simultaneously, GPU compute contention may reduce throughput below 2x a single instance. Expect ~1.5x effective throughput.

**Validation:** Deploy two instances, run concurrent jobs, monitor via hardware profiler. Verify no OOM crashes. Measure combined throughput vs single instance.

---

## Phase 5 — Polish & Validation

### Step 5.1: Benchmarking Script

**Priority:** P2 — Validates all changes.

**What to create:**

- `src/scripts/benchmark.py` — A standalone script that:
  1. Takes an audio file path as input
  2. Runs the full pipeline (VAD → SmartAligner → NMT) without BullMQ/MinIO
  3. Collects per-stage timing from Step 1.2 instrumentation
  4. Outputs a comparison-ready JSON: `{total_s, stages: {vad_s, transcription_s, phoneme_s, merge_s, nmt_s}, sentence_count, avg_sentence_length}`
  5. Can be run before/after changes for A/B comparison

### Step 5.2: CJK First-Batch Latency

**Priority:** P3 — Nice-to-have UX improvement.

**Current state:** First CJK batch triggers immediately (`chunks_since_cjk_flush >= 1`, line 358). But the SmartAligner chunk_size is 8 sentences, meaning 8 sentences must be produced before the first chunk arrives. With segment-by-segment processing, this takes several VAD segments.

**After Phase 2 batching fix:** Transcription will be faster, naturally reducing first-batch latency. Re-evaluate after Phase 2 whether further optimization is needed.

**If still needed:** Reduce `CHUNK_SIZE` from 8 to 4 for the first chunk only (add a `first_chunk_size` override).

---

## Relevant Files

| File                          | What to modify                                                                                              |
| ----------------------------- | ----------------------------------------------------------------------------------------------------------- |
| `src/core/smart_aligner.py`   | Batching refactor (2.1), sentence splitting (2.2), silence threshold (3.2), audio reuse (1.3), timing (1.2) |
| `src/async_pipeline.py`       | Remove homophone call (1.1), NMT/upload overlap (3.1), timing (1.2), audio passthrough (1.3)                |
| `src/core/semantic_merger.py` | No changes needed (homophone method stays, just uncalled)                                                   |
| `src/config.py`               | New settings: GROUP_SIZE, MAX_CJK_CHARS, MAX_WORDS, SILENCE_SPLIT_GAP, MAX_VRAM_FRACTION, MAX_VRAM_MB       |
| `src/main.py`                 | VRAM limiting init (4.1), timing (1.2)                                                                      |
| `src/core/nmt_translator.py`  | VRAM assertion (4.1)                                                                                        |
| `docker-compose.yml`          | Second instance definition (4.1)                                                                            |
| `src/scripts/benchmark.py`    | New file (5.1)                                                                                              |
| `src/pipelines.py`            | Audio array passthrough from VAD to SmartAligner (1.3)                                                      |

## Verification

0. **Baseline (Phase 0):** Run `pnpm test:youtube` with the English TED talk URL. Record total processing time, sentence count, and avg sentence length. This is the pre-optimization baseline.
1. **Unit:** Run existing `pytest tests/ -v` after each phase — no regressions
2. **Timing:** Compare benchmark.py output before/after Phase 1, Phase 2, Phase 3
3. **Quality:** Transcribe the same audio file before/after Phase 2 batching. Diff the text output — should be near-identical. Word timestamps should differ by <50ms.
4. **UX:** After Phase 2 (sentence splitting), verify no subtitle exceeds 25 CJK chars / 15 words
5. **VRAM:** After Phase 4, run two simultaneous jobs on one GPU. Hardware profiler should show each instance < 50% VRAM. No OOM crashes.
6. **E2E:** Re-run `pnpm test:youtube` after each phase. Compare processing time to baseline. Submit a job via BullMQ, verify `translated_batches` socket events arrive faster than before, `final.json` matches expected quality.

## Decisions

- **Phoneme generation stays mandatory** — no deprioritization (user confirmed)
- **Homophone correction removed only from standalone path** — merge prompt still hints at homophones when merge IS needed
- **Batching approach: concatenation with silence markers** — chosen over alternatives (multi-stream, async prefetch) because faster-whisper's BatchedInferencePipeline API accepts single audio arrays only
- **VRAM limiting via PyTorch fraction** — CTranslate2 is uncontrolled but small with int8. Acceptable trade-off.
- **Sentence splitting in SmartAligner** (not consumer) — keeps sentence boundaries consistent across all tiers (raw chunks, merged, translated)

---

## Phase 0 — E2E Test Script (Pre-requisite, Run Before Optimization)

> **Decision:** Before any performance work, validate the full pipeline end-to-end using a known English TED talk. Once this produces a good result, progressively test harder media (mixed languages, noisy audio, long files).

### Step 0.1: Create YouTube Submission Test Script

**Priority:** P0 — Must succeed before any optimization begins.  
**Test URL:** `https://www.youtube.com/watch?v=-moW9jvvMr4` (English TED talk)

**Script location:** `apps/backend-api/scripts/test-youtube-submit.ts`  
**Language:** TypeScript (matches existing scripts like `clean-test-env.ts`)

**What the script does (4 phases):**

1. **Setup test user** — Connect to Prisma, check if test user `test@bilingual.dev` exists. If not, create one with:
   - `bcrypt.hashSync('Test@123Ab', 12)` as password hash
   - `emailVerified: true`
   - Call the same `assignDefaultFreePlan` pattern from `auth.service.ts`:
     - Create `Subscription` row linked to `FREE_MONTHLY` variant with `monthlyQuotaSecondsSnapshot: 72000` (override to 20hrs to avoid quota issues during testing)
     - Set `user.currentSubscriptionId` to the new subscription
2. **Authenticate** — `POST http://localhost:3000/api/auth/login` with `{email: "test@bilingual.dev", password: "Test@123Ab"}` → extract `accessToken`

3. **Submit YouTube URL** — `POST http://localhost:3000/api/media/youtube` with:
   - Header: `Authorization: Bearer {accessToken}`
   - Body: `{url: "https://www.youtube.com/watch?v=-moW9jvvMr4"}`
   - Print response: `mediaId`, `jobId`, `title`, `status`

4. **Poll for completion** — Loop `GET http://localhost:3000/api/media/{mediaId}/status` every 5 seconds:
   - Print current `status`, `progress`, `currentStep`, `estimatedTimeRemaining`
   - On `COMPLETED`: print final artifact info from `artifacts` field, fetch and display `GET /media/{mediaId}/artifacts` (list all chunks, batches, final URL)
   - On `FAILED`: print `failReason` and exit with error code
   - Timeout after 10 minutes

**Dependencies (must be running):**

- PostgreSQL (from `infra/postgres/docker-compose.yml`)
- Redis (from `infra/redis/docker-compose.yml`)
- MinIO (from `infra/minio/docker-compose.yml`)
- Backend API (`pnpm start:dev` in `apps/backend-api`)
- Backend Worker (`pnpm worker:dev` in `apps/backend-api`)
- AI Engine (`python -m src.main` in `apps/ai-engine` or via Docker)

**Files to create:**

- `apps/backend-api/scripts/test-youtube-submit.ts` — Main test script

**Files to modify:**

- `apps/backend-api/package.json` — Add script: `"test:youtube": "tsx scripts/test-youtube-submit.ts"`

**Key patterns to follow (from existing `clean-test-env.ts`):**

- `import 'dotenv/config'` at top for env loading
- Direct Prisma client instantiation with `PrismaPg` adapter
- Use `fetch()` (Node 18+ built-in) for HTTP calls — no extra dependencies
- Use `bcryptjs` (already a dependency) for password hashing

### Step 0.2: Run and Validate

**After script creation:**

1. Ensure all infra is running (Postgres, Redis, MinIO)
2. Ensure backend API + worker are running
3. Ensure AI engine is running
4. Run `pnpm test:youtube` from `apps/backend-api`
5. Verify the full flow completes: QUEUED → VALIDATING → PROCESSING → COMPLETED
6. Inspect the `final.json` artifact — confirm English source subtitles + Vietnamese translations present
7. Check sentence lengths match current pipeline behavior (baseline before Phase 2 optimizations)

**Success criteria:**

- Script exits 0 with COMPLETED status
- `final.json` contains bilingual subtitles (English source, Vietnamese target)
- Sentences have valid timestamps (start < end, monotonically increasing)
- Total processing time is logged (baseline measurement)

---

## Excluded from Scope

- Whisper model fine-tuning or distillation
- Migration away from CTranslate2 NMT
- GPU upgrade or multi-GPU support
- Mobile-side changes
- Backend API changes (beyond the test script)
- LLM refinement path (controlled by `AI_ENABLE_LLM_REFINEMENT`, orthogonal to this plan)
