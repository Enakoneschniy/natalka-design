import re

from natalka_texts import check

CLEAN = (
    "Сонце у Тельці працює повільно й на результат. Ви не поспішаєте, і це не повільність, "
    "а спосіб робити добре.\n\n"
    "Дев'ятий дім переносить це у видиму частину життя: репутація будується шар за шаром."
)


def test_clean_text_passes() -> None:
    assert check(CLEAN, lang="uk", min_paragraphs=2, max_paragraphs=4).ok


def test_empty_text_fails() -> None:
    report = check("   ", lang="uk", min_paragraphs=1, max_paragraphs=2)
    assert not report.ok


def test_pretending_to_know_the_person_is_rejected() -> None:
    text = "Вы писали, что сейчас всё непросто. Карта это подтверждает.\n\nВторой абзац."
    report = check(text, lang="ru", min_paragraphs=2, max_paragraphs=3)
    assert any("implies we know" in p for p in report.problems)


def test_cliches_are_rejected() -> None:
    text = "В современном мире это ключевой аспект.\n\nВторой абзац здесь."
    report = check(text, lang="ru", min_paragraphs=2, max_paragraphs=3)
    assert len([p for p in report.problems if "banned list" in p]) == 2


def test_formatting_rules() -> None:
    report = check(
        "## Заголовок\n\nТекст с восклицанием!\n\n<div>чужой тег</div>",
        lang="ru",
        min_paragraphs=1,
        max_paragraphs=5,
    )
    joined = " ".join(report.problems)
    assert "markdown" in joined
    assert "exclamation" in joined
    assert "unsupported markup" in joined


def test_allowed_markup_survives() -> None:
    text = "Перший абзац із <b>акцентом</b>.\n\nДругий абзац із <i>курсивом</i>."
    assert check(text, lang="uk", min_paragraphs=2, max_paragraphs=2).ok


def test_paragraph_count_is_enforced_with_one_of_slack() -> None:
    three = "Один.\n\nДва.\n\nТри."
    assert check(three, lang="uk", min_paragraphs=2, max_paragraphs=2).ok  # one over is tolerated
    assert not check(three, lang="uk", min_paragraphs=4, max_paragraphs=6).ok


def test_a_latin_word_inside_a_russian_reading_is_caught() -> None:
    report = check(
        "Проверять смысл на practике, а не в голове.\n\nВторой абзац разбора.",
        lang="ru",
        min_paragraphs=2,
        max_paragraphs=3,
    )
    assert any("Latin" in p for p in report.problems)


def test_a_character_from_another_script_is_caught() -> None:
    # Seen in a live preview on 2026-11-02.
    text = "Солнце соединено с Хироном почти точно — меньше半 градуса.\n\nВторой абзац для вас."
    report = check(text, lang="ru", min_paragraphs=2, max_paragraphs=3)
    assert "foreign_script" in report.codes
    assert any("半" in p for p in report.problems)
    greek = "The Sun meets Chiron within half a degree, και you feel it.\n\nYour second paragraph."
    assert "foreign_script" in check(greek, lang="en", min_paragraphs=2, max_paragraphs=3).codes


def test_the_scripts_a_reading_is_written_in_are_not_foreign() -> None:
    for text, lang in (
        ("Ґанок і їжак — це ваше. Ёлка, съезд, «ё» и ударе\u0301ние.\n\nДля вас.", "ru"),
        ("Ваш Асцендент у Діві, MC у Близнюках.\n\nДругий абзац для вас.", "uk"),
        ("Your Sun is in Taurus — café, naïve, Zürich.\n\nYour second paragraph.", "en"),
    ):
        assert (
            "foreign_script" not in check(text, lang=lang, min_paragraphs=2, max_paragraphs=3).codes
        )


def test_chart_abbreviations_are_allowed() -> None:
    text = "Асцендент в Деве, MC в Близнецах.\n\nPDF придёт на почту."
    assert check(text, lang="ru", min_paragraphs=2, max_paragraphs=2).ok


def test_a_section_written_about_the_reader_is_rejected() -> None:
    about = (
        "Солнце Оксаны стоит в Тельце и говорит о человеке, который не спешит. "
        "Она предпочитает основательность и проверяет всё на ощупь, прежде чем довериться. " * 3
    )
    report = check(f"{about}\n\n{about}", lang="ru", min_paragraphs=2, max_paragraphs=3)
    assert any("addressing them" in p for p in report.problems)


def test_a_short_closing_line_may_be_impersonal() -> None:
    text = "Карта не приговор.\n\nОна описывает почву, а не урожай."
    assert check(text, lang="ru", min_paragraphs=2, max_paragraphs=2).ok


def test_an_opening_may_be_impersonal() -> None:
    about = "Транзит описывает погоду, а не событие. " * 12
    strict = check(f"{about}\n\n{about}", lang="ru", min_paragraphs=2, max_paragraphs=3)
    assert any("addressing them" in p for p in strict.problems)
    relaxed = check(
        f"{about}\n\n{about}", lang="ru", min_paragraphs=2, max_paragraphs=3, impersonal_ok=True
    )
    assert relaxed.ok


def test_informal_address_is_rejected() -> None:
    text = "Твой Марс в Овне даёт скорость.\n\nЕсли тебе кажется, что это давит, — это транзит."
    report = check(text, lang="ru", min_paragraphs=2, max_paragraphs=2)
    assert any("informally" in p for p in report.problems)
    # And it is not also reported as impersonal: it addresses the reader, just wrongly.
    assert not any("talks about the reader" in p for p in report.problems)


def test_formal_address_passes() -> None:
    text = "Ваш Марс в Овне даёт скорость.\n\nЕсли вам кажется, что это давит, — это транзит."
    assert check(text, lang="ru", min_paragraphs=2, max_paragraphs=2).ok


def test_ukrainian_words_in_a_russian_reading_are_caught() -> None:
    text = "Ваше Сонце у Тельці стоїть в девятому домі.\n\nВторой абзац по-русски, всё в порядке."
    report = check(text, lang="ru", min_paragraphs=2, max_paragraphs=2)
    assert any("other language" in p for p in report.problems)


def test_russian_words_in_a_ukrainian_reading_are_caught() -> None:
    text = "Ваше Сонце у Тельці.\n\nЭто предложение на русском языке попало не туда."
    report = check(text, lang="uk", min_paragraphs=2, max_paragraphs=2)
    assert any("other language" in p for p in report.problems)


def test_every_problem_has_a_code_that_quotes_nothing() -> None:
    text = "## Заголовок\n\nВ современном мире ты писал, Оксана!\n\n<div>чужой тег</div>"
    report = check(text, lang="ru", min_paragraphs=5, max_paragraphs=6)
    assert len(report.codes) == len(report.problems)
    assert {
        "too_few_paragraphs",
        "implies_knowledge",
        "cliche",
        "informal_address",
        "exclamation",
        "markdown",
        "markup",
    } <= set(report.codes)
    assert all(re.fullmatch(r"[a-z_]+", code) for code in report.codes)
    assert check("", lang="ru", min_paragraphs=1, max_paragraphs=1).codes == ("empty",)
    assert check(CLEAN, lang="uk", min_paragraphs=2, max_paragraphs=4).codes == ()


def test_a_clean_russian_section_passes_the_language_check() -> None:
    text = "Ваше Солнце в Тельце, в девятом доме.\n\nЭто даёт вам устойчивость и упрямство."
    assert check(text, lang="ru", min_paragraphs=2, max_paragraphs=2).ok


GERMAN = (
    "Ihre Sonne steht im Stier, im neunten Haus. Sie haben es nicht eilig, und das ist keine "
    "Langsamkeit, sondern eine Art, Dinge gut zu machen. Was Sie beginnen, führen Sie zu Ende.\n\n"
    "Das neunte Haus trägt das in den sichtbaren Teil Ihres Lebens: Ihr Ruf wächst Schicht für "
    "Schicht, und wer mit Ihnen arbeitet, merkt das früher als Sie selbst. Ein Quadrat zu Saturn "
    "macht daraus keine Last, sondern einen Maßstab."
)


def test_a_german_reading_on_sie_passes() -> None:
    report = check(GERMAN, lang="de", min_paragraphs=2, max_paragraphs=3)
    assert report.ok, report.problems


def test_du_in_a_german_reading_on_sie_is_caught() -> None:
    slipped = GERMAN.replace("Was Sie beginnen", "Was du beginnst")
    report = check(slipped, lang="de", min_paragraphs=2, max_paragraphs=3)
    assert "informal_address" in report.codes
    assert any("«Sie»" in p for p in report.problems)


def test_a_german_section_about_her_instead_of_to_you_is_caught() -> None:
    # Lower-case «sie» and «ihr» are "she" and "her": this talks about the reader, not to her.
    about = (
        "Ihre Sonne steht im Stier. Sie hat es nicht eilig, und ihr Tempo ist kein Zögern. "
        "Was sie beginnt, führt sie zu Ende, und ihr Ruf wächst langsam. " * 3
    ).replace("Ihre Sonne", "Die Sonne")
    report = check(f"{about}\n\n{about}", lang="de", min_paragraphs=2, max_paragraphs=3)
    assert "not_addressed" in report.codes


def test_german_cliches_and_invented_knowledge_are_caught() -> None:
    text = GERMAN + " Zusammenfassend lässt sich sagen, wie Sie wissen, alles ist gut."
    report = check(text, lang="de", min_paragraphs=2, max_paragraphs=3)
    assert "cliche" in report.codes
    assert "implies_knowledge" in report.codes


def test_cyrillic_in_a_german_reading_is_caught() -> None:
    report = check(GERMAN + " Das ist Ваша Sonne.", lang="de", min_paragraphs=2, max_paragraphs=3)
    assert "foreign_script" in report.codes
