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
    DEVICE_INDEX: int = 0 # GPU index
    
    # --- AI Performance Mode ---
    AI_PERF_MODE: AIProfile = Field(default=AIProfile.MEDIUM, description="Performance profile")

    # --- Whisper Model Configuration ---
    # Turbo model: faster, used for well-resourced languages (EN, VI, FR, etc.)
    WHISPER_MODEL_TURBO: str = Field(
        default="large-v3-turbo",
        description="Fast model for common languages"
    )
    # Full model: highest accuracy, used for CJK and complex languages
    WHISPER_MODEL_FULL: str = Field(
        default="large-v3",
        description="Accuracy model for CJK languages"
    )
    # Languages that require the full model
    WHISPER_CJK_LANGUAGES: list[str] = Field(
        default=["zh", "ja", "ko"],
        description="Languages routed to the full model"
    )
    # Worker model mode: controls which models are loaded into VRAM
    #   auto       → load both models (single instance, ~8 GB VRAM)
    #   turbo_only → load only turbo (~3 GB VRAM, for EN/VI worker)
    #   full_only  → load only full  (~5 GB VRAM, for CJK worker)
    WORKER_MODEL_MODE: str = Field(
        default="auto",
        description="auto | turbo_only | full_only"
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

    # Load env vars from .env file (if present)
    model_config = SettingsConfigDict(
        env_file=".env", 
        env_file_encoding="utf-8",
        extra="ignore"
    )

    def create_dirs(self):
        """Initialize directories"""
        os.makedirs(self.TEMP_DIR, exist_ok=True)
        os.makedirs(self.OUTPUT_DIR, exist_ok=True)

settings = Settings()

settings.create_dirs()