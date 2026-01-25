"""
Debug AST Inspector
Run AudioInspector on test files and print predictions.
"""
import sys
from pathlib import Path
from loguru import logger

project_root = Path(__file__).resolve().parent.parent.parent
sys.path.append(str(project_root))

from src.core.audio_inspector import AudioInspector

def main():
    inspector = AudioInspector()
    
    media_dir = project_root / "test-media"
    files = ["demo_audio_2.mp3", "demo_audio_3.mp3"]
    
    for fname in files:
        f = media_dir / fname
        if not f.exists():
            logger.error(f"Skipping {fname} (not found)")
            continue
            
        logger.info(f"\n--- Testing {fname} ---")
        try:
            profile = inspector.inspect(f)
            logger.success(f"FINAL DECISION: {profile.upper()}")
        except Exception as e:
            logger.error(f"CRASH: {e}")

if __name__ == "__main__":
    main()
