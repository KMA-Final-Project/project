"""
Test script for AudioProcessor module.
Usage: python src/scripts/test_audio_processor.py <audio_file_path>
"""

import sys
from pathlib import Path

# Add project root to path for imports
project_root = Path(__file__).resolve().parent.parent.parent
sys.path.insert(0, str(project_root))

from src.utils import AudioProcessor, AudioMetadata, AudioProcessingError
from loguru import logger


def main():
    # Default test file or use command line argument
    if len(sys.argv) > 1:
        input_file = Path(sys.argv[1])
    else:
        input_file = project_root / "test-media" / "demo_audio.mp3"
    
    logger.info(f"Testing AudioProcessor with: {input_file}")
    
    # Initialize processor
    processor = AudioProcessor()
    
    try:
        # Process the audio file
        metadata: AudioMetadata = processor.process(input_file)
        
        # Display results
        print("\n" + "=" * 50)
        print("✅ AUDIO PROCESSING SUCCESSFUL")
        print("=" * 50)
        print(f"📁 Input:       {input_file}")
        print(f"📁 Output:      {metadata.path}")
        print(f"⏱️  Duration:    {metadata.duration:.2f} seconds")
        print(f"🎵 Format:      {metadata.format}")
        print(f"📊 Sample Rate: {metadata.sample_rate} Hz")
        print(f"📦 File Size:   {metadata.path.stat().st_size / 1024:.2f} KB")
        print("=" * 50)
        
        # Optional: cleanup after test
        # processor.cleanup(metadata.path)
        # print("🧹 Cleaned up temporary file")
        
    except AudioProcessingError as e:
        logger.error(f"Processing failed: {e.message}")
        if e.original_error:
            logger.error(f"Original error: {e.original_error}")
        sys.exit(1)


if __name__ == "__main__":
    main()
