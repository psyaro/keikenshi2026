"""共有カード(OGP画像 1200x630)を生成して docs/og.png に出力する。

Pillow のみ使用。日本語は Windows 同梱フォントを利用。
再生成: python scripts/make_og.py
"""
import pathlib

from PIL import Image, ImageDraw, ImageFont

OUT = pathlib.Path(__file__).resolve().parent.parent / "docs" / "og.png"
W, H = 1200, 630

INK = (31, 35, 48)
MUTED = (107, 114, 128)
BRAND = (79, 70, 229)
BG = (247, 248, 250)

# 経県値カラー(凡例順) : (ラベル, 背景色, 文字色)
LEGEND = [
    ("○ 宿泊", (255, 0, 0), (255, 255, 255)),
    ("● 訪問", (255, 255, 0), (40, 40, 40)),
    ("△ 接地", (0, 204, 0), (255, 255, 255)),
    ("▲ 通過", (0, 255, 255), (40, 40, 40)),
    ("× 未踏", (255, 255, 255), (90, 90, 90)),
]

FONT_CANDIDATES = [
    r"C:\Windows\Fonts\YuGothB.ttc",
    r"C:\Windows\Fonts\meiryob.ttc",
    r"C:\Windows\Fonts\meiryo.ttc",
    r"C:\Windows\Fonts\YuGothM.ttc",
    r"C:\Windows\Fonts\msgothic.ttc",
]


def font(size):
    for p in FONT_CANDIDATES:
        if pathlib.Path(p).exists():
            return ImageFont.truetype(p, size)
    return ImageFont.load_default()


def center_text(draw, box, text, fnt, fill):
    x0, y0, x1, y1 = box
    l, t, r, b = draw.textbbox((0, 0), text, font=fnt)
    draw.text((x0 + (x1 - x0 - (r - l)) / 2 - l, y0 + (y1 - y0 - (b - t)) / 2 - t), text, font=fnt, fill=fill)


def main():
    img = Image.new("RGB", (W, H), BG)
    d = ImageDraw.Draw(img)

    d.rectangle([0, 0, W, 14], fill=BRAND)  # 上部アクセント

    d.text((72, 78), "経県値マップ 2026", font=font(80), fill=INK)
    d.text((74, 196), "行ったまちを、ぬって記録。", font=font(44), fill=BRAND)
    d.text((74, 278), "全国1,894市区町村を5段階で塗り分け。", font=font(30), fill=MUTED)
    d.text((74, 322), "背景地図の切替・鉄道・高速の重ね合わせ・CSV/HTML/JPG書き出し。", font=font(28), fill=MUTED)

    # 凡例スウォッチ
    n = len(LEGEND)
    pad, gap = 72, 18
    bw = (W - pad * 2 - gap * (n - 1)) / n
    bh, y = 110, 440
    bf = font(30)
    for i, (label, bg, fg) in enumerate(LEGEND):
        x0 = pad + i * (bw + gap)
        box = [x0, y, x0 + bw, y + bh]
        d.rounded_rectangle(box, radius=16, fill=bg, outline=(210, 210, 210), width=2)
        center_text(d, box, label, bf, fg)

    d.text((72, 575), "地理院タイル / 国土数値情報 N03(2021)", font=font(22), fill=MUTED)

    OUT.parent.mkdir(exist_ok=True)
    img.save(OUT, "PNG")
    print("wrote", OUT, img.size)


if __name__ == "__main__":
    main()
