import sys
from pathlib import Path

project_root = Path(__file__).resolve().parent.parent.parent
sys.path.append(str(project_root))

from loguru import logger
from src.core.pipeline import PipelineOrchestrator

def main():
    logger.info("Initializing Pipeline Orchestrator...")
    orchestrator = PipelineOrchestrator()
    
    input_file = project_root / "test-media" / "demo_audio_2.mp3"
    
    if not input_file.exists():
        logger.error(f"Test file not found: {input_file}")
        return
        
    logger.info(f"Running End-to-End Pipeline for: {input_file}")
    
    try:
        # Run with Vietnamese target
        output_path = orchestrator.process_video(input_file, target_lang="vi")
        logger.success(f"Final Output Saved: {output_path}")
        
    except Exception as e:
        logger.exception(f"Pipeline Failed: {e}")

if __name__ == "__main__":
    main()
