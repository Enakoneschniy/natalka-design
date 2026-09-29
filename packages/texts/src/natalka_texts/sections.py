"""What each section of a reading must contain.

The ids match `natalka_document.build.NATAL_SECTIONS`, so the text pipeline and the PDF skeleton
cannot drift apart. Titles are per language; the brief is what the model is told to write.
"""

from __future__ import annotations

from dataclasses import dataclass, field


@dataclass(frozen=True, slots=True)
class SectionSpec:
    id: str
    brief: str
    paragraphs: tuple[int, int]
    must_cover: tuple[str, ...] = ()
    #: Needs an exact birth time (houses, Ascendant, MC).
    needs_time: bool = False
    #: Rendered as a pull quote after the prose.
    quote: bool = False
    titles: dict[str, str] = field(default_factory=dict)


def _t(uk: str, ru: str, en: str) -> dict[str, str]:
    return {"uk": uk, "ru": ru, "en": en}


NATAL: tuple[SectionSpec, ...] = (
    SectionSpec(
        id="intro",
        brief=(
            "An opening that addresses the person by name and says what this document is and how "
            "to read it. State plainly that everything here comes from the chart and nothing else."
        ),
        paragraphs=(2, 3),
        titles=_t("Про цей розбір", "Об этом разборе", "About this reading"),
    ),
    SectionSpec(
        id="natal.overview",
        brief=(
            "The shape of the chart as a whole: which element and modality dominate, what is "
            "missing, the strongest concentration, the loudest configuration. Build a hierarchy — "
            "what is strongest, what supports it, what stands opposite — instead of listing "
            "planets one by one."
        ),
        paragraphs=(4, 6),
        must_cover=(
            "element and modality balance with the actual counts",
            "any stellium or major configuration",
            "angular planets, if any",
        ),
        titles=_t("Загальний малюнок карти", "Общий рисунок карты", "The shape of the chart"),
    ),
    SectionSpec(
        id="natal.ascendant",
        brief=(
            "The Ascendant: how this person comes across in the first ten minutes, and how that "
            "differs from what is going on inside. Mention the ruler of the Ascendant and where "
            "it sits."
        ),
        paragraphs=(3, 4),
        needs_time=True,
        quote=True,
        titles=_t("Асцендент", "Асцендент", "The Ascendant"),
    ),
    SectionSpec(
        id="natal.sun",
        brief=(
            "The Sun by sign, house and aspects: what this person is actually for, where they "
            "spend themselves, what makes them feel alive rather than merely competent."
        ),
        paragraphs=(3, 4),
        quote=True,
        titles=_t("Сонце", "Солнце", "The Sun"),
    ),
    SectionSpec(
        id="natal.moon",
        brief=(
            "The Moon: the emotional mechanism. What this person needs to feel safe, how they "
            "react before they think, what soothes and what wears them down."
        ),
        paragraphs=(3, 4),
        quote=True,
        titles=_t("Місяць", "Луна", "The Moon"),
    ),
    SectionSpec(
        id="natal.mercury_venus_mars",
        brief=(
            "Mercury, Venus and Mars together: how this person thinks and speaks, what they are "
            "drawn to, and how they act when they want something. Treat them as one working "
            "mechanism, not three separate entries."
        ),
        paragraphs=(4, 5),
        titles=_t("Меркурій, Венера, Марс", "Меркурий, Венера, Марс", "Mercury, Venus and Mars"),
    ),
    SectionSpec(
        id="natal.social",
        brief=(
            "Jupiter and Saturn: where this person expands easily and where life asks for "
            "discipline and time. Name the Saturn return years if they are relevant to the age."
        ),
        paragraphs=(3, 4),
        titles=_t("Юпітер і Сатурн", "Юпитер и Сатурн", "Jupiter and Saturn"),
    ),
    SectionSpec(
        id="natal.outer",
        brief=(
            "Uranus, Neptune, Pluto, Chiron, Lilith and the lunar nodes: the generational layer "
            "and the personal wound. Focus on the ones that aspect personal planets or angles — "
            "the rest belong to a whole generation and say little about this person."
        ),
        paragraphs=(3, 5),
        must_cover=("the node axis as old pattern versus new direction",),
        titles=_t("Зовнішні планети й вузли", "Внешние планеты и узлы", "Outer planets and nodes"),
    ),
    SectionSpec(
        id="natal.mc_career",
        brief=(
            "The Midheaven and its ruler: the shape of a public life, how this person wants to be "
            "seen, what kind of work fits the chart rather than the fashion of the moment."
        ),
        paragraphs=(3, 4),
        needs_time=True,
        titles=_t("MC і покликання", "MC и призвание", "Midheaven and vocation"),
    ),
    SectionSpec(
        id="natal.key_aspects",
        brief=(
            "The four or five tightest aspects in the chart, in order. For each: what it gives "
            "and what it costs. Use the exact orbs from the fact sheet."
        ),
        paragraphs=(4, 6),
        titles=_t("Ключові аспекти", "Ключевые аспекты", "The key aspects"),
    ),
    SectionSpec(
        id="love",
        brief=(
            "A short opening for the relationships part: what the chart says this area is like "
            "for this person in general, before the detail."
        ),
        paragraphs=(2, 3),
        titles=_t("Стосунки", "Отношения", "Relationships"),
    ),
    SectionSpec(
        id="love.seventh_house",
        brief=(
            "The seventh house, its ruler and any planets in it: what this person looks for in a "
            "partnership and what they tend to hand over to a partner."
        ),
        paragraphs=(3, 4),
        needs_time=True,
        titles=_t("Сьомий дім", "Седьмой дом", "The seventh house"),
    ),
    SectionSpec(
        id="love.venus_moon",
        brief=(
            "Venus and the Moon in the context of love: what attracts, what is needed for "
            "emotional peace, and where the two disagree with each other."
        ),
        paragraphs=(3, 4),
        titles=_t("Венера і Місяць", "Венера и Луна", "Venus and the Moon"),
    ),
    SectionSpec(
        id="love.partner",
        brief=(
            "The kind of partner the chart points to — by qualities and dynamics, never by "
            "appearance, nationality or sign alone. Say what makes a relationship work for this "
            "person and what reliably breaks it."
        ),
        paragraphs=(3, 4),
        titles=_t("Який партнер підходить", "Какой партнёр подходит", "The partner that fits"),
    ),
    SectionSpec(
        id="love.advice",
        brief=(
            "Five or six concrete pieces of advice for relationships, each tied to a specific "
            "placement. Write them as a list, one sentence or two each, no filler."
        ),
        paragraphs=(1, 2),
        titles=_t("Що з цим робити", "Что с этим делать", "What to do with it"),
    ),
    SectionSpec(
        id="work",
        brief="A short opening for the work and money part: the overall picture from the chart.",
        paragraphs=(2, 3),
        titles=_t("Робота і гроші", "Работа и деньги", "Work and money"),
    ),
    SectionSpec(
        id="work.picture",
        brief=(
            "The tenth, sixth and second houses together with Mars: how this person works, what "
            "kind of rhythm suits them, and what kind of environment quietly drains them."
        ),
        paragraphs=(3, 4),
        titles=_t("Як ви працюєте", "Как вы работаете", "How you work"),
    ),
    SectionSpec(
        id="work.money",
        brief=(
            "Money: the second house, its ruler and the eighth house if it is occupied. Attitude "
            "to earning, to spending, to shared money and debt."
        ),
        paragraphs=(3, 4),
        titles=_t("Гроші", "Деньги", "Money"),
    ),
    SectionSpec(
        id="work.now",
        brief=(
            "What the current transits say about the professional area specifically. Use only the "
            "transit dates from the fact sheet."
        ),
        paragraphs=(2, 3),
        titles=_t("Що зараз", "Что сейчас", "Where it stands now"),
    ),
    SectionSpec(
        id="transits",
        brief=(
            "An opening for the forecast part: explain in two paragraphs what a transit is and "
            "how to use dates without treating them as verdicts."
        ),
        paragraphs=(2, 3),
        titles=_t("Транзити", "Транзиты", "Transits"),
    ),
    SectionSpec(
        id="transits.past",
        brief=(
            "Looking back: the major transits of the last ten to fourteen years, each as 'the sky "
            "was passing through X, and for a chart like this that period usually brings Y — if "
            "you remember those years as a turning point, this was it'. Never state what happened."
        ),
        paragraphs=(4, 6),
        titles=_t("Погляд назад", "Взгляд назад", "Looking back"),
    ),
    SectionSpec(
        id="transits.now",
        brief=(
            "The transits in force right now, with their exact dates, and how such a combination "
            "is usually experienced from the inside."
        ),
        paragraphs=(3, 4),
        titles=_t("Що відбувається зараз", "Что происходит сейчас", "What is happening now"),
    ),
    SectionSpec(
        id="transits.year1",
        brief="The coming twelve months, month by month where there are exact dates.",
        paragraphs=(4, 6),
        titles=_t("Найближчий рік", "Ближайший год", "The year ahead"),
    ),
    SectionSpec(
        id="transits.year2",
        brief="The year after that: the larger movements, ingresses and slow aspects.",
        paragraphs=(3, 4),
        titles=_t("Наступний рік", "Следующий год", "The year after"),
    ),
    SectionSpec(
        id="transits.year3",
        brief="The third year: only the big, slow transits and what they open up.",
        paragraphs=(2, 3),
        titles=_t("Третій рік", "Третий год", "The third year"),
    ),
    SectionSpec(
        id="summary",
        brief=(
            "The reading in one page: the three or four things that matter most in this chart, "
            "stated plainly, with no new material."
        ),
        paragraphs=(3, 4),
        quote=True,
        titles=_t("Головне", "Главное", "The essentials"),
    ),
    SectionSpec(
        id="ps",
        brief=(
            "A short closing note in a quieter voice: what a chart can and cannot tell, and that "
            "none of it is a verdict."
        ),
        paragraphs=(1, 2),
        titles=_t("Наостанок", "Напоследок", "One last thing"),
    ),
)

BY_PRODUCT: dict[str, tuple[SectionSpec, ...]] = {"natal": NATAL}


def specs(product: str, *, unknown_time: bool) -> tuple[SectionSpec, ...]:
    """The sections to write, with the ones that need houses dropped when there is no birth time."""
    chosen = BY_PRODUCT[product]
    if unknown_time:
        return tuple(s for s in chosen if not s.needs_time)
    return chosen


def title(spec: SectionSpec, lang: str) -> str:
    return spec.titles.get(lang) or spec.titles.get("en") or spec.id
