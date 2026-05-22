# ============================================================
# AI Engine — Dockerfile
# Base: NVIDIA CUDA 12.1 + cuDNN 8 (matches faster-whisper CUDA requirements)
# ============================================================

FROM nvidia/cuda:12.1.1-cudnn8-runtime-ubuntu22.04

# Prevent interactive prompts during apt installs
ENV DEBIAN_FRONTEND=noninteractive

# ── System dependencies ──────────────────────────────────────
# ffmpeg is needed by AudioProcessor + yt-dlp
# libsndfile for soundfile/librosa
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3.11 \
    python3-pip \
    python3.11-venv \
    ffmpeg \
    libsndfile1 \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Make python3 point to python3.11
RUN ln -sf /usr/bin/python3.11 /usr/bin/python3 \
    && ln -sf /usr/bin/python3.11 /usr/bin/python

# ── Working directory ────────────────────────────────────────
WORKDIR /app

# ── Python dependencies ──────────────────────────────────────
# Copy requirements first to leverage Docker layer cache
# (dependencies only reinstall when requirements.txt changes)
COPY requirements.txt .

# Install PyTorch with CUDA 12.1 support first (must precede requirements.txt)
RUN pip install --no-cache-dir --upgrade pip \
    && pip install --no-cache-dir \
    torch==2.3.1 \
    torchvision==0.18.1 \
    --index-url https://download.pytorch.org/whl/cu121

# Install remaining requirements
RUN pip install --no-cache-dir -r requirements.txt

# ── Application source ───────────────────────────────────────
COPY src/ ./src/

# ── Runtime config ───────────────────────────────────────────
# Outputs/temp inside container (mounted as volumes in docker-compose)
ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    HF_HOME=/root/.cache/huggingface \
    MODELSCOPE_CACHE=/root/.cache/modelscope \
    OUTPUT_DIR=/app/outputs \
    TEMP_DIR=/app/temp

# Create output directories
RUN mkdir -p /app/outputs /app/temp /root/.cache/modelscope

# ── Entrypoint ───────────────────────────────────────────────
CMD ["python", "-m", "src.main"]
