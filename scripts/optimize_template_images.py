#!/usr/bin/env python3
"""Resize + recompress JPEGs to phone-iframe display size.

Template images render inside a 400px virtual viewport scaled to ~320px
visible on desktop. We don't need 736x1104 source images for that --
600px max-width is plenty (still 1.5-2x retina headroom).

Usage: ./scripts/optimize_template_images.py <folder> [max_width=600] [quality=82]
"""
import sys
from pathlib import Path
from PIL import Image


def optimize(folder: Path, max_width: int, quality: int) -> None:
    saved_bytes = 0
    count = 0
    for jpg in sorted(folder.glob("*.jpg")):
        original_size = jpg.stat().st_size
        try:
            img = Image.open(jpg)
        except Exception as e:
            print(f"skip {jpg.name}: {e}")
            continue
        # Strip EXIF / metadata that's useless on web
        img = img.convert("RGB")
        if img.width > max_width:
            new_height = round(img.height * max_width / img.width)
            img = img.resize((max_width, new_height), Image.LANCZOS)
        img.save(jpg, "JPEG", quality=quality, optimize=True, progressive=True)
        new_size = jpg.stat().st_size
        delta = original_size - new_size
        saved_bytes += delta
        count += 1
        print(f"{jpg.name}: {original_size//1024} KB -> {new_size//1024} KB  ({img.width}x{img.height})")
    print(f"\nTotal: {count} files, saved {saved_bytes//1024:,} KB")


if __name__ == "__main__":
    folder = Path(sys.argv[1])
    max_width = int(sys.argv[2]) if len(sys.argv) > 2 else 600
    quality = int(sys.argv[3]) if len(sys.argv) > 3 else 82
    optimize(folder, max_width, quality)
