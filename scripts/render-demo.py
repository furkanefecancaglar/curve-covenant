"""Assemble actual browser recording and synthetic narration; preserve provenance."""
import hashlib
import argparse
import json
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
WORK = ROOT / 'docs/video-work'
OUT = ROOT / 'public/media'
parser = argparse.ArgumentParser()
parser.add_argument('--kind', choices=['demo', 'pitch'], default='demo')
args = parser.parse_args()
prefix = 'curve-covenant-local-demo' if args.kind == 'demo' else 'curve-covenant-pitch'
OUT.mkdir(parents=True, exist_ok=True)
record = json.loads((WORK / ('recording.json' if args.kind == 'demo' else 'pitch-recording.json')).read_text())
clips = []
subtitles = []
offset = 0.0

def run(args):
    subprocess.run(args, check=True)

def seconds(stamp):
    h, m, s = stamp.replace(',', '.').split(':')
    return int(h) * 3600 + int(m) * 60 + float(s)

def stamp(value):
    ms = round(value * 1000)
    return f'{ms // 3600000:02d}:{ms // 60000 % 60:02d}:{ms // 1000 % 60:02d},{ms % 1000:03d}'

for i, scene in enumerate(record['timeline']):
    subtitle = WORK / f'{scene["id"]}.srt'
    clip = WORK / f'{args.kind}-clip-{i:02d}.mp4'
    audio = WORK / f'{scene["id"]}.mp3'
    duration = scene['duration']
    # Each cut retains the actual operation at normal speed. No fabricated UI,
    # frame-speedup, or replacement transaction state is used.
    vf = f"tpad=stop_mode=clone:stop_duration=1,subtitles={subtitle}:force_style='FontName=DejaVu Sans,FontSize=10,Outline=1,MarginV=12,BorderStyle=3,BackColour=&H90000000'"
    source = ['-loop', '1', '-i', scene['image']] if 'image' in scene else ['-ss', str(scene['start']), '-i', record['video']]
    run(['ffmpeg', '-hide_banner', '-loglevel', 'error', '-y', *source, '-i', str(audio),
         '-t', str(duration), '-vf', vf, '-af', 'apad', '-map', '0:v:0', '-map', '1:a:0', '-r', '30', '-c:v', 'libx264',
         '-threads', '2', '-preset', 'fast', '-crf', '24', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '128k', str(clip)])
    clips.append(clip)
    for block in subtitle.read_text().strip().split('\n\n'):
        lines = block.splitlines()
        if len(lines) < 3:
            continue
        start, end = lines[1].split(' --> ')
        subtitles.append(f'{len(subtitles) + 1}\n{stamp(offset + seconds(start))} --> {stamp(offset + min(seconds(end), duration))}\n' + '\n'.join(lines[2:]))
    # Use encoded duration rather than assume every cut lands on a frame boundary.
    actual = float(subprocess.check_output(['ffprobe', '-v', 'error', '-show_entries', 'format=duration', '-of', 'default=nw=1:nk=1', str(clip)]))
    offset += actual
    print(f'Rendered {scene["id"]}: {actual:.2f}s', flush=True)
concat = WORK / f'{args.kind}-concat.txt'
concat.write_text(''.join(f"file '{path}'\n" for path in clips))
output = OUT / f'{prefix}.mp4'
run(['ffmpeg', '-hide_banner', '-loglevel', 'error', '-y', '-f', 'concat', '-safe', '0', '-i', str(concat), '-c', 'copy', '-movflags', '+faststart', str(output)])
(OUT / f'{prefix}.srt').write_text('\n\n'.join(subtitles) + '\n')
probe = json.loads(subprocess.check_output(['ffprobe', '-v', 'error', '-show_streams', '-show_format', '-of', 'json', str(output)]))
video = next(s for s in probe['streams'] if s['codec_type'] == 'video')
audio = next(s for s in probe['streams'] if s['codec_type'] == 'audio')
assert video['width'] == 1920 and video['height'] == 1080
assert 120 <= float(probe['format']['duration']) <= 180
assert audio['codec_name'] == 'aac'
run(['ffmpeg', '-hide_banner', '-loglevel', 'error', '-y', '-ss', '24', '-i', str(output), '-frames:v', '1', str(OUT / f'{prefix}-poster.jpg')])
sha = lambda path: hashlib.sha256(path.read_bytes()).hexdigest()
manifest = {k: v for k, v in record.items() if k != 'video'}
manifest['timeline'] = [{**s, **({'image': Path(s['image']).name} if 'image' in s else {})} for s in record['timeline']]
manifest.update({'artifact': output.name, 'durationSeconds': float(probe['format']['duration']), 'width': video['width'], 'height': video['height'],
                 'narrationType': 'synthetic', 'originalCaptureSha256': sha(Path(record['video'])) if 'video' in record else None,
                 'slideHashes': {Path(s['image']).name: sha(Path(s['image'])) for s in record['timeline'] if 'image' in s}, 'videoSha256': sha(output),
                 'scriptSha256': sha(ROOT / f'docs/{args.kind}-scenes.json'), 'subtitlesSha256': sha(OUT / f'{prefix}.srt'),
                 'editing': 'Sequential normal-speed scene cuts; narration and captions added. Local environment banner persists.' if args.kind == 'demo' else 'Static technical presentation slides rendered from checked-in evidence; synthetic narration and captions.'})
(OUT / f'{prefix}.manifest.json').write_text(json.dumps(manifest, indent=2) + '\n')
print(json.dumps({'artifact': str(output), 'duration': manifest['durationSeconds'], 'bytes': output.stat().st_size}))
