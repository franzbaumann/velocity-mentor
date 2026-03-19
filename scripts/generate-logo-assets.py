#!/usr/bin/env python3
"""
Generate high-quality transparent PNG logo assets from the Cade logo source design.
Crops full logo (top) and app icon (bottom), removes light gray background to transparency.
"""
import os
import sys
from pathlib import Path

try:
    from PIL import Image
except ImportError:
    print("Error: Pillow is required. Install with: pip install Pillow")
    sys.exit(1)

# Paths
SCRIPT_DIR = Path(__file__).resolve().parent
PROJECT_ROOT = SCRIPT_DIR.parent
PUBLIC_DIR = PROJECT_ROOT / "public"

# Source image - try Cursor assets first, then project assets
SOURCE_CANDIDATES = [
    Path.home() / ".cursor/projects/Users-franz-velocity-mentor/assets/unnamed-1c4e5aaf-2e50-45bc-b614-724311866cd1.png",
    PROJECT_ROOT / "assets/unnamed-1c4e5aaf-2e50-45bc-b614-724311866cd1.png",
]

OUTPUT_FULL = PUBLIC_DIR / "logo-cade-light.png"
OUTPUT_ICON = PUBLIC_DIR / "logo-cade-icon-light.png"

# Crop bounds (source is 1024x603)
TOP_CROP = (0, 0, 1024, 300)   # Full logo: blue runner + "Cade" text
BOTTOM_CROP = (0, 303, 1024, 603)  # App icon: blue squircle with white runner

# Color-key: make pixels near background color transparent
BG_THRESHOLD = 45  # RGB distance threshold
BG_SAMPLE_POINTS = [(5, 5), (1019, 5), (5, 298), (1019, 298)]  # corners of top crop

# Output sizes (2x for retina)
FULL_MAX_HEIGHT = 96
ICON_SIZE = 128


def color_distance(c1: tuple, c2: tuple) -> float:
    """Euclidean RGB distance."""
    return sum((a - b) ** 2 for a, b in zip(c1[:3], c2[:3])) ** 0.5


def make_transparent(img: Image.Image, threshold: int = BG_THRESHOLD) -> Image.Image:
    """Make background (light gray) transparent via color-keying."""
    img = img.convert("RGBA")
    data = img.getdata()

    # Sample background from corners
    samples = []
    for x, y in BG_SAMPLE_POINTS:
        if x < img.width and y < img.height:
            samples.append(img.getpixel((x, y))[:3])

    if not samples:
        bg = (220, 220, 220)  # fallback light gray
    else:
        bg = tuple(sum(s[i] for s in samples) // len(samples) for i in range(3))

    new_data = []
    for item in data:
        r, g, b, a = item
        dist = color_distance((r, g, b), bg)
        if dist < threshold:
            new_data.append((r, g, b, 0))
        else:
            new_data.append(item)

    img.putdata(new_data)
    return img


def trim_transparent(img: Image.Image, padding: int = 4) -> Image.Image:
    """Trim transparent padding, leaving a small margin."""
    bbox = img.getbbox()
    if not bbox:
        return img
    x1, y1, x2, y2 = bbox
    x1 = max(0, x1 - padding)
    y1 = max(0, y1 - padding)
    x2 = min(img.width, x2 + padding)
    y2 = min(img.height, y2 + padding)
    return img.crop((x1, y1, x2, y2))


def main():
    source = None
    for p in SOURCE_CANDIDATES:
        if p.exists():
            source = p
            break

    if not source:
        print(f"Error: Source image not found. Tried:")
        for p in SOURCE_CANDIDATES:
            print(f"  {p}")
        sys.exit(1)

    print(f"Loading source: {source}")
    full_img = Image.open(source).convert("RGBA")

    # Crop top (full logo)
    top = full_img.crop(TOP_CROP)
    top = make_transparent(top)
    top = trim_transparent(top, padding=8)

    # Resize full logo - preserve aspect, max height 96
    ratio = FULL_MAX_HEIGHT / top.height
    new_w = int(top.width * ratio)
    new_h = FULL_MAX_HEIGHT
    top = top.resize((new_w, new_h), Image.Resampling.LANCZOS)

    top.save(OUTPUT_FULL, "PNG", optimize=True)
    print(f"Saved: {OUTPUT_FULL} ({new_w}x{new_h})")

    # Crop bottom (app icon)
    bottom = full_img.crop(BOTTOM_CROP)
    bottom = make_transparent(bottom)
    bottom = trim_transparent(bottom, padding=8)

    # Resize icon to square
    bottom = bottom.resize((ICON_SIZE, ICON_SIZE), Image.Resampling.LANCZOS)

    bottom.save(OUTPUT_ICON, "PNG", optimize=True)
    print(f"Saved: {OUTPUT_ICON} ({ICON_SIZE}x{ICON_SIZE})")

    print("Done.")


if __name__ == "__main__":
    main()
