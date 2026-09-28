#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
astro_main_template.py — СКЕЛЕТ главного файла сборки.

Под каждого клиента Claude:
  1) Копирует этот файл в рабочую папку (например, outputs/).
  2) Заполняет CLIENT_DATA и KEY_POSITIONS_ROWS данными этого клиента.
  3) Отдельно пишет файлы content_natal.py, content_love.py,
     content_work.py, content_timeline.py с текстовыми переменными
     разделов (по образцу предыдущего разбора).
  4) Запускает: python3 astro_main_template.py  →  получает PDF.
"""

import os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from reportlab.lib.pagesizes import A4
from reportlab.lib.units import cm
from reportlab.platypus import (
    BaseDocTemplate, PageTemplate, Frame,
    Paragraph, Spacer, PageBreak, Table, TableStyle, CondPageBreak,
)
from reportlab.platypus.doctemplate import NextPageTemplate

from astro_build_pdf import (
    set_client,
    s_h1, s_h2, s_body, s_h1_eyebrow, s_caption, s_small, s_quote,
    HRule, QuoteBox, Starfield,
    _page_frame, _cover_page,
    key_positions_table,
    NAVY, GOLD, ROSE, CREAM, LINE, INK, MUTED,
)

# Импорты текстовых модулей — Claude создаёт их под каждого клиента.
# from content_natal    import *   # Раздел I
# from content_love     import *   # Раздел II
# from content_work     import *   # Раздел III
# from content_timeline import *   # Раздел IV + итог


# ═══════════════════════════════════════════════════════════════════
#  ДАННЫЕ КЛИЕНТА — Claude заполняет перед генерацией
# ═══════════════════════════════════════════════════════════════════

CLIENT_DATA = {
    "date_str":    "15 марта 1986",                                   # «человекочитаемая» дата
    "time_str":    "22:25",
    "place_str":   "Харьков",
    "header_line": "Натальная карта  ·  15.03.1986  ·  Харьков  ·  22:25",
    "gender":      "F",   # "M" или "F" — для согласования рода в тексте (используется контентом)
    "file_date":   "15.03.1986",  # для имени файла
}

# Ключевые позиции — с картинки натальной карты.
# Для ☉ ☽ ☿ ♀ ♂ ♃ ♄ ♅ ♆ ♇ ☊ ⚷ используй DejaVuSans — он их рендерит.
KEY_POSITIONS_ROWS = [
    ["Солнце ☉",           "Рыбы",        "24°55'",        "V"],
    ["Луна ☽",             "Телец",       "23°36'",        "VII"],
    ["Меркурий ☿ (R)",     "Рыбы",        "26°50'",        "V"],
    ["Венера ♀",           "Овен",        "08°17'",        "VI"],
    ["Марс ♂",             "Дева",        "23°33'",        "XI"],
    ["Юпитер ♃",           "Рыбы",        "05°30'",        "IV"],
    ["Сатурн ♄",           "Стрелец",     "09°41'",        "II"],
    ["Уран ♅",             "Стрелец",     "22°18'",        "II"],
    ["Нептун ♆",           "Козерог",     "05°39'",        "III"],
    ["Плутон ♇ (R)",       "Скорпион",    "07°01'",        "I"],
    ["Сев. узел ☊",        "Телец",       "00°23'",        "VII"],
    ["Асцендент",          "Скорпион",    "06°11'",        "—"],
    ["МС",                 "Лев",         "18°09'",        "X"],
]


# ═══════════════════════════════════════════════════════════════════
#  ВЫХОДНОЙ ПУТЬ (работает и в Mac, и в sandbox-Linux)
# ═══════════════════════════════════════════════════════════════════

_MAC_DIR   = "/Users/eugenenakoneschniy/Downloads"
_LIN_DIR   = "/sessions/confident-clever-euler/mnt/Downloads"
_OUT_DIR   = _LIN_DIR if os.path.isdir(_LIN_DIR) else _MAC_DIR
OUTPUT     = f"{_OUT_DIR}/Натальная_карта_{CLIENT_DATA['file_date']}.pdf"

# Передаём данные в модуль оформления
set_client(CLIENT_DATA)


# ═══════════════════════════════════════════════════════════════════
#  СБОРКА ДОКУМЕНТА
# ═══════════════════════════════════════════════════════════════════

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
    PageTemplate(id="Cover",   frames=[frame_cover],   onPage=_cover_page),
    PageTemplate(id="Content", frames=[frame_content], onPage=_page_frame),
])


# ═══════════════════════════════════════════════════════════════════
#  ХЭЛПЕРЫ СБОРКИ КОНТЕНТА
# ═══════════════════════════════════════════════════════════════════

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


# ═══════════════════════════════════════════════════════════════════
#  STORY
# ═══════════════════════════════════════════════════════════════════

story = []

# ----- Обложка -> Контент -----
story.append(NextPageTemplate("Content"))
story.append(Spacer(1, 1))
story.append(PageBreak())

# ----- Оглавление -----
story += [
    Paragraph("содержание".upper(), s_h1_eyebrow),
    Paragraph("Структура разбора", s_h1),
    HRule(),
    Spacer(1, 10),
]

toc_data = [
    ["I.  Разбор натальной карты", ""],
    ["    Общее впечатление", ""],
    ["    Асцендент", ""],
    ["    Главный стеллиум", ""],
    ["    Луна, Северный узел — путь роста", ""],
    ["    Венера и Марс", ""],
    ["    Сатурн и структура", ""],
    ["    Нептун, Хирон, Лилит", ""],
    ["    МС и реализация", ""],
    ["    Ключевые аспекты", ""],
    ["II. Личная жизнь", ""],
    ["    Устройство 7 дома", ""],
    ["    Текущие транзиты", ""],
    ["    Кого искать", ""],
    ["    Практические советы", ""],
    ["    Прогноз на 2–3 года", ""],
    ["III. Работа и деньги", ""],
    ["    Профессиональная картина", ""],
    ["    Текущие транзиты", ""],
    ["    Что делать сейчас", ""],
    ["    Прогноз на 2–3 года", ""],
    ["    В сумме", ""],
    ["IV. Транзиты по годам", ""],
    ["    Взгляд назад", ""],
    ["    Настоящее", ""],
    ["    Прогноз помесячно", ""],
    ["    Следующий год", ""],
    ["    Год через год", ""],
    ["    Коротко", ""],
]
toc = Table(toc_data, colWidths=[13.5*cm, 1.5*cm])
toc.setStyle(TableStyle([
    ("FONTNAME",   (0,0),  (-1,-1), "DejaVuSerif"),
    ("FONTSIZE",   (0,0),  (-1,-1), 10.5),
    ("TEXTCOLOR",  (0,0),  (-1,-1), INK),
    ("LEFTPADDING",(0,0),  (-1,-1), 0),
    ("BOTTOMPADDING",(0,0),(-1,-1), 4),
    # заголовки разделов — жирным тёмно-синим
    ("FONTNAME",  (0, 0), (-1, 0), "DejaVuSerif-Bold"),
    ("FONTNAME",  (0,10), (-1,10), "DejaVuSerif-Bold"),
    ("FONTNAME",  (0,16), (-1,16), "DejaVuSerif-Bold"),
    ("FONTNAME",  (0,22), (-1,22), "DejaVuSerif-Bold"),
    ("TEXTCOLOR", (0, 0), (-1, 0), NAVY),
    ("TEXTCOLOR", (0,10), (-1,10), NAVY),
    ("TEXTCOLOR", (0,16), (-1,16), NAVY),
    ("TEXTCOLOR", (0,22), (-1,22), NAVY),
    ("TOPPADDING",(0,10), (-1,10), 8),
    ("TOPPADDING",(0,16), (-1,16), 8),
    ("TOPPADDING",(0,22), (-1,22), 8),
]))
story.append(toc)
story.append(PageBreak())


# ----- Ключевые позиции -----
story += [
    Paragraph("КЛЮЧЕВЫЕ ПОЗИЦИИ", s_h1_eyebrow),
    Paragraph("Сводка по карте", s_h1),
    HRule(),
    Spacer(1, 10),
    Paragraph(
        "Перед разбором — краткая сводка, чтобы были под рукой основные "
        "положения планет и осей карты.",
        s_body,
    ),
    Spacer(1, 10),
    key_positions_table(KEY_POSITIONS_ROWS),
    Spacer(1, 10),
    Paragraph(
        "R — ретроградное движение. Номера домов в римской нумерации. "
        f"Построение: {CLIENT_DATA['date_str']}, {CLIENT_DATA['time_str']}, "
        f"{CLIENT_DATA['place_str']}.",
        s_caption,
    ),
    PageBreak(),
]


# ═══════════════════════════════════════════════════════════════════
#  ДАЛЕЕ Claude ДОБАВЛЯЕТ КОНТЕНТ ВСЕХ РАЗДЕЛОВ.
#  Образец вызова — см. main.py прошлого разбора.
#
#  Ниже — подсказка порядка.
# ═══════════════════════════════════════════════════════════════════

# --- Вступление ---
# story += H1(INTRO_EYEBROW, INTRO_TITLE) + P(INTRO_P1) + P(INTRO_P2)

# --- Раздел I: натальный разбор ---
# story += [
#     Spacer(1, 4),
#     Paragraph("Р А З Д Е Л   I", s_h1_eyebrow),
#     Paragraph("Разбор натальной карты", s_h1),
#     HRule(), Spacer(1, 8),
# ]
# story += H1(S1_EYEBROW, S1_TITLE) + P(S1_P1) + ... + Q(S1_Q)
# ... остальные 8 подразделов

# --- Раздел II: личная жизнь ---
# story += [
#     Spacer(1, 20), CondPageBreak(8*cm),
#     Paragraph("Р А З Д Е Л   II", s_h1_eyebrow),
#     Paragraph("Личная жизнь", s_h1),
#     HRule(), Spacer(1, 8),
# ]
# ... подразделы ...

# --- Раздел III: работа и деньги ---
# story += [
#     Spacer(1, 20), CondPageBreak(8*cm),
#     Paragraph("Р А З Д Е Л   III", s_h1_eyebrow),
#     Paragraph("Работа и деньги", s_h1),
#     HRule(), Spacer(1, 8),
# ]
# ... подразделы ...

# --- Итог по транзитам ---
# story += H1(FINAL_EYEBROW, FINAL_TITLE) + P(FINAL_P1) + ...

# --- Раздел IV: транзиты по годам ---
# story += [
#     Spacer(1, 24), CondPageBreak(10*cm),
#     Paragraph("Р А З Д Е Л   IV", s_h1_eyebrow),
#     Paragraph("Транзиты по годам", s_h1),
#     HRule(), Spacer(1, 8),
# ]
# ... подразделы с конкретными датами ...

# --- Главное по карте ---
# story += H1(S10_EYEBROW, S10_TITLE) + P(S10_P1) + ... + Q(S10_Q)

# --- Постскриптум ---
# story += H1(PS_EYEBROW, PS_TITLE) + P(PS_P1) + ...

# --- Финальный декор ---
# story.append(Spacer(1, 18))
# story.append(HRule())
# story.append(Spacer(1, 8))
# story.append(Paragraph("✦  на этом разбор завершён  ✦", s_small))


# ═══════════════════════════════════════════════════════════════════
#  Собираем PDF
# ═══════════════════════════════════════════════════════════════════

doc.build(story)
print(f"OK — {OUTPUT}")
print("Pages:", doc.page)
