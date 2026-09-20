"""Extract advance widths from the bundled static fonts. No Python dependencies."""
from pathlib import Path
import struct, json
ROOT = Path(__file__).resolve().parents[1]

def metrics(name):
    data = (ROOT / 'public/fonts' / name).read_bytes()
    u16 = lambda p: struct.unpack_from('>H', data, p)[0]
    u32 = lambda p: struct.unpack_from('>I', data, p)[0]
    tables = {}
    for i in range(u16(4)):
        p = 12 + 16 * i
        tables[data[p:p+4].decode('ascii')] = u32(p+8)
    units = u16(tables['head'] + 18)
    count = u16(tables['hhea'] + 34)
    advances = [u16(tables['hmtx'] + i * 4) / units for i in range(count)]
    cmap = tables['cmap']
    mapping = {}
    for i in range(u16(cmap + 2)):
        record = cmap + 4 + i * 8
        if u16(record) not in (0, 3): continue
        table = cmap + u32(record + 4)
        if u16(table) != 4: continue
        n = u16(table + 6) // 2
        end = table + 14
        start = end + 2 * n + 2
        delta = start + 2 * n
        offsets = delta + 2 * n
        for seg in range(n):
            for cp in range(u16(start + 2 * seg), u16(end + 2 * seg) + 1):
                if cp == 65535: continue
                off = u16(offsets + 2 * seg)
                gid = u16(offsets + 2 * seg + off + 2 * (cp - u16(start + 2 * seg))) if off else cp
                if gid: gid = (gid + u16(delta + 2 * seg)) & 65535
                if gid and cp >= 32: mapping[str(cp)] = round(advances[min(gid, count-1)], 4)
    return mapping
out = {'regular': metrics('IBMPlexSans-Regular.ttf'), 'semibold': metrics('IBMPlexSans-SemiBold.ttf')}
(ROOT / 'packages/core/src/font-metrics.json').write_text(json.dumps(out, separators=(',', ':')) + '\n')
print('Generated', len(out['regular']), 'regular glyph metrics and', len(out['semibold']), 'semibold glyph metrics')
