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
