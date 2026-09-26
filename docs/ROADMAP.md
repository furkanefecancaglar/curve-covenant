# Curve Covenant — evidence-driven roadmap

Updated: 2026-09-26. Target: a competitive first-place Meteora DBC submission. Winning is an external outcome, not an engineering completion claim.

## Product claim

Measure the trade-offs of xStock-paired DBC curves under identical buy/sell schedules, deploy the selected configuration, and verify its behavior through graduation.

## Operating loop

1. Select the highest-impact unresolved question or failure.
2. Specify an observable acceptance condition before changing code.
3. Implement the smallest complete path that answers it.
4. Test against independent evidence, including local deployed program copies where relevant.
5. Record commands, versions, results and limitations; update the product and submission claims.
6. Ship verified work, collect real feedback, and reprioritize the next iteration.

Repeat through submission and after the hackathon while meaningful work remains. An unavailable wallet signature, external account or real user response is recorded as a dependency; it is never replaced with invented evidence. No artificial activity is presented as organic traction.

## Gates and deliverables

| Gate | Deliverable | Acceptance evidence | Status |
| --- | --- | --- | --- |
| 0 | Launch, buy/sell, wallet balances, DBC → DAMM v2 | 30 unit checks; local SOL and synthetic XRXx browser lifecycles; published commit `5940028` | Complete, local evidence only |
| 1 | Stateful scenario engine and controlled comparison | Sequential buy/sell accounting; identical input schedules; exact integer amounts; simulation vs local chain balances, prices and fees; unsupported cases rejected | Complete for supported modes; 56 exact local swap matches |
| 2 | Interactive comparison + portable reports | Four scenarios, interactive overlay, trade ledger, cohort costs, early output share and progress; JSON + SVG; offline browser checks | Complete; USD quote shocks remain a later extension |
| 3 | Evidence-to-launch connection | Exact compared config → launch and versioned share link; browser XRXx flow; created on-chain parameters checked; hashed proof manifest | Complete locally; public Phantom evidence is gate 4 |
| 4 | Public mainnet Phantom evidence | Actual confirmed create, buy and sell signatures for funded wallet; SOL and xStock scope clearly separated; migration if feasible | Pending: real wallet access, chosen spending budget and signatures |
| 5 | Demand and differentiation | 3–5 real builder trials; dated feedback and observed decisions; competitor claims checked against current products | Pending: real participants; outreach requires user's explicit instruction |
| 6 | Submission package | Current README, form-ready claim/evidence text, sample reports, pitch/demo scripts and builder-trial protocol | Text prepared; actual recordings, public transaction manifest and founder details pending |
| 7 | Submit and verify receipt | Colosseum + Meteora sidetrack receipts from actual accounts, deadline verified, all links usable | Pending: account access and submission details |
| 8 | After submission | Fix observed issues, extend validated use cases, follow up with actual users, evidence-based product and revenue experiments | Continuous backlog |

## Gate 1 design constraints

- Begin with one-segment and 16-segment curves; both use the same supply, leftover allocation, opening price, fee schedule, quote decimals and quote reserve threshold.
- Solve for each model's endpoint instead of pretending both endpoint price and threshold remain equal. Display endpoint differences.
- The existing two-stage preset reserves 35% of supply. It must not enter a controlled curve-only comparison against 0.001% leftovers without a separate allocation control.
- Every trade advances the prior pool state. Repeating an opening quote is not a sequential simulation.
- Quotes use the pinned installed Meteora SDK. State accounting must additionally match actual local program execution.
- Support the product's quote-token fee mode, timestamp fee schedules and disabled dynamic fees first. Reject unsupported controls instead of approximating them silently.
- Enforce seller inventory, nonnegative reserves, monotonic event timestamps, partial fills and graduation termination.
- Lower price impact is not synonymous with less early capture. Report both; do not select a winner in advance.
- Recovery means additional specified buy flow required to regain a pre-sale price, not autonomous price recovery.
- Scenario assumptions are not observed market demand or actual stock-price forecasts.

## Evidence and deadlines

- Local evidence: [LOCAL-LAUNCH.md](LOCAL-LAUNCH.md). Current readiness: [SUBMISSION.md](SUBMISSION.md).
- Crypto World's Fair official page: https://colosseum.com/worldsfair — submissions due 2026-10-12, verified 2026-09-26.
- Meteora sidetrack: https://superteam.fun/earn/listing/meteora-dbc — $20k total, $10k first prize; recheck exact sidetrack cutoff before submission.
- Stocklana: https://hackathons.solana.com/hackathons/stocklana — closed 2026-09-25 16:00 ET (23:00 Istanbul); edits allowed only until closure. Do not assume a late submission window.

## Next action

Prepare the public-wallet evidence collector and budgeted launch review while waiting for the user-provided public wallet address. Prepare honest submission/demo material using the completed local evidence. No mainnet proof or user trials are claimed. See [SCENARIO-METHOD.md](SCENARIO-METHOD.md) for the completed engine and browser acceptance evidence.

## Execution checkpoint — 2026-09-26

Scenario implementation and local evidence shipped in `48e2380`. Unit checks: 45 passed. Offline scenario browser: all four schedules, exact config launch export/share restore, JSON/SVG exports and 390 px layout passed with zero public RPC requests. Full scenario-selected XRXx local browser lifecycle passed.

Next independent work: produce the clearly labeled local demo recording and continue preparing the public-wallet transaction review once the wallet address arrives. Current documents: [submission](SUBMISSION.md), [demo script](DEMO-SCRIPT.md), [mainnet worksheet](MAINNET-EVIDENCE.md), [builder trial protocol](BUILDER-TRIALS.md). No outreach or external submission has been sent.
