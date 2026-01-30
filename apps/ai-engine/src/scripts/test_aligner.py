"""
Script to test SmartAligner
===========================
Runs the full pipeline:
1. VAD (Music Mode) -> Segments
2. SmartAligner -> Detailed Sentences/Words
"""
import sys
import json
from pathlib import Path

# Add project root to sys.path
project_root = Path(__file__).resolve().parent.parent.parent
sys.path.append(str(project_root))

sys.stdout.reconfigure(encoding='utf-8')

from loguru import logger
from src.core.vad_manager import VADManager
from src.core.smart_aligner import SmartAligner
from src.core.audio_inspector import AudioInspector
from src.utils.audio_processor import AudioProcessor

def main():
    # Input File
    input_file = project_root / "test-media" / "demo_audio_2.mp3"
    
    if not input_file.exists():
        logger.error(f"File not found: {input_file}")
        return

    logger.info(f"--- Testing Pipeline on {input_file.name} ---")
    
    # 0. Standardize Audio (16kHz WAV)
    logger.info(">>> Step 0: Audio Standardization")
    processor = AudioProcessor()
    meta = processor.process(input_file)
    standardized_path = meta.path
    
    # 1. Audio Inspection (Gatekeeper)
    logger.info(">>> Step 1: Audio Inspection")
    inspector = AudioInspector()
    profile = inspector.inspect(standardized_path) 
    
    # 2. VAD (Adaptive)
    logger.info(f">>> Step 2: VAD ({profile.upper()} Mode)")
    vad = VADManager()
    # VADManager now handles isolation internally if profile=music
    # It returns the path used (which might be isolated) so we can reuse it!
    segments, processed_audio_path = vad.process(standardized_path, profile=profile)
    
    logger.info(f"VAD found {len(segments)} segments. Processing Path: {processed_audio_path}")
    
    if not segments:
        logger.warning("No segments found. Exiting.")
        return

    # 3. Alignment
    logger.info(f">>> Step 3: Smart Aligner (Profile: {profile} - Path: {standardized_path})")
    aligner = SmartAligner()
    # We use the processed path (isolated vocals) from VAD!
    sentences = aligner.process(processed_audio_path, segments, profile=profile)
    
    # 3. Print Fancy Output
    print("\n" + "="*60)
    print(f"FINAL TRANSCRIPTION ({len(sentences)} Sentences)")
    print("="*60)
    
    for i, sent in enumerate(sentences):
        print(f"\n#{i+1} [{sent.start:.2f}s -> {sent.end:.2f}s]: \"{sent.text}\"")
        
        # Print a few words as check
        words_str = " | ".join([f"{w.word}({w.phoneme or '-'})" for w in sent.words])
        print(f"   Words: {words_str}")
        
    print("\n" + "="*60)
    
    # 4. Save to JSON
    output_path = project_root / "outputs" / f"{input_file.stem}_alignment.json"
    output_path.parent.mkdir(exist_ok=True, parents=True)
    
    logger.info(f"Saving alignment results to {output_path}")
    
    data = [sent.model_dump() for sent in sentences]
    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    
if __name__ == "__main__":
    main()
