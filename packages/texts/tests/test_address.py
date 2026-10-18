from natalka_texts import prompts
from natalka_texts.prompts import system_prompt
from natalka_texts.sections import specs, title
from natalka_texts.validate import check

FORMAL_RULE = (
    "In Russian and Ukrainian this is the\nformal «вы» / «ви» throughout — never «ты» / «ти», "
    "in any sentence, however warm the moment."
)

TY_TEXT = "\n\n".join(
    [
        "Твоё Солнце в Тельце делает тебя упорным человеком, и ты редко сдаёшься. " * 3,
        "Луна в Раке подсказывает, что тебе важен дом и близкие люди рядом. " * 3,
        "Асцендент в Деве объясняет, почему ты замечаешь детали раньше других. " * 3,
    ]
)
VY_TEXT = (
    TY_TEXT.replace("Твоё", "Ваше")
    .replace("тебя", "вас")
    .replace("ты ", "вы ")
    .replace("тебе", "вам")
    .replace("сдаёшься", "сдаётесь")
    .replace("замечаешь", "замечаете")
)


def _addr(problems: tuple[str, ...]) -> list[str]:
    return [p for p in problems if "inform" in p or "addressing" in p or "talks about" in p]


def test_formal_prompt_is_unchanged() -> None:
    text = system_prompt("ru", "f", "natal")
    assert FORMAL_RULE in text
    assert text == system_prompt("ru", "f", "natal", address="vy")
    assert prompts.SYSTEM in text
    # The template with the formal rule filled in is exactly the pre-existing prompt.
    filled = prompts._SYSTEM_TEMPLATE.replace("{address_rule}", prompts.ADDRESS_RULE["vy"])
    assert filled == prompts.SYSTEM
    assert "{address_rule}" not in text
    assert prompts.ADDRESS_RULE["vy"] == FORMAL_RULE


def test_informal_prompt_asks_for_ty_and_keeps_everything_else() -> None:
    ty = system_prompt("ru", "f", "natal", address="ty")
    assert FORMAL_RULE not in ty
    assert "«ты» / «ти»" in ty
    vy = system_prompt("ru", "f", "natal")
    assert ty.replace(ty.split("ADDRESS\n", 1)[1].split("\n\nTONE", 1)[0], "") == vy.replace(
        vy.split("ADDRESS\n", 1)[1].split("\n\nTONE", 1)[0], ""
    )


def test_validator_follows_the_address_form() -> None:
    assert _addr(check(TY_TEXT, lang="ru", min_paragraphs=3, max_paragraphs=3).problems)
    assert not _addr(
        check(TY_TEXT, lang="ru", min_paragraphs=3, max_paragraphs=3, address="ty").problems
    )
    assert not _addr(check(VY_TEXT, lang="ru", min_paragraphs=3, max_paragraphs=3).problems)
    assert _addr(
        check(VY_TEXT, lang="ru", min_paragraphs=3, max_paragraphs=3, address="ty").problems
    )


PAIR_TEXT = "\n\n".join(["Вы оба цените честность, и вам легко договориться. " * 3] * 3)


def test_informal_synastry_may_speak_to_the_pair_in_plural() -> None:
    report = check(
        PAIR_TEXT, lang="ru", min_paragraphs=3, max_paragraphs=3, address="ty", pair=True
    )
    assert not _addr(report.problems)


def test_plural_only_section_is_flagged_without_pair() -> None:
    report = check(PAIR_TEXT, lang="ru", min_paragraphs=3, max_paragraphs=3, address="ty")
    assert _addr(report.problems)


def test_pair_flag_changes_nothing_in_formal_mode() -> None:
    plain = check(TY_TEXT, lang="ru", min_paragraphs=3, max_paragraphs=3)
    paired = check(TY_TEXT, lang="ru", min_paragraphs=3, max_paragraphs=3, pair=True)
    assert plain == paired
    assert not _addr(
        check(PAIR_TEXT, lang="ru", min_paragraphs=3, max_paragraphs=3, pair=True).problems
    )


def test_ty_reading_still_bans_implied_knowledge() -> None:
    text = TY_TEXT + "\n\nКак ты знаешь, всё повторяется."
    report = check(text, lang="ru", min_paragraphs=3, max_paragraphs=4, address="ty")
    assert any("как ты знаешь" in p for p in report.problems)


def test_titles_follow_the_address_form() -> None:
    work = next(s for s in specs("natal", unknown_time=False) if s.id == "work.picture")
    assert title(work, "ru") == "Как вы работаете"
    assert title(work, "ru", "ty") == "Как ты работаешь"
    assert title(work, "uk", "ty") == "Як ти працюєш"
    assert title(work, "en", "ty") == "How you work"
    overview = next(s for s in specs("natal", unknown_time=False) if s.id == "natal.overview")
    assert title(overview, "ru", "ty") == title(overview, "ru")
    ground = next(s for s in specs("forecast", unknown_time=False) if s.id == "forecast.ground")
    assert title(ground, "ru") == "Почва вашей карты"
    assert title(ground, "ru", "ty") == "Почва твоей карты"
    assert title(ground, "uk", "ty") == "Ґрунт твоєї карти"


# A Ukrainian «ти» section can name the reader through «твій» and its forms alone: «твій»,
# «твого», «твому», «твою» do not start with «тво» + «ї/є/я», and were missed.
UK_TY_POSSESSIVE = "\n\n".join(
    [
        "Твій Місяць у Раку шукає опору вдома, і саме там найкраще відновлюються сили. " * 3,
        "Для твого Сонця в Тельці важливі спокій, сталість і речі, які можна торкнутися. " * 3,
        "Твому Асценденту в Діві властиво помічати деталі, а твою уважність цінують інші. " * 3,
    ]
)
UK_VY_TEXT = "\n\n".join(
    [
        "Ваш Місяць у Раку шукає опору вдома, і саме там найкраще відновлюються ваші сили. " * 3,
        "Для вашого Сонця в Тельці важливі спокій, сталість і творчість, яку можна торкнутися. "
        * 3,
        "Вашому Асценденту в Діві властиво помічати деталі, а вашу уважність цінують інші. " * 3,
    ]
)


def test_ukrainian_ty_section_may_address_the_reader_through_tviy_alone() -> None:
    report = check(UK_TY_POSSESSIVE, lang="uk", min_paragraphs=3, max_paragraphs=3, address="ty")
    assert not _addr(report.problems)


def test_ukrainian_vy_section_catches_a_slip_into_tviy() -> None:
    assert not _addr(check(UK_VY_TEXT, lang="uk", min_paragraphs=3, max_paragraphs=3).problems)
    slipped = UK_VY_TEXT.replace("Ваш Місяць", "Твій Місяць", 1)
    assert _addr(check(slipped, lang="uk", min_paragraphs=3, max_paragraphs=3).problems)


def test_ukrainian_tvorchist_is_not_an_informal_word() -> None:
    # «творчість», «твори», «творець»: «тво» + «р» is not the reader's possessive.
    text = UK_VY_TEXT + "\n\nВаші твори й ваша творчість — це ваш шлях."
    report = check(text, lang="uk", min_paragraphs=3, max_paragraphs=4)
    assert not _addr(report.problems)


def test_ukrainian_ty_reading_bans_ty_zgaduvala() -> None:
    text = UK_TY_POSSESSIVE + "\n\nЯк ти згадувала, усе повторюється."
    report = check(text, lang="uk", min_paragraphs=3, max_paragraphs=4, address="ty")
    assert any("ти згадувала" in p for p in report.problems)
