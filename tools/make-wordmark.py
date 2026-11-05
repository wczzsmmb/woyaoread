#!/usr/bin/env python3
"""把「我要读书」四个字从系统宋体里取出轮廓，生成：
   src/components/Wordmark.vue     横向字标（内联 SVG，fill: currentColor）
   public/icon.svg                 方形图标（上下两字（读/书），可 maskable）

设计取自「运筹学UI」的做法：字标不依赖字体文件、不用 SVG <text>，
所以任何机器上渲染都一致，也不会出现字体加载抖动。

用法（仅开发时需要）：
   python3 -m venv /tmp/ftenv && /tmp/ftenv/bin/pip install fonttools
   /tmp/ftenv/bin/python tools/make-wordmark.py
"""
from pathlib import Path

from fontTools.ttLib import TTFont
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen
from fontTools.pens.boundsPen import BoundsPen

ROOT = Path(__file__).resolve().parent.parent
TEXT = "我要读书"

# macOS 自带宋体：Songti.ttc 是集合，按字体名挑面
SONGTI = Path("/System/Library/Fonts/Supplemental/Songti.ttc")
FACES = {"word": "Songti SC Regular", "icon": "Songti SC Bold"}


def load_face(kind="word"):
    if not SONGTI.exists():
        raise SystemExit("找不到 Songti.ttc")
    wanted = FACES[kind]
    for idx in range(8):
        font = TTFont(SONGTI, fontNumber=idx, lazy=True)
        name = font["name"].getDebugName(4) or ""
        cmap = font.getBestCmap()
        if name == wanted and all(ord(c) in cmap for c in TEXT):
            return TTFont(SONGTI, fontNumber=idx), name
    font = TTFont(SONGTI, fontNumber=6)
    return font, font["name"].getDebugName(4) or "Songti SC Regular"


def glyph_paths(font, text, letterspace=0, baseline=0):
    glyphs = font.getGlyphSet()
    cmap = font.getBestCmap()
    hmtx = font["hmtx"]
    out, x = [], 0
    minx = miny = 1e9
    maxx = maxy = -1e9
    for ch in text:
        gname = cmap[ord(ch)]
        tx = (1, 0, 0, -1, x, baseline)
        pen = SVGPathPen(glyphs)
        glyphs[gname].draw(TransformPen(pen, tx))
        out.append(pen.getCommands())
        bpen = BoundsPen(glyphs)
        glyphs[gname].draw(TransformPen(bpen, tx))
        if bpen.bounds:
            x0, y0, x1, y1 = bpen.bounds
            minx, miny = min(minx, x0), min(miny, y0)
            maxx, maxy = max(maxx, x1), max(maxy, y1)
        x += hmtx[gname][0] + letterspace
    return out, (minx, miny, maxx, maxy), x


def svg(paths, box, extra_class=None, pad=0):
    minx, miny, maxx, maxy = box
    w, h = maxx - minx + pad * 2, maxy - miny + pad * 2
    vb = f"{minx - pad:.1f} {miny - pad:.1f} {w:.1f} {h:.1f}"
    body = "\n".join(f'  <path d="{d}" />' for d in paths if d)
    cls = f' class="{extra_class}"' if extra_class else ""
    return f'<svg{cls} xmlns="http://www.w3.org/2000/svg" viewBox="{vb}" fill="currentColor" aria-hidden="true" focusable="false">\n{body}\n</svg>\n'


def main():
    font, name = load_face("word")
    print(f"字标字体: {name}")

    # 1) 横向字标
    paths, box, _ = glyph_paths(font, TEXT, letterspace=-20)
    word = svg(paths, box)
    (ROOT / "src" / "components" / "Wordmark.vue").write_text(
        "<script setup lang=\"ts\">\n// 由 tools/make-wordmark.py 生成，勿手改。\n</script>\n\n<template>\n"
        + word.replace("<svg", "<svg class=\"wordmark\"")
        + "</template>\n",
        encoding="utf-8",
    )

    # 2) 方形图标：上下两字（读/书），留出 maskable 安全区（用 Bold，小尺寸更立得住）
    icon_font, icon_name = load_face("icon")
    print(f"图标字体: {icon_name}")
    up, box1, _ = glyph_paths(icon_font, "读")
    dn, box2, _ = glyph_paths(icon_font, "书")
    b1, b2 = box1, box2
    w = max(b1[2] - b1[0], b2[2] - b2[0])
    h1, h2 = b1[3] - b1[1], b2[3] - b2[1]
    gap = 40
    total_h = h1 + h2 + gap
    size = max(w, total_h) * 1.62  # 安全区
    off_x = (size - w) / 2
    off_y = (size - total_h) / 2
    # 平移：第一字左上对齐 off_x/off_y，第二字在其下
    def shift(paths, box, dx, dy):
        # 用 transform 包一层太啰嗦，直接复用 SVG 的 transform 属性
        minx, miny, _, _ = box
        return (paths, minx + dx, miny + dy)

    def group(paths, box, x, y):
        minx, miny, _, _ = box
        return (
            f'  <g transform="translate({x - minx:.1f} {y - miny:.1f})">\n'
            + "\n".join(f'    <path d="{d}" />' for d in paths if d)
            + "\n  </g>\n"
        )

    icon = (
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {size:.0f} {size:.0f}" fill="#111111">\n'
        f'  <rect width="{size:.0f}" height="{size:.0f}" rx="{size * 0.18:.0f}" fill="#ffffff" />\n'
        + group(up, b1, off_x + (w - (b1[2] - b1[0])) / 2, off_y)
        + group(dn, b2, off_x + (w - (b2[2] - b2[0])) / 2, off_y + h1 + gap)
        + "</svg>\n"
    )
    (ROOT / "public" / "icon.svg").write_text(icon, encoding="utf-8")
    print("写出 src/components/Wordmark.vue 与 public/icon.svg")


if __name__ == "__main__":
    main()
