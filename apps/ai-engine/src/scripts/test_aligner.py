"""
Script to test SmartAligner
===========================
Runs the full pipeline:
1. VAD (Music Mode) -> Segments
2. SmartAligner -> Detailed Sentences/Words
"""
import sys
from pathlib import Path

# Add project root to sys.path
project_root = Path(__file__).resolve().parent.parent.parent
sys.path.append(str(project_root))

from loguru import logger
from src.core.vad_manager import VADManager
from src.core.smart_aligner import SmartAligner

def main():
    # Input File
    input_file = project_root / "test-media" / "demo_audio_2.mp3"
    
    if not input_file.exists():
        logger.error(f"File not found: {input_file}")
        return

    logger.info(f"--- Testing Pipeline on {input_file.name} ---")
    
    # 1. VAD (Music Mode)
    logger.info(">>> Step 1: VAD (Music Mode)")
    vad = VADManager()
    segments = vad.process(input_file, profile="music")
    
    logger.info(f"VAD found {len(segments)} segments.")
    
    if not segments:
        logger.warning("No segments found. Exiting.")
        return

    # 2. Alignment
    logger.info(">>> Step 2: Smart Aligner (Transcription)")
    aligner = SmartAligner()
    sentences = aligner.process(input_file, segments)
    
    # 3. Print Fancy Output
    print("\n" + "="*60)
    print(f"FINAL TRANSCRIPTION ({len(sentences)} Sentences)")
    print("="*60)
    
    for i, sent in enumerate(sentences):
        print(f"\n#{i+1} [{sent.start:.2f}s -> {sent.end:.2f}s]: \"{sent.text}\"")
        
        # Print a few words as check
        words_str = " | ".join([f"{w.word}({w.start:.2f})" for w in sent.words])
        print(f"   Words: {words_str}")
        
    print("\n" + "="*60)
    
if __name__ == "__main__":
    main()
