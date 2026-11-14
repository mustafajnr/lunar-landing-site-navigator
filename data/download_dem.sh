#!/usr/bin/env bash
# Download the LOLA south-pole DEMs used by horizon.py into data/raw/.
# Source: NASA PGDA product 90, "A New View of the Lunar South Pole from LOLA"
# (Barker et al. 2023), https://pgda.gsfc.nasa.gov/products/90
#
# Safe to run again: curl resumes partial files (-C -) and the size check skips
# files that are already complete. Total download is about 3.5 GB.
#
# Usage: bash data/download_dem.sh
set -euo pipefail

BASE="https://pgda.gsfc.nasa.gov/data/LOLA_20mpp"
RAW="$(cd "$(dirname "$0")" && pwd)/raw"
mkdir -p "$RAW"

# name  expected_bytes
FILES=(
  "LDEM_80S_20MPP_ADJ.TIF 2696082051"   # fine (near field): 20 m/px, 80-90 S
  "LDEM_60S_120MPP_ADJ.TIF 821504895"   # coarse (far field): 120 m/px, 60-90 S
)

for entry in "${FILES[@]}"; do
  read -r name size <<<"$entry"
  out="$RAW/$name"
  have=$(stat -c %s "$out" 2>/dev/null || echo 0)
  if [[ "$have" == "$size" ]]; then
    echo "ok   $name ($size bytes)"
    continue
  fi
  echo "get  $name ($size bytes, have $have)"
  curl -fL --retry 5 --retry-delay 5 -C - -o "$out" "$BASE/$name"
  have=$(stat -c %s "$out")
  if [[ "$have" != "$size" ]]; then
    echo "size mismatch for $name: $have != $size" >&2
    exit 1
  fi
done
echo "done: $RAW"
