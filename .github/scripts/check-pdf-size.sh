#!/usr/bin/env bash
# Render the canonical size-check fixture and compare its PDF byte size
# against a baseline. Fails CI if the rendered size grows by more than
# `THRESHOLD_PCT` (default 5%). Surfaces feature regressions like:
#   - Shading dictionary bloat (gradients)
#   - Page-background image dedup failures
#   - ExtGState entries that don't dedupe by f64::to_bits
#   - Per-element shadow path duplication
#
# Update the baseline (engine/.pdf-size-baseline.txt) when the growth is
# intentional (new feature, intentional refactor). The threshold is a
# safety net, not a hard ceiling.
#
# Usage: bash .github/scripts/check-pdf-size.sh
# Exit codes: 0 = within threshold, 1 = regression (size grew >5%).

set -euo pipefail

# Resolve paths from this script's location so it works regardless of cwd.
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
ENGINE_DIR="$REPO_ROOT/engine"
FIXTURE="$SCRIPT_DIR/size-check-fixture.json"
BASELINE_FILE="$ENGINE_DIR/.pdf-size-baseline.txt"
THRESHOLD_PCT="${THRESHOLD_PCT:-5}"

cd "$ENGINE_DIR"

# Build the release binary. Use the existing target dir; if cargo decides
# nothing changed it's a no-op.
cargo build --release --quiet

OUT="$(mktemp -t forme-size-check.XXXXXX).pdf"
./target/release/forme "$FIXTURE" -o "$OUT" >/dev/null

CURRENT="$(wc -c < "$OUT" | tr -d '[:space:]')"

if [[ ! -f "$BASELINE_FILE" ]]; then
  echo "::warning::No baseline at $BASELINE_FILE — recording current size as new baseline."
  echo "$CURRENT" > "$BASELINE_FILE"
  echo "Current PDF size: ${CURRENT} bytes (baseline created)"
  exit 0
fi

BASELINE="$(tr -d '[:space:]' < "$BASELINE_FILE")"

if ! [[ "$BASELINE" =~ ^[0-9]+$ ]]; then
  echo "::error::Baseline file ${BASELINE_FILE} is not a positive integer: '${BASELINE}'"
  exit 2
fi

# Use awk for floating-point math (POSIX-portable, no python/bc required).
DELTA=$((CURRENT - BASELINE))
PCT="$(awk -v c="$CURRENT" -v b="$BASELINE" 'BEGIN { if (b == 0) print "inf"; else printf "%.2f", ((c - b) / b) * 100 }')"

echo "Baseline size: ${BASELINE} bytes"
echo "Current size:  ${CURRENT} bytes"
echo "Delta:         ${DELTA} bytes (${PCT}%)"

# Pass if growth is within threshold OR if the file shrank. Shrinkage is
# fine — the baseline can be tightened in the same PR or a follow-up.
EXCEEDS="$(awk -v p="$PCT" -v t="$THRESHOLD_PCT" 'BEGIN { print (p > t) ? "1" : "0" }')"
if [[ "$EXCEEDS" == "1" ]]; then
  echo ""
  echo "::error::PDF size regression: ${PCT}% growth exceeds ${THRESHOLD_PCT}% threshold."
  echo "If this growth is intentional, update ${BASELINE_FILE} to ${CURRENT}."
  exit 1
fi

# Surface meaningful shrinkage as a hint that the baseline could be
# tightened — useful but not a failure.
SHRUNK="$(awk -v p="$PCT" 'BEGIN { print (p < -5) ? "1" : "0" }')"
if [[ "$SHRUNK" == "1" ]]; then
  echo ""
  echo "::notice::PDF size shrunk by ${PCT}%. Consider updating ${BASELINE_FILE} to ${CURRENT}."
fi

exit 0
