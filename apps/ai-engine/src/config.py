import os
from enum import Enum
from pathlib import Path
from pydantic_settings import BaseSettings, SettingsConfigDict
from pydantic import DirectoryPath, Field


# Performance Profiles
class AIProfile(str, Enum):
    LOW = "LOW"
    MEDIUM = "MEDIUM"
    HIGH = "HIGH"


class Settings(BaseSettings):
    # --- Project Info ---
    APP_NAME: str = "AI Engine Worker"
    ENV: str = Field(default="development", description="dev, staging, production")

    # --- Paths ---
    BASE_DIR: DirectoryPath = Path(__file__).resolve().parent.parent
    TEMP_DIR: Path = Field(default=Path("temp"), description="Temp audio files")
    OUTPUT_DIR: Path = Field(default=Path("outputs"), description="JSON result files")

    # --- Hardware Configuration ---
    DEVICE: str = Field(default="cuda", description="cuda or cpu")
    DEVICE_INDEX: int = 0  # GPU index

    # --- AI Performance Mode ---
    AI_PERF_MODE: AIProfile = Field(
        default=AIProfile.MEDIUM, description="Performance profile"
    )
    AI_PREWARM_MODELS: bool = Field(
        default=False,
        description=(
            "Preload heavy long-lived inference components at worker startup "
            "(Whisper, AST inspector, VAD, NMT) before accepting jobs."
        ),
    )

    # --- Whisper Model Configuration ---
    # Turbo model: faster, used for well-resourced languages (EN, VI, FR, etc.)
    WHISPER_MODEL_TURBO: str = Field(
        default="large-v3-turbo", description="Fast model for common languages"
    )
    # Full model: highest accuracy, used for CJK and complex languages
    WHISPER_MODEL_FULL: str = Field(
        default="large-v3", description="Accuracy model for CJK languages"
    )
    # Languages that require the full model
    WHISPER_CJK_LANGUAGES: list[str] = Field(
        default=["zh", "ja", "ko"], description="Languages routed to the full model"
    )
    # Worker model mode: controls which models are loaded into VRAM
    #   auto       → load both models (single instance, ~8 GB VRAM)
    #   turbo_only → load only turbo (~3 GB VRAM, for EN/VI worker)
    #   full_only  → load only full  (~5 GB VRAM, for CJK worker)
    WORKER_MODEL_MODE: str = Field(
        default="auto", description="auto | turbo_only | full_only"
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
        """Quantization type"""
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

    def create_dirs(self):
        """Initialize directories"""
        os.makedirs(self.TEMP_DIR, exist_ok=True)
        os.makedirs(self.OUTPUT_DIR, exist_ok=True)

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
