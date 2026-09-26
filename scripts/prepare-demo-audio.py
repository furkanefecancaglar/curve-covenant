"""Generate synthetic narration and sentence captions from the checked-in script.
Run with an environment containing edge-tts; no credentials or private text used.
"""
import asyncio
import json
import argparse
from pathlib import Path
import edge_tts

ROOT = Path(__file__).resolve().parents[1]
WORK = ROOT / 'docs/video-work'
VOICE = 'en-US-AriaNeural'
parser = argparse.ArgumentParser()
parser.add_argument('--kind', choices=['demo', 'pitch'], default='demo')
args = parser.parse_args()

async def main():
    WORK.mkdir(parents=True, exist_ok=True)
    scenes = json.loads((ROOT / f'docs/{args.kind}-scenes.json').read_text())
    for scene in scenes:
        audio = WORK / f'{scene["id"]}.mp3'
        # Always regenerate when text changes; metadata makes narration reproducible.
        metadata = WORK / f'{scene["id"]}.voice.json'
        settings = {'voice': VOICE, 'rate': '+5%', 'text': scene['text']}
        if audio.exists() and metadata.exists() and json.loads(metadata.read_text()) == settings:
            continue
        communication = edge_tts.Communicate(scene['text'], VOICE, rate='+5%')
        subtitles = edge_tts.SubMaker()
        with audio.open('wb') as output:
            async for chunk in communication.stream():
                if chunk['type'] == 'audio':
                    output.write(chunk['data'])
                elif chunk['type'] in ('WordBoundary', 'SentenceBoundary'):
                    subtitles.feed(chunk)
        (WORK / f'{scene["id"]}.srt').write_text(subtitles.get_srt())
        metadata.write_text(json.dumps(settings, indent=2) + '\n')
        print(f'Narration ready: {scene["id"]}', flush=True)

asyncio.run(main())
