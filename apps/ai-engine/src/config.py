import os
from enum import Enum
from pathlib import Path
from pydantic_settings import BaseSettings, SettingsConfigDict
from pydantic import DirectoryPath, Field, model_validator


# Performance Profiles
class AIProfile(str, Enum):
    LOW = "LOW"
    MEDIUM = "MEDIUM"
    HIGH = "HIGH"


def _detect_device() -> str:
    """Auto-detect the best available compute device."""
    try:
        import torch
        if torch.cuda.is_available():
            return "cuda"
    except ImportError:
        pass
    return "cpu"


class Settings(BaseSettings):
    # --- Project Info ---
    APP_NAME: str = "AI Engine Worker"
    ENV: str = Field(default="development", description="dev, staging, production")

    # --- Paths ---
    BASE_DIR: DirectoryPath = Path(__file__).resolve().parent.parent
    TEMP_DIR: Path = Field(default=Path("temp"), description="Temp audio files")
    OUTPUT_DIR: Path = Field(default=Path("outputs"), description="JSON result files")
    HF_TOKEN: str = Field(
        default="",
        description="Optional Hugging Face access token propagated to model download clients.",
    )
    HF_HUB_DISABLE_XET: bool = Field(
        default=False,
        description="Disable the hf-xet transfer backend and fall back to standard HTTP downloads.",
    )
    HF_HUB_DOWNLOAD_TIMEOUT: int = Field(
        default=0,
        description="Optional Hugging Face Hub download timeout in seconds (0 keeps the library default).",
    )

    # --- Hardware Configuration ---
    # Auto-falls back to "cpu" when CUDA is unavailable (e.g., Apple Silicon Mac).
    # Set DEVICE=cpu explicitly in .env to skip the detection check.
    DEVICE: str = Field(default="", description="cuda or cpu (auto-detected if empty)")
    DEVICE_INDEX: int = 0  # GPU index

    # --- AI Performance Mode ---
    AI_PERF_MODE: AIProfile = Field(
        default=AIProfile.MEDIUM, description="Performance profile"
    )
    AI_PREWARM_MODELS: bool = Field(
        default=False,
        description=(
            "Preload heavy long-lived inference components at worker startup "
            "before accepting jobs. The hybrid single-GPU path only prewarms "
            "components that do not create conflicting GPU residency."
        ),
    )

    # --- Whisper Model Configuration ---
    # Turbo model: faster, used for well-resourced languages (EN, VI, FR, etc.)
    WHISPER_MODEL_TURBO: str = Field(
        default="large-v3-turbo", description="Fast model for common languages"
    )
    WHISPER_MODEL_DISTIL_EN: str = Field(
        default="distil-large-v3.5",
        description="English-first Distil-Whisper route for low-residency overlap.",
    )
    # Full model: highest accuracy, used for CJK and complex languages
    WHISPER_MODEL_FULL: str = Field(
        default="large-v3", description="Accuracy model for CJK languages"
    )
    # Languages that require the full model
    WHISPER_CJK_LANGUAGES: list[str] = Field(
        default=["zh", "zh-cn", "zh-tw", "yue", "ja", "ko"],
        description="Languages routed to the full model",
    )
    # Worker model mode: controls which ASR routes this worker may load.
    #   auto       → may load turbo or full lazily per job
    #   turbo_only → may load only turbo
    #   full_only  → may load only full
    WORKER_MODEL_MODE: str = Field(
        default="auto", description="auto | turbo_only | full_only"
    )
    AI_ASR_ROUTING_ENABLED: bool = Field(
        default=True,
        description="Enable route-aware ASR provider selection instead of hard-coded Whisper-only routing.",
    )
    AI_ASR_DEFAULT_ROUTE_EN: str = Field(
        default="distil_whisper_en",
        description="Default ASR route id for English source audio.",
    )
    AI_ASR_DEFAULT_ROUTE_ZH: str = Field(
        default="sensevoice_small",
        # default="paraformer_zh",
        description="Default ASR route id for Chinese-family audio.",
    )
    AI_ASR_EXPERIMENTAL_ROUTE_ZH: str = Field(
        default="sensevoice_small",
        description="Experimental Chinese ASR route id used when prototype routing is enabled.",
    )
    AI_ASR_ENABLE_EXPERIMENTAL_ZH_ROUTE: bool = Field(
        default=False,
        description="Enable the experimental Chinese route before it becomes the shipping default.",
    )
    AI_ASR_FALLBACK_ROUTE_EN: str = Field(
        default="whisper_turbo",
        description="Fallback ASR route id for English and unknown-language jobs.",
    )
    AI_ASR_FALLBACK_ROUTE_ZH: str = Field(
        default="whisper_full",
        description="Fallback ASR route id for Chinese-family jobs.",
    )
    AI_ASR_ALLOW_AUTO_POLICY_DOWNGRADE: bool = Field(
        default=True,
        description="Automatically downgrade uncertified routes from during_asr to after_asr.",
    )
    AI_ASR_DURING_ASR_CERTIFIED_ROUTES: str = Field(
        default="distil_whisper_en,whisper_turbo,sensevoice_small",
        description=(
            "Comma-separated internal ASR route ids that are allowed to keep "
            "during_asr overlap without auto-downgrading."
        ),
    )
    AI_ASR_FORCE_ROUTE: str = Field(
        default="",
        description="Force one internal ASR route id for local benchmarks or debugging.",
    )
    AI_ASR_PROVIDER_CACHE_DIR: Path = Field(
        default=Path("temp/models/asr"),
        description="Shared cache directory for non-Whisper ASR providers.",
    )
    AI_AUDIO_INSPECTOR_ENABLED: bool = Field(
        default=True,
        description="Enable the AST-based audio profile classifier before VAD and ASR.",
    )
    AI_AUDIO_INSPECTOR_CACHE_DIR: Path = Field(
        default=Path("temp/models/audio-inspector"),
        description="Cache directory for the AST audio-classification model.",
    )
    AI_SOURCE_LANGUAGE_HINT: str = Field(
        default="",
        description=(
            "Optional ISO language hint used to choose the ASR route before the "
            "main transcription pass."
        ),
    )
    AI_SOURCE_LANGUAGE_PROBE_ENABLED: bool = Field(
        default=True,
        description=(
            "Probe early speech with the fast ASR route when no source language "
            "hint is available."
        ),
    )
    AI_SOURCE_LANGUAGE_PROBE_MAX_SECONDS: float = Field(
        default=12.0,
        description="Maximum early-audio duration used for source-language probing.",
    )
    AI_SOURCE_LANGUAGE_PROBE_MAX_SEGMENTS: int = Field(
        default=4,
        description="Maximum VAD segments used for source-language probing.",
    )
    AI_CHINESE_TRUST_GATE_ENABLED: bool = Field(
        default=True,
        description="Enable trust-gated Chinese transcript routing and recovery.",
    )
    AI_CHINESE_PRIOR_TITLE_KEYWORDS: str = Field(
        default="chinese,mandarin,pinyin,hsk,dialogue,beginner,lesson,learn chinese,中文,汉语,漢語,普通话,普通話,粤语,粵語,拼音,相亲,相親",
        description="Comma-separated title keywords that bias the route prior toward Chinese-family transcript ownership.",
    )
    AI_CHINESE_PRIOR_FILENAME_KEYWORDS: str = Field(
        default="chinese,mandarin,pinyin,hsk,dialogue,lesson,中文,汉语,漢語,普通话,普通話,粤语,粵語,拼音",
        description="Comma-separated filename/title keywords used when media metadata is limited.",
    )
    AI_CHINESE_PRIOR_MIN_SCORE: float = Field(
        default=2.0,
        description="Minimum soft-prior score required before Chinese trust gating activates.",
    )
    AI_CHINESE_PROBE_NEAR_TIE_MARGIN: float = Field(
        default=1.75,
        description="Maximum zh-vs-en probe score gap treated as a near tie for Chinese routing.",
    )
    AI_CHINESE_MIN_HAN_RATIO: float = Field(
        default=0.12,
        description="Minimum Han-character ratio expected from a trusted Chinese-family transcript.",
    )
    AI_CHINESE_MIN_EARLY_HAN_RATIO: float = Field(
        default=0.08,
        description="Minimum Han-character ratio expected in the early transcript window for trusted Chinese-family output.",
    )
    AI_CHINESE_MAX_PINYIN_RATIO: float = Field(
        default=0.45,
        description="Maximum tolerated pinyin-like romanized token ratio before a Chinese-family transcript becomes suspicious.",
    )
    AI_CHINESE_MIN_AVG_LOGPROB: float = Field(
        default=-0.75,
        description="Minimum average Whisper log probability accepted before a Chinese-family candidate is treated as suspicious.",
    )
    AI_CHINESE_MIN_AVG_WORD_CONFIDENCE: float = Field(
        default=0.45,
        description="Minimum average word confidence accepted before a Chinese-family candidate is treated as suspicious.",
    )
    AI_CHINESE_MAX_REPETITION_SCORE: float = Field(
        default=0.22,
        description="Maximum tolerated repetition score before a transcript is considered degenerate.",
    )
    AI_CHINESE_MIN_LEXICAL_DIVERSITY: float = Field(
        default=0.22,
        description="Minimum lexical diversity expected from a trusted Chinese-family transcript.",
    )
    AI_CHINESE_DURATION_TEXT_DENSITY_MIN: float = Field(
        default=0.8,
        description="Minimum transcript character density per audio second for trusted Chinese-family output.",
    )
    AI_CHINESE_DURATION_TEXT_DENSITY_MAX: float = Field(
        default=18.0,
        description="Maximum transcript character density per audio second for trusted Chinese-family output.",
    )
    AI_CHINESE_TRUST_SUSPICIOUS_SCORE: float = Field(
        default=2.0,
        description="Weighted suspiciousness threshold that triggers Chinese recovery.",
    )
    AI_CHINESE_TRUST_FAIL_SCORE: float = Field(
        default=3.5,
        description="Weighted suspiciousness threshold that fails closed after the final Chinese fallback.",
    )
    AI_CHINESE_HOLD_UNVERIFIED_CHUNKS: bool = Field(
        default=True,
        description="Block Tier 1/2 publication until a Chinese-family transcript becomes trusted.",
    )
    AI_CHINESE_FORCE_AFTER_ASR_ON_RECOVERY: bool = Field(
        default=True,
        description="Force after_asr scheduling when Chinese trust-gated recovery is active.",
    )
    AI_CHINESE_FAIL_CLOSED: bool = Field(
        default=True,
        description="Use the existing FAILED path when no trusted Chinese-family transcript can be recovered.",
    )
    AI_CHINESE_RECOVERY_ENABLE_SENSEVOICE: bool = Field(
        default=True,
        description="Allow SenseVoice as the first Chinese-family recovery route.",
    )
    AI_CHINESE_RECOVERY_ENABLE_WHISPER_FULL: bool = Field(
        default=True,
        description="Allow whisper_full as the final Chinese-family recovery route.",
    )
    AI_CHINESE_RECOVERY_ROUTE_IDS: str = Field(
        default="",
        description=(
            "Optional comma-separated internal ASR route ids attempted after the "
            "initially selected Chinese-family route when trust-gated recovery is "
            "needed. Leave empty to derive the chain from the current Chinese "
            "default route plus enabled safe fallbacks."
        ),
    )
    AI_CHINESE_TRUST_EARLY_WINDOW_SENTENCES: int = Field(
        default=8,
        description="Number of leading transcript sentences used for early-window Chinese trust heuristics.",
    )
    AI_CHINESE_TRUST_OWNER_SUSPICIOUS_SCORE: float = Field(
        default=1.6,
        description="Ownership-risk threshold that triggers Chinese route recovery before publication.",
    )
    AI_CHINESE_TRUST_REPAIR_SCORE: float = Field(
        default=0.9,
        description="Cleanliness-risk threshold that keeps Chinese ownership but requests whole-window repair before publication.",
    )
    AI_CHINESE_TRUST_PROBE_NEAR_TIE_WEIGHT: float = Field(
        default=0.35,
        description="Soft ownership-risk weight added when zh-vs-en probing is a near tie.",
    )
    AI_CHINESE_WINDOW_GAP_SECONDS: float = Field(
        default=1.0,
        description="Sentence-gap threshold used to start a new deterministic Chinese transcript window.",
    )
    AI_CHINESE_WINDOW_MAX_SECONDS: float = Field(
        default=18.0,
        description="Maximum duration of one deterministic Chinese transcript window before forcing a boundary.",
    )
    AI_CHINESE_WINDOW_MIN_SENTENCES: int = Field(
        default=2,
        description="Minimum sentence count before code-switch density may force a new deterministic Chinese transcript window.",
    )
    AI_CHINESE_WINDOW_MAX_SENTENCES: int = Field(
        default=6,
        description="Maximum sentence count in one deterministic Chinese transcript window before forcing a boundary.",
    )
    AI_CHINESE_WINDOW_CODE_SWITCH_SHIFT: float = Field(
        default=0.35,
        description="Minimum absolute code-switch density change that can force a new deterministic Chinese transcript window.",
    )
    AI_CHINESE_MIXED_WINDOW_REPETITION_MULTIPLIER: float = Field(
        default=2.0,
        description="Multiplier applied to repetition tolerance inside mixed-script Chinese transcript windows.",
    )
    AI_CHINESE_DROP_ENGLISH_GLOSS: bool = Field(
        default=False,
        description="Legacy guard for dropping clearly garbage English-only clauses in Chinese-primary mode. Defaults off so spoken English gloss is preserved.",
    )
    AI_CHINESE_KEEP_ENGLISH_DIALOGUE_MAX_TOKENS: int = Field(
        default=4,
        description="Maximum Latin token count still allowed as short intentional English dialogue inside Chinese-primary mode.",
    )
    AI_CHINESE_KEEP_ENGLISH_DIALOGUE_MAX_SECONDS: float = Field(
        default=1.6,
        description="Maximum duration still allowed for a short intentional English dialogue span in Chinese-primary mode.",
    )
    AI_CHINESE_KEEP_ENGLISH_DIALOGUE_MIN_CONFIDENCE: float = Field(
        default=0.9,
        description="Minimum average word confidence required before a short pure-English span is kept in Chinese-primary mode.",
    )
    AI_CHINESE_MAX_SEGMENT_SECONDS: float = Field(
        default=8.0,
        description="Preferred maximum duration of one Chinese-primary subtitle segment before it is split.",
    )
    AI_CHINESE_MAX_SEGMENT_HAN_CHARS: int = Field(
        default=35,
        description="Preferred maximum Han-character count of one Chinese-primary subtitle segment before it is split.",
    )
    AI_CHINESE_MAX_SEGMENT_SENTENCE_UNITS: int = Field(
        default=3,
        description="Preferred maximum number of Chinese clause/sentence units merged into one Chinese-primary subtitle segment.",
    )
    AI_CHINESE_LOW_CONFIDENCE_WORD_THRESHOLD: float = Field(
        default=0.35,
        description="Word-confidence threshold used for Chinese-primary segment quality metrics and noisy-span checks.",
    )
    AI_CHINESE_DUPLICATE_TIME_WINDOW_SECONDS: float = Field(
        default=12.0,
        description="Nearby time window used to suppress repeated Chinese-primary phrases from overlapping ASR windows.",
    )
    AI_CHINESE_DUPLICATE_SIMILARITY: float = Field(
        default=0.92,
        description="Similarity threshold used for nearby repeated-phrase suppression in Chinese-primary mode.",
    )
    AI_CHINESE_RECONCILE_EARLY_WINDOW_SECONDS: float = Field(
        default=24.0,
        description="Only the opening Chinese-primary window within this many seconds is eligible for candidate reconciliation patches.",
    )
    AI_CHINESE_RECONCILE_MIN_OVERLAP_SECONDS: float = Field(
        default=0.35,
        description="Minimum timestamp overlap required before an alternate Chinese candidate may replace an overlapping trusted segment.",
    )
    AI_CHINESE_RECONCILE_REPLACE_SCORE_MARGIN: float = Field(
        default=3.0,
        description="Minimum content-score improvement required before an alternate Chinese candidate replaces a trusted overlapping segment.",
    )
    AI_CHINESE_RECONCILE_MIN_AVG_CONFIDENCE: float = Field(
        default=0.5,
        description="Minimum average word confidence required before an alternate Chinese candidate can patch the trusted opening window.",
    )
    AI_CHINESE_DEDUPE_MIN_NORMALIZED_CHARS: int = Field(
        default=6,
        description="Minimum normalized text length before Chinese-primary duplicate suppression can remove a repeated phrase.",
    )
    AI_CHINESE_DEDUPE_SHORT_PHRASES: str = Field(
        default="你好,幸会,谢谢,哈哈",
        description="Comma-separated short repeated dialogue phrases that must not be deduped in Chinese-primary mode.",
    )
    AI_CHINESE_TEXT_NORMALIZATION_RULES: str = Field(
        default="王靖=>王静;感觉想完成任务=>感觉像完成任务;当回吧=>当回报;选你做的菜=>学你做的菜",
        description="Semicolon-separated equal-length Chinese text normalization rules applied before translation in Chinese-primary mode.",
    )
    AI_CHINESE_LLM_RESCUE_ENABLED: bool = Field(
        default=True,
        description="Enable selective local LLM rescue for structurally risky Chinese translation batches.",
    )
    AI_CHINESE_LINGUISTIC_RADAR_ENABLED: bool = Field(
        default=True,
        description="Enable the SenseVoice-focused Chinese linguistic radar that detects structural jamming patterns before LLM rescue.",
    )
    AI_CHINESE_LLM_RESCUE_SPLIT_HINTS_ENABLED: bool = Field(
        default=True,
        description="Allow prompt-only [split_hint] insertions for radar-detected Chinese structural jams.",
    )
    AI_CHINESE_LLM_RESCUE_SPLIT_HINT_ROUTE_IDS: str = Field(
        default="sensevoice_small",
        description="Comma-separated ASR route ids eligible for Chinese [split_hint] radar injection.",
    )
    AI_CHINESE_LLM_RESCUE_SPLIT_HINT_MAX_PER_SEGMENT: int = Field(
        default=2,
        description="Maximum number of [split_hint] markers the Chinese radar may inject into one target segment.",
    )
    AI_CHINESE_LLM_RESCUE_SPLIT_HINT_MAX_PER_BATCH: int = Field(
        default=3,
        description="Maximum number of [split_hint] markers the Chinese radar may inject across one LLM rescue batch.",
    )
    AI_CHINESE_LLM_RESCUE_MODEL: str = Field(
        default="qwen2.5:7b-instruct",
        description="Ollama model used for Chinese batch punctuation+translation rescue.",
    )
    AI_CHINESE_LLM_RESCUE_KEEP_ALIVE: str = Field(
        default="5m",
        description="Ollama keep_alive value used to keep the Chinese rescue model resident between batch calls.",
    )
    AI_CHINESE_LLM_RESCUE_MAX_SEGMENTS: int = Field(
        default=6,
        description="Maximum number of target subtitle segments sent in one Chinese LLM rescue request.",
    )
    AI_CHINESE_LLM_RESCUE_MAX_SECONDS: float = Field(
        default=18.0,
        description="Maximum total target-audio duration sent in one Chinese LLM rescue request.",
    )
    AI_CHINESE_LLM_RESCUE_MAX_SOURCE_CHARS: int = Field(
        default=180,
        description="Maximum total source characters sent in one Chinese LLM rescue request.",
    )
    AI_CHINESE_LLM_RESCUE_SHADOW_SEGMENTS: int = Field(
        default=1,
        description="Number of context-only subtitle segments included before and after each Chinese rescue target window when available.",
    )
    AI_CHINESE_LLM_RESCUE_MIN_HAN_CHARS: int = Field(
        default=40,
        description="Minimum total Han-character count before a Chinese batch becomes eligible for LLM rescue.",
    )
    AI_CHINESE_LLM_RESCUE_MIN_SOURCE_CHARS: int = Field(
        default=30,
        description="Minimum total source character count before a Chinese batch becomes eligible for LLM rescue.",
    )
    AI_CHINESE_LLM_RESCUE_TERMINAL_RUN: int = Field(
        default=3,
        description="Number of consecutive punctuationless Chinese segments that triggers LLM rescue.",
    )
    AI_CHINESE_LLM_RESCUE_MIN_PUNCT_DENSITY: float = Field(
        default=0.015,
        description="Minimum terminal punctuation density expected from a healthy Chinese subtitle batch.",
    )
    AI_CHINESE_LLM_RESCUE_OVERLONG_SECONDS: float = Field(
        default=6.5,
        description="Segment duration threshold above which an unpunctuated Chinese segment becomes structurally risky.",
    )
    AI_CHINESE_LLM_RESCUE_OVERLONG_HAN_CHARS: int = Field(
        default=28,
        description="Han-character threshold above which an unpunctuated Chinese segment becomes structurally risky.",
    )
    AI_CHINESE_LLM_RESCUE_SHORT_SEGMENT_MAX_SECONDS: float = Field(
        default=4.2,
        description="Maximum segment duration considered a compact dialogue turn for Chinese LLM rescue heuristics.",
    )
    AI_CHINESE_LLM_RESCUE_COMPACT_DIALOGUE_MAX_SECONDS: float = Field(
        default=18.0,
        description="Maximum total duration of a compact Chinese dialogue block eligible for proactive LLM rescue.",
    )
    AI_CHINESE_LLM_RESCUE_COMPACT_DIALOGUE_MAX_SEGMENTS: int = Field(
        default=6,
        description="Maximum segment count of a compact Chinese dialogue block eligible for proactive LLM rescue.",
    )
    AI_CHINESE_LLM_RESCUE_COMPACT_DIALOGUE_MIN_SHORT_SEGMENTS: int = Field(
        default=2,
        description="Minimum short dialogue turns required before the compact Chinese dialogue rescue heuristic can trigger.",
    )
    AI_CHINESE_LLM_RESCUE_TEMPERATURE: float = Field(
        default=0.1,
        description="Temperature used for Chinese batch LLM rescue prompts.",
    )
    AI_CHINESE_WORD_SEGMENTATION_ENABLED: bool = Field(
        default=True,
        description=(
            "Group Chinese character-level subtitle words into lexical word tokens "
            "before Tier 2 upload and final export."
        ),
    )
    AI_CHINESE_LLM_RESCUE_NUM_CTX: int = Field(
        default=8192,
        description="Ollama context window used for Chinese batch LLM rescue prompts.",
    )
    AI_CHINESE_ALIGNMENT_STRATEGY: str = Field(
        default="linear_smeared",
        description=(
            "Chinese timing post-processing strategy. "
            "Use qwen3_forced_after_llm only for the narrow CPU forced-align experiment."
        ),
    )
    AI_QWEN3_FORCE_ALIGNER_MODEL: str = Field(
        default="Qwen/Qwen3-ForcedAligner-0.6B",
        description="Model id used by the internal CPU-only Qwen3 forced aligner.",
    )
    AI_QWEN3_FORCE_ALIGNER_DEVICE: str = Field(
        default="cpu",
        description="Execution device for the internal Qwen3 forced aligner. V1 normalizes to cpu.",
    )
    AI_QWEN3_FORCE_ALIGNER_ROUTE_IDS: str = Field(
        default="sensevoice_small",
        description="Comma-separated ASR route ids eligible for post-LLM Qwen3 forced alignment.",
    )
    AI_QWEN3_FORCE_ALIGNER_MAX_SEGMENT_SECONDS: float = Field(
        default=20.0,
        description="Maximum sentence duration eligible for CPU Qwen3 forced alignment.",
    )
    AI_QWEN3_FORCE_ALIGNER_NUM_THREADS: int = Field(
        default=0,
        description="Torch CPU thread count for Qwen3 forced alignment. 0 auto-resolves to min(8, cpu_count).",
    )
    AI_QWEN3_FORCE_ALIGNER_CACHE_DIR: Path = Field(
        default=Path("temp/models/qwen3-forced-aligner"),
        description="Cache directory for the internal Qwen3 forced-aligner assets.",
    )
    AI_TRANSLATION_START_POLICY: str = Field(
        default="during_asr",
        description=(
            "after_asr | during_asr. Controls whether translation starts only "
            "after ASR releases the GPU or overlaps with ASR."
        ),
    )
    AI_ENABLE_NMT_PREFETCH: bool = Field(
        default=False,
        description=(
            "Load the NMT model before translation starts. Disabled by default "
            "for the single-GPU hybrid path."
        ),
    )

    # --- Redis (BullMQ) ---
    REDIS_HOST: str = Field(default="localhost")
    REDIS_PORT: int = Field(default=6379)
    REDIS_PASSWORD: str = Field(default="")

    # --- MinIO (Object Storage) ---
    MINIO_ENDPOINT: str = Field(default="localhost")
    MINIO_PORT: int = Field(default=9000)
    MINIO_ACCESS_KEY: str = Field(default="")
    MINIO_SECRET_KEY: str = Field(default="")
    MINIO_USE_SSL: bool = Field(default=False)
    MINIO_BUCKET_RAW: str = Field(default="raw")
    MINIO_BUCKET_PROCESSED: str = Field(default="processed")
    MINIO_PUBLIC_ENDPOINT: str = Field(
        default="", description="Public-facing MinIO URL for presigned GET URLs"
    )

    # --- Database (for direct status updates) ---
    DATABASE_URL: str = Field(default="")

    # --- Parameters Mapping ---

    @property
    def whisper_compute_type(self) -> str:
        """Quantization type. On CPU, float16/int8_float16 are not supported —
        CTranslate2 falls back to int8 automatically."""
        if self.DEVICE == "cpu":
            return "int8"
        if self.AI_PERF_MODE == AIProfile.HIGH:
            return "float16"
        elif self.AI_PERF_MODE == AIProfile.MEDIUM:
            return "int8_float16"
        else:
            return "int8"

    @property
    def whisper_beam_size(self) -> int:
        """Beam search depth"""
        if self.AI_PERF_MODE == AIProfile.HIGH:
            return 5
        elif self.AI_PERF_MODE == AIProfile.MEDIUM:
            return 3
        else:
            return 1

    @property
    def batch_size(self) -> int:
        """Batch size"""
        if self.AI_PERF_MODE == AIProfile.HIGH:
            return 8
        elif self.AI_PERF_MODE == AIProfile.MEDIUM:
            return 4
        else:
            return 1

    # --- VAD Configuration ---
    VAD_THRESHOLD: float = 0.5
    MIN_SILENCE_DURATION_MS: int = 300

    # --- Translation Config ---
    TRANSLATOR_PROVIDER: str = "google"
    USE_V2_PIPELINE: bool = Field(
        default=False,
        description="Legacy flag kept for .env compat. V2 is now the only pipeline.",
    )

    # --- NMT (NLLB via CTranslate2) ---
    NMT_MODEL_DIR: Path = Field(
        default=Path("temp/models/nllb-200-3.3B-ct2"),
        description="CTranslate2-converted NLLB model directory",
    )
    NMT_TOKENIZER_NAME: str = Field(
        default="facebook/nllb-200-3.3B",
        description="HuggingFace tokenizer name for NLLB",
    )
    NMT_COMPUTE_TYPE: str = Field(
        default="float16",
        description="CTranslate2 compute type. Use 'float16' for Blackwell/Ada (RTX 50xx/40xx). "
        "'int8_float16' is faster on Ampere/Turing but unsupported on Blackwell.",
    )
    NMT_BEAM_SIZE: int = Field(default=4, description="Beam search width for NMT")
    FUNASR_SENSEVOICE_MODEL: str = Field(
        default="iic/SenseVoiceSmall",
        description="FunASR SenseVoice model id for the experimental Chinese route.",
    )
    FUNASR_PARAFORMER_ZH_MODEL: str = Field(
        default="paraformer-zh",
        description="FunASR Paraformer Mandarin model id for the experimental Chinese backup route.",
    )
    FUNASR_FA_ZH_MODEL: str = Field(
        default="fa-zh",
        description="FunASR alignment model used to recover timestamps for Paraformer output.",
    )
    FUNASR_VAD_MODEL: str = Field(
        default="fsmn-vad",
        description="FunASR VAD model id used by experimental ASR providers.",
    )
    FUNASR_PUNC_MODEL: str = Field(
        default="ct-punc",
        description="FunASR punctuation model id for Paraformer-based transcription.",
    )
    FUNASR_ENABLE_FA_ZH_ALIGNMENT: bool = Field(
        default=True,
        description="Use fa-zh alignment when Paraformer output does not expose stable timestamps directly.",
    )
    FUNASR_MODEL_HUB: str = Field(
        default="ms",
        description="FunASR model hub to use for prototype Chinese routes: ms | hf.",
    )
    FUNASR_DISABLE_UPDATE_CHECK: bool = Field(
        default=True,
        description="Disable FunASR startup update checks for deterministic worker startup.",
    )
    FUNASR_MAX_SINGLE_SEGMENT_TIME_MS: int = Field(
        default=30000,
        description="Maximum single-segment time passed to FunASR VAD, in milliseconds.",
    )
    AI_ENABLE_LLM_REFINEMENT: bool = Field(
        default=False,
        description=(
            "Enable the optional LLM post-NMT refinement pass. Disable to speed up "
            "translated batch delivery and rely on raw NMT output only."
        ),
    )
    DEFAULT_LLM_PROVIDER_FOR_MERGER: str = Field(
        default="gemini",
        description="Primary LLM provider for semantic merge windows: ollama | openai | gemini.",
    )
    DEFAULT_LLM_PROVIDER_FOR_ANALYSIS: str = Field(
        default="gemini",
        description="Primary LLM provider for context analysis: ollama | openai | gemini.",
    )
    DEFAULT_LLM_PROVIDER_FOR_REFINEMENT: str = Field(
        default="gemini",
        description="Primary LLM provider for optional post-NMT refinement: ollama | openai | gemini.",
    )
    LLM_REMOTE_TO_OLLAMA_FALLBACK: bool = Field(
        default=True,
        description="If a remote LLM provider fails, retry the same capability with Ollama.",
    )
    OLLAMA_HOST: str = Field(
        default="",
        description="Optional Ollama base URL override, for example http://localhost:11434.",
    )
    OLLAMA_TIMEOUT_SECONDS: int = Field(
        default=120, description="Request timeout for Ollama chat calls."
    )
    OLLAMA_CPU_FALLBACK_ON_ERROR: bool = Field(
        default=True,
        description="Retry Ollama on CPU when the default runtime fails, even if it is slower.",
    )
    OLLAMA_LLM_MODEL_FOR_MERGER: str = Field(
        default="qwen2.5:7b-instruct",
        description="Ollama model used for semantic merge windows.",
    )
    OLLAMA_LLM_MODEL_FOR_ANALYSIS: str = Field(
        default="qwen2.5:7b-instruct",
        description="Ollama model used for context analysis.",
    )
    OLLAMA_LLM_MODEL_FOR_REFINEMENT: str = Field(
        default="qwen2.5:7b-instruct",
        description="Ollama model used for optional refinement.",
    )
    OLLAMA_NUM_CTX_FOR_MERGER: int = Field(
        default=8192,
        description="Bounded Ollama context size for merge windows.",
    )
    OLLAMA_NUM_CTX_FOR_ANALYSIS: int = Field(
        default=4096,
        description="Bounded Ollama context size for context analysis.",
    )
    OLLAMA_NUM_CTX_FOR_REFINEMENT: int = Field(
        default=8192,
        description="Bounded Ollama context size for refinement windows.",
    )
    OPENAI_API_KEY: str = Field(default="")
    OPENAI_BASE_URL: str = Field(
        default="",
        description="Optional OpenAI-compatible base URL override.",
    )
    OPENAI_LLM_MODEL_FOR_MERGER: str = Field(
        default="gpt-4.1-mini",
        description="OpenAI model used for semantic merge windows.",
    )
    OPENAI_LLM_MODEL_FOR_ANALYSIS: str = Field(
        default="gpt-4.1-mini",
        description="OpenAI model used for context analysis.",
    )
    OPENAI_LLM_MODEL_FOR_REFINEMENT: str = Field(
        default="gpt-4.1-mini",
        description="OpenAI model used for optional refinement.",
    )
    GEMINI_API_KEY: str = Field(default="")
    GEMINI_LLM_MODEL_FOR_MERGER: str = Field(
        default="gemini-2.5-flash",
        description="Gemini model used for semantic merge windows.",
    )
    GEMINI_LLM_MODEL_FOR_ANALYSIS: str = Field(
        default="gemini-2.5-flash-lite",
        description="Gemini model used for context analysis.",
    )
    GEMINI_LLM_MODEL_FOR_REFINEMENT: str = Field(
        default="gemini-2.5-flash",
        description="Gemini model used for optional refinement.",
    )
    CHUNK_SIZE: int = Field(
        default=8, description="Sentences per streaming chunk (all stages)"
    )
    SMART_ALIGNER_GROUP_SIZE: int = Field(
        default=8,
        description="Number of consecutive VAD segments to concatenate per SmartAligner batch.",
    )
    SUBTITLE_MAX_CJK_CHARS: int = Field(
        default=25,
        description="Maximum recommended CJK subtitle line length before splitting.",
    )
    SUBTITLE_MAX_WORDS: int = Field(
        default=15,
        description="Maximum recommended non-CJK subtitle word count before splitting.",
    )
    SILENCE_SPLIT_GAP: float = Field(
        default=0.8,
        description="Silence gap threshold in seconds for sentence splitting.",
    )
    MAX_VRAM_FRACTION: float = Field(
        default=0.5,
        description="Per-process CUDA allocator memory fraction for PyTorch-managed VRAM.",
    )
    MAX_VRAM_MB: int = Field(
        default=0,
        description="Optional soft assertion limit for NMT VRAM usage in MB (0 disables).",
    )

    # Load env vars from .env file (if present)
    model_config = SettingsConfigDict(
        env_file=".env", env_file_encoding="utf-8", extra="ignore"
    )

    @model_validator(mode="after")
    def _resolve_device(self) -> "Settings":
        """Auto-detect device when DEVICE is not explicitly set."""
        if not self.DEVICE:
            self.DEVICE = _detect_device()
        if self.HF_TOKEN:
            os.environ.setdefault("HF_TOKEN", self.HF_TOKEN)
            os.environ.setdefault("HUGGING_FACE_HUB_TOKEN", self.HF_TOKEN)
        if self.HF_HUB_DISABLE_XET:
            os.environ.setdefault("HF_HUB_DISABLE_XET", "1")
        if self.HF_HUB_DOWNLOAD_TIMEOUT > 0:
            os.environ.setdefault(
                "HF_HUB_DOWNLOAD_TIMEOUT", str(self.HF_HUB_DOWNLOAD_TIMEOUT)
            )
        return self

    def create_dirs(self):
        """Initialize directories"""
        os.makedirs(self.TEMP_DIR, exist_ok=True)
        os.makedirs(self.OUTPUT_DIR, exist_ok=True)
        os.makedirs(self.AI_ASR_PROVIDER_CACHE_DIR, exist_ok=True)
        os.makedirs(self.AI_AUDIO_INSPECTOR_CACHE_DIR, exist_ok=True)
        os.makedirs(self.AI_QWEN3_FORCE_ALIGNER_CACHE_DIR, exist_ok=True)

    @staticmethod
    def normalize_language_tag(language: str | None) -> str:
        """Normalize a language hint into a lowercase hyphenated tag."""
        if not language:
            return ""
        return language.strip().lower().replace("_", "-")

    @staticmethod
    def normalize_route_id(route_id: str | None) -> str:
        """Normalize internal ASR route identifiers."""
        if not route_id:
            return ""
        return route_id.strip().lower().replace("-", "_")

    @staticmethod
    def parse_csv_tokens(raw: str | None) -> tuple[str, ...]:
        if not raw:
            return ()
        return tuple(
            token.strip().lower()
            for token in str(raw).split(",")
            if token and token.strip()
        )

    @staticmethod
    def parse_mapping_rules(raw: str | None) -> tuple[tuple[str, str], ...]:
        if not raw:
            return ()
        rules: list[tuple[str, str]] = []
        for item in str(raw).split(";"):
            candidate = item.strip()
            if not candidate or "=>" not in candidate:
                continue
            source, target = candidate.split("=>", 1)
            source = source.strip()
            target = target.strip()
            if source and target:
                rules.append((source, target))
        return tuple(rules)

    @property
    def source_language_hint(self) -> str:
        """Return the normalized configured source-language hint."""
        return self.normalize_language_tag(self.AI_SOURCE_LANGUAGE_HINT)

    @property
    def asr_default_route_en(self) -> str:
        return (
            self.normalize_route_id(self.AI_ASR_DEFAULT_ROUTE_EN) or "distil_whisper_en"
        )

    @property
    def asr_default_route_zh(self) -> str:
        return self.normalize_route_id(self.AI_ASR_DEFAULT_ROUTE_ZH) or "whisper_full"

    @property
    def asr_experimental_route_zh(self) -> str:
        return (
            self.normalize_route_id(self.AI_ASR_EXPERIMENTAL_ROUTE_ZH)
            or "sensevoice_small"
        )

    @property
    def asr_fallback_route_en(self) -> str:
        return self.normalize_route_id(self.AI_ASR_FALLBACK_ROUTE_EN) or "whisper_turbo"

    @property
    def asr_fallback_route_zh(self) -> str:
        return self.normalize_route_id(self.AI_ASR_FALLBACK_ROUTE_ZH) or "whisper_full"

    @property
    def asr_during_asr_certified_routes(self) -> frozenset[str]:
        routes = {
            self.normalize_route_id(route)
            for route in str(self.AI_ASR_DURING_ASR_CERTIFIED_ROUTES or "").split(",")
            if self.normalize_route_id(route)
        }
        if not routes:
            routes = {"distil_whisper_en", "whisper_turbo", "sensevoice_small"}
        return frozenset(routes)

    @property
    def asr_force_route(self) -> str:
        return self.normalize_route_id(self.AI_ASR_FORCE_ROUTE)

    @property
    def chinese_recovery_route_ids(self) -> tuple[str, ...]:
        routes: list[str] = []
        configured_routes = [
            self.normalize_route_id(route)
            for route in self.parse_csv_tokens(self.AI_CHINESE_RECOVERY_ROUTE_IDS)
            if self.normalize_route_id(route)
        ]
        if configured_routes:
            candidates = configured_routes
        else:
            candidates = [self.asr_default_route_zh]
            if self.AI_CHINESE_RECOVERY_ENABLE_SENSEVOICE:
                candidates.append("sensevoice_small")
            if self.AI_CHINESE_RECOVERY_ENABLE_WHISPER_FULL:
                candidates.append(self.asr_fallback_route_zh)

        for normalized in candidates:
            if (
                normalized == "sensevoice_small"
                and not self.AI_CHINESE_RECOVERY_ENABLE_SENSEVOICE
            ):
                continue
            if (
                normalized == "whisper_full"
                and not self.AI_CHINESE_RECOVERY_ENABLE_WHISPER_FULL
            ):
                continue
            if normalized and normalized not in routes:
                routes.append(normalized)
        return tuple(routes)

    @property
    def chinese_llm_rescue_split_hint_route_ids(self) -> frozenset[str]:
        routes = {
            self.normalize_route_id(route)
            for route in self.parse_csv_tokens(
                self.AI_CHINESE_LLM_RESCUE_SPLIT_HINT_ROUTE_IDS
            )
            if self.normalize_route_id(route)
        }
        if not routes:
            routes = {"sensevoice_small"}
        return frozenset(routes)

    @property
    def chinese_alignment_strategy(self) -> str:
        value = (
            str(self.AI_CHINESE_ALIGNMENT_STRATEGY or "linear_smeared").strip().lower()
        )
        if value not in {"linear_smeared", "qwen3_forced_after_llm"}:
            return "linear_smeared"
        return value

    @property
    def qwen3_force_aligner_device(self) -> str:
        value = str(self.AI_QWEN3_FORCE_ALIGNER_DEVICE or "cpu").strip().lower()
        if value != "cpu":
            return "cpu"
        return value

    @property
    def qwen3_force_aligner_route_ids(self) -> frozenset[str]:
        routes = {
            self.normalize_route_id(route)
            for route in self.parse_csv_tokens(self.AI_QWEN3_FORCE_ALIGNER_ROUTE_IDS)
            if self.normalize_route_id(route)
        }
        if not routes:
            routes = {"sensevoice_small"}
        return frozenset(routes)

    @property
    def qwen3_force_aligner_num_threads(self) -> int:
        configured = int(self.AI_QWEN3_FORCE_ALIGNER_NUM_THREADS or 0)
        if configured > 0:
            return configured
        return min(8, os.cpu_count() or 1)

    @property
    def translation_start_policy(self) -> str:
        """Return the normalized translation start policy."""
        value = str(self.AI_TRANSLATION_START_POLICY or "during_asr").strip().lower()
        if value not in {"after_asr", "during_asr"}:
            return "during_asr"
        return value

    @property
    def hybrid_after_asr_mode(self) -> bool:
        """Return True when the single-GPU hybrid schedule is active."""
        return self.translation_start_policy == "after_asr"

    @property
    def nmt_prefetch_enabled(self) -> bool:
        """Return True when NMT prefetch is allowed for this runtime mode."""
        return self.AI_ENABLE_NMT_PREFETCH and not self.hybrid_after_asr_mode

    @property
    def chinese_prior_title_keywords(self) -> tuple[str, ...]:
        return self.parse_csv_tokens(self.AI_CHINESE_PRIOR_TITLE_KEYWORDS)

    @property
    def chinese_prior_filename_keywords(self) -> tuple[str, ...]:
        return self.parse_csv_tokens(self.AI_CHINESE_PRIOR_FILENAME_KEYWORDS)

    @property
    def chinese_text_normalization_rules(self) -> tuple[tuple[str, str], ...]:
        return self.parse_mapping_rules(self.AI_CHINESE_TEXT_NORMALIZATION_RULES)

    @property
    def chinese_dedupe_short_phrases(self) -> tuple[str, ...]:
        return self.parse_csv_tokens(self.AI_CHINESE_DEDUPE_SHORT_PHRASES)

    @staticmethod
    def normalize_llm_capability(capability: str) -> str:
        """Map capability aliases onto the three supported LLM task buckets."""
        normalized = capability.strip().lower()
        if normalized in {"merge", "merger"}:
            return "merger"
        if normalized in {"analysis", "analyze", "context_analysis"}:
            return "analysis"
        if normalized in {"refine", "refinement"}:
            return "refinement"
        raise ValueError(f"Unsupported LLM capability: {capability}")

    def llm_provider_for(self, capability: str) -> str:
        """Resolve the configured primary provider for a capability."""
        capability_name = self.normalize_llm_capability(capability)
        field_name = f"DEFAULT_LLM_PROVIDER_FOR_{capability_name.upper()}"
        provider = str(getattr(self, field_name, "ollama") or "ollama").strip().lower()
        if provider not in {"ollama", "openai", "gemini"}:
            return "ollama"
        return provider

    def llm_model_for(self, provider: str, capability: str) -> str:
        """Resolve the configured model name for a provider/capability pair."""
        capability_name = self.normalize_llm_capability(capability)
        provider_name = provider.strip().lower()
        if provider_name not in {"ollama", "openai", "gemini"}:
            raise ValueError(f"Unsupported LLM provider: {provider}")
        field_name = f"{provider_name.upper()}_LLM_MODEL_FOR_{capability_name.upper()}"
        return str(getattr(self, field_name)).strip()

    def ollama_num_ctx_for(self, capability: str) -> int:
        """Resolve bounded Ollama context settings by capability."""
        capability_name = self.normalize_llm_capability(capability)
        field_name = f"OLLAMA_NUM_CTX_FOR_{capability_name.upper()}"
        return int(getattr(self, field_name))


settings = Settings()

settings.create_dirs()
