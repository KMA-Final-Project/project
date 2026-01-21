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
    TEMP_DIR: Path = Field(default=Path("temp"), description="Nơi chứa file audio tạm")
    OUTPUT_DIR: Path = Field(default=Path("outputs"), description="Nơi chứa file JSON kết quả")
    
    # --- Hardware Configuration ---
    DEVICE: str = Field(default="cuda", description="cuda hoặc cpu")
    DEVICE_INDEX: int = 0 # GPU index
    
    # --- AI Performance Mode ---
    AI_PERF_MODE: AIProfile = Field(default=AIProfile.MEDIUM, description="Chế độ chạy")

    # --- Parameters Mapping ---
    
    @property
    def whisper_compute_type(self) -> str:
        """Kiểu tính toán (Quantization)"""
        if self.AI_PERF_MODE == AIProfile.HIGH:
            return "float16"
        elif self.AI_PERF_MODE == AIProfile.MEDIUM:
            return "int8_float16"
        else:
            return "int8"

    @property
    def whisper_beam_size(self) -> int:
        """Độ sâu tìm kiếm của thuật toán Beam Search"""
        if self.AI_PERF_MODE == AIProfile.HIGH:
            return 5
        elif self.AI_PERF_MODE == AIProfile.MEDIUM:
            return 3
        else:
            return 1

    @property
    def batch_size(self) -> int:
        """Kích thước lô xử lý"""
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

    # Load biến môi trường từ file .env (nếu có)
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