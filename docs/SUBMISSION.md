# Submission package — current evidence, 2026-09-26

## Title

Curve Covenant — Scenario-driven curve selection for xStock-paired DBC launches

## One-liner

Compare DBC curve trade-offs under sequential buy/sell scenarios, launch the configuration you chose, and verify it through graduation.

## Problem

A launch creator can choose a curve and fee schedule without understanding how the design changes early buyer allocation, execution costs or graduation progress. A smoother price path does not necessarily distribute fewer tokens to an early whale. For xStock-paired launches, making these trade-offs visible before deployment is particularly relevant when creators have limited quote-token liquidity.

We have not yet established the size of this problem through user interviews. We do not claim that no competing tool offers simulation.

## Product

Curve Covenant combines controlled scenario comparison with a wallet-based Meteora launch flow:

- Select a supported issuer-listed xStock or rehearse with devnet SOL.
- Compare one-segment and 16-segment curves with equal supply, opening price, reserve threshold and fee schedule. Ending prices remain visible outcomes.
- Run retail drip, early-whale, sell-pressure and graduation schedules. Every trade advances the prior pool state and actor inventory.
- Inspect price paths, fees, early buy-output share, cohort costs and reserve progress. Export raw-unit JSON and an SVG summary.
- Pass the exact compared configuration to the launch form, or restore it from a versioned share link.
- Create a token and DBC pool, buy/sell with minimum-output protection, refresh wallet balances and graduate to DAMM v2.

The launched token is an independent asset quoted in an xStock. It is not ownership in the underlying company.

## Specific measured result

In the exported fixed-fee XRXx whale scenario, the one-segment curve's first buy raises the price by 311.08%, compared with 239.16% for the long curve. However, the early cohort receives 88.70% versus 91.23% of gross buy output. The long curve lowers the initial price jump while increasing early output share by 2.53 percentage points. Ending price also differs: approximately 10× versus 15.58× the opening price.

This is the point of the product: expose a choice's benefits and costs rather than declare a preset universally better. These are hypothetical schedule outputs, not observed market behavior or a fairness guarantee.

## Evidence matrix

| Claim | Evidence | Limit |
| --- | --- | --- |
| Stateful scenario accounting matches DBC execution | 56 confirmed swaps across eight local pools; raw price, reserves, fees, wallet inventory and quote transfers matched exactly | Local deployed program copies; XRXx funding is synthetic |
| Controlled comparisons can be deployed | SDK-valid equalized configs; browser-selected long curve matches actual created on-chain parameters | Local validator, not mainnet |
| Config remains exact across sharing | Version 2 share-link reconstruction and exported config equality verified in browser | Pinned SDK/normalization version |
| End-to-end launch works | Local browser scenario → create → buy → sell → balances → graduate; declined second approval recovered | Phantom-compatible local signer, not a real extension certification |
| Tested product | 45 unit tests, TypeScript/build, offline scenario browser checks and local lifecycle test | Not a security audit or exhaustive parameter proof |
| Real mainnet usage | Not yet available | Do not add a public-network claim until actual receipts exist |
| Demand or revenue | None claimed | Real builder trials remain outstanding |

## Meteora fit

The product addresses stock-paired launch configuration and developer tooling. DBC is central to both the calculations and transactions; DAMM v2 is the verified graduation destination. Controlled scenario selection is the primary differentiation to validate. There is no current DLMM, preset marketplace or automatic compounding feature.

## Life after the hackathon

Initial customer hypothesis: launchpad teams and launch creators who need to review configuration choices before deployment. The first distribution experiment is hands-on trials with 3–5 builders, asking whether the report changes a real configuration decision. Reusable configuration links and reports provide a workflow they can return to.

Potential next steps depend on those trials: reusable validated presets, an embeddable comparison module, and additional quote-asset stress assumptions. Paid configuration tooling is a business hypothesis, not current revenue. DLMM and compounding are later research options, not near-term delivery promises.

## Links ready today

- Live: https://furkanefecancaglar.github.io/curve-covenant/
- Source: https://github.com/furkanefecancaglar/curve-covenant
- Method and local proof: https://github.com/furkanefecancaglar/curve-covenant/blob/main/docs/SCENARIO-METHOD.md
- Whale JSON: https://github.com/furkanefecancaglar/curve-covenant/blob/main/docs/evidence/scenarios/whale.json
- Visual report: https://github.com/furkanefecancaglar/curve-covenant/blob/main/docs/evidence/scenarios/whale.svg
- Roadmap: https://github.com/furkanefecancaglar/curve-covenant/blob/main/docs/ROADMAP.md

## Outstanding submission fields

Founder/team biography and contact/X details must come from the actual participants. Pitch and demo video URLs, public mainnet transaction URLs, user-validation evidence and portal receipt URLs are not yet available. The previous inspector-only videos were removed and must not be reused as a demo of this version.

## Deadlines and submission status

Crypto World's Fair closes 2026-10-12: https://colosseum.com/worldsfair. Meteora sidetrack: https://superteam.fun/earn/listing/meteora-dbc ($20k total, $10k first); recheck its exact cutoff before submission. Colosseum requests a 2–3 minute presentation and a product demo no longer than 3 minutes: https://colosseum.com/hackathon.

Stocklana closed 2026-09-25 16:00 ET, with edits allowed only until closure: https://hackathons.solana.com/hackathons/stocklana. No late-entry exception is known.

No Colosseum or Superteam submission, award or organizer approval is claimed.
