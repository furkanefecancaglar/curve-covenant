# Curve Covenant — hackathon pitch

## One sentence

Curve Covenant gives every Meteora DBC launch a readable, simulatable, and cryptographically attributable set of terms that anyone can verify against the live chain.

## The problem

DBC exposes powerful launch controls: the fee schedule, curve, graduation threshold, migration target, token authority, and post-migration liquidity split. That flexibility is a strength for builders, but it also makes it hard for a participant to answer a simple question: **Do the launch's public claims match its on-chain terms?** A social post or screenshot can omit critical settings and cannot be checked later. Existing tools primarily help launch teams design or trade a token; a reusable disclosure standard for participants is a different need.

## The product

1. **Inspect:** Paste any standard or transfer-hook DBC pool or config. The app reads and decodes the actual account through Meteora's SDK, then explains key terms and the current graduation progress.
2. **Simulate:** Enter a buy amount. The scenario lab runs `swapQuote2` against fresh pool state and shows expected output, minimum with 1% slippage, fee split, and any unfilled amount near the migration threshold. No wallet or transaction is needed.
3. **Attest:** A launch team exports a selected set of exact on-chain claims as a portable JSON covenant. The DBC fee claimer or pool creator may sign it through Phantom's fee-free message signing. The signer role is checked against on-chain accounts.
4. **Verify:** Anyone imports a covenant and sees both signature validity and a fresh comparison of every claim. A changed document fails Ed25519 verification; a changed or different config is flagged separately.

## Why Meteora is central

This product does not merely mention DBC. It decodes `VirtualPool` and `PoolConfig` (including transfer-hook variants) with the official DBC SDK, uses the pool's actual reserve and migration threshold, calls the SDK's own partial-fill quote math, and checks signers against DBC creator/fee-claimer roles. The disclosure field names and comparison semantics are specific to DBC.

## Differentiation

- A launch studio helps a team choose parameters and deploy. Curve Covenant gives users a repeatable way to understand and verify the resulting launch.
- A screener catalogs pools. Curve Covenant adds exact claims, attribution by an on-chain role, and a later recheck of the same claims.
- Both creators and downstream interfaces can share the JSON format, opening a path to standardized launch disclosure embeds and monitoring.

## Evidence today — 24 September 2026

- [Live product](https://furkanefecancaglar.github.io/curve-covenant/)
- [Open-source repo](https://github.com/furkanefecancaglar/curve-covenant)
- A live mainnet pool is readable from a browser, with a real SDK quote scenario and no transaction.
- Unit tests cover exact quote-token units, covenant comparisons, Ed25519 verification, tamper detection, and signer-role enforcement. Production build and GitHub Pages deploy pass.
- **No users, revenue, mainnet transactions by Curve Covenant, or prize have been claimed.** Usage evidence still needs to be gathered honestly.

## Go-to-market and business model

Start with launch teams that already use Meteora DBC. Give them a free signed disclosure that can be linked from their own launch page and social channels. A verifiable link gives each team an incentive to distribute it. Provide an embeddable badge and developer API next, so terminals and launchpads can show the same terms in their own flows. A paid monitoring tier could alert launchpads and traders when live pool state crosses thresholds or when signed disclosures no longer match the latest configuration. The free public inspector remains open.

These are plans, not existing partnerships or revenue.

## Work completed during the hackathon

The repository was created on 24 September 2026, inside the Crypto World's Fair build period. Furkan Efe Can Çağlar owns the GitHub account and directed Codex, an AI coding agent, to build the product. Implementation, testing, and deployment have been performed by the agent in the shared workspace. This AI assistance should be disclosed in the Colosseum submission; do not claim manual implementation by Furkan.

## Presentation video script (target: 2–3 minutes)

**0:00–0:20 — Opening.** “A token launch can promise a fair curve, a low fee, and locked liquidity. Meteora's DBC makes those settings programmable. But the terms are scattered across on-chain accounts that most users cannot read.”

**0:20–0:45 — Insight.** “The missing infrastructure is a disclosure that a user can verify later. A screenshot is static. A social post does not prove that the launch owner made it. We built Curve Covenant as a portable, verifiable statement of DBC launch terms.”

**0:45–1:20 — Product demo.** Open the site. Click ‘Try a live pool.’ Show the verified mainnet slot, initial fee, migration target, liquidity controls, and graduation progress. Switch to Scenario lab and quote a 10 USDC buy without a wallet.

**1:20–1:55 — Proof.** In Covenant, select claims and export JSON. Explain the optional Phantom signature. The app verifies Ed25519 bytes and checks that the signer is the actual DBC fee claimer or pool creator. When a file is imported, each claim is compared against a fresh on-chain read.

**1:55–2:20 — Meteora integration.** “This uses Meteora's official DBC SDK for both account decoding and swap quote math. Standard and Token-2022 transfer-hook variants are supported. Quote amounts use exact token units.”

**2:20–2:45 — Opportunity.** “Every new DBC launch could publish a signed disclosure. Launchpads and terminals could embed the same proof. The open inspector builds trust; monitoring and integration tools create a business path.”

**2:45–2:55 — Close.** “Curve Covenant: make launch terms visible, attributable, and checkable.”

## Product demo video sequence (target: under 3 minutes)

1. Open live page, use the sample mainnet pool, inspect fee schedule, threshold, migration and authority.
2. Enter 1, 10, and 100 USDC in Scenario lab; show differences and the SDK-derived fee split.
3. Export an unsigned covenant from selected fields, import it, show exact matches and unsigned issuer status.
4. Show a signed fixture from a controlled test wallet or devnet creator, including on-chain role verification and a tamper failure. Do not claim the unrelated sample mainnet pool was signed by us.
5. Open repo and show `src/dbc.ts`, `src/covenant.ts`, tests, and GitHub Pages build result.
