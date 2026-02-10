"""
Mock Media Processor — Simulates heavy processing work.

This script is spawned by the Node.js MediaProcessor as a child process.
In production, this will be replaced with actual logic:
  - yt-dlp for YouTube audio extraction
  - ffmpeg for audio processing
  - Whisper / AI inference for transcription

Usage:
    python mock_processor.py --input <source> --media-id <id> --job-id <id>
"""

import argparse
import sys
import time


def main():
    parser = argparse.ArgumentParser(description="Mock Media Processor")
    parser.add_argument("--input", required=True, help="Input source (file path or URL)")
    parser.add_argument("--media-id", required=True, help="Database MediaItem ID")
    parser.add_argument("--job-id", required=True, help="BullMQ Job ID")
    args = parser.parse_args()

    print(f"[mock_processor] Starting processing for media: {args.media_id}")
    print(f"[mock_processor] Input source: {args.input}")
    print(f"[mock_processor] Job ID: {args.job_id}")

    # Simulate processing stages
    stages = [
        ("Downloading audio...", 1),
        ("Extracting features...", 1),
        ("Running transcription model...", 2),
        ("Generating subtitles...", 1),
    ]

    for stage_name, duration in stages:
        print(f"[mock_processor] {stage_name}")
        sys.stdout.flush()  # Ensure Node.js receives output immediately
        time.sleep(duration)

    print(f"[mock_processor] Processing completed for media: {args.media_id}")
    sys.stdout.flush()
    sys.exit(0)


if __name__ == "__main__":
    main()
