#!/bin/bash
# Crop and stack a terminal screenshot into a hero image
# Usage: ./crop-hero-screenshot.sh <input-image> <output-path>
# ./scripts/crop-hero-screenshot.sh /home/xertrov/Pictures/screenshot-2026-04-17_14-52-50.png /home/xertrov/src/claude-inject-idle-time/docs/screenshots/hero.png

set -e

input="${1:?Input image path required}"
output="${2:?Output path required}"

# Crop parameters (adjust as needed)
top_height=444
bottom_start=912
bottom_height=96
divider_height=12

# Sample background color from left margin
bg=$(magick "$input" -format "%[pixel:p{10,400}]" info:)
echo "Sampled background: $bg"

# Create temp directory
tmpdir=$(mktemp -d)
trap "rm -rf $tmpdir" EXIT

# Crop top section (prompt + content, exclude item 3)
magick "$input" -crop 1134x${top_height}+0+0 "$tmpdir/top.png"

# Crop bottom section (input box + statusline)
magick "$input" -crop 1134x${bottom_height}+0+${bottom_start} "$tmpdir/bottom.png"

# Create divider with sampled color
magick -size 1134x${divider_height} "xc:$bg" "$tmpdir/divider.png"

# Stack and output
magick "$tmpdir/top.png" "$tmpdir/divider.png" "$tmpdir/bottom.png" -append "$output"

echo "Hero image saved: $output"
identify "$output"
