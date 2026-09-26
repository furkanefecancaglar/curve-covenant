# Presentation and product demo

These artifacts use synthetic narration and contain explicitly labeled **local-validator evidence**. They do not show a real Phantom extension or mainnet transactions, and they do not claim user demand or revenue.

## Published artifacts

Player page: https://furkanefecancaglar.github.io/curve-covenant/demo.html

- Technical presentation: `public/media/curve-covenant-pitch.mp4` — approximately 2:16, 1920×1080, narrated and captioned.
- Product demo: `public/media/curve-covenant-local-demo.mp4` — approximately 2:55, 1920×1080, narrated and captioned.
- Matching `.srt` captions, poster frames and `.manifest.json` provenance records live beside each video.

The presentation is rendered from checked-in scenario and execution-proof data. The demo records the actual browser application operating against a local validator, including exact configuration checks, creation, buy/sell, balance refresh and graduation. Scene cuts retain normal-speed actions. A persistent banner identifies the local environment, synthetic XRXx and test signer.

This is a technical presentation rather than a fabricated founder introduction. Actual participant biography and final public-wallet proof remain submission dependencies.

## Reproduce

Requirements: Node dependencies installed; Chromium; FFmpeg/ffprobe; Python environment containing `edge-tts==7.2.8`. Speech generation uses the online Edge speech service and sends only the checked-in public narration text. No API key or wallet secret is sent to it. The generated audio is synthetic (`en-US-AriaNeural`).

```bash
python3 -m venv .venv
.venv/bin/pip install -r scripts/requirements-media.txt
.venv/bin/python scripts/prepare-demo-audio.py
.venv/bin/python scripts/prepare-demo-audio.py --kind pitch
```

Start the local validator with the synthetic stock fixture as described in [LOCAL-LAUNCH.md](LOCAL-LAUNCH.md), and run the app on port 4175. Then:

```bash
STOCK_FIXTURE_DIR=/tmp/curve-stock-fixture-... \
CHROMIUM_PATH=/path/to/chromium node scripts/record-demo.mjs
python3 scripts/render-demo.py

CHROMIUM_PATH=/path/to/chromium node scripts/record-pitch.mjs
python3 scripts/render-demo.py --kind pitch

CHROMIUM_PATH=/path/to/chromium node scripts/verify-media.mjs
```

Intermediate audio, slides and browser capture stay in ignored `docs/video-work/`. Final public artifacts are under `public/media/`, so the Vite build publishes the player and video files together.

## Validation

The verifier checks artifact hashes, complete MP4 decoding, audio presence, 1080p dimensions and the 2–3 minute duration bounds. Chromium opens and plays both videos, verifies download links and checks the 390 px layout. Sample frames are also visually inspected for readable captions and environment labeling. Narration is synthetic, not a claim that a founder personally recorded the voice.

The demo recorder checks the actual created config against the selected scenario and asserts post-buy/sell balance changes and successful migration. Its manifest retains confirmed local transaction receipts collected immediately after each action, before the temporary validator's historical signature index can disappear. Local signatures are not publicly verifiable mainnet links.

When actual Phantom/mainnet evidence becomes available, record a separate clearly identified public-wallet version and update the submission links. Keep the local evidence available for reproducibility.
