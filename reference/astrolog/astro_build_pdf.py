#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
astro_build_pdf.py — модуль оформления PDF для разбора натальной карты.

main.py должен вызвать set_client(...) до построения story:

    from astro_build_pdf import set_client
    set_client({
        "date_str":  "15 марта 1986",
        "time_str":  "22:25",
        "place_str": "Харьков",
        "header_line": "Натальная карта  ·  15.03.1986  ·  Харьков  ·  22:25",
    })
"""

import os

# ---------- Данные клиента (заполняются из main.py) ----------
CLIENT = {
    "date_str":    "—",
    "time_str":    "—",
    "place_str":   "—",
    "header_line": "Натальная карта",
}

def set_client(info: dict):
    """Вызывается из main.py до сборки story."""
    CLIENT.update(info)

from reportlab.lib.pagesizes import A4
from reportlab.lib.units import cm, mm
from reportlab.lib.colors import HexColor, Color
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.enums import TA_LEFT, TA_CENTER, TA_JUSTIFY
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, PageBreak, Table, TableStyle,
    KeepTogether, Flowable
)
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfgen import canvas

# ---------- Шрифты ----------
FONT_DIR = "/usr/share/fonts/truetype/dejavu"
pdfmetrics.registerFont(TTFont("DejaVuSerif", f"{FONT_DIR}/DejaVuSerif.ttf"))
pdfmetrics.registerFont(TTFont("DejaVuSerif-Bold", f"{FONT_DIR}/DejaVuSerif-Bold.ttf"))
pdfmetrics.registerFont(TTFont("DejaVuSerif-Italic", f"{FONT_DIR}/DejaVuSerif-Italic.ttf"))
pdfmetrics.registerFont(TTFont("DejaVuSans", f"{FONT_DIR}/DejaVuSans.ttf"))
pdfmetrics.registerFont(TTFont("DejaVuSans-Bold", f"{FONT_DIR}/DejaVuSans-Bold.ttf"))
pdfmetrics.registerFont(TTFont("DejaVuSans-Italic", f"{FONT_DIR}/DejaVuSans-Oblique.ttf"))

pdfmetrics.registerFontFamily(
    "DejaVuSerif",
    normal="DejaVuSerif",
    bold="DejaVuSerif-Bold",
    italic="DejaVuSerif-Italic",
)
pdfmetrics.registerFontFamily(
    "DejaVuSans",
    normal="DejaVuSans",
    bold="DejaVuSans-Bold",
    italic="DejaVuSans-Italic",
)

# ---------- Цветовая палитра ----------
NAVY = HexColor("#1B2545")       # глубокая ночная синь
INK = HexColor("#232333")        # основной текст
GOLD = HexColor("#B08E4F")       # приглушённое золото
ROSE = HexColor("#8C5F6B")       # пыльная роза
MUTED = HexColor("#6B6B7C")      # подпись
CREAM = HexColor("#F7F1E6")      # кремовый фон
LINE = HexColor("#D9CDB4")       # линия
ACCENT_BG = HexColor("#F1EADD")  # фон цитаты

# ---------- Стили ----------
styles = getSampleStyleSheet()

s_cover_eyebrow = ParagraphStyle(
    "CoverEyebrow", fontName="DejaVuSans", fontSize=10,
    textColor=GOLD, alignment=TA_CENTER, spaceAfter=14, leading=14,
)
s_cover_title = ParagraphStyle(
    "CoverTitle", fontName="DejaVuSerif-Bold", fontSize=30,
    textColor=NAVY, alignment=TA_CENTER, leading=36, spaceAfter=8,
)
s_cover_sub = ParagraphStyle(
    "CoverSub", fontName="DejaVuSerif-Italic", fontSize=14,
    textColor=ROSE, alignment=TA_CENTER, leading=18, spaceAfter=40,
)
s_cover_data = ParagraphStyle(
    "CoverData", fontName="DejaVuSerif", fontSize=12,
    textColor=INK, alignment=TA_CENTER, leading=20,
)

s_h1 = ParagraphStyle(
    "H1", fontName="DejaVuSerif-Bold", fontSize=20,
    textColor=NAVY, alignment=TA_LEFT, leading=26,
    spaceBefore=10, spaceAfter=6,
)
s_h1_eyebrow = ParagraphStyle(
    "H1Eyebrow", fontName="DejaVuSans", fontSize=9,
    textColor=GOLD, alignment=TA_LEFT, leading=12, spaceAfter=2,
)

s_h2 = ParagraphStyle(
    "H2", fontName="DejaVuSerif-Bold", fontSize=14,
    textColor=ROSE, alignment=TA_LEFT, leading=18,
    spaceBefore=14, spaceAfter=4,
)

s_body = ParagraphStyle(
    "Body", fontName="DejaVuSerif", fontSize=11,
    textColor=INK, alignment=TA_JUSTIFY, leading=17, spaceAfter=7,
    firstLineIndent=0,
)

s_quote = ParagraphStyle(
    "Quote", fontName="DejaVuSerif-Italic", fontSize=11.5,
    textColor=NAVY, alignment=TA_LEFT, leading=18,
    leftIndent=16, rightIndent=10, spaceBefore=4, spaceAfter=4,
)

s_caption = ParagraphStyle(
    "Caption", fontName="DejaVuSans-Italic", fontSize=9,
    textColor=MUTED, alignment=TA_LEFT, leading=12,
)

s_small = ParagraphStyle(
    "Small", fontName="DejaVuSans", fontSize=9,
    textColor=MUTED, alignment=TA_CENTER, leading=12,
)


# ---------- Декоративные элементы ----------
class HRule(Flowable):
    """Тонкая линия-разделитель с золотым ромбиком посередине."""
    def __init__(self, width=None, color=LINE, thickness=0.5):
        Flowable.__init__(self)
        self.width = width
        self.color = color
        self.thickness = thickness
        self.height = 12

    def wrap(self, availWidth, availHeight):
        if self.width is None:
            self.width = availWidth
        return (self.width, self.height)

    def draw(self):
        c = self.canv
        c.setStrokeColor(self.color)
        c.setLineWidth(self.thickness)
        y = self.height / 2
        gap = 8
        cx = self.width / 2
        c.line(0, y, cx - gap, y)
        c.line(cx + gap, y, self.width, y)
        # Ромб
        c.setFillColor(GOLD)
        c.setStrokeColor(GOLD)
        size = 3
        p = c.beginPath()
        p.moveTo(cx, y + size)
        p.lineTo(cx + size, y)
        p.lineTo(cx, y - size)
        p.lineTo(cx - size, y)
        p.close()
        c.drawPath(p, stroke=0, fill=1)


class QuoteBox(Flowable):
    """Декоративная врезка-цитата."""
    def __init__(self, text, width=None):
        Flowable.__init__(self)
        self.text = text
        self.width = width
        self._para = None
        self._h = 0

    def wrap(self, availWidth, availHeight):
        if self.width is None:
            self.width = availWidth
        inner_w = self.width - 28
        self._para = Paragraph(self.text, s_quote)
        w, h = self._para.wrap(inner_w, availHeight)
        self._h = h + 20
        return (self.width, self._h)

    def draw(self):
        c = self.canv
        # фон
        c.setFillColor(ACCENT_BG)
        c.setStrokeColor(ACCENT_BG)
        c.rect(0, 0, self.width, self._h, stroke=0, fill=1)
        # золотая полоса слева
        c.setFillColor(GOLD)
        c.rect(0, 0, 3, self._h, stroke=0, fill=1)
        # текст
        self._para.drawOn(c, 14, 10)


class Starfield(Flowable):
    """Мелкий точечный орнамент — россыпь «звёзд»."""
    def __init__(self, width, height=18, count=40):
        Flowable.__init__(self)
        self.width = width
        self.height = height
        self.count = count

    def wrap(self, *args):
        return (self.width, self.height)

    def draw(self):
        import random
        random.seed(7)
        c = self.canv
        c.setFillColor(GOLD)
        for _ in range(self.count):
            x = random.random() * self.width
            y = random.random() * self.height
            r = random.choice([0.4, 0.6, 0.8, 1.0])
            c.circle(x, y, r, stroke=0, fill=1)


# ---------- Оформление страниц ----------
def _page_frame(canv, doc):
    """Рамка и номер страницы на каждой странице (кроме обложки)."""
    page_num = canv.getPageNumber()
    w, h = A4

    # лёгкая кремовая подложка сверху и снизу
    canv.saveState()

    # верхний маркер
    canv.setStrokeColor(LINE)
    canv.setLineWidth(0.5)
    canv.line(2*cm, h - 1.6*cm, w - 2*cm, h - 1.6*cm)

    # название в колонтитуле
    canv.setFont("DejaVuSans", 8)
    canv.setFillColor(MUTED)
    canv.drawString(2*cm, h - 1.3*cm, CLIENT["header_line"])
    canv.drawRightString(w - 2*cm, h - 1.3*cm, f"— {page_num} —")

    # нижняя линия
    canv.line(2*cm, 1.6*cm, w - 2*cm, 1.6*cm)
    canv.setFont("DejaVuSans-Italic", 8)
    canv.drawCentredString(w/2, 1.1*cm, "✦  Индивидуальный разбор  ✦")

    canv.restoreState()


def _cover_page(canv, doc):
    """Обложка: сверху тёмное звёздное небо, снизу — тёплый кремовый с текстом.
    Все надписи размещены на светлой части для максимального контраста."""
    w, h = A4
    canv.saveState()

    import math, random

    # --- Фон: сплошной кремовый ---
    canv.setFillColor(CREAM)
    canv.rect(0, 0, w, h, stroke=0, fill=1)

    # --- Верхняя «небесная» полоса (примерно 55% высоты) ---
    SKY_TOP_Y = h
    SKY_BOTTOM_Y = h * 0.45
    band_h = SKY_TOP_Y - SKY_BOTTOM_Y
    steps = 80
    # Цвета: тёмный навий сверху (#0E1530) → тёплый кремовый внизу (CREAM)
    DARK_R, DARK_G, DARK_B = 0x0E, 0x15, 0x30
    CREAM_R, CREAM_G, CREAM_B = 0xF7, 0xF1, 0xE6
    for i in range(steps):
        # i=0 — нижняя часть полосы, i=steps-1 — самый верх страницы
        y0 = SKY_BOTTOM_Y + i * band_h / steps
        frac_up = i / (steps - 1)   # 0 внизу полосы, 1 наверху
        # Интерполяция: внизу cream, наверху dark
        r = (CREAM_R * (1 - frac_up) + DARK_R * frac_up) / 255
        g = (CREAM_G * (1 - frac_up) + DARK_G * frac_up) / 255
        b = (CREAM_B * (1 - frac_up) + DARK_B * frac_up) / 255
        canv.setFillColor(Color(r, g, b))
        canv.rect(0, y0, w, band_h / steps + 1, stroke=0, fill=1)

    # --- Россыпь звёзд только в тёмной части (верхние 45% страницы) ---
    random.seed(42)
    for _ in range(160):
        x = random.random() * w
        # Звёзды в верхней половине тёмного неба, плотнее сверху
        y = SKY_BOTTOM_Y + (random.random() ** 0.6) * band_h * 0.95
        rr = random.choice([0.3, 0.4, 0.5, 0.7, 0.9, 1.2])
        # более крупные — ярче
        shade = HexColor("#FBF4E2") if rr > 0.6 else HexColor("#C9AF6E")
        canv.setFillColor(shade)
        canv.circle(x, y, rr, stroke=0, fill=1)

    # Несколько более крупных «огоньков»
    canv.setFillColor(HexColor("#FFF6DE"))
    for cx_, cy_, rad in [(w*0.18, h*0.88, 1.6), (w*0.78, h*0.72, 1.8),
                          (w*0.62, h*0.93, 1.3), (w*0.32, h*0.60, 1.4)]:
        canv.circle(cx_, cy_, rad, stroke=0, fill=1)

    # --- Центральная астрологическая окружность в тёмной части ---
    cx, cy = w / 2, h * 0.72
    canv.setStrokeColor(HexColor("#C9AF6E"))
    canv.setLineWidth(0.9)
    canv.circle(cx, cy, 88, stroke=1, fill=0)
    canv.circle(cx, cy, 72, stroke=1, fill=0)
    canv.circle(cx, cy, 56, stroke=1, fill=0)

    # 12 делений
    for k in range(12):
        a = math.radians(k * 30 - 90)
        x1 = cx + 72 * math.cos(a)
        y1 = cy + 72 * math.sin(a)
        x2 = cx + 88 * math.cos(a)
        y2 = cy + 88 * math.sin(a)
        canv.line(x1, y1, x2, y2)

    # центральный ромб
    canv.setFillColor(HexColor("#E0C07A"))
    size = 6
    p = canv.beginPath()
    p.moveTo(cx, cy + size)
    p.lineTo(cx + size, cy)
    p.lineTo(cx, cy - size)
    p.lineTo(cx - size, cy)
    p.close()
    canv.drawPath(p, stroke=0, fill=1)

    # --- Тонкая золотая разделительная линия между небом и текстом ---
    canv.setStrokeColor(GOLD)
    canv.setLineWidth(0.6)
    canv.line(w*0.25, SKY_BOTTOM_Y, w*0.42, SKY_BOTTOM_Y)
    canv.line(w*0.58, SKY_BOTTOM_Y, w*0.75, SKY_BOTTOM_Y)
    # золотой ромбик посередине линии
    canv.setFillColor(GOLD)
    s = 2.5
    p = canv.beginPath()
    p.moveTo(w/2, SKY_BOTTOM_Y + s)
    p.lineTo(w/2 + s, SKY_BOTTOM_Y)
    p.lineTo(w/2, SKY_BOTTOM_Y - s)
    p.lineTo(w/2 - s, SKY_BOTTOM_Y)
    p.close()
    canv.drawPath(p, stroke=0, fill=1)

    # ========================================================
    # ТЕКСТОВЫЙ БЛОК НА КРЕМОВОМ ФОНЕ (высокий контраст)
    # ========================================================

    # Подпись-шапка (золото на кремовом — отлично читается)
    canv.setFillColor(GOLD)
    canv.setFont("DejaVuSans-Bold", 11)
    canv.drawCentredString(cx, SKY_BOTTOM_Y - 30, "А С Т Р О Л О Г И Ч Е С К И Й   Р А З Б О Р")

    # Заголовок (NAVY на кремовом — чёрно-тёплый контраст)
    canv.setFillColor(NAVY)
    canv.setFont("DejaVuSerif-Bold", 36)
    canv.drawCentredString(cx, SKY_BOTTOM_Y - 75, "Натальная карта")

    # Подзаголовок
    canv.setFillColor(ROSE)
    canv.setFont("DejaVuSerif-Italic", 16)
    canv.drawCentredString(cx, SKY_BOTTOM_Y - 100, "индивидуальное прочтение")

    # Разделительная звёздочка
    canv.setFillColor(GOLD)
    canv.setFont("DejaVuSans", 14)
    canv.drawCentredString(cx, SKY_BOTTOM_Y - 135, "✦")

    # --- Данные рождения: три колонки на кремовом ---
    # Левая колонка — Дата | Центр — Время | Правая — Место
    block_y = SKY_BOTTOM_Y - 180
    col_xs = [w * 0.22, w * 0.50, w * 0.78]
    labels = ["Д А Т А", "В Р Е М Я", "М Е С Т О"]
    values = [CLIENT["date_str"], CLIENT["time_str"], CLIENT["place_str"]]

    for xx, lbl, val in zip(col_xs, labels, values):
        canv.setFillColor(GOLD)
        canv.setFont("DejaVuSans", 9)
        canv.drawCentredString(xx, block_y, lbl)
        canv.setFillColor(NAVY)
        canv.setFont("DejaVuSerif", 13)
        canv.drawCentredString(xx, block_y - 20, val)

    # Вертикальные тонкие разделители между колонками
    canv.setStrokeColor(LINE)
    canv.setLineWidth(0.5)
    for sep_x in [w * 0.36, w * 0.64]:
        canv.line(sep_x, block_y - 24, sep_x, block_y + 6)

    # Нижняя линия + подпись
    canv.setStrokeColor(LINE)
    canv.setLineWidth(0.5)
    canv.line(w * 0.3, 2.4 * cm, w * 0.7, 2.4 * cm)

    canv.setFillColor(GOLD)
    canv.setFont("DejaVuSans-Italic", 9)
    canv.drawCentredString(cx, 1.6 * cm, "✦   подготовлено индивидуально   ✦")

    canv.setFillColor(MUTED)
    canv.setFont("DejaVuSans", 7.5)
    _short = f'{CLIENT["place_str"]} · {CLIENT["date_str"]} · {CLIENT["time_str"]}'
    canv.drawCentredString(cx, 1.05 * cm, _short)

    canv.restoreState()


# ---------- Хэлперы для сборки контента ----------
def H1(eyebrow, title):
    return [
        Spacer(1, 4),
        Paragraph(eyebrow.upper(), s_h1_eyebrow),
        Paragraph(title, s_h1),
        HRule(),
        Spacer(1, 6),
    ]

def H2(text):
    return [Paragraph(text, s_h2)]

def P(text):
    return [Paragraph(text, s_body)]

def Q(text):
    return [Spacer(1, 4), QuoteBox(text), Spacer(1, 6)]


# ---------- Таблица ключевых позиций ----------
# Заголовок + строки для КАЖДОГО клиента собирает main.py и передаёт сюда.
# Пример:
# rows = [
#     ["Солнце ☉",      "Рыбы",  "24°55'", "V"],
#     ["Луна ☽",        "Телец", "23°36'", "VII"],
#     ...
#     ["Асцендент",     "Скорпион", "06°11'", "—"],
#     ["МС",            "Лев",   "18°09'", "X"],
# ]
def key_positions_table(rows):
    header = ["Светило / точка", "Знак", "Градус", "Дом"]
    data = [header] + rows
    t = Table(data, colWidths=[5.2*cm, 3.2*cm, 2.7*cm, 2.3*cm])
    t.setStyle(TableStyle([
        ("FONTNAME", (0,0), (-1,0), "DejaVuSans-Bold"),
        ("FONTSIZE", (0,0), (-1,0), 10),
        ("TEXTCOLOR", (0,0), (-1,0), HexColor("#F7F1E6")),
        ("BACKGROUND", (0,0), (-1,0), NAVY),
        ("ALIGN", (0,0), (-1,-1), "LEFT"),
        ("FONTNAME", (0,1), (-1,-1), "DejaVuSans"),
        ("FONTSIZE", (0,1), (-1,-1), 10),
        ("TEXTCOLOR", (0,1), (-1,-1), INK),
        ("ROWBACKGROUNDS", (0,1), (-1,-1), [CREAM, HexColor("#FBF6EA")]),
        ("LINEBELOW", (0,0), (-1,0), 0.8, GOLD),
        ("LEFTPADDING", (0,0), (-1,-1), 8),
        ("RIGHTPADDING", (0,0), (-1,-1), 8),
        ("TOPPADDING", (0,0), (-1,-1), 6),
        ("BOTTOMPADDING", (0,0), (-1,-1), 6),
    ]))
    return t
