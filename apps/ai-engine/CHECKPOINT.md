# AI Engine - Checkpoint

> Last updated: 2026-05-25
> Maintained by: agents - update this file after every significant change.

## 1. Current Status

AI Engine is in the active V2.2 route-aware ASR state, and the Chinese source-transcript path now has an internal trust-gated Chinese-primary flow with deterministic mixed-script window profiling, structured trust-gate observability, sentence-level window repair boundaries, and an opt-in CPU-only Qwen3 forced-alignment timing overlay for validated LLM-rescued segments. The latest backend-submit E2E rerun now completes the benchmark Chinese case on `sensevoice_small` with `source_lang=zh` instead of silently publishing an English-owned transcript.

The module is a queue-driven Python GPU worker that consumes `ai-processing` jobs, downloads validated audio from MinIO, runs the V2.2 route-aware async pipeline, uploads streaming and final subtitle artifacts, updates PostgreSQL progress/status, and emits Redis Pub/Sub processing events.

The active production path is:

```text
main.py
  -> pipelines.py / run_v2_pipeline()
  -> async_pipeline.py
  -> AudioProcessor
  -> AudioInspector
  -> VADManager
  -> source-language hint/probe routing
  -> SmartAligner
  -> ASR provider routing
  -> SemanticMerger when needed
  -> NMTTranslator
  -> optional LLMProvider refinement
  -> MinIO chunks / translated_batches / final.json
```

English now defaults to a Distil-Whisper route that stays eligible for `during_asr`. The active Chinese route is SenseVoice with Whisper full fallback, but suspicious Chinese-prior jobs now force `after_asr`, hold public publication until transcript trust is established, and only release `chunks/`, `translated_batches/`, and `final.json` after the trusted transcript has been normalized, optionally repaired at sentence-window boundaries, and refined. Public artifacts, event names, queue semantics, and progress discipline stay unchanged.

Deprecated V1 paths must not be reintroduced.

## 2. Active Work

- [ ] Improve the first Chinese dialogue block through stricter LLM rescue examples and validation-safe punctuation recovery, without adding source-side placeholder text for colloquial `我是` / `是我` turns.
- [ ] Re-run the next targeted Chinese E2E after the prompt-only rescue pass and verify whether segments like `你好，我是。你是李雷吧？`, `对，是我。第一次见面。`, and `幸会，等很久了吗？` survive through translation cleanly.

## 3. Recently Completed

- 2026-06-05 — Added macOS-usable process-tree profiling and validated the Kim vocal-isolation model cache.
  - Status: Working
  - Changed: Extended `src/utils/hardware_profiler.py` so reports now include execution context (`DEVICE`, host platform, NVML/MPS availability) plus process-tree CPU, RSS, thread-count, and child-process metrics that work on macOS even when NVML is unavailable. Updated `src/scripts/benchmark_suite.py` to export the richer hardware metrics. Also explicitly warmed the configured `audio-separator` vocal-isolation path and confirmed `temp/models/Kim_Vocal_2.onnx` is downloaded and loadable from the AI engine model cache.
  - Why: The previous profiler produced misleading Apple-Silicon output (`GPU underutilized`, `0 MB VRAM free`) because it only knew how to read NVIDIA NVML telemetry. That made Mac-vs-PC performance comparisons harder than they needed to be. Separately, the music-mode code really was configured for `Kim_Vocal_2.onnx`, so the cache needed to be verified instead of assumed.

- 2026-05-25 — Integrated early Chinese word segmentation into the live Tier 2 batch path.
  - Status: Working
  - Changed: Added `src/core/chinese_word_segmenter.py` using `jieba` precise-mode tokenization to regroup character-level Chinese and mixed-script `sentence.words` into lexical tokens during `_translate_batch()` in `src/async_pipeline.py`, before `TranslatedBatch` upload and before final export reuse. Added `AI_CHINESE_WORD_SEGMENTATION_ENABLED` as a kill switch, refreshed Chinese phonetics after regrouping so `word.phoneme` / `sentence.phonetic` stay aligned with the new tokens, and added focused coverage in `tests/test_chinese_word_segmenter.py` plus a Tier 2 regression in `tests/test_qwen3_forced_alignment.py`.
  - Why: Character-level SenseVoice-style words were reaching `translated_batches/` unchanged, so the mobile player rendered fractured Chinese like `我  们` and future word-tap lookup would only see isolated characters instead of compounds such as `我们` or `橱柜`.
  - Contract touched: Artifact | Language
  - Validation: `venv\Scripts\python.exe -m py_compile src\core\chinese_word_segmenter.py src\async_pipeline.py tests\test_chinese_word_segmenter.py tests\test_qwen3_forced_alignment.py tests\test_streaming_contracts.py`; `venv\Scripts\python.exe -m pytest tests\test_chinese_word_segmenter.py tests\test_qwen3_forced_alignment.py tests\test_streaming_contracts.py -q`
  - Follow-up: Punctuation is intentionally still serialized as standalone tokens in v1 so lookup keys and pinyin stay clean. If the remaining punctuation gap on mobile is unacceptable, solve that as a renderer concern instead of concatenating punctuation into lexical `word.word` values.

- 2026-05-24 — Moved global Qwen retiming and Latin token merging into the live Tier 2 batch path so progressive artifacts match `final.json`.
  - Status: Working
  - Changed: Repositioned the `qwen3_forced_after_llm` pass inside `_translate_batch()` in `src/async_pipeline.py`, immediately after validated text/translation assignment and `segment_index` population but before `TranslatedBatch` serialization/upload. The same sentence objects now feed both `translated_batches/{index}.json` and `final.json`, so the deterministic Latin word merger and CPU Qwen timing overlay are visible during streaming instead of only at export time. Added a recording-batch regression in `tests/test_qwen3_forced_alignment.py` that verifies the uploaded Tier 2 artifact already carries the retimed Chinese segment state.
  - Why: The previous final-export hook fixed only `final.json`, which left live progressive playback on the mobile client stuck with smeared timings and shattered English word tokens until 100% completion.
  - Validation: `venv\Scripts\python.exe -m py_compile src\async_pipeline.py tests\test_qwen3_forced_alignment.py`; `venv\Scripts\python.exe -m pytest tests\test_qwen3_forced_alignment.py -q`; `venv\Scripts\python.exe -m pytest tests\test_chinese_batch_llm_translator.py -q`; `venv\Scripts\python.exe -m pytest tests\test_streaming_contracts.py -q`; `venv\Scripts\python.exe -m pytest tests\test_event_discipline.py -q`; `.\scripts\run-e2e-youtube-pipeline.ps1` with `AI_CHINESE_ALIGNMENT_STRATEGY=qwen3_forced_after_llm`, `AI_QWEN3_FORCE_ALIGNER_DEVICE=cpu`, and `AI_QWEN3_FORCE_ALIGNER_ROUTE_IDS=sensevoice_small`, which produced `outputs/e2e-youtube-pipeline/20260524_015621/`.
  - Follow-up: The progressive Tier 2 path is now in sync with `final.json`, including merged Latin tokens in `translated_batch.first.json`, but the global per-batch CPU pass still costs about `59.4s` of extra forced-alignment time on the 526-second Chinese benchmark. Any future optimization work should focus on wall-clock reduction or selective gating, not on timing correctness.

- 2026-05-24 — Promoted Qwen forced alignment to a final-export post-processing pass and added deterministic Latin token merging for mixed-script karaoke UX.
  - Status: Working
  - Changed: Refactored `src/async_pipeline.py` so `AI_CHINESE_ALIGNMENT_STRATEGY=qwen3_forced_after_llm` now applies the CPU Qwen3 forced-aligner to the complete zh/yue `all_sentences` list immediately before `final.json` serialization instead of only inside the Chinese LLM rescue batch branch. Added a text-guided word merger that collapses single-character Latin runs in `sentence.words` into coherent tokens such as `First`, `blind`, and `date` before final retiming, while preserving the existing `Sentence` / `Word` schema. Updated `tests/test_qwen3_forced_alignment.py` so the final-pass behavior, fallback coverage, and mixed-script Latin merge path are exercised directly.
  - Why: The earlier Route 3 slice only retimed 10 rescued segments, so most of the Chinese timeline still shipped with SenseVoice’s smeared timings. The mobile karaoke UX also remained poor on mixed-script segments because English words were still serialized as letter-by-letter tokens that all shared one timestamp range.
  - Validation: `venv\Scripts\python.exe -m py_compile src\async_pipeline.py tests\test_qwen3_forced_alignment.py`; `venv\Scripts\python.exe -m pytest tests\test_qwen3_forced_alignment.py -q`; `venv\Scripts\python.exe -m pytest tests\test_chinese_batch_llm_translator.py -q`; `venv\Scripts\python.exe -m pytest tests\test_streaming_contracts.py -q`; `venv\Scripts\python.exe -m pytest tests\test_event_discipline.py -q`; `venv\Scripts\python.exe -c "from src.core.pipeline import PipelineOrchestrator; print('OK')"`; `.\scripts\run-e2e-youtube-pipeline.ps1` with `AI_CHINESE_ALIGNMENT_STRATEGY=qwen3_forced_after_llm`, `AI_QWEN3_FORCE_ALIGNER_DEVICE=cpu`, and `AI_QWEN3_FORCE_ALIGNER_ROUTE_IDS=sensevoice_small`, which produced `outputs/e2e-youtube-pipeline/20260524_011416/`.
  - Follow-up: The global final pass now aligned all 113 final Chinese segments with no downgrades, but it added roughly 59 seconds of CPU forced-alignment time and raised the Chinese E2E wall time to about 200.5 seconds. Tier 2 `translated_batches` still keep their pre-export timings by design, so only `final.json` reflects the global Qwen retiming and merged Latin karaoke tokens.

- 2026-05-24 — Fixed the Qwen provider adapter to unwrap `ForcedAlignResult.items`, enabling live timestamp overlays in the Chinese E2E path.
  - Status: Working
  - Changed: Updated `src/core/qwen3_forced_aligner.py` so `_coerce_items()` no longer treats the top-level `qwen-asr` result container as an aligned token. The provider now unwraps and flattens nested `.items` lists before extracting `text`, `start_time`, and `end_time`, and the provider regression in `tests/test_qwen3_forced_alignment.py` now uses the real observed container shape instead of a simplified nested list.
  - Why: The new per-segment diagnostics proved the validator was receiving `aligned_units=['']` with `match_rate=0.000` even though the CPU aligner executed successfully. Raw-item introspection then showed the package was returning `ForcedAlignResult(items=[ForcedAlignItem(...)])`, so the adapter was parsing the wrong object level and silently discarding all token text.
  - Validation: `venv\Scripts\python.exe -m py_compile src\core\qwen3_forced_aligner.py src\async_pipeline.py tests\test_qwen3_forced_alignment.py`; `venv\Scripts\python.exe -m pytest tests\test_qwen3_forced_alignment.py -q`; `.\scripts\run-e2e-youtube-pipeline.ps1` with `AI_CHINESE_ALIGNMENT_STRATEGY=qwen3_forced_after_llm`, `AI_QWEN3_FORCE_ALIGNER_DEVICE=cpu`, and `AI_QWEN3_FORCE_ALIGNER_ROUTE_IDS=sensevoice_small`, which produced `outputs/e2e-youtube-pipeline/20260524_004627/`.
  - Follow-up: The forced-alignment timing experiment is now operational in live E2E, with `attempted_segments=10`, `aligned_segments=10`, and `downgraded_segments=0` in `outputs/e2e-youtube-pipeline/20260524_004627/logs/ai-engine.err.log`. Remaining Chinese quality issues are now upstream transcript/rescue wording problems rather than forced-alignment plumbing failures.

- 2026-05-24 — Added per-segment Qwen forced-alignment diagnostics and confirmed the parsed aligner output is text-empty in live E2E.
  - Status: Partial
  - Changed: Added targeted diagnostics in `src/async_pipeline.py` for downgraded Qwen forced-alignment attempts. The worker now logs each failed segment's source text, baseline token list, normalized baseline/aligned canonical strings, raw aligned-unit text preview, and effective match rate.
  - Why: Aggregate counters were no longer sufficient. After relaxing the validator multiple times, the next step had to prove whether the remaining failures were caused by validator strictness, bad source text, or incorrect parsing of the aligner output itself.
  - Validation: `venv\Scripts\python.exe -m py_compile src\async_pipeline.py`; `.\scripts\run-e2e-youtube-pipeline.ps1` with `AI_CHINESE_ALIGNMENT_STRATEGY=qwen3_forced_after_llm`, `AI_QWEN3_FORCE_ALIGNER_DEVICE=cpu`, and `AI_QWEN3_FORCE_ALIGNER_ROUTE_IDS=sensevoice_small`, which produced `outputs/e2e-youtube-pipeline/20260524_002106/`.
  - Follow-up: The new diagnostics in `outputs/e2e-youtube-pipeline/20260524_002106/logs/ai-engine.err.log` show every attempted segment failing with `match_rate=0.000`, `aligned_chars=0`, and `aligned_units=['']` while the baseline canonical text is non-empty. That means the current blocker is no longer validator logic; the provider integration is extracting empty text from the real `qwen-asr` alignment result. The next fix should inspect the raw result object shape inside `src/core/qwen3_forced_aligner.py` and correct `_coerce_items()` to read the actual text/timestamp fields returned by the package.

- 2026-05-23 — Replaced all-or-nothing Qwen character identity checks with partial monotonic LCS overlay, but live Chinese E2E still falls below the match-rate floor.
  - Status: Partial
  - Changed: Refactored `src/async_pipeline.py` so the Qwen overlay validator no longer rejects a segment for canonical length or exact string mismatches. The baseline word stream is now expanded into a canonical character/timing map, the Qwen stream is expanded likewise, and the two are matched with a monotonic LCS pass. Matched characters receive Qwen timestamps, unmatched characters keep their baseline timings, and only low overall match coverage or timeline inversion downgrades the segment. Updated `tests/test_qwen3_forced_alignment.py` so one regression proves partial overlays survive a dropped/mutated character while another proves low match-rate still downgrades safely.
  - Why: Real forced-aligner output can omit weak particles or truncate characters at the VAD boundary; discarding the entire segment for those drops prevented the experiment from applying any useful timestamps in production.
  - Validation: `venv\Scripts\python.exe -m py_compile src\async_pipeline.py tests\test_qwen3_forced_alignment.py`; `venv\Scripts\python.exe -m pytest tests\test_qwen3_forced_alignment.py -q`; `venv\Scripts\python.exe -m pytest tests\test_chinese_batch_llm_translator.py -q`; `.\scripts\run-e2e-youtube-pipeline.ps1` with `AI_CHINESE_ALIGNMENT_STRATEGY=qwen3_forced_after_llm`, `AI_QWEN3_FORCE_ALIGNER_DEVICE=cpu`, and `AI_QWEN3_FORCE_ALIGNER_ROUTE_IDS=sensevoice_small`, which produced `outputs/e2e-youtube-pipeline/20260523_235332/`.
  - Follow-up: The fresh E2E bundle still reports `attempted_segments=10`, `aligned_segments=0`, and `failure_reasons={'nmt': 102, 'match_rate_too_low': 10, 'partial_invalid': 1}`. The next effective debugging slice is to log the actual Qwen text-unit outputs for those 10 rescued segments, because the blocker has moved from validator strictness to the aligner returning too little matching text to clear even a fuzzy 60% subsequence threshold.

- 2026-05-23 — Forced-align character mapper now propagates whole-token Latin timing and explicit NFKC+casefold normalization, but live Chinese E2E still does not overlay Qwen timings.
  - Status: Partial
  - Changed: Tightened `src/async_pipeline.py` so `_normalize_alignment_characters()` explicitly compacts after NFKC and then casefolds, and `_aligned_char_timing_map()` now expands multi-character aligner units into per-character records that all inherit the parent unit boundary instead of subdividing the span. Extended `tests/test_qwen3_forced_alignment.py` to cover a full-width Latin source token (`Ｆirst`) aligned against uppercase word-level Qwen output (`FIRST`) while preserving the original baseline letter-by-letter `sentence.words` layout.
  - Why: The previous live run had already eliminated `unit_count_mismatch`, but the user wanted the Latin word-to-character expansion rule made explicit so mixed-script units like `First` could never collapse into a single timing slot or fail due to full-width/case differences.
  - Validation: `venv\Scripts\python.exe -m py_compile src\async_pipeline.py tests\test_qwen3_forced_alignment.py`; `venv\Scripts\python.exe -m pytest tests\test_qwen3_forced_alignment.py -q`; `venv\Scripts\python.exe -m pytest tests\test_chinese_batch_llm_translator.py -q`; `.\scripts\run-e2e-youtube-pipeline.ps1` with `AI_CHINESE_ALIGNMENT_STRATEGY=qwen3_forced_after_llm`, `AI_QWEN3_FORCE_ALIGNER_DEVICE=cpu`, and `AI_QWEN3_FORCE_ALIGNER_ROUTE_IDS=sensevoice_small`, which produced `outputs/e2e-youtube-pipeline/20260523_232749/`.
  - Follow-up: The fresh E2E bundle still reports `attempted_segments=10`, `aligned_segments=0`, `failure_reasons={'nmt': 102, 'char_length_mismatch': 8, 'char_text_mismatch': 2, 'partial_invalid': 1}`. The next effective step is no longer another normalization guess; we need debug captures of the actual Qwen-returned text units for the attempted rescued segments to see exactly which characters are missing or rewritten relative to the validated canonical source text.

- 2026-05-23 — Replaced Qwen overlay token-count validation with canonical character-index mapping, but live Chinese E2E still downgrades all attempted segments.
  - Status: Partial
  - Changed: Refactored `src/async_pipeline.py` so Qwen forced-alignment validation no longer compares `sentence.words` token counts against aligner token counts. The overlay path now builds a punctuation/space-stripped canonical character stream from `sentence.text`, validates both the baseline word stream and Qwen units against that canonical text, derives per-character timing slices from aligner units, and remaps those timings back onto the original `sentence.words` sequence while keeping punctuation-only tokens inherited from the preceding spoken token. Extended `tests/test_qwen3_forced_alignment.py` with a mixed-granularity regression covering letter-by-letter baseline tokens versus word-level aligner tokens.
  - Why: The punctuation-only normalization fix removed one false-positive source of `unit_count_mismatch`, but the live worker still failed because SenseVoice baseline words and Qwen aligned units can segment the same spoken text at different granularities, especially around mixed-script or multi-character chunks.
  - Validation: `venv\Scripts\python.exe -m py_compile src\async_pipeline.py tests\test_qwen3_forced_alignment.py`; `venv\Scripts\python.exe -m pytest tests\test_qwen3_forced_alignment.py -q`; `venv\Scripts\python.exe -m pytest tests\test_chinese_batch_llm_translator.py -q`; `.\scripts\run-e2e-youtube-pipeline.ps1` with `AI_CHINESE_ALIGNMENT_STRATEGY=qwen3_forced_after_llm`, `AI_QWEN3_FORCE_ALIGNER_DEVICE=cpu`, and `AI_QWEN3_FORCE_ALIGNER_ROUTE_IDS=sensevoice_small`, which produced `outputs/e2e-youtube-pipeline/20260523_230448/`.
  - Follow-up: The fresh E2E bundle now reports `attempted_segments=8`, `aligned_segments=0`, `failure_reasons={'nmt': 102, 'char_length_mismatch': 7, 'char_text_mismatch': 1, 'partial_invalid': 3}`. The next slice should capture the real Qwen returned character stream for those 8 rescued segments so we can see whether Qwen is dropping characters, merging numerals/Latin differently, or rewriting the validated text before timestamps can be overlaid.

- 2026-05-23 — Normalized punctuation-only baseline tokens in Qwen overlay validation, but live Chinese E2E still downgrades every attempted segment.
  - Status: Partial
  - Changed: Updated `src/async_pipeline.py` so `_apply_qwen3_forced_alignment()` now filters punctuation-only baseline `sentence.words` tokens out of the count/order validator, applies Qwen timings only onto spoken tokens, and lets punctuation-only tokens inherit the preceding spoken token's aligned interval. Added a focused regression in `tests/test_qwen3_forced_alignment.py` proving punctuation-only baseline tokens no longer cause a false `unit_count_mismatch`.
  - Why: The first live Qwen rerun showed all 10 attempted Chinese segments downgrading on `unit_count_mismatch`, and the saved artifacts confirmed the baseline word arrays include standalone punctuation tokens such as `，`, `。`, and `？`.
  - Validation: `venv\Scripts\python.exe -m py_compile src\config.py src\async_pipeline.py tests\test_qwen3_forced_alignment.py`; `venv\Scripts\python.exe -m pytest tests\test_qwen3_forced_alignment.py -q`; `venv\Scripts\python.exe -m pytest tests\test_chinese_batch_llm_translator.py -q`; `.\scripts\run-e2e-youtube-pipeline.ps1` with `AI_CHINESE_ALIGNMENT_STRATEGY=qwen3_forced_after_llm`, `AI_QWEN3_FORCE_ALIGNER_DEVICE=cpu`, and `AI_QWEN3_FORCE_ALIGNER_ROUTE_IDS=sensevoice_small`, which produced `outputs/e2e-youtube-pipeline/20260523_221638/`.
  - Follow-up: The fresh E2E bundle still reports `attempted_segments=10`, `aligned_segments=0`, and `failure_reasons={'nmt': 102, 'unit_count_mismatch': 10, 'partial_invalid': 1}`, so the remaining mismatch is not explained by standalone punctuation alone. Capture the real Qwen returned unit streams for those 10 rescued segments next and compare them against the spoken baseline token sequence to isolate the next normalization gap.

- 2026-05-23 — Added Route 3 CPU Qwen3 forced alignment after validated Chinese LLM rescue.
  - Status: Working
  - Changed: Added internal config for `AI_CHINESE_ALIGNMENT_STRATEGY`, `AI_QWEN3_FORCE_ALIGNER_*`, and the lazy `qwen-asr>=0.0.6` dependency; added `src/core/qwen3_forced_aligner.py` as a CPU-only lazy provider around `Qwen3ForcedAligner`; wired `src/async_pipeline.py` to retime only validated `llm_rescue` / valid `llm_rescue_partial` Chinese segments on allowlisted routes after text validation but before Tier 2 upload; preserved text, translation, phonetic, confidence, `segment_index`, artifacts, and event ordering on all downgrade paths; surfaced `chinese_forced_alignment` run metrics; extended `src/scripts/benchmark_suite.py`; and added focused coverage in `tests/test_qwen3_forced_alignment.py`.
  - Why: The opening Chinese dialogue still needed a narrow timing-quality experiment that could improve rescued segments without changing public contracts, ASR routing, or the single Ollama rescue call.
  - Validation: `venv\Scripts\python.exe -m py_compile src\config.py src\async_pipeline.py src\main.py src\core\qwen3_forced_aligner.py src\scripts\benchmark_suite.py tests\test_qwen3_forced_alignment.py`; `venv\Scripts\python.exe -c "from src.core.pipeline import PipelineOrchestrator; print('OK')"`; `venv\Scripts\python.exe -m pytest tests\test_qwen3_forced_alignment.py -q`; `venv\Scripts\python.exe -m pytest tests\test_chinese_batch_llm_translator.py -q`; `venv\Scripts\python.exe -m pytest tests\test_streaming_contracts.py -q`; `venv\Scripts\python.exe -m pytest tests\test_event_discipline.py -q`.
  - Follow-up: Install `qwen-asr` wherever this slice should run and rerun the next Chinese E2E bundle with `AI_CHINESE_ALIGNMENT_STRATEGY=qwen3_forced_after_llm` to measure whether per-segment CPU retiming materially improves the rescued dialogue timing without unacceptable wall-clock cost.

- 2026-05-23 — Explicit Chinese Routing Override. Status: Working.
  - Changed: Modified `run_v2_pipeline_async` in `src/async_pipeline.py` to check if `local_source_hint` starts with `"zh"`. If so, it sets `route_override = "sensevoice_small"`. This is passed to route decision and ASR processing, forcing the certified Chinese-primary route and skipping language probing entirely.
  - Why: Users manually declaring Chinese must bypass the language probe and route onto the certified `sensevoice_small` route to avoid misrouting and translation pitfalls.
  - Validation: `venv\Scripts\python.exe -m pytest tests/test_hybrid_routing.py` (3 passed), `venv\Scripts\python.exe -m pytest tests/test_event_discipline.py` (5 passed).

- 2026-05-23 — Reverted semantic placeholder insertion for colloquial Chinese meeting turns and moved the interpretation back to prompt-driven rescue.
  - Status: Working
  - Changed: Updated `src/core/chinese_primary_refiner.py` so the opening-dialogue cleanup no longer mutates `我是你是` into an ellipsis placeholder form; the refiner now stays source-preserving for that colloquial turn family while still applying deterministic punctuation-only or high-confidence lexical repairs such as `对，是我。第一次见面。` and `幸会，等很久了吗？`. Tightened `src/core/prompts.py` with explicit colloquial-dialogue rules and examples teaching that `我是` / `是我` can be complete standalone clauses, and updated the Chinese rescue and pipeline tests in `tests/test_chinese_primary_refiner.py` and `tests/test_chinese_batch_llm_translator.py`.
  - Why: The previous placeholder form `我是……` encoded the wrong linguistic assumption, damaged downstream LLM context, and violated the principle that the refiner must not invent spoken lexical content. Boundary interpretation belongs in the adaptive rescue layer, while the validator continues to enforce source-token preservation.
  - Contract touched: Language
  - Validation: `venv\Scripts\python.exe -m py_compile src\core\chinese_primary_refiner.py src\core\prompts.py tests\test_chinese_primary_refiner.py tests\test_chinese_batch_llm_translator.py`; `venv\Scripts\python.exe -m pytest tests\test_chinese_primary_refiner.py tests\test_chinese_batch_llm_translator.py -q --maxfail=1 -k "not test_async_pipeline_uses_llm_rescue_for_flagged_chinese_batch" --basetemp temp\pytest-zh-dialogue-revert-v2` passed with `25 passed, 1 deselected, 1 warning`; direct invocation of `test_async_pipeline_uses_llm_rescue_for_flagged_chinese_batch` via `pytest.MonkeyPatch` and a manual temp directory passed in `0.01s`.
  - Follow-up: Re-run the next Chinese E2E bundle and verify whether the prompt-only interpretation is enough to keep the colloquial meeting lines structurally correct without reintroducing semantic source edits.

- 2026-05-23 — Narrowed SenseVoice radar rescue windows and added partial per-segment fallback acceptance.
  - Status: Working
  - Changed: Refined `src/core/chinese_batch_llm_translator.py` so hard-radar rescue no longer sends broad mixed dialogue windows when a smaller flagged run is sufficient; contiguous hard-jam runs are now isolated more tightly, and LLM validation now preserves source-valid segments while falling back only the mutated ones instead of discarding the whole window. Updated `tests/test_chinese_batch_llm_translator.py` to cover hard-radar window carving, partial acceptance, and the pipeline prompt path.
  - Why: The first SenseVoice Chinese E2E run proved the new radar path was active but still unusable for the opening dialogue because one mutated source segment caused the entire rescue window to fall back to bad NMT output. The next pass had to recover the valid question/meeting lines without trusting mutated source text.
  - Contract touched: Language
  - Validation: `venv\Scripts\python.exe -m py_compile src\core\chinese_batch_llm_translator.py tests\test_chinese_batch_llm_translator.py src\async_pipeline.py`; `venv\Scripts\python.exe -m pytest tests\test_chinese_batch_llm_translator.py -q --maxfail=1 -k "not test_async_pipeline_uses_llm_rescue_for_flagged_chinese_batch" --basetemp temp\pytest-zh-radar-no-async2` passed with `16 passed, 1 deselected`; direct invocation of `test_async_pipeline_uses_llm_rescue_for_flagged_chinese_batch` via `pytest.MonkeyPatch` passed; `.\scripts\run-e2e-youtube-pipeline.ps1` produced `outputs/e2e-youtube-pipeline/20260523_150300/`, where the opening Chinese question now appears as `请问，你是王静吗？ -> Bạn có phải là Vương靜 không?` instead of the older NMT failure `Xin hãy giữ bình tĩnh.`
  - Follow-up: The jammed source line `你好，我是你是李雷吧。` still mutates under LLM rescue and correctly falls back, so the next fix should target source-side lexical/turn repair for that exact segment before translation rather than broadening LLM trust.

- 2026-05-23 — Added SenseVoice-scoped Chinese linguistic radar and prompt-only `[split_hint]` rescue hints.
  - Status: Working
  - Changed: Extended `src/core/chinese_batch_llm_translator.py` with a conservative regex radar for internal Chinese dialogue segmentation jams, added prompt payload fields `raw_text`, `text_with_hints`, and optional `radar_flags`, inserted `[split_hint]` only for configured SenseVoice Chinese routes with per-segment and per-batch caps, added normalized hint-leak auditing plus hint stripping before canonical source comparison, and threaded the active route into `src/async_pipeline.py` so the radar stays scoped to the live Chinese route.
  - Why: Trusted SenseVoice Chinese batches were still reaching the LLM rescue path with jammed internal turn boundaries like `你好我是你是李雷吧`, which made punctuation restoration brittle. The fix needed to stay conservative, route-scoped, and prompt-internal so no hint token could leak into public subtitle artifacts.
  - Contract touched: Language
  - Validation: `venv\Scripts\python.exe -m py_compile src\config.py src\async_pipeline.py src\core\prompts.py src\core\chinese_batch_llm_translator.py tests\test_chinese_batch_llm_translator.py`; `venv\Scripts\python.exe -m pytest tests\test_chinese_batch_llm_translator.py -q --maxfail=1 -k "not test_async_pipeline_uses_llm_rescue_for_flagged_chinese_batch" --basetemp temp\pytest-zh-radar-no-async` passed with `15 passed, 1 deselected`; direct invocation of `test_async_pipeline_uses_llm_rescue_for_flagged_chinese_batch` via `pytest.MonkeyPatch` and a manual temp directory passed after pytest's known Windows `tmp_path` cleanup issue was bypassed.
  - Follow-up: Keep the radar conservative and review future Chinese E2E bundles for over-splitting before expanding the route allowlist beyond `sensevoice_small`.

- 2026-05-23 — Stabilized Paraformer as a configurable Chinese default route for controlled E2E runs.
  - Status: Working
  - Changed: Added `AI_CHINESE_RECOVERY_ROUTE_IDS` in `src/config.py` as an optional override and changed its default behavior so the Chinese trust-gated recovery ladder derives from the current Chinese default route plus enabled safe fallbacks instead of hardcoded SenseVoice assumptions; updated `src/async_pipeline.py` to honor the configured recovery order after the selected Chinese route; generalized final-stage trust handling away from a Whisper-specific stage name in `src/core/transcript_trust_gate.py`; and added focused routing/trust tests proving `AI_ASR_DEFAULT_ROUTE_ZH=paraformer_zh` becomes the first Chinese recovery route when the initial probe still misroutes to English.
  - Why: Paraformer was already implemented as a provider, but the system still treated it as benchmark-only because the Chinese trust path was implicitly wired around SenseVoice-first recovery. Flipping `AI_ASR_DEFAULT_ROUTE_ZH` alone was therefore not a stable E2E configuration seam whenever the initial probe chose an English route first.
  - Validation: `venv\Scripts\python.exe -m py_compile src/config.py src/async_pipeline.py src/core/transcript_trust_gate.py tests/test_asr_routing.py tests/test_chinese_trust_gate.py`; `venv\Scripts\python.exe -m pytest tests/test_asr_routing.py tests/test_chinese_trust_gate.py tests/test_asr_provider_contract.py -q --maxfail=1 --basetemp temp\pytest-paraformer-route`
  - Follow-up: Run `.\scripts\run-e2e-youtube-pipeline.ps1` with `AI_ASR_DEFAULT_ROUTE_ZH=paraformer_zh` and inspect whether Paraformer remains a viable evaluation route on the current Chinese YouTube case or still degrades too much versus SenseVoice.

- 2026-05-22 — Added selective Chinese LLM batch rescue and proved it on the live backend-submit opening batch.
  - Status: Working
  - Changed: Added `src/core/chinese_batch_llm_translator.py` and extended `src/core/llm_provider.py` plus `src/core/prompts.py` so trusted Chinese batches can selectively call local Ollama `qwen2.5:7b-instruct` with structured JSON output for punctuation-preserving source display text plus Vietnamese translation; wired the strategy into `src/async_pipeline.py` as a Chinese-only fallback-free branch alongside deterministic NMT; added deterministic risk metrics, exact canonical source-preservation validation, and mixed-script opener window splitting so a leading bilingual gloss line is treated as context while the following compact Chinese dialogue block is eligible for LLM rescue.
  - Why: The real app-path E2E runs showed that the opening Chinese dialogue was no longer misrouted to English ASR, but deterministic NMT still collapsed short trusted dialogue like `请问你是王静吗？` into unrelated Vietnamese despite correct Chinese source ownership. A full Chinese-wide LLM replacement was too expensive, so the fix had to be selective and batch-local.
  - Validation: `& .\apps\ai-engine\venv\Scripts\python.exe -m py_compile apps\ai-engine\src\config.py apps\ai-engine\src\core\prompts.py apps\ai-engine\src\core\llm_provider.py apps\ai-engine\src\core\chinese_batch_llm_translator.py apps\ai-engine\tests\test_chinese_batch_llm_translator.py`; `& .\apps\ai-engine\venv\Scripts\python.exe -m pytest apps\ai-engine\tests\test_chinese_batch_llm_translator.py -q --maxfail=1 --basetemp temp\pytest-zh-llm-trigger3` with all assertions passing before the known Windows pytest tempdir cleanup permission failure; `.\scripts\run-e2e-youtube-pipeline.ps1` produced `outputs/e2e-youtube-pipeline/20260522_232435/`, where `ai-engine.err.log` shows `Chinese batch translation 0: 8 segments (llm_batches=1, llm_fallbacks=0)` and the saved Chinese `evaluation.summary.json` now corrects the opening line `请问你是王静吗？ -> Xin hỏi bạn là Vương Tĩnh phải không?`.
  - Follow-up: Keep improving trusted Chinese source lexical quality for lines like `你好，我是你是李雷吧。` and `信会等很久了吗？`, and decide whether those should be handled by additional selective LLM rescue windows or a separate source-text repair stage before translation.

- 2026-05-22 — Added early-window Chinese candidate reconciliation and provider-level mixed-script sentence building.
  - Status: Working
  - Changed: Updated `src/core/subtitle_text.py` so provider-level mixed CJK+Latin sentences keep readable Latin spacing instead of collapsing everything into `''.join(tokens)` whenever Han characters appear; added `src/core/chinese_candidate_reconciler.py`; and wired `src/async_pipeline.py` to keep prior Chinese candidate outputs during trust-gated recovery so a trusted `whisper_full` transcript can patch its opening window with richer overlapping content from an earlier route such as `sensevoice_small` instead of discarding that earlier candidate completely.
  - Why: The saved E2E bundle `outputs/e2e-youtube-pipeline/20260522_140934/` showed that the remaining losses were already present in `chunk.first.json`, not introduced by final export or translation: `第一次相亲 first blind date` had collapsed to `第一次相亲。`, and the first `你好` greeting before `请问你是王静吗?` was already missing. The trusted route for that run was `whisper_full`, so the real issue was whole-route winner selection without any segment-level recovery when an earlier Chinese candidate had a better opening span.
  - Validation: `cd apps/ai-engine && .\venv\Scripts\python.exe -m py_compile src\core\chinese_candidate_reconciler.py src\core\subtitle_text.py src\async_pipeline.py src\config.py tests\test_chinese_candidate_reconciler.py`; `cd apps/ai-engine && .\venv\Scripts\python.exe -m pytest tests\test_chinese_candidate_reconciler.py -q --maxfail=1 --basetemp temp\pytest-zh-reconcile` passed; broader Chinese-focused pytest assertions over `tests/test_chinese_primary_refiner.py tests/test_chinese_trust_gate.py tests/test_chinese_candidate_reconciler.py -q` passed before the known Windows pytest tempdir cleanup permission failure.
  - Follow-up: The immediate rerun through `.\scripts\run-e2e-youtube-pipeline.ps1` no longer completed with the old wrong `whisper_full` transcript; instead the Chinese case failed closed with `Chinese transcript trust gate rejected all recovery candidates`. The next fix is therefore in trust-gate calibration for Chinese-learning mixed-script content, not in final export or translation.

- 2026-05-22 — Added a Chinese-primary source cleaner, segmentation guard, and duplicate suppression before translation.
  - Status: Working
  - Changed: Added `src/core/chinese_primary_refiner.py` and wired it into the trust-gated Chinese path in `src/async_pipeline.py` after transcript ownership is trusted but before any `chunks/` replay or NMT starts; the refiner now preserves spoken English gloss inside Chinese-primary segments, restores mixed-script spacing instead of gluing English tokens to Han text, applies config-driven equal-length Chinese phrase corrections, splits Chinese dialogue on sentence punctuation with segment-length limits, suppresses only true overlap-style repeated phrases, and records per-segment quality metrics plus reason codes for any dropped/deduped spans.
  - Why: The live E2E Chinese runs showed that route ownership was mostly fixed, but the trusted source transcript still degraded translation quality because mixed English gloss was getting glued into unreadable strings, long dialogue lines stayed over-merged, and overlap artifacts duplicated nearby Chinese phrases. A later rerun also showed that destructive English-gloss dropping was the wrong direction because many English gloss phrases in this video are real spoken content.
  - Validation: `venv\Scripts\python.exe -m py_compile src/async_pipeline.py src/config.py src/core/chinese_primary_refiner.py tests/test_chinese_primary_refiner.py tests/test_chinese_trust_gate.py`; `venv\Scripts\python.exe -m pytest tests/test_chinese_primary_refiner.py -q --basetemp temp\pytest-zh-source-corrected2` passed; broader focused suite over `tests/test_chinese_primary_refiner.py tests/test_chinese_trust_gate.py tests/test_asr_provider_contract.py tests/test_asr_sentence_normalization.py tests/test_asr_routing.py tests/test_hybrid_routing.py tests/test_streaming_contracts.py -q` passed assertions before the known Windows pytest tempdir cleanup failure; the `tmp_path` cases were revalidated by direct invocation with `pytest.MonkeyPatch`, including the trust-gated Chinese pipeline test and the SenseVoice/Paraformer cache-path tests.
  - Follow-up: Re-run the automated backend-submit E2E bundle on `kUzay3X1maA` and inspect whether spoken English gloss now survives with restored spacing, the two `你好` greetings both remain when spoken, and only true overlap duplicates are removed from `final.json`.

- 2026-05-22 — Chinese trust-gated routing and recovery implemented inside AI Engine.
  - Status: Working
  - Changed: Added an internal `ChineseRoutePrior`, `ChineseTranscriptTrustGate`, and post-ASR Chinese pinyin adapter; `main.py` now fetches lightweight media context from PostgreSQL for title/filename soft priors; `async_pipeline.py` now blocks public chunk/batch publication for suspicious Chinese-family cases, forces `after_asr` during trust-gated recovery, retries the transcript ladder as `current route -> sensevoice_small -> whisper_full`, and fails closed only after the full recovery chain remains untrusted.
  - Why: The backend-submit E2E harness proved the real failure was wrong Chinese source-transcript ownership before translation, not just translation latency or scheduling. The worker needed an internal trust boundary so bad English-first Chinese transcripts could not flow into public artifacts and downstream translation.
  - Validation: `venv\Scripts\python.exe -m py_compile src/async_pipeline.py src/config.py src/db.py src/main.py src/pipelines.py src/core/smart_aligner.py src/core/chinese_prior.py src/core/transcript_trust_gate.py src/core/chinese_phonetics.py tests/test_chinese_trust_gate.py`; `venv\Scripts\python.exe -c "from src.core.pipeline import PipelineOrchestrator; print('OK')"`; focused pytest run over `tests/test_chinese_trust_gate.py tests/test_asr_provider_contract.py tests/test_asr_sentence_normalization.py tests/test_asr_routing.py tests/test_hybrid_routing.py tests/test_streaming_contracts.py -q` passed all assertions before the known Windows pytest tempdir cleanup failure; the `tmp_path` cases were then revalidated by direct invocation with `pytest.MonkeyPatch`, including the new pipeline test that proves the wrong `distil_whisper_en` candidate stays private until a trusted `sensevoice_small` transcript is replayed into normal `chunks/` and `translated_batches/` flow.
  - Follow-up: Re-run the full automated backend-submit E2E harness against the Chinese benchmark case and compare `final.json`, chunk text, and translated batches against the previous bad baseline.

- 2026-05-21 — Automated app-path E2E run disproved the current live Chinese routing assumption.
  - Status: Partial
  - Changed: Added a backend-driven local E2E harness that submits real YouTube cases through `POST /media/youtube`, polls status, collects artifacts from MinIO, and saves logs plus result bundles; then ran English `-moW9jvvMr4` and Chinese `kUzay3X1maA` through the actual backend -> worker -> AI-engine path.
  - Why: benchmark-only runs had already diverged too far from the live app path, so the current routing and artifact-quality claims needed to be checked against the real submission flow.
  - Validation: `.\scripts\run-e2e-youtube-pipeline.ps1` completed and produced `outputs/e2e-youtube-pipeline/20260521_113334/`; English completed correctly as `source_lang=en` on `distil-large-v3.5`, while Chinese also completed as `source_lang=en` on `distil-large-v3.5` with hallucinated English transcript text in `final.json`.
  - Follow-up: inspect why the probe vote `{'zh': 4.6, 'en': 6.0}` is still allowed to lock the route to English for the Chinese case, and verify whether the experimental-flag runtime path is still affecting Chinese provider selection anywhere else.

- 2026-05-21 — Investigated benchmark/live mismatch and hardened Chinese live routing.
  - Status: Working
  - Changed: Verified that the earlier Chinese benchmark runs were not representative of the live mobile path because they disabled `AI_SOURCE_LANGUAGE_PROBE_ENABLED`, disabled `AI_AUDIO_INSPECTOR_ENABLED`, and injected `AI_SOURCE_LANGUAGE_HINT=zh`; then hardened the Whisper probe to infer CJK languages from transcript script content instead of trusting `info.language` alone, and sanitized SenseVoice output to strip control tokens and decorative emoji before subtitle normalization.
  - Why: Real mobile submissions for Chinese YouTube cases were still being locked onto `distil_whisper_en`, while benchmark artifacts already showed emoji-heavy SenseVoice text pollution that had not been treated as a blocker during the earlier latency-first evaluation.
  - Validation: `venv\Scripts\python.exe -m py_compile src/core/asr/providers/whisper_provider.py src/core/asr/providers/sensevoice_provider.py tests/test_asr_provider_contract.py tests/test_asr_sentence_normalization.py`; `venv\Scripts\python.exe -m pytest tests/test_asr_provider_contract.py tests/test_asr_sentence_normalization.py tests/test_asr_routing.py tests/test_hybrid_routing.py -q --basetemp C:\Users\sondo\AppData\Local\Temp\codex-pytest-v22-investigate` with all assertions passing before the known Windows pytest tempdir cleanup permission error.
  - Follow-up: Validate the same YouTube case end to end from mobile, and compare regenerated artifacts against the prior emoji-polluted benchmark outputs before treating SenseVoice quality as acceptable.

- 2026-05-21 — Source-language probe no longer overfits short English intros.
  - Status: Working
  - Changed: Reworked the Whisper turbo probe path to sample VAD segments across the clip and vote per sampled segment instead of transcribing only the earliest speech region before route selection.
  - Why: Real mobile submissions with short English intros and mostly Chinese speech were being locked onto `distil_whisper_en`, which bypassed the new Chinese default route entirely.
  - Validation: `venv\Scripts\python.exe -m py_compile src/core/asr/providers/whisper_provider.py tests/test_asr_provider_contract.py`; `venv\Scripts\python.exe -m pytest tests/test_asr_provider_contract.py tests/test_asr_routing.py tests/test_hybrid_routing.py -v --basetemp C:\Users\sondo\AppData\Local\Temp\codex-pytest-v22-probefix` with all assertions for the new probe behavior passing before the known Windows pytest tempdir cleanup permission error.
  - Follow-up: Verify the mixed-language mobile flow manually against real Chinese videos that start with an English intro.

- 2026-05-21 — Chinese shipping default was intended to switch to SenseVoice with Whisper fallback, but live-path verification is still incomplete.
  - Status: Partial
  - Changed: Config and provider routing were moved toward `AI_ASR_DEFAULT_ROUTE_ZH=sensevoice_small` with Whisper fallback and Paraformer removed from the active Chinese chain.
  - Why: The earlier three-case Chinese overlap matrix showed SenseVoice sustaining real `during_asr` behavior with peak GPU memory around `11.3GB` and materially better wall clock than the safe-mode or Whisper-full path.
  - Validation: benchmark evidence in `outputs/benchmarks/suite_20260520_235105/`, `suite_20260520_234854/`, and `suite_20260520_235000/`; however, the later automated app-path E2E run still showed `Experimental zh route enabled: False` and processed the Chinese case on `distil-large-v3.5`.
  - Follow-up: treat the benchmark result as promising but not yet representative of the live route until the app-path gate is fixed.

- 2026-05-20 — FunASR routes now stream chunks during ASR and SenseVoice has a complete three-case `during_asr` benchmark matrix.
  - Status: Working
  - Changed: Added shared phonetic enrichment for experimental Chinese routes, made SenseVoice and Paraformer emit `on_chunk` callbacks incrementally instead of buffering all sentences until the end of ASR, and added `AI_ASR_DURING_ASR_CERTIFIED_ROUTES` so overlap certification can be enabled per route without changing shipping defaults.
  - Why: The first certified SenseVoice overlap run revealed that the provider was still behaving like `after_asr` internally because chunk callbacks only fired after the full provider pass. Fixing streaming was required before any `during_asr` benchmark result could be trusted.
  - Validation: `venv\Scripts\python.exe -m py_compile src/config.py src/core/smart_aligner.py src/core/asr/phonetics.py src/core/asr/providers/sensevoice_provider.py src/core/asr/providers/paraformer_provider.py tests/test_asr_provider_contract.py tests/test_asr_sentence_normalization.py`; `venv\Scripts\python.exe -m pytest tests/test_asr_provider_contract.py tests/test_asr_sentence_normalization.py -v --basetemp C:\Users\sondo\AppData\Local\Temp\codex-pytest-20260520\v22-streaming-funasr` with the known Windows pytest tempdir cleanup permission error after all assertions passed; live GPU benchmarks for `sensevoice_small` on `chinese_kUzay3X1maA`, `chinese_60xeAEe7H28`, and `chinese_LcUoiBwG-OA` with `AI_TRANSLATION_START_POLICY=during_asr`, `AI_ASR_DURING_ASR_CERTIFIED_ROUTES=distil_whisper_en,whisper_turbo,sensevoice_small`, `AI_ASR_FORCE_ROUTE=sensevoice_small`, `AI_AUDIO_INSPECTOR_ENABLED=false`, `AI_SOURCE_LANGUAGE_PROBE_ENABLED=false`, `AI_SOURCE_LANGUAGE_HINT=zh`, and offline Hugging Face caches.
  - Impact: SenseVoice now demonstrates real overlap behavior with `chunk_uploaded` events before `asr_completed` and keeps peak GPU memory near `11.3GB` across the three measured Chinese fixtures while first translated batch arrives at `38.154s`, `39.513s`, and `39.723s` respectively.
  - Follow-up: Review subtitle/timestamp quality versus Whisper full before flipping the Chinese shipping default; keep Paraformer uncertified because latency remains far behind both Whisper full and SenseVoice.

- 2026-05-20 — Chinese FunASR routes made benchmarkable and measured on a live GPU case.
  - Status: Working
  - Changed: Added explicit FunASR cache/hub runtime setup, made `AudioInspector` skip or fail open cleanly for focused route benchmarks, and simplified the SenseVoice generate path so it retries on FunASR runtime errors instead of falling out on the internal `punc_res` bug.
  - Why: The Chinese routing code existed, but the first live benchmark attempt showed the real blockers were provider bootstrapping and SenseVoice runtime compatibility rather than scheduler logic.
  - Validation: `venv\Scripts\python.exe -m py_compile src/config.py src/core/audio_inspector.py src/core/asr/providers/sensevoice_provider.py src/core/asr/providers/paraformer_provider.py tests/test_prewarm_startup.py tests/test_asr_provider_contract.py`; live GPU smokes for `sensevoice_small` and `paraformer_zh`; `venv\Scripts\python.exe -m src.scripts.benchmark_suite --case chinese_kUzay3X1maA` with `AI_AUDIO_INSPECTOR_ENABLED=false`, `AI_SOURCE_LANGUAGE_PROBE_ENABLED=false`, `AI_SOURCE_LANGUAGE_HINT=zh`, `AI_TRANSLATION_START_POLICY=during_asr`, and forced routes for `sensevoice_small`, `paraformer_zh`, and `whisper_full`.
  - Follow-up: Run the same forced-route benchmark recipe on the remaining two Chinese fixtures, then compare timing plus subtitle quality before any default-route promotion.

- 2026-05-20 — V2.2 ASR model routing foundation implemented.
  - Status: Working
  - Changed: Added internal `ASRProvider` routing, switched the English default route to Distil-Whisper, added route-aware scheduling metadata and automatic `during_asr` downgrade for uncertified routes, and introduced experimental Chinese SenseVoice/Paraformer provider paths behind config.
  - Why: The remaining blocker for `during_asr` UX was ASR residency, not queue scheduling alone. English needed a lighter default route, and Chinese needed prototype-specific integration points without changing artifacts or events.
  - Validation: `venv\Scripts\python.exe -c "from src.core.pipeline import PipelineOrchestrator; print('OK')"`; `venv\Scripts\python.exe -m py_compile src/config.py src/async_pipeline.py src/main.py src/core/smart_aligner.py src/core/asr/base.py src/core/asr/router.py src/core/asr/providers/whisper_provider.py src/core/asr/providers/sensevoice_provider.py src/core/asr/providers/paraformer_provider.py src/scripts/benchmark_suite.py tests/test_prewarm_startup.py tests/test_asr_routing.py tests/test_asr_provider_contract.py tests/test_asr_sentence_normalization.py`; `venv\Scripts\python.exe -m pytest tests/test_prewarm_startup.py tests/test_asr_routing.py tests/test_asr_provider_contract.py tests/test_asr_sentence_normalization.py tests/test_hybrid_routing.py tests/test_streaming_contracts.py -v --basetemp C:\Users\sondo\AppData\Local\Temp\codex-pytest-20260520\v22-asr`; direct invocation of the `tmp_path` cases in `tests/test_first_batch_streaming.py` and `tests/test_event_discipline.py` via `pytest.MonkeyPatch` because this sandbox blocks pytest tempdir setup/cleanup.
  - Follow-up: Benchmark the Chinese prototype routes on the target 16GB GPU and promote only certified routes to `during_asr`.

- 2026-05-20 — V2.1 hybrid single-GPU runtime adopted.
  - Status: Working
  - Changed: `SmartAligner` and `NMTTranslator` now support lazy load/unload, source-language hint/probe routing selects the main ASR route per job, and the default `AI_TRANSLATION_START_POLICY=after_asr` schedule unloads ASR before NMT starts.
  - Why: Keep one 16GB GPU worker off the multi-model VRAM cliff while preserving `chunks/`, `translated_batches/`, `final.json`, event names, and monotonic progress behavior.
  - Validation: `venv\Scripts\python.exe -c "from src.core.pipeline import PipelineOrchestrator; print('OK')"`; `venv\Scripts\python.exe -m py_compile src/config.py src/async_pipeline.py src/core/smart_aligner.py src/core/nmt_translator.py src/main.py src/pipelines.py src/scripts/benchmark_suite.py`; `venv\Scripts\python.exe -m pytest tests/test_prewarm_startup.py -v --basetemp C:\Users\sondo\AppData\Local\Temp\codex-pytest-20260520\prewarm`; `venv\Scripts\python.exe -m pytest tests/test_hybrid_routing.py -v --basetemp C:\Users\sondo\AppData\Local\Temp\codex-pytest-20260520\hybrid`; `venv\Scripts\python.exe -m pytest tests/test_streaming_contracts.py -q --basetemp C:\Users\sondo\AppData\Local\Temp\codex-pytest-20260520\contracts`; direct invocation of the `tmp_path` cases in `tests/test_first_batch_streaming.py` and `tests/test_event_discipline.py` via `pytest.MonkeyPatch` because this sandbox blocks pytest tmpdir cleanup.
  - Follow-up: Run the benchmark matrix and decide later whether `during_asr` overlap or NMT prefetch is worth re-enabling on specific hardware profiles.

- 2026-04-02 — V2 async NMT-first pipeline marked active. Status: Working.
  - `async_pipeline.py` owns producer-consumer processing.
  - `core/nmt_translator.py` is the active translation runtime.
  - Optional LLM refinement remains available through `LLMProvider`.

- 2026-04-02 — V1 translation cleanup completed. Status: Working.
  - Old `translator_engine.py` path removed.
  - Old `incremental_pipeline.py` path removed.
  - `processingMode` branching removed.
  - `targetLanguage` is the active bilingual flow input.

- 2026-04-02 — Two-tier streaming artifact protocol completed. Status: Working.
  - Tier 1 chunks uploaded during alignment.
  - Tier 2 translated batches uploaded during async translation.
  - `final.json` uploaded as the canonical completed output.

- 2026-04-02 — Progress discipline completed. Status: Working.
  - In-memory reservation prevents progress rollback.
  - Database writes preserve monotonic progress.
  - Event discipline tests exist for progress/event behavior.

- 2026-04-02 — Docker deployment path added. Status: Working.
  - CUDA image.
  - Profile-based GPU worker modes.
  - `auto`, `turbo`, and `full` profile usage.

## 4. Known Issues

- Full E2E streaming integration test is still missing.
  - Impact: Redis + MinIO + Ollama + backend worker + AI Engine streaming contract is not fully validated in one automated flow.
  - Current workaround: targeted pytest coverage plus manual integration testing.
  - Related areas: `tests/`, Redis, MinIO, backend worker, mobile player.

- A single pre-ASR route decision can still be wrong for genuinely code-switched media.
  - Impact: probe routing is now more defensive for Chinese-family speech because it uses transcript script evidence, but the worker still does not re-route mid-job if a clip genuinely changes dominant language later.
  - Current workaround: use `AI_SOURCE_LANGUAGE_HINT` for controlled evaluation cases or rely on Whisper fallback when the selected Chinese provider fails.
  - Related areas: `src/async_pipeline.py`, `src/core/smart_aligner.py`, `src/core/asr/`, `src/core/nmt_translator.py`, `src/scripts/benchmark_suite.py`.

- Narrow English probe wins no longer silently own the Chinese benchmark case, but the probe still reports `en` on some mixed-script Chinese-learning videos.
  - Impact: ownership now recovers safely because the Chinese prior and trust gate keep the job on a Chinese path, but route metrics and logs can still look confusing because `probe_source_lang='en'` while the trusted route is `sensevoice_small`.
  - Current workaround: rely on the Chinese prior plus trust-gated ownership decision rather than the probe result alone; use the structured trust-attempt dump in pipeline metrics or `outputs/trust_gate_failures/` when a case still fails closed.
  - Related areas: `src/core/chinese_prior.py`, `src/core/transcript_trust_gate.py`, `src/async_pipeline.py`, `src/main.py`, `outputs/e2e-youtube-pipeline/20260522_161155/`.

- Chinese source transcript quality is now better structured but still not production-clean on SenseVoice-first live runs.
  - Impact: ownership, timing continuity, and mixed-script opening preservation are materially better, but the opening meeting dialogue still needs stronger punctuation/translation recovery for colloquial turns like `你好我是你是李雷吧` and `对是我第一次见面`, even after the refiner stopped injecting semantic placeholders.
  - Current workaround: keep the Chinese trust gate, source-preserving refiner, and validated LLM rescue in place, then focus the next pass on prompt-level recovery and fresh E2E evidence instead of inventing source text upstream.
  - Related areas: `src/core/chinese_primary_refiner.py`, `src/core/chinese_batch_llm_translator.py`, `src/core/prompts.py`, `src/core/transcript_trust_gate.py`, `outputs/e2e-youtube-pipeline/20260523_153018/`.

- Benchmark quality and benchmark latency must be evaluated separately.
  - Impact: earlier benchmark wins for SenseVoice were real for latency/VRAM, but the benchmark artifacts themselves already contained emoji/decorative text pollution, so “benchmark passed” did not mean subtitle quality was acceptable.
  - Current workaround: treat benchmark route metrics and artifact-quality review as separate gates; inspect `final.json` contents directly before promoting a route as a quality default.
  - Related areas: `outputs/benchmarks/`, `src/core/asr/providers/sensevoice_provider.py`, `src/scripts/benchmark_suite.py`.

- Paraformer remains uncertified and non-competitive on the current Chinese workload.
  - Impact: Paraformer now has phonetic fill and working timestamp alignment, but its wall-clock and first-chunk timings remain substantially worse than both Whisper full and SenseVoice on the measured Chinese fixtures.
  - Current workaround: keep Paraformer available only as a forced benchmark/debug route; do not keep it in the normal Chinese fallback chain or add it to `AI_ASR_DURING_ASR_CERTIFIED_ROUTES`.
  - Related areas: `src/core/asr/providers/paraformer_provider.py`, `src/core/asr/phonetics.py`, `src/scripts/benchmark_suite.py`.

- SenseVoice Hugging Face repo emits noisy requirement-install attempts at runtime.
  - Impact: the provider still runs successfully, but worker logs include a non-blocking pip failure from the model repo's `requirements.txt`, which can confuse later debugging.
  - Current workaround: treat the message as non-fatal during prototype benchmarking; the actual inference path still completes and writes valid artifacts.
  - Related areas: `src/core/asr/providers/sensevoice_provider.py`, `requirements.txt`, Hugging Face `FunAudioLLM/SenseVoiceSmall`.

- NMT quality tuning is ongoing.
  - Impact: translation quality may vary by language pair and media style.
  - Current workaround: tune `NMT_BEAM_SIZE`, `NMT_COMPUTE_TYPE`, and refinement prompts per language pair.
  - Related areas: `core/nmt_translator.py`, `core/llm_provider.py`, `core/prompts.py`, `config.py`.

- Queue-level worker routing for horizontal scale-out is still incomplete.
  - Impact: the active worker now chooses the correct ASR route internally, but multi-worker deployments still lack queue-level language-aware dispatch when separate `turbo` and `full` workers are used.
  - Current workaround: rely on per-job lazy routing inside the worker or pin deployments to a single hybrid worker until scale-out routing is designed explicitly.
  - Related areas: worker profiles, queue payloads, future backend dispatch rules.

- Long music-heavy files may need further VAD and inspector tuning.
  - Impact: processing time and segmentation quality may vary on real-world music content.
  - Current workaround: current AudioInspector, VADManager, and vocal isolation fallback behavior.

## 5. Next Candidates

- [ ] Improve the first Chinese dialogue block (`请问你是王静吗？`, `你好，我是李雷吧？`, `对，是我。第一次见面，幸会。`) without regressing the restored opening `第一次相亲。 First blind date.` and first `你好。`.
- [ ] Decide whether selective Whisper-full sentence-window repair should be enabled for low-quality trusted SenseVoice windows, or whether a lighter Chinese lexical normalizer should run first.
- [ ] Keep `paraformer_zh` as a benchmark-only debug route unless a later optimization changes its latency profile materially.
- [ ] Add an end-to-end AI Engine integration test with real Redis, MinIO, and optional Ollama.
- [ ] Continue NMT quality tuning for important language pairs.
- [ ] Improve queue-level language-aware worker routing when horizontal scaling becomes necessary.
- [ ] Further tune the multi-segment AudioInspector using real-world audio.
- [ ] Investigate VAD processing time on long music files.
- [ ] Add basic monitoring and alerting for worker health, GPU memory, processing time, and failure rates.
- [ ] Build a small evaluation set for transcription timing, translation quality, and latency.

## 6. Contract Touchpoints

### Queue

Consumes `AiProcessingJobPayload` from the `ai-processing` queue.

Required fields:

- `mediaId`
- `audioS3Key`
- `durationSeconds`
- `userId`
- `targetLanguage?`

Do not reintroduce `processingMode`.
Do not treat source-language hints as a required cross-module contract in the current MVP.

### Artifacts

Writes durable artifacts under:

```text
processed/{mediaId}/chunks/
processed/{mediaId}/translated_batches/
processed/{mediaId}/final.json
```

Expected surfaces:

- Tier 1 chunk files: raw transcription sentence arrays.
- Tier 2 translated batch files: translated batch objects.
- Final output: full `SubtitleOutput`.

### Progress and Events

Expected processing events:

- `progress`
- `chunk_ready`
- `batch_ready`
- `completed`
- `failed`

Progress must remain monotonic across emitted events and persisted database writes.

### Mobile Impact

Mobile player depends on:

- translated batch availability before `final.json`;
- final JSON shape;
- word timestamps;
- source text;
- translation text;
- phonetic field;
- stable artifact URLs.

### Backend Impact

Backend depends on:

- queue payload compatibility;
- progress/status updates;
- Redis event payloads;
- artifact path conventions;
- final completion/failure state.

## 7. Validation Notes

Fast sanity check:

```powershell
cd apps/ai-engine
venv\Scripts\python.exe -c "from src.core.pipeline import PipelineOrchestrator; print('OK')"
```

Focused hybrid validation:

```powershell
cd apps/ai-engine
venv\Scripts\python.exe -m pytest tests/test_prewarm_startup.py -v
venv\Scripts\python.exe -m pytest tests/test_hybrid_routing.py -v
venv\Scripts\python.exe -m pytest tests/test_streaming_contracts.py -q
venv\Scripts\python.exe -m pytest tests/test_asr_routing.py tests/test_asr_provider_contract.py tests/test_asr_sentence_normalization.py -v
```

Ordering and worker-discipline tests:

```powershell
cd apps/ai-engine
venv\Scripts\python.exe -m pytest tests/test_first_batch_streaming.py -v
venv\Scripts\python.exe -m pytest tests/test_event_discipline.py -v
```

Full pytest:

```powershell
cd apps/ai-engine
venv\Scripts\python.exe -m pytest tests/ -v
```

Docker/GPU profile or benchmark check:

```bash
cd apps/ai-engine
docker compose --profile auto up
```

Last verified:

- 2026-05-20 — import sanity, py_compile, `test_prewarm_startup.py`, `test_asr_routing.py`, `test_asr_provider_contract.py`, `test_asr_sentence_normalization.py`, `test_hybrid_routing.py`, and `test_streaming_contracts.py` passed.
- 2026-05-20 — `tests/test_first_batch_streaming.py` and `tests/test_event_discipline.py` logic passed via direct function invocation because this sandbox denies pytest tmpdir setup/cleanup for those `tmp_path` cases.
- 2026-05-21 — `.\scripts\run-e2e-youtube-pipeline.ps1` completed and saved a full local backend-submit E2E bundle under `outputs/e2e-youtube-pipeline/20260521_113334/`; English case behaved plausibly, Chinese case still completed as `source_lang=en` on `distil-large-v3.5`.

## 8. Update Rules

Update this checkpoint when:

- A pipeline stage changes.
- A schema or artifact format changes.
- A queue payload or event payload changes.
- Translation, alignment, VAD, or audio processing behavior changes.
- A runtime profile or GPU setting changes.
- A systemic bug or quality issue is discovered.
- A dependency is added or upgraded.
- A validation result changes the known state.

Do not add long migration history here. Move stable architecture to `INSTRUCTION.md`, cross-module contracts to a future `CONTRACTS.md`, and historical migration details to `docs/archive/`.

- 2026-05-22 — Deterministic Chinese trust-gate refactor, sentence-level window repair, and structured trust-failure dumps landed.
  - Status: Working
  - Changed: Added `src/core/chinese_candidate_normalizer.py`, `src/core/chinese_window_profiler.py`, and `src/core/chinese_window_repairer.py`; rewrote `src/core/transcript_trust_gate.py` so Chinese trust is evaluated on deterministic windows bounded by VAD-like silence gaps, window duration, sentence count, and code-switch density shift instead of brittle semantic phase detection; updated `src/async_pipeline.py` so Chinese-prior candidates are normalized before trust, can be repaired only by whole sentence-window swaps, and are refined only after ownership trust is established; and updated `src/main.py` to emit a structured `ChineseTrustGateError` dump under `outputs/trust_gate_failures/` when the Chinese path still fails closed.
  - Why: The earlier mixed-script trust-gated path was over-penalizing SenseVoice for Chinese-learning content because a noisy but lexically faithful candidate was being rejected before cleanup, while whole-route replacement by `whisper_full` dropped real opening content like `first blind date` and the first `你好`. The trust model needed to separate transcript ownership from cleanliness, avoid semantic “teaching phase” heuristics, and preserve karaoke timing by swapping only full sentence windows.
  - Validation: `cd apps/ai-engine && .\venv\Scripts\python.exe -m py_compile src\async_pipeline.py src\main.py src\core\chinese_candidate_normalizer.py src\core\chinese_window_profiler.py src\core\chinese_window_repairer.py src\core\transcript_trust_gate.py tests\test_chinese_primary_refiner.py tests\test_chinese_trust_gate.py tests\test_chinese_window_refactor.py`; `cd apps/ai-engine && .\venv\Scripts\python.exe -m pytest tests\test_chinese_primary_refiner.py -q --maxfail=1 --basetemp temp\pytest-zh-refiner-override` passed; broader focused suite over `tests\test_chinese_primary_refiner.py tests\test_chinese_window_refactor.py tests\test_chinese_trust_gate.py -q` passed assertions before the known Windows pytest tempdir cleanup permission failure.
  - Follow-up: Continue source-side quality work for mistranscribed Chinese dialogue and mixed-script vocabulary sections now that live route ownership, opening gloss preservation, and first-greeting preservation are stable again.

- 2026-05-22 — Automated backend-submit E2E rerun now keeps the Chinese benchmark case on SenseVoice and preserves the opening mixed-script greeting flow.
  - Status: Partial
  - Changed: Reran `.\scripts\run-e2e-youtube-pipeline.ps1` after the trust/window refactor and verified the saved local bundle under `outputs/e2e-youtube-pipeline/20260522_161155/`.
  - Why: The prior reruns either silently completed on the wrong route or failed closed. The real acceptance target for this slice was the live backend-submit path preserving `第一次相亲。 First blind date.` and the first `你好。` while still producing normal artifacts and mobile-compatible timing.
  - Validation: `.\scripts\run-e2e-youtube-pipeline.ps1` completed; `outputs/e2e-youtube-pipeline/20260522_161155/results/suite.summary.md` shows English completed as `source=en` on `distil-large-v3.5`, and Chinese completed as `source=zh` on `iic/SenseVoiceSmall`; `outputs/e2e-youtube-pipeline/20260522_161155/results/chinese_kUzay3X1maA/evaluation.summary.json` shows first source segments `第一次相亲。 First blind date.` then `你好。`; `outputs/e2e-youtube-pipeline/20260522_161155/logs/ai-engine.err.log` shows `Source routing: strategy=chinese_prior source=zh route=sensevoice_small ... trust_gate_active=True`, `Trusted Chinese-family transcript established on route=sensevoice_small`, and final pipeline metrics with `trust_attempts[0].decision.verdict='trusted'`.
  - Follow-up: Remaining errors are now source lexical mistakes and downstream translation collapse on some Chinese lines, not source-language ownership failure.
