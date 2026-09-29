#!/usr/bin/env python3
"""Build the AppBarDock application icon from the artwork PNG.

The source artwork is a 1254x1254 render with a transparent page around the
icon. This script trims to the artwork's own alpha bounds, re-lays it onto a
square canvas with the margin an app icon is expected to carry, and exports the
formats each platform actually consumes.

Usage:
    python tools/build-icons.py <source.png>

The source path can also be supplied through the APPBARDOCK_ICON_SOURCE
environment variable, so the script itself carries no machine-specific path.
"""

from __future__ import annotations

import io
import os
import struct
import sys

from PIL import Image

# --------------------------------------------------------------------------- #
# Configuration
# --------------------------------------------------------------------------- #

CANVAS = 1024
# Fraction of the canvas the artwork occupies on its longest side.
#
# Windows app icons fill their slot almost completely - measured against
# System32\calc.exe, explorer.exe and notepad.exe, the artwork covers 97-100% of
# the frame. The macOS convention is much airier (~0.80), and using that here
# made the icon visibly smaller than every other taskbar icon next to it, so
# this follows the Windows convention instead.
ARTWORK_FILL = 1.0

# Deliberate overflow past the slot, applied on top of ARTWORK_FILL.
#
# At a nominal 100% the artwork still reads smaller than neighbouring taskbar
# icons, for two reasons that measuring the file cannot fix: the mark is a
# rounded square rather than a full-bleed circle, and it is a touch taller than
# wide, so its width only reaches ~97% of the slot. Against the Edge mark in a
# real taskbar (which fills its slot corner to corner) the difference was
# obvious. Overscanning slightly grows the visual mass, at the cost of shaving
# the outer millimetre off the rounded corners - invisible at 32px, and less
# noticeable than looking undersized.
ARTWORK_ZOOM = 1.12

ICO_SIZES = (16, 24, 32, 48, 64, 128, 256)
PNG_SIZES = (256, 512, 1024)
ICNS_SIZES = (16, 32, 64, 128, 256, 512, 1024)

DEFAULT_SOURCE = os.environ.get("APPBARDOCK_ICON_SOURCE")

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ASSETS = os.path.join(ROOT, "assets")

# Alpha at or below this counts as page background when trimming.
ALPHA_FLOOR = 8

# LANCZOS for reduction, BICUBIC for the one enlargement pass: LANCZOS ringing
# shows up as a halo along the soft gradient edges of this artwork.
UPSCALE = Image.Resampling.BICUBIC
DOWNSCALE = Image.Resampling.LANCZOS


def trim_to_artwork(img: Image.Image) -> tuple[Image.Image, tuple[int, int, int, int]]:
    """Crop away the transparent page around the icon."""
    bounds = img.getchannel("A").point(lambda v: 255 if v > ALPHA_FLOOR else 0).getbbox()
    if bounds is None:
        raise ValueError("source image is entirely transparent - nothing to trim")
    return img.crop(bounds), bounds


def fit_to_canvas(
    art: Image.Image,
    canvas: int = CANVAS,
    fill: float = ARTWORK_FILL,
    zoom: float = ARTWORK_ZOOM,
) -> Image.Image:
    """Centre the artwork on a square transparent canvas.

    The aspect ratio is preserved rather than stretched: the artwork is a couple
    of percent taller than it is wide, and squashing it would show up as subtly
    out-of-round corners.

    With `zoom` above 1.0 the artwork deliberately exceeds the canvas, so the
    corners are clipped. `alpha_composite` ignores the out-of-bounds region,
    which is exactly the crop we want.
    """
    target = canvas * fill * zoom
    scale = target / max(art.width, art.height)
    size = (max(1, round(art.width * scale)), max(1, round(art.height * scale)))
    resized = art.resize(size, UPSCALE if scale > 1 else DOWNSCALE)

    out = Image.new("RGBA", (canvas, canvas), (0, 0, 0, 0))
    # Negative offsets are expected once zoom pushes the art past the canvas.
    out.alpha_composite(resized, ((canvas - size[0]) // 2, (canvas - size[1]) // 2))
    return out


def _png_bytes(img: Image.Image) -> bytes:
    buffer = io.BytesIO()
    img.convert("RGBA").save(buffer, format="PNG")
    return buffer.getvalue()


def write_ico(frames: dict[int, Image.Image], path: str) -> None:
    """Assemble a multi-size .ico from independently resized frames.

    Written by hand because PIL's ICO plugin only downsamples whichever single
    image it is handed. Frames are stored as PNG payloads, which Vista and later
    read natively and which carry alpha properly - the legacy BMP encoding would
    not.
    """
    sizes = sorted(frames)
    payloads = [(size, _png_bytes(frames[size])) for size in sizes]
    header = struct.pack("<HHH", 0, 1, len(payloads))
    offset = len(header) + 16 * len(payloads)

    directory = bytearray()
    for size, payload in payloads:
        # 256 is encoded as 0 in the single-byte width/height fields.
        directory += struct.pack(
            "<BBBBHHII",
            0 if size >= 256 else size,
            0 if size >= 256 else size,
            0,
            0,
            1,
            32,
            len(payload),
            offset,
        )
        offset += len(payload)

    with open(path, "wb") as handle:
        handle.write(header)
        handle.write(bytes(directory))
        for _, payload in payloads:
            handle.write(payload)


def build(source: str) -> None:
    if not os.path.exists(source):
        raise SystemExit(f"source artwork not found: {source}")

    original = Image.open(source).convert("RGBA")
    art, bounds = trim_to_artwork(original)
    master = fit_to_canvas(art)

    os.makedirs(ASSETS, exist_ok=True)
    print(f"source  -> {source}")
    print(f"           {original.width}x{original.height}, artwork bbox {bounds}")
    print(f"           trimmed {art.width}x{art.height}, aspect {art.width / art.height:.4f}")
    print(f"assets  -> {ASSETS}")

    master.save(os.path.join(ASSETS, "icon-1024.png"), format="PNG")
    for size in PNG_SIZES:
        if size == CANVAS:
            continue
        master.resize((size, size), DOWNSCALE).save(
            os.path.join(ASSETS, f"icon-{size}.png"), format="PNG"
        )
    print(f"  wrote icon-1024.png (master) + {', '.join(f'icon-{s}.png' for s in PNG_SIZES if s != CANVAS)}")

    ico_frames = {size: master.resize((size, size), DOWNSCALE) for size in ICO_SIZES}
    write_ico(ico_frames, os.path.join(ASSETS, "icon.ico"))
    print(f"  wrote icon.ico ({', '.join(str(s) for s in ICO_SIZES)})")

    try:
        master.save(
            os.path.join(ASSETS, "icon.icns"),
            format="ICNS",
            sizes=[_png_bytes(master.resize((s, s), DOWNSCALE)) for s in ICNS_SIZES],
        )
        print(f"  wrote icon.icns ({', '.join(str(s) for s in ICNS_SIZES)})")
    except Exception as exc:  # pragma: no cover - depends on the local Pillow build
        print(f"  ! icon.icns skipped: {exc}")


def main() -> None:
    source = sys.argv[1] if len(sys.argv) > 1 else DEFAULT_SOURCE
    if not source:
        raise SystemExit(
            "usage: python tools/build-icons.py <source.png>\n"
            "       (or set APPBARDOCK_ICON_SOURCE)"
        )
    build(source)


if __name__ == "__main__":
    main()
