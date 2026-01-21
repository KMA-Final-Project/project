#!/usr/bin/env python3
import argparse
import os
from yt_dlp import YoutubeDL

def download(url, out_dir, mode):
    os.makedirs(out_dir, exist_ok=True)
    if mode == "mp4":
        # standard resolution: prefer <=480p MP4, fallback to best available mp4
        ydl_opts = {
            "format": "bestvideo[ext=mp4][height<=480]+bestaudio/best[ext=mp4][height<=480]/best",
            "outtmpl": os.path.join(out_dir, "%(title)s.%(ext)s"),
            "merge_output_format": "mp4",
            "noplaylist": True,
            "quiet": False,
        }
    else:  # mp3
        ydl_opts = {
            "format": "bestaudio/best",
            "outtmpl": os.path.join(out_dir, "%(title)s.%(ext)s"),
            "noplaylist": True,
            "postprocessors": [
                {
                    "key": "FFmpegExtractAudio",
                    "preferredcodec": "mp3",
                    "preferredquality": "192",
                }
            ],
            "quiet": False,
        }

    with YoutubeDL(ydl_opts) as ydl:
        ydl.download([url])

def main():
    parser = argparse.ArgumentParser(description="Download YouTube as MP4 (std) or MP3")
    parser.add_argument("url", help="YouTube video URL")
    parser.add_argument("--mode", choices=["mp4","mp3"], default="mp4", help="Download format")
    parser.add_argument("--out", default="downloads", help="Output directory")
    args = parser.parse_args()
    download(args.url, args.out, args.mode)

if __name__ == "__main__":
    main()
