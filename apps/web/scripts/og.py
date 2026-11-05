"""The share image.

Composed here rather than in the browser so that it is a file in the repository like any other
asset: the same fonts the documents use, the chart from a real sample, and the headline of the
page it links to.
"""

from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter, ImageFont

# The fonts the documents use, found from this file rather than from one machine's checkout.
F = str(Path(__file__).resolve().parents[3] / "packages/document/src/natalka_document/fonts") + "/"
W, H = 1200, 630

COPY = {
    "ru": (
        "Ваша натальная карта —",
        "с датами",
        "35 страниц личного разбора и прогноз по месяцам.",
        "Бесплатное превью, PDF на почту.",
        "PDF · 35 страниц",
    ),
    "uk": (
        "Ваша натальна карта —",
        "з датами",
        "35 сторінок особистого розбору і прогноз за місяцями.",
        "Безкоштовне превʼю, PDF на пошту.",
        "PDF · 35 сторінок",
    ),
    "pl": (
        "Horoskop urodzeniowy —",
        "z dokładnymi datami",
        "35 stron indywidualnej analizy i prognoza na każdy miesiąc.",
        "Bezpłatny podgląd, PDF e-mailem.",
        "PDF · 35 stron",
    ),
    "de": (
        "Ihr Geburtshoroskop —",
        "auf den Monat genau",
        "35 Seiten persönliche Deutung, Prognose nach Monaten.",
        "Kostenlose Vorschau, PDF per E-Mail.",
        "PDF · 35 Seiten",
    ),
}

#: Russian keeps the name it always had; other languages carry theirs.
OUT = {
    "ru": "public/og.png",
    "uk": "public/og-uk.png",
    "pl": "public/og-pl.png",
    "de": "public/og-de.png",
}

mark_f = ImageFont.truetype(F + "PlayfairDisplay-Medium.ttf", 34)
head_f = ImageFont.truetype(F + "PlayfairDisplay-Regular.ttf", 54)
lead_f = ImageFont.truetype(F + "GolosText-Regular.ttf", 23)
mono_f = ImageFont.truetype(F + "JetBrainsMono-Regular.ttf", 17)

wheel = Image.open("public/og-wheel.png").convert("RGB").resize((820, 820), Image.LANCZOS)
circle = Image.new("L", wheel.size, 0)
ImageDraw.Draw(circle).ellipse((0, 0, 819, 819), fill=255)
circle = circle.filter(ImageFilter.GaussianBlur(30))
# Dimmed towards the words, so the halves meet without a seam.
fade = (
    Image.linear_gradient("L")
    .rotate(90, expand=True)
    .resize(wheel.size)
    .point(lambda v: min(255, int(v * 2.4)))
)
wheel_mask = Image.composite(circle, Image.new("L", wheel.size, 0), fade)

for locale, (head1, head2, lead1, lead2, size) in COPY.items():
    bg = Image.new("RGB", (W, H), "#05070f")
    glow = Image.new("L", (W, H), 0)
    ImageDraw.Draw(glow).ellipse((W * 0.30, -H * 0.55, W * 1.32, H * 1.55), fill=190)
    bg = Image.composite(
        Image.new("RGB", (W, H), "#1b2a6b"), bg, glow.filter(ImageFilter.GaussianBlur(120))
    )
    bg.paste(wheel, (W - 660, H // 2 - 410), wheel_mask)

    d = ImageDraw.Draw(bg)
    x, cy = 72, 172
    d.ellipse((x, cy - 17, x + 34, cy + 17), outline="#e7b75c", width=2)
    d.line((x + 2, cy, x + 32, cy), fill="#e7b75c", width=2)
    d.line((x + 17, cy - 15, x + 17, cy + 15), fill="#e7b75c", width=2)
    d.ellipse((x + 11, cy - 6, x + 23, cy + 6), outline="#e7b75c", width=2)
    d.text((x + 50, cy), "Chronika", font=mark_f, fill="#eef1fb", anchor="lm")

    d.text((x, 236), head1, font=head_f, fill="#f4f6ff")
    d.text((x, 300), head2, font=head_f, fill="#f4f6ff")
    d.text((x, 400), lead1, font=lead_f, fill="#aab3d0")
    d.text((x, 434), lead2, font=lead_f, fill="#aab3d0")

    for i, part in enumerate(("chronika.me", size)):
        left = x + i * 210
        d.text((left, 505), "◆", font=mono_f, fill="#e7b75c")
        d.text((left + 22, 505), part, font=mono_f, fill="#e7b75c")

    bg.save(OUT[locale], optimize=True)
    print(OUT[locale], locale)
