"""Extract the 6 x 4 transparent jewelry atlas into catalog PNGs (stdlib only).

Usage: python3 scripts/split_charm_atlas.py /path/to/atlas.png
This only crops/repositions existing pixels; artwork and alpha are preserved.
"""
import struct
import sys
import zlib
from pathlib import Path

NAMES = (
    'heart moon food wave cloud mountain gift flower sun star leaf camera '
    'smile cake coffee book note plane paw bike candle home snow matcha'
).split()


def paeth(a, b, c):
    p = a + b - c
    return min((a, b, c), key=lambda value: abs(p - value))


def read_png(path):
    data = Path(path).read_bytes()
    assert data[:8] == b'\x89PNG\r\n\x1a\n'
    pos, compressed = 8, bytearray()
    while pos < len(data):
        length = struct.unpack('>I', data[pos:pos + 4])[0]
        kind, payload = data[pos + 4:pos + 8], data[pos + 8:pos + 8 + length]
        if kind == b'IHDR':
            w, h, depth, color, _, _, interlace = struct.unpack('>IIBBBBB', payload)
            assert (depth, color, interlace) == (8, 6, 0), 'Requires non-interlaced RGBA8 PNG'
        if kind == b'IDAT':
            compressed.extend(payload)
        pos += length + 12
    raw, rows, prev = zlib.decompress(compressed), [], bytearray(w * 4)
    stride = w * 4
    for y in range(h):
        mode = raw[y * (stride + 1)]
        row = bytearray(raw[y * (stride + 1) + 1:(y + 1) * (stride + 1)])
        for x in range(stride):
            a, b, c = row[x - 4] if x >= 4 else 0, prev[x], prev[x - 4] if x >= 4 else 0
            predictor = (0, a, b, (a + b) // 2, paeth(a, b, c))[mode]
            row[x] = (row[x] + predictor) & 255
        rows.append(row)
        prev = row
    return w, h, rows


def chunk(kind, data):
    return struct.pack('>I', len(data)) + kind + data + struct.pack('>I', zlib.crc32(kind + data))


def write_png(path, w, h, rows):
    header = struct.pack('>IIBBBBB', w, h, 8, 6, 0, 0, 0)
    data = b''.join(b'\0' + row for row in rows)
    Path(path).write_bytes(b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', header)
                          + chunk(b'IDAT', zlib.compress(data, 9)) + chunk(b'IEND', b''))


if __name__ == '__main__':
    width, height, rows = read_png(sys.argv[1])
    cw, ch = width // 6, height // 4
    assert width % 6 == height % 4 == 0
    # The last row's tall jump rings begin slightly above its nominal grid
    # boundary. Crop on the transparent gutters to keep neighboring artwork out.
    gutters = [0, ch, ch * 2, round(height * 0.7324), height]
    out = Path(__file__).resolve().parents[1] / 'public/assets/charms/gold'
    out.mkdir(parents=True, exist_ok=True)
    for i, name in enumerate(NAMES):
        col, row = i % 6, i // 6
        start, end = gutters[row], min(gutters[row + 1], gutters[row] + ch)
        pixels = [bytearray(r[col * cw * 4:(col + 1) * cw * 4]) for r in rows[start:end]]
        pixels.extend(bytearray(cw * 4) for _ in range(ch - len(pixels)))
        assert any(pixels[y][x * 4 + 3] == 0 for y in range(ch) for x in range(cw)), 'Atlas needs transparent alpha'
        write_png(out / f'{name}.png', cw, ch, pixels)
    print(f'Extracted {len(NAMES)} charms to {out}')
