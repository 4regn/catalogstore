#!/usr/bin/env python3
"""Extract embedded base64 images out of a self-contained HTML demo and
rewrite the document to reference them as separate files instead.

Why: Crown's index.html is 5MB and Heirloom's is 2.3MB because every product
photo lives inside the file as `data:image/jpeg;base64,...`. Browsers can't
cache, lazy-load, or stream those efficiently -- the whole HTML has to be
downloaded before any image renders. Splitting them out keeps the HTML tiny
(<100KB) and lets the browser fetch images in parallel + cache them.

Run: ./scripts/extract_html_images.py <html_path> <prefix>
Eg.  ./scripts/extract_html_images.py public/templates/crown/index.html crown
"""
import base64
import re
import sys
from pathlib import Path


def main() -> None:
    if len(sys.argv) != 3:
        print("usage: extract_html_images.py <html_path> <prefix>", file=sys.stderr)
        sys.exit(1)

    html_path = Path(sys.argv[1])
    prefix = sys.argv[2]
    folder = html_path.parent

    html = html_path.read_text()
    # match data:image/<ext>;base64,<payload> in src="...", url(...), and CSS contexts
    pattern = re.compile(r"data:image/([a-z]+);base64,([A-Za-z0-9+/=]+)")

    seen: dict[str, str] = {}
    counter = 0

    def replace(match: re.Match[str]) -> str:
        nonlocal counter
        ext = match.group(1).lower()
        payload = match.group(2)
        # SVGs inline fine; only extract raster formats. (jpeg/png/webp/gif)
        if ext == "svg":
            return match.group(0)
        if ext == "jpg":
            ext = "jpeg"
        key = payload[:64]  # stable hash from first chunk -- dedupes identical images
        if key in seen:
            return seen[key]
        counter += 1
        ext_out = "jpg" if ext == "jpeg" else ext
        filename = f"{prefix}-{counter:02d}.{ext_out}"
        out_path = folder / filename
        out_path.write_bytes(base64.b64decode(payload))
        rel = f"./{filename}"
        seen[key] = rel
        return rel

    new_html = pattern.sub(replace, html)
    html_path.write_text(new_html)

    new_size = len(new_html.encode())
    print(f"extracted {counter} images, html now {new_size:,} bytes")


if __name__ == "__main__":
    main()
