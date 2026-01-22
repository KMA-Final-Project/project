"""
Test script for VADManager module.
Usage: python src/scripts/test_vad.py <audio_file_path>
"""

import sys
import traceback
from pathlib import Path

# Add project root to path for imports
project_root = Path(__file__).resolve().parent.parent.parent
sys.path.insert(0, str(project_root))

from loguru import logger
from src.utils import AudioProcessor, AudioProcessingError
from src.core.vad_manager import VADManager
from src.schemas import SegmentType

def print_results(mode_name: str, segments: list):
    print("\n" + "=" * 60)
    print(f"✅ {mode_name} RESULTS: {len(segments)} segments found")
    print("=" * 60)
    
    header = f"{'START (s)':<10} | {'END (s)':<10} | {'DURATION':<10} | {'TYPE':<10}"
    print(header)
    print("-" * 60)
    
    for seg in segments:
        row = (
            f"{seg.start:<10.3f} | {seg.end:<10.3f} | "
            f"{seg.duration:<10.3f} | {seg.type.value}"
        )
        if seg.type == SegmentType.SPECIAL_CASE:
            row += " ⚠️"
        print(row)
        
    print("=" * 60)

def main():
    # Default test file or use command line argument
    if len(sys.argv) > 1:
        input_file = Path(sys.argv[1])
    else:
        input_file = project_root / "test-media" / "demo_audio.mp3"
    
    logger.info(f"Testing VADManager with: {input_file}")
    
    # 1. Preprocessing (AudioProcessor)
    processor = AudioProcessor()
    wav_path = None
    
    try:
        logger.info("Step 1: Convert to Whisper format (16kHz WAV)...")
        metadata = processor.process(input_file)
        wav_path = metadata.path
        logger.info(f"Audio processed: {wav_path}")
        
    except AudioProcessingError as e:
        logger.error(f"Audio processing failed: {e}")
        sys.exit(1)
        
    # 2. VAD (VADManager)
    try:
        vad_manager = VADManager()
        
        # Test 1: Standard Mode
        logger.info("\n--- TEST 1: STANDARD MODE ---")
        segments_std = vad_manager.process(wav_path, profile="standard")
        print_results("STANDARD", segments_std)
        
        # Test 2: Music Mode
        logger.info("\n--- TEST 2: MUSIC MODE ---")
        segments_music = vad_manager.process(wav_path, profile="music")
        print_results("MUSIC", segments_music)
        
    except Exception as e:
        logger.error(f"VAD failed: {e}")
        traceback.print_exc()
        sys.exit(1)
    finally:
        pass
        # Optional Cleanup
        # if wav_path and wav_path.exists():
        #     processor.cleanup(wav_path)

if __name__ == "__main__":
    main()
