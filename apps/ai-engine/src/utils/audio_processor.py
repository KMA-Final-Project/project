"""
Audio Processor Module
======================
Handles audio preprocessing for the Whisper Speech-to-Text engine.
Converts input media files (video/audio) to Whisper-friendly WAV format.
"""

from __future__ import annotations

import uuid
from pathlib import Path
from typing import Union

import ffmpeg
from loguru import logger
from pydantic import BaseModel

from src.config import settings


# =============================================================================
# Exceptions
# =============================================================================

class AudioProcessingError(Exception):
    """Custom exception raised when FFmpeg audio processing fails."""
    
    def __init__(self, message: str, original_error: Exception | None = None):
        self.message = message
        self.original_error = original_error
        super().__init__(self.message)


# =============================================================================
# Data Models
# =============================================================================

class AudioMetadata(BaseModel):
    """Metadata for processed audio files."""
    
    path: Path
    duration: float
    format: str = "wav"
    sample_rate: int = 16000

    class Config:
        """Pydantic model configuration."""
        arbitrary_types_allowed = True


# =============================================================================
# Audio Processor Class
# =============================================================================

class AudioProcessor:
    """
    Audio Processor for Whisper Speech-to-Text preprocessing.
    
    Converts input media files (video/audio) to a standardized WAV format
    optimized for Whisper ASR:
    - Format: WAV
    - Sample Rate: 16000 Hz
    - Channels: Mono (1 channel)
    - Codec: PCM 16-bit signed little-endian
    
    Attributes:
        output_dir: Directory where processed audio files are saved.
        sample_rate: Target sample rate for output audio (default: 16000).
        channels: Number of audio channels (default: 1 for mono).
        codec: Audio codec for output (default: pcm_s16le).
    """
    
    # Whisper-optimized audio parameters
    SAMPLE_RATE: int = 16000
    CHANNELS: int = 1
    CODEC: str = "pcm_s16le"
    FORMAT: str = "wav"
    
    def __init__(self, output_dir: Path | None = None) -> None:
        """
        Initialize the AudioProcessor.
        
        Args:
            output_dir: Directory for saving processed files. 
                        Defaults to settings.TEMP_DIR.
        """
        self.output_dir = output_dir or settings.TEMP_DIR
        self._ensure_output_dir()
    
    def _ensure_output_dir(self) -> None:
        """Ensure the output directory exists."""
        self.output_dir.mkdir(parents=True, exist_ok=True)
        logger.debug(f"Output directory ensured: {self.output_dir}")
    
    def _validate_file(self, file_path: Path) -> None:
        """
        Validate that the input file exists and is accessible.
        
        Args:
            file_path: Path to the input file.
            
        Raises:
            AudioProcessingError: If file does not exist or is not a file.
        """
        if not file_path.exists():
            raise AudioProcessingError(f"Input file does not exist: {file_path}")
        if not file_path.is_file():
            raise AudioProcessingError(f"Input path is not a file: {file_path}")
    
    def _generate_output_path(self, original_path: Path) -> Path:
        """
        Generate a unique output file path using UUID.
        
        Args:
            original_path: Original input file path (used for naming context).
            
        Returns:
            Path: Unique output file path with .wav extension.
        """
        unique_id = uuid.uuid4().hex[:12]
        original_stem = original_path.stem[:20]  # Limit original name length
        output_name = f"{original_stem}_{unique_id}.{self.FORMAT}"
        return self.output_dir / output_name
    
    def _probe_duration(self, file_path: Path) -> float:
        """
        Probe the audio/video file to get its duration.
        
        Args:
            file_path: Path to the media file.
            
        Returns:
            float: Duration in seconds.
            
        Raises:
            AudioProcessingError: If probing fails.
        """
        try:
            probe = ffmpeg.probe(str(file_path))
            
            # Try to get duration from format info first
            duration_str = probe.get("format", {}).get("duration")
            if duration_str:
                return float(duration_str)
            
            # Fallback: get duration from first audio/video stream
            for stream in probe.get("streams", []):
                stream_duration = stream.get("duration")
                if stream_duration:
                    return float(stream_duration)
            
            raise AudioProcessingError(
                f"Could not determine duration for file: {file_path}"
            )
            
        except ffmpeg.Error as e:
            error_message = e.stderr.decode() if e.stderr else str(e)
            logger.error(f"FFprobe failed for {file_path}: {error_message}")
            raise AudioProcessingError(
                f"Failed to probe file: {file_path}",
                original_error=e
            )
    
    def _convert_to_whisper_format(
        self, 
        input_path: Path, 
        output_path: Path
    ) -> None:
        """
        Convert audio/video file to Whisper-friendly WAV format.
        
        Args:
            input_path: Path to input media file.
            output_path: Path for output WAV file.
            
        Raises:
            AudioProcessingError: If conversion fails.
        """
        try:
            logger.info(f"Converting to Whisper format: {input_path.name}")
            
            # Build FFmpeg command
            stream = ffmpeg.input(str(input_path))
            stream = ffmpeg.output(
                stream,
                str(output_path),
                format=self.FORMAT,
                acodec=self.CODEC,
                ar=self.SAMPLE_RATE,
                ac=self.CHANNELS,
            )
            
            # Run with overwrite enabled
            ffmpeg.run(
                stream,
                overwrite_output=True,
                capture_stdout=True,
                capture_stderr=True,
                quiet=True
            )
            
            logger.info(f"Conversion successful: {output_path.name}")
            
        except ffmpeg.Error as e:
            error_message = e.stderr.decode() if e.stderr else str(e)
            logger.error(f"FFmpeg conversion failed: {error_message}")
            
            # Cleanup partial output if exists
            if output_path.exists():
                output_path.unlink()
                
            raise AudioProcessingError(
                f"Failed to convert file: {input_path}",
                original_error=e
            )
    
    def process(self, file_path: Union[str, Path]) -> AudioMetadata:
        """
        Process an audio/video file for Whisper transcription.
        
        Converts the input file to a Whisper-optimized WAV format:
        - 16kHz sample rate
        - Mono channel
        - PCM 16-bit encoding
        
        Args:
            file_path: Path to the input audio or video file.
            
        Returns:
            AudioMetadata: Metadata object containing:
                - path: Path to the processed WAV file
                - duration: Audio duration in seconds
                - format: Output format (wav)
                - sample_rate: Sample rate (16000)
                
        Raises:
            AudioProcessingError: If file validation or processing fails.
        """
        # Normalize path
        input_path = Path(file_path) if isinstance(file_path, str) else file_path
        
        logger.info(f"Processing audio file: {input_path}")
        
        # Validate input file
        self._validate_file(input_path)
        
        # Probe duration before conversion
        duration = self._probe_duration(input_path)
        logger.debug(f"Detected duration: {duration:.2f}s")
        
        # Generate unique output path
        output_path = self._generate_output_path(input_path)
        
        # Convert to Whisper format
        self._convert_to_whisper_format(input_path, output_path)
        
        # Build and return metadata
        metadata = AudioMetadata(
            path=output_path,
            duration=duration,
            format=self.FORMAT,
            sample_rate=self.SAMPLE_RATE
        )
        
        logger.info(
            f"Audio processing complete: {output_path.name} "
            f"(duration: {duration:.2f}s)"
        )
        
        return metadata
    
    def cleanup(self, file_path: Union[str, Path]) -> bool:
        """
        Remove a processed audio file.
        
        Args:
            file_path: Path to the file to remove.
            
        Returns:
            bool: True if file was removed, False if it didn't exist.
        """
        path = Path(file_path) if isinstance(file_path, str) else file_path
        
        if path.exists():
            path.unlink()
            logger.debug(f"Cleaned up file: {path}")
            return True
        
        return False
