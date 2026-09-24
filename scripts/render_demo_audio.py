"""Produce synthetic narration segments for the reproducible live product demo."""
import asyncio
import json
import subprocess
from pathlib import Path

import edge_tts

ROOT = Path(__file__).resolve().parents[1]
WORK = ROOT / "docs" / "video-work"
SEGMENTS = [
    "This is the live Curve Covenant site. I will use a public mainnet DBC pool as a technical example. We do not own or endorse this token. I click Try a live pool, and the app reads its current pool and config from Solana using Meteora's official SDK.",
    "The report identifies the verified chain slot and explains the actual initial trading fee, the quote asset and graduation target, the migration destination and the live reserve progress. It also shows the creator, fee claimer, token authority, and liquidity distribution. Every address links to a block explorer, and the raw decoded accounts are available for independent checking.",
    "The scenario lab runs Meteora's own swap quote math against fresh pool state. I enter ten USDC, then one hundred USDC. The estimated token output, the one percent slippage minimum, and fee split update from the official SDK. This is a read-only simulation. No wallet is connected, no funds are spent, and no trade is submitted.",
    "A launch can publish these terms as a covenant. I select exact on-chain fields, give the document a name, and download the JSON file. Then I import it into the app: each claim is checked against a new chain read. This example is unsigned because the sample token is not ours. A real DBC fee claimer or pool creator can sign with Phantom, and the app checks both the Ed25519 signature and the signer's on-chain role.",
    "Finally, a launchpad or trading terminal can embed the report with a single iframe. This compact view reads live chain data when it loads. The same open source repo contains the DBC decoder, quote integration, signing and comparison logic, and tests. Curve Covenant makes launch terms visible, attributable and repeatably checkable.",
]


def duration(path: Path) -> float:
    output = subprocess.check_output(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "json", str(path)])
    return float(json.loads(output)["format"]["duration"])


async def main():
    WORK.mkdir(parents=True, exist_ok=True)
    lengths = []
    for index, text in enumerate(SEGMENTS, 1):
        path = WORK / f"demo-{index}.mp3"
        await edge_tts.Communicate(text, "en-US-AvaNeural", rate="+4%").save(str(path))
        lengths.append(duration(path) + 1.5)
    (WORK / "demo-lengths.json").write_text(json.dumps(lengths))
    print("Segment durations:", [round(value, 1) for value in lengths], "total:", round(sum(lengths), 1))
    if sum(lengths) > 180:
        raise RuntimeError("Demo exceeds 3 minutes")


if __name__ == "__main__":
    asyncio.run(main())
