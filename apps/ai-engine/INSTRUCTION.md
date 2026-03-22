# AI ENGINE DEVELOPMENT INSTRUCTIONS

## 1. Project Context

This project is a **Bilingual Subtitle Generation System** (SaaS architecture).
This module is the **AI Engine** (Python), operating as a worker node responsible for:

1.  Ingesting Audio/Video files.
2.  Preprocessing (VAD, Audio Normalization).
3.  ASR & Alignment (Speech-to-Text).
4.  Translation & G2P (Grapheme-to-Phoneme).
5.  Exporting structured JSON.

> See also: `apps/ai-engine/ARCHITECTURE_CONTEXT.md` for the current V2 runtime architecture, contracts, and handoff notes.

## 2. Hardware & Performance Strategy

- **Reference Hardware:** NVIDIA RTX 5060 Ti (16GB VRAM).
- **Configuration Strategy:** The system MUST NOT hardcode performance parameters. It must support configurable **Performance Profiles** via Environment Variables (`AI_PERF_MODE`).

### Performance Profiles:

1.  **LOW (Efficiency/Cooling)**:
    - Target: Background jobs, low heat.
    - Settings: `int8` quantization, Batch Size = 1, smaller Beam Size (1-2).
2.  **MEDIUM (Balanced - DEFAULT)**:
    - Target: Standard usage, optimal VRAM usage.
    - Settings: `int8_float16` mix, Batch Size = 4, Beam Size = 5.
3.  **HIGH (Max Speed)**:
    - Target: Priority jobs, leveraging full 16GB VRAM.
    - Settings: `float16` (no quantization if possible), higher Batch Size, Beam Size = 5+.

## 3. Tech Stack

- **Language:** Python 3.10+
- **Core ASR:** `faster-whisper` (CTranslate2 backend) for speed.
- **Refinement:** `stable-ts` (Word-level timestamps) for handling hallucinations/long segments.
- **VAD:** `silero-vad` (ONNX Runtime GPU).
- **Audio:** `ffmpeg-python`, `librosa`.
- **Translation:** NLLB-200-3.3B via CTranslate2 (GPU-native NMT) + optional LLM refinement (Ollama qwen2.5:7b-instruct).

## 4. Architectural Design (Modular OOP)

### 4.1. Core Classes

1.  **`AudioProcessor`**:
    - Handles FFmpeg operations.
    - Converts inputs to standard format (WAV, 16kHz, Mono).
2.  **`VADManager`**:
    - Implements Silero VAD.
    - **Logic:** Detects speech segments to split audio into manageable chunks.
    - Classifies chunks into `HAPPY_CASE` (2s-15s) and `SPECIAL_CASE` (>15s).
3.  **`DeepTranscriber`**:
    - **Context:** Manages the Whisper Model lifecycle.
    - **Logic:**
      - Load model based on `AI_PERF_MODE`.
      - If `HAPPY_CASE`: Standard fast transcription.
      - If `SPECIAL_CASE`: Recursive alignment (Refinement Mode) using word-level timestamps to find optimal split points.
4.  **`SmartAligner`**:
    - Post-processing logic.
    - Merges words/segments into sentences.
    - Enforces max duration constraints (e.g., max 15s per subtitle line).
5.  **`NMTTranslator`**:
    - NLLB-200-3.3B via CTranslate2, singleton with lazy GPU model load.
    - Async `translate_batch()` for streaming integration.
6.  **`LLMProvider` (refinement)**:
    - Optional post-NMT pass via Ollama for CJK/complex text quality improvement.

## 5. Coding Standards

- **Type Hinting:** Mandatory for all functions.
- **Configuration:** Use `pydantic-settings` or `python-dotenv`. NO hardcoded thresholds.
- **Logging:** Use `loguru`. Structure logs to trace `Job ID`.
- **Error Handling:** Graceful degradation. If GPU fails (OOM), attempt fallback to CPU or smaller model/batch size (optional but recommended).

## 6. Data Contract (JSON Output)

Output must strictly adhere to the schema required by the Mobile App:

```json
{
  "metadata": { "duration": 300.5, "engine_profile": "MEDIUM", ... },
  "segments": [
    {
      "start": 0.0, "end": 4.5,
      "text": "Source text",
      "translation": "Target text",
      "phonetic": "/ipa/",
      "words": [{ "word": "Source", "start": 0.0, "end": 0.5 }]
    }
  ]
}
```

## 7. Basic technical flow (current idea)

```text
[Input File (Video/Audio)]
      |
      v
(AudioProcessor) -----------------> Audio standalizing (16kHz, Mono)
      |
      v
(AudioInspector) -----------------> Classification (Music/Standard)
      |
      v
(VADManager - Silero VAD) --------> Audio segmentation (Silent points)
      |
      |--- [Segment < 15s] ----------> (DeepTranscriber: Standard Mode)
      |                                  |
      |--- [Segment > 15s] ----------> (DeepTranscriber: Refinement Mode)
      |                                  |--> Word-level Alignment (stable-ts)
      |                                  |--> Find natural break points (Gap/Punctuation)
      |                                  |--> Split into smaller segments & Transcribe again
      |
      v
(SmartAligner) -------------------> Sentence alignment (<15s) + Tier 1 chunk streaming
      |
      v  (asyncio.Queue — producer/consumer)
      |
      |--- [CJK lang] ------------> (SemanticMerger) → Line grouping + homophone fix
      |--- [non-CJK] ------------> bypass merge
      |
      v
(NMTTranslator) ------------------> NLLB-200-3.3B GPU translation (CTranslate2)
      |
      v
[Optional LLM Refinement] --------> Ollama post-NMT quality pass
      |
      v
[Tier 2 batch upload] ------------> MinIO processed/{mediaId}/translated_batches/
      |
      v
[Output final.json] --------------> Save & Ready for Mobile App
```
