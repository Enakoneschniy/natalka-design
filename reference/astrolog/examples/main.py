#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Сборка итогового PDF."""

import os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from reportlab.lib.pagesizes import A4
from reportlab.lib.units import cm
from reportlab.platypus import (
    BaseDocTemplate, PageTemplate, Frame,
    Paragraph, Spacer, PageBreak, Table, TableStyle,
)

from build_pdf import (
    # стили/оформление
    s_h1, s_h2, s_body, s_h1_eyebrow, s_caption, s_small, s_quote,
    HRule, QuoteBox, Starfield,
    _page_frame, _cover_page,
    H1, H2, P, Q, key_positions_table,
    NAVY, GOLD, ROSE, CREAM, LINE, INK, MUTED,
)

from content import (
    INTRO_EYEBROW, INTRO_TITLE, INTRO_P1, INTRO_P2,
    S1_EYEBROW, S1_TITLE, S1_P1, S1_P2, S1_P3, S1_Q,
    S2_EYEBROW, S2_TITLE, S2_P1, S2_P2, S2_P3,
    S3_EYEBROW, S3_TITLE, S3_P1, S3_P2, S3_P3, S3_Q,
    S4_EYEBROW, S4_TITLE, S4_P1, S4_P2, S4_P3, S4_P4, S4_Q,
    S5_EYEBROW, S5_TITLE, S5_P1, S5_P2, S5_P3,
    S6_EYEBROW, S6_TITLE, S6_P1, S6_P2, S6_P3,
    S7_EYEBROW, S7_TITLE, S7_P1, S7_P2, S7_P3,
    S8_EYEBROW, S8_TITLE, S8_P1, S8_P2, S8_P3,
    S9_EYEBROW, S9_TITLE, S9_P1, S9_P2, S9_P3, S9_P4, S9_P5,
    S10_EYEBROW, S10_TITLE, S10_P1, S10_P2, S10_P3, S10_Q,
    PS_EYEBROW, PS_TITLE, PS_P1, PS_P2, PS_P3, PS_P4, PS_P5,
)

from content_extended import (
    LOVE_EYEBROW, LOVE_TITLE,
    LOVE_P1,
    LOVE_H2_1, LOVE_P2, LOVE_P3, LOVE_P4, LOVE_Q1, LOVE_P5, LOVE_P6, LOVE_P7,
    LOVE_H2_2, LOVE_P8, LOVE_P9, LOVE_P10, LOVE_P11, LOVE_P12,
    LOVE_P12B, LOVE_P12C, LOVE_P12D, LOVE_Q2,
    LOVE_H2_3, LOVE_P13, LOVE_P14, LOVE_P15,
    LOVE_H2_4, LOVE_P16, LOVE_P17, LOVE_P18, LOVE_P19, LOVE_P20,
    LOVE_P20B, LOVE_P20C,
    LOVE_H2_5, LOVE_P21, LOVE_P22, LOVE_P23, LOVE_P24, LOVE_P25,

    WORK_EYEBROW, WORK_TITLE, WORK_P1,
    WORK_H2_1, WORK_P2, WORK_P3, WORK_P4, WORK_P5,
    WORK_H2_2, WORK_P6, WORK_P7, WORK_P8, WORK_P9, WORK_P10, WORK_Q1,
    WORK_H2_3, WORK_P11, WORK_P12, WORK_P13,
    WORK_H2_4, WORK_P14, WORK_P15, WORK_P16, WORK_P17, WORK_P18, WORK_Q2,

    FINAL_EYEBROW, FINAL_TITLE, FINAL_P1, FINAL_P2, FINAL_P3, FINAL_P4,
)

from content_timeline import (
    TL_EYEBROW, TL_TITLE, TL_INTRO_1, TL_INTRO_2,
    TL_H2_PAST,
    TL_PAST_1_H, TL_PAST_1,
    TL_PAST_2_H, TL_PAST_2,
    TL_PAST_3_H, TL_PAST_3, TL_PAST_3B,
    TL_PAST_4_H, TL_PAST_4,
    TL_PAST_5_H, TL_PAST_5,
    TL_PAST_6_H, TL_PAST_6,
    TL_PAST_7_H, TL_PAST_7, TL_PAST_7B, TL_PAST_7C,
    TL_PAST_8_H, TL_PAST_8,
    TL_PAST_9_H, TL_PAST_9,
    TL_H2_NOW, TL_NOW_1,
    TL_NOW_2_H, TL_NOW_2, TL_NOW_2B,
    TL_NOW_3_H, TL_NOW_3,
    TL_NOW_4_H, TL_NOW_4, TL_NOW_4B,
    TL_H2_2026,
    TL_2026_1_H, TL_2026_1,
    TL_2026_2_H, TL_2026_2, TL_2026_2B, TL_2026_2C,
    TL_2026_3_H, TL_2026_3,
    TL_2026_4_H, TL_2026_4, TL_2026_4B, TL_2026_4C, TL_2026_4D,
    TL_H2_2027,
    TL_2027_1_H, TL_2027_1,
    TL_2027_2_H, TL_2027_2,
    TL_2027_3_H, TL_2027_3, TL_2027_3B,
    TL_2027_4_H, TL_2027_4,
    TL_H2_2028,
    TL_2028_1_H, TL_2028_1,
    TL_2028_2_H, TL_2028_2,
    TL_2028_3_H, TL_2028_3,
    TL_H2_LONG, TL_LONG_1, TL_LONG_2, TL_LONG_3, TL_LONG_4,
    TL_H2_SUMMARY, TL_SUMMARY_1, TL_Q,
)


# Resolve output path for both the Linux sandbox and Mac file tools.
_MAC_PATH = "/Users/eugenenakoneschniy/Downloads/Натальная_карта_15.03.1986.pdf"
_LINUX_PATH = "/sessions/confident-clever-euler/mnt/Downloads/Натальная_карта_15.03.1986.pdf"
OUTPUT = _LINUX_PATH if os.path.isdir("/sessions/confident-clever-euler/mnt/Downloads") else _MAC_PATH

# ---------- DocTemplate со сплошной обложкой и рамкой на остальных ----------
doc = BaseDocTemplate(
    OUTPUT, pagesize=A4,
    leftMargin=2.2*cm, rightMargin=2.2*cm,
    topMargin=2.2*cm, bottomMargin=2.2*cm,
    title="Натальная карта — индивидуальный разбор",
    author="Астрологический разбор",
)

frame_cover = Frame(0, 0, A4[0], A4[1], id="cover",
                    leftPadding=0, rightPadding=0, topPadding=0, bottomPadding=0)
frame_content = Frame(
    doc.leftMargin, doc.bottomMargin,
    A4[0] - doc.leftMargin - doc.rightMargin,
    A4[1] - doc.topMargin - doc.bottomMargin,
    id="content", showBoundary=0,
)

doc.addPageTemplates([
    PageTemplate(id="Cover", frames=[frame_cover], onPage=_cover_page),
    PageTemplate(id="Content", frames=[frame_content], onPage=_page_frame),
])


# ---------- Сборка контента ----------
from reportlab.platypus.doctemplate import NextPageTemplate

story = []

# ОБЛОЖКА — переключаем шаблон ДО PageBreak,
# иначе следующая страница унаследует Cover-фон.
story.append(NextPageTemplate("Content"))
story.append(Spacer(1, 1))
story.append(PageBreak())

# --- Оглавление ---
story += [
    Paragraph("содержание".upper(), s_h1_eyebrow),
    Paragraph("Структура разбора", s_h1),
    HRule(),
    Spacer(1, 10),
]

toc_data = [
    ["I.  Разбор натальной карты", ""],
    ["    Общее впечатление", ""],
    ["    Асцендент и Плутон", ""],
    ["    Стеллиум в Рыбах", ""],
    ["    Луна, Северный узел — путь роста", ""],
    ["    Венера и Марс", ""],
    ["    Сатурн и Уран: деньги и ценности", ""],
    ["    Нептун, Хирон, Лилит", ""],
    ["    МС во Льве — реализация", ""],
    ["    Ключевые аспекты", ""],
    ["II. Личная жизнь", ""],
    ["    Устройство «отдела любви»", ""],
    ["    Текущие транзиты по 7 дому", ""],
    ["    Кого на самом деле искать", ""],
    ["    Практические советы", ""],
    ["    Прогноз 2026 — 2028", ""],
    ["III. Работа и деньги", ""],
    ["    Профессиональная картина", ""],
    ["    Текущие транзиты по карьере", ""],
    ["    Что делать сейчас", ""],
    ["    Прогноз 2026 — 2028", ""],
    ["    В сумме", ""],
    ["IV. Транзиты по годам", ""],
    ["    Взгляд назад (2012 — 2025)", ""],
    ["    Настоящее: весна 2026", ""],
    ["    Прогноз 2026 помесячно", ""],
    ["    Прогноз 2027", ""],
    ["    Прогноз 2028", ""],
    ["    На горизонте 2029 — 2030", ""],
    ["    Коротко", ""],
]
toc = Table(toc_data, colWidths=[13.5*cm, 1.5*cm])
toc.setStyle(TableStyle([
    ("FONTNAME", (0,0), (-1,-1), "DejaVuSerif"),
    ("FONTSIZE", (0,0), (-1,-1), 10.5),
    ("TEXTCOLOR", (0,0), (-1,-1), INK),
    ("LEFTPADDING", (0,0), (-1,-1), 0),
    ("BOTTOMPADDING", (0,0), (-1,-1), 4),
]))
# выделим заглавия разделов
toc.setStyle(TableStyle([
    ("FONTNAME", (0,0), (-1,0), "DejaVuSerif-Bold"),
    ("FONTNAME", (0,10), (-1,10), "DejaVuSerif-Bold"),
    ("FONTNAME", (0,16), (-1,16), "DejaVuSerif-Bold"),
    ("FONTNAME", (0,22), (-1,22), "DejaVuSerif-Bold"),
    ("TEXTCOLOR", (0,0), (-1,0), NAVY),
    ("TEXTCOLOR", (0,10), (-1,10), NAVY),
    ("TEXTCOLOR", (0,16), (-1,16), NAVY),
    ("TEXTCOLOR", (0,22), (-1,22), NAVY),
    ("TOPPADDING", (0,10), (-1,10), 8),
    ("TOPPADDING", (0,16), (-1,16), 8),
    ("TOPPADDING", (0,22), (-1,22), 8),
]))
story.append(toc)
story.append(Spacer(1, 16))
story.append(PageBreak())


# --- Ключевые позиции ---
story += [
    Paragraph("КЛЮЧЕВЫЕ ПОЗИЦИИ", s_h1_eyebrow),
    Paragraph("Сводка по карте", s_h1),
    HRule(),
    Spacer(1, 10),
    Paragraph(
        "Перед разбором — краткая сводка, чтобы у вас под рукой были основные "
        "положения светил, планет и осей карты.",
        s_body,
    ),
    Spacer(1, 10),
    key_positions_table(),
    Spacer(1, 10),
    Paragraph(
        "R — ретроградное движение планеты. Номера домов приведены в римской "
        "нумерации. Построение сделано на дату: 15.03.1986, 22:25, Харьков.",
        s_caption,
    ),
    PageBreak(),
]


# --- Вступление ---
story += H1(INTRO_EYEBROW, INTRO_TITLE) + P(INTRO_P1) + P(INTRO_P2)
story.append(Spacer(1, 10))

# --- Раздел I: натальный разбор ---
story += [
    Spacer(1, 4),
    Paragraph("Р А З Д Е Л   I", s_h1_eyebrow),
    Paragraph("Разбор натальной карты", s_h1),
    HRule(),
    Spacer(1, 8),
]

story += H1(S1_EYEBROW, S1_TITLE) + P(S1_P1) + P(S1_P2) + P(S1_P3) + Q(S1_Q)
story += H1(S2_EYEBROW, S2_TITLE) + P(S2_P1) + P(S2_P2) + P(S2_P3)
story += H1(S3_EYEBROW, S3_TITLE) + P(S3_P1) + P(S3_P2) + P(S3_P3) + Q(S3_Q)
story += H1(S4_EYEBROW, S4_TITLE) + P(S4_P1) + P(S4_P2) + P(S4_P3) + P(S4_P4) + Q(S4_Q)
story += H1(S5_EYEBROW, S5_TITLE) + P(S5_P1) + P(S5_P2) + P(S5_P3)
story += H1(S6_EYEBROW, S6_TITLE) + P(S6_P1) + P(S6_P2) + P(S6_P3)
story += H1(S7_EYEBROW, S7_TITLE) + P(S7_P1) + P(S7_P2) + P(S7_P3)
story += H1(S8_EYEBROW, S8_TITLE) + P(S8_P1) + P(S8_P2) + P(S8_P3)
story += H1(S9_EYEBROW, S9_TITLE) + P(S9_P1) + P(S9_P2) + P(S9_P3) + P(S9_P4) + P(S9_P5)

# --- Раздел II: личная жизнь — без принудительного PageBreak ---
from reportlab.platypus import CondPageBreak
story += [
    Spacer(1, 20),
    CondPageBreak(8*cm),     # перейти на новую страницу, только если осталось меньше 8 см
    Paragraph("Р А З Д Е Л   II", s_h1_eyebrow),
    Paragraph("Личная жизнь", s_h1),
    HRule(),
    Spacer(1, 8),
]

story += H1(LOVE_EYEBROW, LOVE_TITLE) + P(LOVE_P1)
story += H2(LOVE_H2_1) + P(LOVE_P2) + P(LOVE_P3) + P(LOVE_P4) + Q(LOVE_Q1) + P(LOVE_P5) + P(LOVE_P6) + P(LOVE_P7)
story += H2(LOVE_H2_2) + P(LOVE_P8) + P(LOVE_P9) + P(LOVE_P10) + P(LOVE_P11) + P(LOVE_P12)
story += P(LOVE_P12B) + P(LOVE_P12C) + P(LOVE_P12D) + Q(LOVE_Q2)
story += H2(LOVE_H2_3) + P(LOVE_P13) + P(LOVE_P14) + P(LOVE_P15)
story += H2(LOVE_H2_4) + P(LOVE_P16) + P(LOVE_P17) + P(LOVE_P18) + P(LOVE_P19) + P(LOVE_P20)
story += P(LOVE_P20B) + P(LOVE_P20C)
story += H2(LOVE_H2_5) + P(LOVE_P21) + P(LOVE_P22) + P(LOVE_P23) + P(LOVE_P24) + P(LOVE_P25)

# --- Раздел III: работа — без принудительного PageBreak ---
story += [
    Spacer(1, 20),
    CondPageBreak(8*cm),
    Paragraph("Р А З Д Е Л   III", s_h1_eyebrow),
    Paragraph("Работа и деньги", s_h1),
    HRule(),
    Spacer(1, 8),
]

story += H1(WORK_EYEBROW, WORK_TITLE) + P(WORK_P1)
story += H2(WORK_H2_1) + P(WORK_P2) + P(WORK_P3) + P(WORK_P4) + P(WORK_P5)
story += H2(WORK_H2_2) + P(WORK_P6) + P(WORK_P7) + P(WORK_P8) + P(WORK_P9) + P(WORK_P10) + Q(WORK_Q1)
story += H2(WORK_H2_3) + P(WORK_P11) + P(WORK_P12) + P(WORK_P13)
story += H2(WORK_H2_4) + P(WORK_P14) + P(WORK_P15) + P(WORK_P16) + P(WORK_P17) + P(WORK_P18) + Q(WORK_Q2)

# --- Итог (идёт потоком, без принудительного перехода на новую страницу) ---
story.append(Spacer(1, 10))
story += H1(FINAL_EYEBROW, FINAL_TITLE)
story += P(FINAL_P1) + P(FINAL_P2) + P(FINAL_P3) + P(FINAL_P4)

# ==================== РАЗДЕЛ IV — Транзиты по годам ====================
story += [
    Spacer(1, 24),
    CondPageBreak(10*cm),
    Paragraph("Р А З Д Е Л   IV", s_h1_eyebrow),
    Paragraph("Транзиты по годам", s_h1),
    HRule(),
    Spacer(1, 8),
]
story += H1(TL_EYEBROW, TL_TITLE) + P(TL_INTRO_1) + P(TL_INTRO_2)

# Прошлое
story += H2(TL_H2_PAST)
story += H2(TL_PAST_1_H) + P(TL_PAST_1)
story += H2(TL_PAST_2_H) + P(TL_PAST_2)
story += H2(TL_PAST_3_H) + P(TL_PAST_3) + P(TL_PAST_3B)
story += H2(TL_PAST_4_H) + P(TL_PAST_4)
story += H2(TL_PAST_5_H) + P(TL_PAST_5)
story += H2(TL_PAST_6_H) + P(TL_PAST_6)
story += H2(TL_PAST_7_H) + P(TL_PAST_7) + P(TL_PAST_7B) + P(TL_PAST_7C)
story += H2(TL_PAST_8_H) + P(TL_PAST_8)
story += H2(TL_PAST_9_H) + P(TL_PAST_9)

# Настоящее
story += H2(TL_H2_NOW) + P(TL_NOW_1)
story += H2(TL_NOW_2_H) + P(TL_NOW_2) + P(TL_NOW_2B)
story += H2(TL_NOW_3_H) + P(TL_NOW_3)
story += H2(TL_NOW_4_H) + P(TL_NOW_4) + P(TL_NOW_4B)

# 2026
story += H2(TL_H2_2026)
story += H2(TL_2026_1_H) + P(TL_2026_1)
story += H2(TL_2026_2_H) + P(TL_2026_2) + P(TL_2026_2B) + P(TL_2026_2C)
story += H2(TL_2026_3_H) + P(TL_2026_3)
story += H2(TL_2026_4_H) + P(TL_2026_4) + P(TL_2026_4B) + P(TL_2026_4C) + P(TL_2026_4D)

# 2027
story += H2(TL_H2_2027)
story += H2(TL_2027_1_H) + P(TL_2027_1)
story += H2(TL_2027_2_H) + P(TL_2027_2)
story += H2(TL_2027_3_H) + P(TL_2027_3) + P(TL_2027_3B)
story += H2(TL_2027_4_H) + P(TL_2027_4)

# 2028
story += H2(TL_H2_2028)
story += H2(TL_2028_1_H) + P(TL_2028_1)
story += H2(TL_2028_2_H) + P(TL_2028_2)
story += H2(TL_2028_3_H) + P(TL_2028_3)

# Дальний горизонт
story += H2(TL_H2_LONG) + P(TL_LONG_1) + P(TL_LONG_2) + P(TL_LONG_3) + P(TL_LONG_4)

# Короткое резюме по транзитам
story += H2(TL_H2_SUMMARY) + P(TL_SUMMARY_1) + Q(TL_Q)

# --- Главное из натальной части (итог по карте) ---
story += H1(S10_EYEBROW, S10_TITLE) + P(S10_P1) + P(S10_P2) + P(S10_P3) + Q(S10_Q)

# --- Постскриптум ---
story += H1(PS_EYEBROW, PS_TITLE) + P(PS_P1) + P(PS_P2) + P(PS_P3) + P(PS_P4) + P(PS_P5)

# --- финальный декоративный элемент ---
story.append(Spacer(1, 18))
story.append(HRule())
story.append(Spacer(1, 8))
story.append(Paragraph("✦  на этом разбор завершён  ✦", s_small))
story.append(Spacer(1, 6))
story.append(Paragraph(
    "Разбор подготовлен индивидуально по данным рождения 15.03.1986, 22:25, Харьков. "
    "Содержит натальный анализ и прогноз на 2026 — 2028 годы.",
    s_small,
))


# ---------- Билдим ----------
doc.build(story)
print(f"OK — {OUTPUT}")
print("Pages:", doc.page)
