"""Generate the Fund Pilot icon set (app icon + tray template icons).

Run:  python tools/make_icons.py
"""
import math
import os
import struct

from PIL import Image, ImageDraw, ImageFilter, ImageFont

OUT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
S = 2048            # working canvas (supersampled)
FINAL = 1024

STOPS = [
    (0.00, (67, 56, 202)),    # indigo-700
    (0.35, (99, 102, 241)),   # indigo-500
    (0.72, (56, 189, 248)),   # sky-400
    (1.00, (6, 182, 212)),    # cyan-500
]


def lerp(a, b, t):
    return tuple(round(a[i] + (b[i] - a[i]) * t) for i in range(3))


def color_at(t):
    t = min(max(t, 0.0), 1.0)
    for i in range(len(STOPS) - 1):
        p0, c0 = STOPS[i]
        p1, c1 = STOPS[i + 1]
        if p0 <= t <= p1:
            return lerp(c0, c1, (t - p0) / (p1 - p0))
    return STOPS[-1][1]


def gradient(size):
    img = Image.new('RGB', (size, size))
    px = img.load()
    for y in range(size):
        for x in range(size):
            t = (x / size) * 0.5 + (y / size) * 0.5
            px[x, y] = color_at(t)
    return img


def squircle_mask(size, radius_ratio=0.225, inset_ratio=0.05):
    mask = Image.new('L', (size, size), 0)
    d = ImageDraw.Draw(mask)
    inset = int(size * inset_ratio)
    r = int(size * radius_ratio)
    d.rounded_rectangle([inset, inset, size - inset - 1, size - inset - 1], radius=r, fill=255)
    return mask


def fit(pts, size, pad_ratio=0.06, deg=-18):
    """Rotate then scale/centre points so they fit a size x size square."""
    a = math.radians(deg)
    rot_pts = [
        (x * math.cos(a) - y * math.sin(a), x * math.sin(a) + y * math.cos(a))
        for x, y in pts
    ]
    xs = [p[0] for p in rot_pts]
    ys = [p[1] for p in rot_pts]
    w, h = max(xs) - min(xs), max(ys) - min(ys)
    pad = size * pad_ratio
    sc = (size - 2 * pad) / max(w, h)
    ox = (size - w * sc) / 2 - min(xs) * sc
    oy = (size - h * sc) / 2 - min(ys) * sc
    return [(x * sc + ox, y * sc + oy) for x, y in rot_pts]


def rot(pts, cx, cy, scale, deg):
    a = math.radians(deg)
    out = []
    for x, y in pts:
        xr = x * math.cos(a) - y * math.sin(a)
        yr = x * math.sin(a) + y * math.cos(a)
        out.append((cx + xr * scale, cy + yr * scale))
    return out


def build_app_icon():
    bg = gradient(S)
    mask = squircle_mask(S)
    icon = Image.new('RGBA', (S, S), (0, 0, 0, 0))
    icon.paste(bg, (0, 0), mask)

    # soft top-left sheen
    sheen = Image.new('L', (S, S), 0)
    ImageDraw.Draw(sheen).ellipse([-S * 0.30, -S * 0.70, S * 1.00, S * 0.50], fill=60)
    sheen = sheen.filter(ImageFilter.GaussianBlur(S * 0.08))
    sheen = Image.composite(sheen, Image.new('L', (S, S), 0), mask)
    icon = Image.alpha_composite(icon, Image.merge('RGBA', (Image.new('L', (S, S), 255),) * 3 + (sheen,)))

    # inner rim highlight
    rim = Image.new('L', (S, S), 0)
    ImageDraw.Draw(rim).rounded_rectangle(
        [S * 0.05, S * 0.05, S * 0.95, S * 0.95],
        radius=int(S * 0.225), outline=110, width=int(S * 0.006),
    )
    rim = Image.composite(rim, Image.new('L', (S, S), 0), mask)
    icon = Image.alpha_composite(icon, Image.merge('RGBA', (Image.new('L', (S, S), 255),) * 3 + (rim,)))

    # 白色字母 F（和托盘图标统一）
    font = _tray_font(int(S * 0.68))
    glyph = _glyph_mask('F', font, S)
    icon = _paste_centered(icon, glyph, (S / 2, S / 2))

    return icon.resize((FINAL, FINAL), Image.LANCZOS)


TRAY_FONT = 'C:/Windows/Fonts/segoeuib.ttf'   # Segoe UI Bold
TRAY_FONT_FALLBACKS = [
    'C:/Windows/Fonts/arialbd.ttf',
    'C:/Windows/Fonts/segoeuib.ttf',
    'C:/Windows/Fonts/arial.ttf',
]


def _tray_font(size):
    for f in TRAY_FONT_FALLBACKS:
        if os.path.exists(f):
            return ImageFont.truetype(f, size)
    return ImageFont.load_default()


def _glyph_mask(text, font, canvas):
    """Render text and return the mask cropped to its ink bounding box.

    PIL 的 anchor='mm' 居中的是字体度量框（含上下留白），并非字形本身，
    直接使用会让字形视觉偏下/偏右，所以这里按实际墨迹裁切后再居中。
    """
    tmp = Image.new('L', (canvas, canvas), 0)
    ImageDraw.Draw(tmp).text((canvas / 2, canvas / 2), text, font=font, fill=255, anchor='mm')
    bbox = tmp.getbbox()
    if not bbox:
        return Image.new('L', (1, 1), 0)
    return tmp.crop(bbox)


def _paste_centered(base, mask, center):
    x = int(round(center[0] - mask.width / 2))
    y = int(round(center[1] - mask.height / 2))
    if base.mode == 'L':
        layer = Image.new('L', base.size, 0)
        layer.paste(mask, (x, y))
        return Image.composite(Image.new('L', base.size, 0), base, layer)
    layer = Image.new('RGBA', base.size, (255, 255, 255, 0))
    layer.paste((255, 255, 255, 255), (x, y, x + mask.width, y + mask.height), mask)
    return Image.alpha_composite(base, layer)


def build_tray(size, colored=False):
    """Tray icon.

    colored=False -> macOS template image: white glyph on transparent, the OS tints it.
    colored=True  -> Windows: small gradient plate + white "F", readable on light and
                     dark taskbars as well as in the overflow flyout.
    """
    k = 1024
    center = (k / 2, k / 2)
    font = _tray_font(int(k * (0.70 if colored else 0.68)))
    glyph = _glyph_mask('F', font, k)

    if colored:
        # 彩色：渐变圆角底板 + 白色 F
        plate = gradient(k).convert('RGBA')
        alpha = Image.new('L', (k, k), 0)
        pad = int(k * 0.015)
        ImageDraw.Draw(alpha).rounded_rectangle(
            [pad, pad, k - pad, k - pad], radius=int(k * 0.28), fill=255
        )
        plate.putalpha(alpha)
        plate = _paste_centered(plate, glyph, center)
        return plate.resize((size, size), Image.LANCZOS)

    # macOS 模板图：白色字形 + 镂空底板，由系统负责着色
    img = Image.new('L', (k, k), 0)
    pad = int(k * 0.075)
    ImageDraw.Draw(img).rounded_rectangle(
        [pad, pad, k - pad, k - pad], radius=int(k * 0.24), fill=255
    )
    img = _paste_centered(img, glyph, center)
    img = img.resize((size, size), Image.LANCZOS)
    out = Image.new('RGBA', (size, size), (255, 255, 255, 255))
    out.putalpha(img)
    return out


def save_icns(path, pngs):
    chunks = b''
    for typ, im in pngs:
        tmp = os.path.join(os.path.dirname(path), f'.{typ}.png')
        im.save(tmp, 'PNG')
        data = open(tmp, 'rb').read()
        os.remove(tmp)
        chunks += typ.encode() + struct.pack('>I', len(data) + 8) + data
    with open(path, 'wb') as f:
        f.write(b'icns' + struct.pack('>I', len(chunks) + 8) + chunks)


def main():
    app = build_app_icon()
    app.save(os.path.join(OUT, 'build', 'icon.png'))
    os.makedirs(os.path.join(OUT, 'build', 'icons'), exist_ok=True)
    for s in (16, 24, 32, 48, 64, 128, 256, 512, 1024):
        app.resize((s, s), Image.LANCZOS).save(os.path.join(OUT, 'build', 'icons', f'{s}x{s}.png'))
    app.save(os.path.join(OUT, 'build', 'icon.ico'),
             sizes=[(16, 16), (24, 24), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)])
    save_icns(os.path.join(OUT, 'build', 'icon.icns'), [
        ('ic07', app.resize((128, 128), Image.LANCZOS)),
        ('ic08', app.resize((256, 256), Image.LANCZOS)),
        ('ic09', app.resize((512, 512), Image.LANCZOS)),
        ('ic10', app.resize((1024, 1024), Image.LANCZOS)),
        ('ic11', app.resize((32, 32), Image.LANCZOS)),
        ('ic12', app.resize((64, 64), Image.LANCZOS)),
        ('ic13', app.resize((256, 256), Image.LANCZOS)),
        ('ic14', app.resize((512, 512), Image.LANCZOS)),
    ])

    app.resize((256, 256), Image.LANCZOS).save(
        os.path.join(OUT, 'src', 'renderer', 'public', 'img', 'icon.ico'),
        sizes=[(16, 16), (24, 24), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)])

    menu = os.path.join(OUT, 'assets', 'menu')
    # macOS template images (transparent white glyph, OS handles tinting)
    build_tray(16).save(os.path.join(menu, 'iconTemplate.png'))
    build_tray(32).save(os.path.join(menu, 'iconTemplate@2x.png'))
    # Windows uses the .ico: keep it coloured so it reads on light and dark taskbars
    win = build_tray(256, colored=True)
    win.save(os.path.join(menu, 'iconTemplate.ico'),
             sizes=[(16, 16), (24, 24), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)])
    print('icons written')


if __name__ == '__main__':
    main()
