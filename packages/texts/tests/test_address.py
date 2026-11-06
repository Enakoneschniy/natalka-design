from natalka_texts import prompts
from natalka_texts.address import address_for
from natalka_texts.prompts import section_prompt, system_prompt
from natalka_texts.sections import NATAL, specs, title
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
    filled = filled.replace("{script_rule}", prompts.CYRILLIC_SCRIPT_RULE)
    assert filled == prompts.SYSTEM
    assert "{address_rule}" not in text
    assert "{script_rule}" not in text
    assert "The only Latin characters allowed are the chart abbreviations AC, MC,\nIC, DC" in text
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


def test_a_german_reading_is_on_sie_and_may_use_its_own_alphabet() -> None:
    text = system_prompt("de", "f", "natal")
    assert "«Sie» throughout" in text
    assert "never «du»" in text
    assert "The only Latin characters allowed" not in text
    assert "„…“" in text
    assert text.endswith(
        "Write auf Deutsch. The person the chart belongs to is eine Frau — "
        "Personenbezeichnungen in der weiblichen Form (die Kämpferin, die Gestalterin)."
    )
    du = system_prompt("de", "m", "synastry", address="ty")
    assert "«du» throughout" in du and "«ihr»" in du
    assert "{" not in du


def test_only_the_opening_section_may_greet() -> None:
    intro, overview = NATAL[0], NATAL[1]
    assert intro.id == "intro"
    assert "do not greet" not in section_prompt(intro, name="Lena", sheet="-", written_so_far=[])
    assert "do not greet" in section_prompt(overview, name="Lena", sheet="-", written_so_far=[])


def test_a_polish_reading_is_on_pani_or_pan_by_gender() -> None:
    she = system_prompt("pl", "f", "natal")
    assert "«Pani» / «Pan» throughout" in she and "never «ty»" in she
    assert "zwracaj się do niej «Pani»" in she
    assert "zwracaj się do niego «Pan»" in system_prompt("pl", "m", "natal")
    assert "nie zwracaj się «Pani» ani «Pan»" in system_prompt("pl", "n", "natal")
    assert "w Byku" in she and "„…”" in she
    assert "{" not in system_prompt("pl", "f", "synastry", address="ty")


def test_a_french_reading_is_on_vous_by_default() -> None:
    she = system_prompt("fr", "f", "natal")
    assert "«vous»\nthroughout" in she and "never «tu»" in she
    assert she.endswith("vous êtes née).")
    assert "en français" in she
    assert "{" not in system_prompt("fr", "m", "synastry", address="ty")


def test_a_spanish_reading_is_always_on_tu() -> None:
    assert address_for("es", "vy") == "ty"
    assert address_for("de", "vy") == "vy"
    assert address_for("fr", "ty") == "ty"
    formal = system_prompt("es", "f", "natal", address="vy")
    assert formal == system_prompt("es", "f", "natal", address="ty")
    assert "«tú»\nthroughout" in formal and "never «usted»" in formal
    assert "de España" in formal and "estás preparada" in formal
    assert "«vosotros»" in system_prompt("es", "m", "synastry")


def test_an_english_reading_spells_the_chart_out_and_may_use_english() -> None:
    text = system_prompt("en", "f", "natal")
    assert "plain English" in text
    assert "use she/her" in text
    assert "{" not in text
