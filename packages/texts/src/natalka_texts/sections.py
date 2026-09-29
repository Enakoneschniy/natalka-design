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
    #: Needs the transit list. It is the longest part of the fact sheet, so the sections that do
    #: not forecast anything are not charged for carrying it.
    needs_transits: bool = False
    #: Rendered as a pull quote after the prose.
    quote: bool = False
    #: An opening or a closing line may talk about the reading rather than to the reader; the
    #: chapters about the person may not, and the editor enforces that only where it applies.
    impersonal_ok: bool = False
    titles: dict[str, str] = field(default_factory=dict)


def _t(uk: str, ru: str, en: str) -> dict[str, str]:
    return {"uk": uk, "ru": ru, "en": en}


NATAL: tuple[SectionSpec, ...] = (
    SectionSpec(
        id="intro",
        impersonal_ok=True,
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
        impersonal_ok=True,
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
        impersonal_ok=True,
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
        # forecast section: needs the transit dates
        brief=(
            "What the current transits say about the professional area specifically. Use only the "
            "transit dates from the fact sheet."
        ),
        paragraphs=(2, 3),
        needs_transits=True,
        titles=_t("Що зараз", "Что сейчас", "Where it stands now"),
    ),
    SectionSpec(
        id="transits",
        # forecast section: needs the transit dates
        brief=(
            "An opening for the forecast part: explain in two paragraphs what a transit is and "
            "how to use dates without treating them as verdicts."
        ),
        paragraphs=(2, 3),
        needs_transits=True,
        titles=_t("Транзити", "Транзиты", "Transits"),
    ),
    SectionSpec(
        id="transits.past",
        # forecast section: needs the transit dates
        brief=(
            "Looking back: the major transits of the last ten to fourteen years, each as 'the sky "
            "was passing through X, and for a chart like this that period usually brings Y — if "
            "you remember those years as a turning point, this was it'. Never state what happened."
        ),
        paragraphs=(4, 6),
        needs_transits=True,
        titles=_t("Погляд назад", "Взгляд назад", "Looking back"),
    ),
    SectionSpec(
        id="transits.now",
        # forecast section: needs the transit dates
        brief=(
            "The transits in force right now, with their exact dates, and how such a combination "
            "is usually experienced from the inside."
        ),
        paragraphs=(3, 4),
        needs_transits=True,
        titles=_t("Що відбувається зараз", "Что происходит сейчас", "What is happening now"),
    ),
    SectionSpec(
        id="transits.year1",
        # forecast section: needs the transit dates
        brief="The coming twelve months, month by month where there are exact dates.",
        paragraphs=(4, 6),
        needs_transits=True,
        titles=_t("Найближчий рік", "Ближайший год", "The year ahead"),
    ),
    SectionSpec(
        id="transits.year2",
        # forecast section: needs the transit dates
        brief="The year after that: the larger movements, ingresses and slow aspects.",
        paragraphs=(3, 4),
        needs_transits=True,
        titles=_t("Наступний рік", "Следующий год", "The year after"),
    ),
    SectionSpec(
        id="transits.year3",
        # forecast section: needs the transit dates
        brief="The third year: only the big, slow transits and what they open up.",
        paragraphs=(2, 3),
        needs_transits=True,
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
        impersonal_ok=True,
        brief=(
            "A short closing note in a quieter voice: what a chart can and cannot tell, and that "
            "none of it is a verdict."
        ),
        paragraphs=(1, 2),
        titles=_t("Наостанок", "Напоследок", "One last thing"),
    ),
)

BY_PRODUCT: dict[str, tuple[SectionSpec, ...]] = {}


def specs(product: str, *, unknown_time: bool) -> tuple[SectionSpec, ...]:
    """The sections to write, with the ones that need houses dropped when there is no birth time."""
    chosen = BY_PRODUCT[product]
    if unknown_time:
        return tuple(s for s in chosen if not s.needs_time)
    return chosen


def title(spec: SectionSpec, lang: str) -> str:
    return spec.titles.get(lang) or spec.titles.get("en") or spec.id


FORECAST: tuple[SectionSpec, ...] = (
    SectionSpec(
        id="intro",
        impersonal_ok=True,
        brief=(
            "An opening: what a forecast from transits is and how to use dates without treating "
            "them as verdicts. Say plainly that a transit describes a weather front, not an event."
        ),
        paragraphs=(2, 3),
        needs_transits=True,
        titles=_t("Про цей прогноз", "Об этом прогнозе", "About this forecast"),
    ),
    SectionSpec(
        id="forecast.ground",
        brief=(
            "The natal ground the year lands on: the two or three placements that decide how this "
            "person meets any transit at all. Short — the chart itself is not the subject here."
        ),
        paragraphs=(3, 4),
        titles=_t("Ґрунт вашої карти", "Почва вашей карты", "The ground of your chart"),
    ),
    SectionSpec(
        id="forecast.year",
        brief=(
            "The year in one piece: which transits define it, when it is dense and when it is "
            "quiet. Name the exact dates from the fact sheet."
        ),
        paragraphs=(3, 5),
        needs_transits=True,
        quote=True,
        titles=_t("Рік загалом", "Год целиком", "The year as a whole"),
    ),
    SectionSpec(
        id="forecast.q1",
        brief="The first three months, with the exact dates that fall in them.",
        paragraphs=(3, 4),
        needs_transits=True,
        titles=_t("Перші три місяці", "Первые три месяца", "The first three months"),
    ),
    SectionSpec(
        id="forecast.q2",
        brief="Months four to six.",
        paragraphs=(3, 4),
        needs_transits=True,
        titles=_t("Другий квартал", "Второй квартал", "The second quarter"),
    ),
    SectionSpec(
        id="forecast.q3",
        brief="Months seven to nine.",
        paragraphs=(3, 4),
        needs_transits=True,
        titles=_t("Третій квартал", "Третий квартал", "The third quarter"),
    ),
    SectionSpec(
        id="forecast.q4",
        brief="Months ten to twelve, and what is left open at the end of the year.",
        paragraphs=(3, 4),
        needs_transits=True,
        titles=_t("Четвертий квартал", "Четвёртый квартал", "The fourth quarter"),
    ),
    SectionSpec(
        id="forecast.slow",
        brief=(
            "The slow transits that outlast this year — Pluto, Neptune, Uranus, Saturn — and what "
            "they are quietly rearranging underneath the months."
        ),
        paragraphs=(3, 4),
        needs_transits=True,
        titles=_t("Повільні транзити", "Медленные транзиты", "The slow transits"),
    ),
    SectionSpec(
        id="forecast.work",
        brief="What the year asks of the professional side, with dates.",
        paragraphs=(3, 4),
        needs_transits=True,
        titles=_t("Робота і гроші цього року", "Работа и деньги в этом году", "Work and money"),
    ),
    SectionSpec(
        id="forecast.love",
        brief="What the year does to relationships, with dates.",
        paragraphs=(3, 4),
        needs_transits=True,
        titles=_t("Стосунки цього року", "Отношения в этом году", "Relationships this year"),
    ),
    SectionSpec(
        id="forecast.advice",
        brief=(
            "Six pieces of advice for this specific year, each tied to a transit and a date. "
            "Practical, no platitudes."
        ),
        paragraphs=(1, 2),
        needs_transits=True,
        titles=_t("Що робити", "Что делать", "What to do"),
    ),
    SectionSpec(
        id="ps",
        impersonal_ok=True,
        brief=(
            "A short closing note: a forecast describes pressure and opportunity, not fate, and "
            "the same transit is lived differently depending on what the person does with it."
        ),
        paragraphs=(1, 2),
        titles=_t("Наостанок", "Напоследок", "One last thing"),
    ),
)

CHILD: tuple[SectionSpec, ...] = (
    SectionSpec(
        id="intro",
        impersonal_ok=True,
        brief=(
            "An opening addressed to the parent: what this document is, and the warning that a "
            "chart describes a temperament, never a diagnosis or a destiny."
        ),
        paragraphs=(2, 3),
        titles=_t("Про цей розбір", "Об этом разборе", "About this reading"),
    ),
    SectionSpec(
        id="child.overview",
        brief=(
            "The shape of the chart: element and modality balance with the counts, the strongest "
            "concentration, what is missing. Phrased as a temperament, not as a verdict."
        ),
        paragraphs=(3, 5),
        must_cover=("element and modality balance with the actual counts",),
        titles=_t("Загальний малюнок", "Общий рисунок", "The shape of the chart"),
    ),
    SectionSpec(
        id="child.temper",
        brief=(
            "Sun and Moon as temperament: what this child is like from the inside, what comes "
            "easily, what costs effort."
        ),
        paragraphs=(3, 4),
        quote=True,
        titles=_t("Характер", "Характер", "Temperament"),
    ),
    SectionSpec(
        id="child.needs",
        brief=(
            "The Moon and the fourth house: what this child needs to feel safe, and what a "
            "parent can do to provide it without smothering."
        ),
        paragraphs=(3, 4),
        titles=_t(
            "Що дає відчуття безпеки", "Что даёт чувство безопасности", "What makes them feel safe"
        ),
    ),
    SectionSpec(
        id="child.learning",
        brief=(
            "Mercury and the third house: how this child takes in information, which kind of "
            "teaching works and which one makes them shut down."
        ),
        paragraphs=(3, 4),
        titles=_t("Як вчиться", "Как учится", "How they learn"),
    ),
    SectionSpec(
        id="child.rest",
        brief=(
            "Venus, Jupiter and the fifth house: what restores this child, what play looks like "
            "for them, what to protect in the timetable."
        ),
        paragraphs=(2, 4),
        titles=_t("Як відпочиває", "Как отдыхает", "How they rest"),
    ),
    SectionSpec(
        id="child.hurts",
        brief=(
            "Saturn, Chiron and the tense aspects: what wounds this child more than it would "
            "another, and how an adult usually causes it without meaning to."
        ),
        paragraphs=(3, 4),
        quote=True,
        titles=_t("Що ранить", "Что ранит", "What hurts"),
    ),
    SectionSpec(
        id="child.language",
        brief=(
            "The Ascendant and its ruler: how this child is read by strangers, and the gap "
            "between that and who they are at home."
        ),
        paragraphs=(3, 4),
        needs_time=True,
        titles=_t("Якою її бачать", "Какой её видят", "How they come across"),
    ),
    SectionSpec(
        id="child.parent",
        brief=(
            "Practical advice for the parent: six things that work with this chart and two that "
            "reliably backfire. Concrete, tied to placements."
        ),
        paragraphs=(1, 2),
        titles=_t("Мова, якою її чути", "Язык, на котором её слышно", "The language they hear"),
    ),
    SectionSpec(
        id="child.years",
        brief=(
            "The years ahead: the transits due while the child is still a child, described as "
            "phases a parent can prepare for rather than as events."
        ),
        paragraphs=(3, 4),
        needs_transits=True,
        titles=_t("Найближчі роки", "Ближайшие годы", "The years ahead"),
    ),
    SectionSpec(
        id="ps",
        impersonal_ok=True,
        brief=(
            "A short closing note to the parent: a chart is a hypothesis to test against the "
            "child in front of them, not an instruction."
        ),
        paragraphs=(1, 2),
        titles=_t("Наостанок", "Напоследок", "One last thing"),
    ),
)


BY_PRODUCT.update({"natal": NATAL, "forecast": FORECAST, "child": CHILD})


SYNASTRY: tuple[SectionSpec, ...] = (
    SectionSpec(
        id="intro",
        impersonal_ok=True,
        brief=(
            "An opening for both of them: what a synastry is and, plainly, what it is not — it "
            "does not score a couple or say whether to stay together."
        ),
        paragraphs=(2, 3),
        titles=_t("Про цей розбір", "Об этом разборе", "About this reading"),
    ),
    SectionSpec(
        id="synastry.each",
        brief=(
            "The two charts side by side in brief: what each person brings before they meet. Two "
            "or three sentences about each, no more — the pair is the subject."
        ),
        paragraphs=(3, 4),
        titles=_t("Двоє окремо", "Двое по отдельности", "The two of them apart"),
    ),
    SectionSpec(
        id="synastry.pull",
        brief=(
            "The contacts that create attraction: Sun, Moon, Venus and Mars across the two charts, "
            "with the exact orbs. What each one actually feels like day to day."
        ),
        paragraphs=(4, 5),
        quote=True,
        titles=_t("Що притягує", "Что притягивает", "What pulls them together"),
    ),
    SectionSpec(
        id="synastry.friction",
        brief=(
            "The tense contacts: where the two charts grind, and what that looks like in an "
            "ordinary week. Describe the mechanism, never a verdict on the relationship."
        ),
        paragraphs=(4, 5),
        titles=_t("Де виникає тертя", "Где возникает трение", "Where the friction is"),
    ),
    SectionSpec(
        id="synastry.houses",
        brief=(
            "The house overlays: which part of each person's life the other lands in, both ways "
            "round. This is the half that says where a partner actually shows up."
        ),
        paragraphs=(3, 4),
        needs_time=True,
        titles=_t("Де ви одне в одного", "Где вы друг у друга", "Where you land in each other"),
    ),
    SectionSpec(
        id="synastry.talk",
        brief=(
            "Mercury to Mercury and Moon to Mercury: how these two understand and misunderstand "
            "each other, and what a repair conversation needs to look like for them."
        ),
        paragraphs=(3, 4),
        titles=_t("Як домовлятися", "Как договариваться", "How to work it out"),
    ),
    SectionSpec(
        id="synastry.long",
        brief=(
            "Saturn, Pluto and the nodes across the charts: what makes this bond durable and what "
            "makes it heavy. The long-term structure rather than the mood."
        ),
        paragraphs=(3, 4),
        titles=_t("Що тримає надовго", "Что держит надолго", "What makes it last"),
    ),
    SectionSpec(
        id="synastry.advice",
        brief=(
            "Six pieces of advice for this pair, each tied to a specific contact. Addressed to "
            "both of them, not to one side."
        ),
        paragraphs=(1, 2),
        titles=_t("Що з цим робити", "Что с этим делать", "What to do with it"),
    ),
    SectionSpec(
        id="ps",
        impersonal_ok=True,
        brief=(
            "A closing note: two charts describe the weather between two people, not their worth "
            "or their future. Say it without hedging."
        ),
        paragraphs=(1, 2),
        titles=_t("Наостанок", "Напоследок", "One last thing"),
    ),
)

BY_PRODUCT["synastry"] = SYNASTRY


#: The same composition as the document's bundle: the natal reading, then the quarter-by-quarter
#: detail. Built from the two lists rather than retyped, so a change to a section brief reaches
#: the bundle without anyone remembering to copy it.
_FORECAST_BY_ID = {spec.id: spec for spec in FORECAST}
BUNDLE: tuple[SectionSpec, ...] = (
    *(s for s in NATAL if s.id != "ps"),
    _FORECAST_BY_ID["forecast.q1"],
    _FORECAST_BY_ID["forecast.q2"],
    _FORECAST_BY_ID["forecast.q3"],
    _FORECAST_BY_ID["forecast.q4"],
    _FORECAST_BY_ID["forecast.slow"],
    _FORECAST_BY_ID["forecast.advice"],
    next(s for s in NATAL if s.id == "ps"),
)

BY_PRODUCT["bundle"] = BUNDLE


#: The free preview: three short passages a visitor reads before paying, and the first words the
#: product ever says to them. One model call rather than three — the fact sheet is most of the
#: input, and paying for it three times would triple both the bill and the wait.
_PREVIEW_COMMON = (
    "Three short passages, in this order and separated by a blank line. One paragraph each, "
    "three to five sentences, no headings and no labels — the document prints the titles itself. "
    "Say something specific enough that the reader recognises themselves, and stop before the "
    "full reading would begin. Write only the three passages: never comment on the instructions, "
    "on what the chart contains or on what will be covered later."
)

#: Two briefs rather than one with a condition in it. A model told "if there is no birth time,
#: do X" will explain that the birth time is present — which is exactly what it did — so the
#: branch belongs in the code that knows the answer.
PREVIEW = SectionSpec(
    id="preview",
    brief=f"{_PREVIEW_COMMON} The three are: the Sun, the Moon, then the Ascendant.",
    paragraphs=(3, 3),
    titles=_t("Перше враження", "Первое впечатление", "A first look"),
)

PREVIEW_NO_TIME = SectionSpec(
    id="preview",
    brief=(
        f"{_PREVIEW_COMMON} The three are: the Sun, the Moon, then the shape of the chart as a "
        "whole — its element and modality balance and its loudest configuration. There is no "
        "birth time for this chart, so there is no Ascendant to write about; do not mention that."
    ),
    paragraphs=(3, 3),
    titles=_t("Перше враження", "Первое впечатление", "A first look"),
)

#: The titles printed above each passage.
PREVIEW_TITLES: tuple[dict[str, str], ...] = (
    _t("Сонце", "Солнце", "The Sun"),
    _t("Місяць", "Луна", "The Moon"),
    _t("Асцендент", "Асцендент", "The Ascendant"),
)
PREVIEW_TITLES_NO_TIME: tuple[dict[str, str], ...] = (
    _t("Сонце", "Солнце", "The Sun"),
    _t("Місяць", "Луна", "The Moon"),
    _t("Малюнок карти", "Рисунок карты", "The shape of the chart"),
)


#: The free passages for a pair. Same idea as PREVIEW, different subject: two charts, and the
#: three things a couple actually wants to know before paying.
PREVIEW_SYNASTRY = SectionSpec(
    id="preview",
    brief=(
        f"{_PREVIEW_COMMON} The three are: what pulls these two together, where the friction "
        "between them sits, and where each of them lands in the other's life by house. Write "
        "about the pair, not about either chart on its own."
    ),
    paragraphs=(3, 3),
    titles=_t("Перше враження", "Первое впечатление", "A first look"),
)

PREVIEW_TITLES_SYNASTRY: tuple[dict[str, str], ...] = (
    _t("Що притягує", "Что притягивает", "What pulls you together"),
    _t("Де виникає тертя", "Где возникает трение", "Where the friction is"),
    _t("Де ви одне в одного", "Где вы друг у друга", "Where you land in each other"),
)
