"""Mux the real-browser walkthrough with synthetic narration."""
import json
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
WORK = ROOT / "docs" / "video-work"
OUTPUT = ROOT / "public" / "demo.mp4"
lengths = json.loads((WORK / "demo-lengths.json").read_text())


def run(*args):
    subprocess.run(args, check=True)


for index, length in enumerate(lengths, 1):
    run("ffmpeg", "-y", "-loglevel", "error", "-i", str(WORK / f"demo-{index}.mp3"),
        "-af", "apad", "-t", str(length), "-c:a", "aac", "-b:a", "96k",
        str(WORK / f"demo-audio-{index}.m4a"))

concat = WORK / "demo-audio-list.txt"
concat.write_text("\n".join(f"file '{WORK / f'demo-audio-{index}.m4a'}'" for index in range(1, len(lengths) + 1)) + "\n")
audio = WORK / "demo-narration.m4a"
run("ffmpeg", "-y", "-loglevel", "error", "-f", "concat", "-safe", "0", "-i", str(concat), "-c", "copy", str(audio))

run("ffmpeg", "-y", "-loglevel", "error", "-i", str(WORK / "demo-raw.webm"),
    "-i", str(audio), "-map", "0:v:0", "-map", "1:a:0", "-c:v", "libx264",
    "-preset", "veryfast", "-crf", "25", "-pix_fmt", "yuv420p", "-c:a", "aac",
    "-b:a", "96k", "-shortest", "-movflags", "+faststart", str(OUTPUT))
output = subprocess.check_output(["ffprobe", "-v", "error", "-show_entries", "format=duration,size", "-of", "json", str(OUTPUT)])
print(OUTPUT, json.loads(output)["format"])
