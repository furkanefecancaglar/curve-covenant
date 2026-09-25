#!/usr/bin/env bash
set -euo pipefail

# Read-only downloads from mainnet; all test transactions run on localhost.
studio=${1:?Usage: bash scripts/start-local-validator.sh /path/to/meteora-invent/studio}
command -v solana >/dev/null
command -v solana-test-validator >/dev/null
test -d "$studio/src/tests/artifacts/accounts"
test -f "$studio/src/tests/artifacts/metaplex.so"
fixture_dir=$(mktemp -d /tmp/curve-covenant-validator.XXXXXX)
rpc=https://solana-rpc.publicnode.com
solana program dump dbcij3LWUppWqq96dh6gJWwBifmcGfLSB5D4DuSMaqN "$fixture_dir/dbc.so" --url "$rpc"
solana program dump cpamdpZCGKUy5JxQXB4dcpGPiikHawvSWAd6mEn1sGG "$fixture_dir/damm.so" --url "$rpc"
sha256sum "$fixture_dir/dbc.so" "$fixture_dir/damm.so"
exec solana-test-validator \
  --account-dir "$studio/src/tests/artifacts/accounts" \
  --bpf-program dbcij3LWUppWqq96dh6gJWwBifmcGfLSB5D4DuSMaqN "$fixture_dir/dbc.so" \
  --bpf-program cpamdpZCGKUy5JxQXB4dcpGPiikHawvSWAd6mEn1sGG "$fixture_dir/damm.so" \
  --bpf-program metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s "$studio/src/tests/artifacts/metaplex.so" \
  --gossip-port 19000 --dynamic-port-range 19001-19030 --faucet-port 19900 --rpc-port 18899 \
  --ledger "$fixture_dir/ledger" --url "$rpc" \
  --clone XsensupeZBdHxZtdnLptf1UfWpVyancWcit7qWFYZrJ \
  --clone EbTzvxs3Lx9vojKbBTey2Zee3feUHKkzCm9XSaPb8pX --quiet
