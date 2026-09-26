# Pitch and demo production sheet

Status: narrated technical presentation and local product demo produced; see [media artifacts and reproduction](MEDIA.md). The final narration is stored in `demo-scenes.json` and `pitch-scenes.json`. The outline below guided production; it is not a literal frame timestamp index. Every recorded environment must remain visibly labeled. Local-validator transactions must never be described as mainnet.

## Product demo — target 2:45

| Time | Actual screen/action | Narration |
| --- | --- | --- |
| 0:00–0:15 | Scenario Lab, XRXx, fixed 1% fee, opening cap 1, reference graduation cap 10, whale schedule, default 120% budget | “A lower opening price jump can still give early buyers more tokens. Curve Covenant shows both sides of that trade-off before you launch.” |
| 0:15–0:40 | Overlay and early-share table; inspect opening event | “The same supply, opening price, reserve threshold and fee schedule produce different outcomes. Here, the long curve reduces the first price jump from 311% to 239%, while early buyers receive about 2.53 percentage points more of total buy output.” |
| 0:40–1:00 | Switch to sell pressure; open the transaction ledger | “Each buy and sell changes the next price and reserve. Sellers can only sell tokens they hold. This schedule measures how much additional buying recovers the pre-sale price and whether the pool still graduates.” |
| 1:00–1:20 | Export JSON and SVG; select “Use long curve for launch”; copy and reopen design link | “Export every integer amount and the exact configuration. The configuration selected here is the one passed to the launch transaction and restored from the share link.” |
| 1:20–2:15 | Record actual create → buy → sell → balances → graduation. Until mainnet proof exists, use the real local browser flow with a persistent LOCAL VALIDATOR / SYNTHETIC XRXx label | “This demonstration uses [the actual displayed network]. The wallet approves creation, the app shows a minimum trade output, and balances refresh after confirmation. At the reserve threshold, the pool migrates to DAMM v2.” |
| 2:15–2:35 | Raw local proof / manifest; briefly show one confirmed event's prediction and observed values | “The scenario engine matched 56 actual swaps across eight local pools: both curves, SOL and XRXx, and fixed and declining fees. Price, reserves, fees and wallet balances matched in base units.” |
| 2:35–2:45 | Product URL and source link | “Measure the trade-offs. Launch the configuration you chose. Verify the result.” |

Do not show a generic terminal scroll as the only proof. Keep the selected scenario, raw comparison, and real transaction confirmation visible long enough to inspect. A successful transaction signature is not a claim of organic adoption.

## Presentation — target 2:30

1. 0:00–0:25: A concrete launch creator decision: lower price jump versus early token concentration. State that this is the initial user hypothesis, not validated market demand.
2. 0:25–1:00: Show the exported whale result and explain the two opposing outcomes. Explain why endpoint prices also change when the threshold is held constant.
3. 1:00–1:35: Show the product flow and exact-config deployment. Explain DBC + DAMM v2's role; distinguish simulation, local execution and public proof.
4. 1:35–2:00: Show validation: raw integer parity, full local browser lifecycle, limitations (external quote liquidity/USD price not modeled).
5. 2:00–2:20: Identify the initial customer and distribution experiment: 3–5 launchpad/creator trials. Add actual feedback only once obtained.
6. 2:20–2:30: Actual founder introduction and next measurable milestone. Do not invent team history or traction.

## Production acceptance

- Audible narration, readable captions, 1080p product recording, no private wallet material.
- Separate pitch (2–3 minutes) and demo (≤3 minutes), playable without account access.
- URLs, signatures and numbers correspond to actual current artifacts.
- If a live transaction takes longer than the allotted scene, use a labeled cut; do not imply instantaneous finality.
- Replace the local transaction scene with an actual Phantom/mainnet scene only after its receipts have been independently checked.
