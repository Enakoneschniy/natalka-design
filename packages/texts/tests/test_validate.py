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


def test_a_chapter_that_greets_the_reader_again_is_caught() -> None:
    # A German reading came back with «Liebe Lena,» at the start of twenty-five sections.
    greeted = "Liebe Lena,\n\n" + GERMAN
    report = check(greeted, lang="de", min_paragraphs=2, max_paragraphs=4)
    assert "greeting" in report.codes
    # The opening section is the one place a greeting belongs.
    assert (
        "greeting"
        not in check(
            greeted, lang="de", min_paragraphs=2, max_paragraphs=4, impersonal_ok=True
        ).codes
    )
    ru = "Дорогая Оксана,\n\nВаше Солнце стоит в Тельце, и вы не спешите.\n\nЭто ваш способ делать хорошо."
    assert "greeting" in check(ru, lang="ru", min_paragraphs=2, max_paragraphs=4).codes


def test_a_german_sign_without_its_article_and_an_english_word_are_caught() -> None:
    slipped = GERMAN.replace("steht im Stier", "steht in Stier") + " Es ist Timing-Wissen für Sie."
    assert (
        "anglicism"
        in check(
            GERMAN + " Eine Chart-Architektur für Sie.",
            lang="de",
            min_paragraphs=2,
            max_paragraphs=3,
        ).codes
    )
    report = check(slipped, lang="de", min_paragraphs=2, max_paragraphs=3)
    assert "sign_article" in report.codes
    assert "anglicism" in report.codes
    assert check(GERMAN, lang="de", min_paragraphs=2, max_paragraphs=3).ok


POLISH = (
    "Słońce Pani horoskopu stoi w Byku, w dziewiątym domu. Nie spieszy się Pani, i to nie jest "
    "powolność, tylko sposób robienia rzeczy dobrze. To, co Pani zaczyna, doprowadza Pani do "
    "końca.\n\n"
    "Dziewiąty dom przenosi to w widoczną część życia: Pani reputacja rośnie warstwa po warstwie, "
    "a ci, którzy z Panią pracują, zauważają to wcześniej niż Pani sama. Kwadratura do Saturna "
    "nie jest tu ciężarem, tylko miarą."
)


def test_a_polish_reading_on_pani_passes_and_ci_is_not_informal() -> None:
    report = check(POLISH, lang="pl", min_paragraphs=2, max_paragraphs=3, gender="f")
    assert report.ok, report.problems


def test_ty_in_a_polish_reading_on_pani_is_caught() -> None:
    slipped = POLISH.replace("To, co Pani zaczyna", "To, co ty zaczynasz")
    report = check(slipped, lang="pl", min_paragraphs=2, max_paragraphs=3, gender="f")
    assert "informal_address" in report.codes
    assert any("«Pani» / «Pan»" in p for p in report.problems)


def test_a_polish_reading_without_a_gender_is_impersonal_by_design() -> None:
    impersonal = (
        "Słońce w tym horoskopie stoi w Byku, w dziewiątym domu. Przy takim układzie nie ma pośpiechu, "
        "a rzeczy robi się dokładnie i do końca. " * 3
    )
    text = f"{impersonal}\n\n{impersonal}"
    assert (
        "not_addressed"
        not in check(text, lang="pl", min_paragraphs=2, max_paragraphs=3, gender="n").codes
    )
    assert (
        "not_addressed"
        in check(text, lang="pl", min_paragraphs=2, max_paragraphs=3, gender="f").codes
    )


def test_a_polish_greeting_in_a_chapter_is_caught() -> None:
    report = check(
        "Droga Anno,\n\n" + POLISH, lang="pl", min_paragraphs=2, max_paragraphs=4, gender="f"
    )
    assert "greeting" in report.codes


FRENCH = (
    "Votre Soleil est en Taureau, dans la neuvième maison. Vous ne vous pressez pas, et ce n'est "
    "pas de la lenteur : c'est votre façon de bien faire les choses. Ce que vous commencez, vous "
    "le menez à son terme, et le ton de votre Lune reste calme.\n\n"
    "La neuvième maison porte cela vers la partie visible de la vie : votre réputation se "
    "construit couche après couche, et ceux qui travaillent avec vous le remarquent avant vous. "
    "Le carré à Saturne n'en fait pas un fardeau, mais une mesure."
)


def test_a_french_reading_on_vous_passes_and_tone_is_not_informal() -> None:
    report = check(FRENCH, lang="fr", min_paragraphs=2, max_paragraphs=3, gender="f")
    assert report.ok, report.problems


def test_tu_in_a_french_reading_on_vous_is_caught() -> None:
    slipped = FRENCH.replace(
        "Ce que vous commencez, vous le menez", "Ce que tu commences, tu le mènes"
    )
    report = check(slipped, lang="fr", min_paragraphs=2, max_paragraphs=3)
    assert "informal_address" in report.codes
    assert any("«vous»" in p for p in report.problems)
    elided = FRENCH.replace("Vous ne vous pressez pas", "Tu ne t'empresses pas")
    assert "informal_address" in check(elided, lang="fr", min_paragraphs=2, max_paragraphs=3).codes


def test_a_french_chapter_that_greets_or_borrows_english_is_caught() -> None:
    assert (
        "greeting"
        in check("Chère Léa,\n\n" + FRENCH, lang="fr", min_paragraphs=2, max_paragraphs=4).codes
    )
    assert (
        "anglicism"
        in check(
            FRENCH + " Le timing compte pour vous.", lang="fr", min_paragraphs=2, max_paragraphs=3
        ).codes
    )
    assert (
        "foreign_script"
        in check(
            FRENCH + " C'est Ваше Солнце.", lang="fr", min_paragraphs=2, max_paragraphs=3
        ).codes
    )


SPANISH = (
    "Tu Sol está en Tauro, en la novena casa. No tienes prisa, y eso no es lentitud: es tu manera "
    "de hacer bien las cosas. Lo que empiezas lo terminas, y quienes trabajan contigo lo notan "
    "antes que tú.\n\n"
    "La novena casa lleva todo esto a la parte visible de la vida: tu reputación se construye "
    "capa a capa, sin prisa y sin ruido. La cuadratura con Saturno no es una carga, sino una "
    "medida de lo que eres capaz de sostener."
)


def test_a_spanish_reading_is_on_tu_even_when_the_order_says_formal() -> None:
    # The seller's «вы» does not reach Spanish: Spain reads its horoscopes on «tú».
    assert check(SPANISH, lang="es", min_paragraphs=2, max_paragraphs=3, address="vy").ok
    assert check(SPANISH, lang="es", min_paragraphs=2, max_paragraphs=3, address="ty").ok


def test_usted_in_a_spanish_reading_is_caught() -> None:
    slipped = SPANISH.replace("Lo que empiezas lo terminas", "Lo que usted empieza lo termina")
    report = check(slipped, lang="es", min_paragraphs=2, max_paragraphs=3)
    assert "formal_address" in report.codes
    assert any("«tú»" in p for p in report.problems)


def test_a_spanish_section_about_her_instead_of_to_you_is_caught() -> None:
    about = (
        "Su Sol está en Tauro. No tiene prisa, y su ritmo no es duda. Lo que empieza lo termina, "
        "y su reputación crece despacio, capa a capa, entre quienes la conocen. " * 3
    )
    report = check(f"{about}\n\n{about}", lang="es", min_paragraphs=2, max_paragraphs=3)
    assert "not_addressed" in report.codes


def test_a_spanish_synastry_may_speak_to_the_pair_as_vosotros() -> None:
    pair = (
        "Lo que os une es una forma parecida de cuidar las cosas. Vuestro ritmo es lento, y "
        "ninguno de los dos lo vive como un defecto, sino como una manera de durar. " * 3
    )
    report = check(f"{pair}\n\n{pair}", lang="es", min_paragraphs=2, max_paragraphs=3, pair=True)
    assert report.ok, report.problems


ENGLISH = (
    "Your Sun is in Taurus, in the ninth house. You are not in a hurry, and that is not slowness "
    "but your way of doing things well. What you begin, you finish.\n\n"
    "The ninth house carries this into the visible part of life: your reputation is built layer "
    "by layer, and the people who work with you notice it before you do. The square to Saturn is "
    "not a burden here but a measure."
)


def test_an_english_reading_passes_and_may_use_english_words() -> None:
    report = check(ENGLISH + " Timing matters.", lang="en", min_paragraphs=2, max_paragraphs=3)
    assert report.ok, report.problems


def test_an_english_chapter_that_greets_or_slips_into_cyrillic_is_caught() -> None:
    assert (
        "greeting"
        in check("Dear Lena,\n\n" + ENGLISH, lang="en", min_paragraphs=2, max_paragraphs=4).codes
    )
    assert (
        "foreign_script"
        in check(
            ENGLISH + " This is Ваше Солнце.", lang="en", min_paragraphs=2, max_paragraphs=3
        ).codes
    )
