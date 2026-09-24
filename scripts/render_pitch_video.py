"""Render a narrated, reproducible presentation video from the pitch PDF.

Requires: edge-tts (in .venv), ffmpeg, ffprobe, pdftoppm.
Narration is a synthetic English voice. No founder voice is imitated.
"""

import asyncio
import json
import subprocess
from pathlib import Path

import edge_tts

ROOT = Path(__file__).resolve().parents[1]
WORK = ROOT / "docs" / "video-work"
PDF = ROOT / "docs" / "Curve-Covenant-Pitch.pdf"
OUTPUT = ROOT / "public" / "pitch.mp4"

NARRATION = [
    "Every token launch has a story. Curve Covenant lets anyone read the actual contract behind a Meteora Dynamic Bonding Curve launch. It is a disclosure and verification layer, built on Solana mainnet data and the official Meteora software development kit.",
    "Meteora DBC gives builders powerful controls over trading fees, curve shape, migration, liquidity and token authority. Those choices live in on-chain accounts, but are hard to understand together. A screenshot can leave out a setting. A social post cannot prove the launch owner made it. A promise needs a better format.",
    "Curve Covenant has four steps. Inspect a DBC pool or config and see the current terms. Simulate a buy without sending a transaction. Select exact fields and export a portable covenant. The DBC fee claimer or pool creator can sign it. Anyone can later verify the signature and compare every claim with a fresh chain read.",
    "The integration runs through the core of the product. Meteora's SDK decodes standard and transfer-hook account variants. The scenario lab calls the SDK's own partial-fill swap quote against fresh reserves. Raw token amounts use exact integers. Signature verification checks the signer against the actual DBC roles. The live browser example reads a real mainnet pool.",
    "Launch studios help a team design and deploy. Screeners help people find a pool. Curve Covenant provides the missing trust layer: a readable, attributable and repeatable statement of launch terms. Start with a free public inspector and signed disclosure, then offer embeds for launchpads and terminals. Historical monitoring is a future business path, not current revenue.",
    "The product, source code, tests and live site are public today. You can inspect a mainnet pool, simulate a quote, and verify a signed disclosure. We have not claimed users, revenue or a prize. Curve Covenant aims to make every Meteora launch easier to understand and harder to misrepresent.",
]


def run(*args):
    subprocess.run(args, check=True, stdout=subprocess.DEVNULL)


def duration(path: Path) -> float:
    output = subprocess.check_output([
        "ffprobe", "-v", "error", "-show_entries", "format=duration",
        "-of", "json", str(path),
    ])
    return float(json.loads(output)["format"]["duration"])


async def main():
    WORK.mkdir(parents=True, exist_ok=True)
    run("pdftoppm", "-png", "-r", "96", str(PDF), str(WORK / "slide"))
    paths = []
    total = 0.0
    for index, text in enumerate(NARRATION, 1):
        audio = WORK / f"slide-{index}.mp3"
        await edge_tts.Communicate(text, "en-US-AvaNeural", rate="+4%").save(str(audio))
        image = WORK / f"slide-{index}.png"
        video = WORK / f"segment-{index}.mp4"
        length = duration(audio) + 1.0
        total += length
        fade_out = max(0, length - 0.45)
        run("ffmpeg", "-y", "-loglevel", "error", "-loop", "1", "-framerate", "24",
            "-i", str(image), "-i", str(audio), "-t", str(length),
            "-vf", f"fade=t=in:st=0:d=0.4,fade=t=out:st={fade_out}:d=0.4,format=yuv420p",
            "-af", "apad", "-c:v", "libx264", "-preset", "veryfast", "-crf", "25",
            "-c:a", "aac", "-b:a", "96k", "-movflags", "+faststart", str(video))
        paths.append(video)
        print(f"Slide {index}: {length:.1f}s")
    if total > 180:
        raise RuntimeError(f"Presentation exceeds three minutes: {total:.1f}s")
    concat = WORK / "segments.txt"
    concat.write_text("\n".join(f"file '{path}'" for path in paths) + "\n")
    run("ffmpeg", "-y", "-loglevel", "error", "-f", "concat", "-safe", "0",
        "-i", str(concat), "-c", "copy", "-movflags", "+faststart", str(OUTPUT))
    print(f"Created {OUTPUT} ({duration(OUTPUT):.1f}s)")


if __name__ == "__main__":
    asyncio.run(main())
