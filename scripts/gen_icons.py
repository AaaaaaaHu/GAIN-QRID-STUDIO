"""Generate application icons using only the Python standard library.

Produces a QR-code style mark: indigo rounded square with white finder patterns.
Run: python scripts/gen_icons.py
"""
import os
import struct
import zlib

OUT = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "src-tauri", "icons")
GRID = 21


def chunk(tag: bytes, data: bytes) -> bytes:
    return struct.pack(">I", len(data)) + tag + data + struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF)


def make_png(size: int) -> bytes:
    scale = size / 512.0
    radius = 108 * scale
    grid_left, grid_top = 112 * scale, 112 * scale
    cell = 288 * scale / GRID

    def finder(gx: int, gy: int, ox: int, oy: int):
        dx, dy = gx - ox, gy - oy
        if not (0 <= dx < 7 and 0 <= dy < 7):
            return None
        border = dx in (0, 6) or dy in (0, 6)
        core = 2 <= dx <= 4 and 2 <= dy <= 4
        return border or core

    def module_on(gx: int, gy: int) -> bool:
        for ox, oy in ((0, 0), (14, 0), (0, 14)):
            hit = finder(gx, gy, ox, oy)
            if hit is not None:
                return hit
        # keep the quiet separators around finder patterns empty
        if (gx < 8 and gy < 8) or (gx > 12 and gy < 8) or (gx < 8 and gy > 12):
            return False
        return ((gx * 31 + gy * 17 + gx * gy * 7 + (gx ^ gy) * 13) % 11) < 5

    def pixel(x: int, y: int):
        # rounded-rectangle mask
        cx = min(max(x, radius), size - radius)
        cy = min(max(y, radius), size - radius)
        if (x - cx) ** 2 + (y - cy) ** 2 > radius ** 2:
            return (0, 0, 0, 0)
        # vertical gradient
        t = y / max(size - 1, 1)
        r = int(79 + (37 - 79) * t)
        g = int(70 + (99 - 70) * t)
        b = int(229 + (235 - 229) * t)

        gx = int((x - grid_left) / cell)
        gy = int((y - grid_top) / cell)
        if 0 <= gx < GRID and 0 <= gy < GRID and module_on(gx, gy):
            return (255, 255, 255, 255)
        return (r, g, b, 255)

    raw = bytearray()
    for y in range(size):
        raw.append(0)  # filter type: none
        for x in range(size):
            raw.extend(bytes(pixel(x, y)))

    return (
        b"\x89PNG\r\n\x1a\n"
        + chunk(b"IHDR", struct.pack(">IIBBBBB", size, size, 8, 6, 0, 0, 0))
        + chunk(b"IDAT", zlib.compress(bytes(raw), 9))
        + chunk(b"IEND", b"")
    )


def make_ico(sizes) -> bytes:
    images = [make_png(s) for s in sizes]
    header = struct.pack("<HHH", 0, 1, len(images))
    offset = 6 + 16 * len(images)
    entries = b""
    for s, img in zip(sizes, images):
        entries += struct.pack("<BBBBHHII", s % 256, s % 256, 0, 0, 1, 32, len(img), offset)
        offset += len(img)
    return header + entries + b"".join(images)


def main():
    os.makedirs(OUT, exist_ok=True)
    files = {
        "32x32.png": make_png(32),
        "128x128.png": make_png(128),
        "128x128@2x.png": make_png(256),
        "icon.ico": make_ico([16, 32, 48, 64, 128, 256]),
    }
    for name, data in files.items():
        with open(os.path.join(OUT, name), "wb") as f:
            f.write(data)
        print(f"{name}: {len(data)} bytes")


if __name__ == "__main__":
    main()
