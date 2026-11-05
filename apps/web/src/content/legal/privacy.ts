/* Privacy policy. The facts about data handling are true to the code: what the model, Stripe and
   the advertising tags receive, and how long each kind of data is kept. Change it with them. */

export const privacy: Record<string, string> = {
  ru: `
# Политика обработки данных

_Редакция от 2 ноября 2026 г. Оператор: coremind s. r. o., Vlčie hrdlo 1887/81, 821 07 Братислава – Ружинов, Словакия, IČO 57 339 368, Торговый реестр Городского суда Братислава III, раздел Sro, вставка 194301/B. Связь: help@chronika.me._

## Какие данные мы получаем

Чтобы построить карту, вы вводите **дату, время и место рождения**, имя (необязательно) и форму обращения. Для доставки документа — **адрес электронной почты**; если вы выбираете получение в Telegram — идентификатор вашего чата. Для совместимости вводятся данные двух человек; для детской карты — данные ребёнка, которые вводит родитель или опекун. Для подписки на гороскоп — данные рождения и почта.

По IP-адресу мы автоматически определяем страну — чтобы показать цену в вашей валюте и не принимать заказы там, где оплата невозможна. Тот же адрес на лету служит ещё одной цели: ограничить частоту запросов к сайту. Сам IP-адрес мы не сохраняем — кроме случая, описанного в разделе о рекламе, и только с вашего согласия.

## Зачем

Данные рождения нужны для одного: рассчитать положение планет и написать по ним текст. Почта и Telegram — чтобы доставить документ или гороскоп и сообщить о готовности. Больше ни для чего: мы не рассылаем рекламу и не продаём данные. Рекламному сервису Meta мы сообщаем о заказах только с вашего согласия и только то, что перечислено в разделе о рекламе; данных рождения там нет.

## Cookie и реклама

Сайт ставит свои технические cookie: ваш ответ на вопрос о cookie (на год), промокод — если вы ввели его или пришли по ссылке с ним (до конца срока его действия) — и название рекламной кампании, по которой вы пришли (без идентификаторов, до закрытия браузера). Посещения мы считаем сами и через Cloudflare Web Analytics — без cookie.

Рекламные теги (Meta, Google, TikTok) загружаются, только если вы нажали «Разрешить», и только на страницах без личных данных: на главной, в документах и на пустой форме. На страницах с картой, заказом, оплатой, ожиданием документа и подпиской их нет — туда не попадают ни данные рождения, ни ссылки на документ.

Если вы нажали «Разрешить», сайт также сообщает Meta со своего сервера о четырёх событиях: вы открыли превью своей карты, перешли к оплате, оплатили заказ, подтвердили подписку на гороскоп — чтобы понимать, какая реклама к ним привела. С событием передаются: адрес почты и страна в виде хеша (необратимого отпечатка), IP-адрес и данные браузера (user agent), рекламные cookie Meta, если они уже установлены, номер заказа или подписки, продукт и цена. Данные рождения, имя, место рождения и пол не передаются никогда. Чтобы сообщить об оплате, которая приходит позже, IP-адрес, данные браузера и cookie Meta хранятся с заказом в зашифрованном виде — до оплаты и не дольше 7 дней. Если вы выбрали «Только необходимые» или не ответили, ничего из этого не отправляется и не хранится.

## Кто их обрабатывает

Мы не делаем всё сами. Обработка происходит на серверах **Cloudflare** (хостинг, база данных, хранилище документов). Оплату принимает **Stripe**: ему передаются адрес почты, название продукта и цена — без данных рождения; данные карты видит только Stripe. Если вы платите другим способом на странице Stripe — BLIK, Klarna, Revolut Pay и т. п., — его провайдер получает то, что нужно для платежа, и обрабатывает это по своим правилам. Текст разбора и гороскопа пишет языковая модель: провайдеру модели (**Anthropic**, модели Claude) передаются положения планет, аспекты и дома, имя, дата и время рождения — по ним определяются возраст и возвраты планет. Координаты, место рождения, часовой пояс и почта модели не передаются. Письма отправляет **Resend**. Сообщения в Telegram — **Telegram**, если вы сами выбрали этот способ. Каждый из них связан с нами договором и обрабатывает данные только по нашему поручению.

## Как храним и сколько

Данные рождения шифруются (AES-256-GCM) до того, как попадают в базу, и расшифровываются только на время расчёта. Данные рождения, тексты разбора и готовый документ **удаляются через 30 дней** после заказа — вместе со ссылкой на скачивание. Неоплаченный заказ удаляется со всеми данными через 7 дней. Адрес почты в оплаченном заказе хранится 180 дней — на случай вопросов и возвратов, — затем удаляется. Запись о заказе без него (что куплено, когда, за сколько) хранится столько, сколько требует бухгалтерский и налоговый учёт.

Подписка на гороскоп начинается только после того, как вы подтвердите её по ссылке из письма; неподтверждённая заявка удаляется через 7 дней. Для действующей подписки мы храним почту, а также рассчитанную карту и имя в зашифрованном виде; сами данные рождения — только первые 30 дней, на случай исправления. После отмены или окончания подписки её данные хранятся ещё 30 дней и удаляются.

Тексты бесплатного превью хранятся до 30 дней, чтобы не писать один и тот же текст дважды; к ним не привязаны ни почта, ни заказ.

## Ваши права

Вы можете запросить копию своих данных, их исправление или удаление раньше срока — напишите на help@chronika.me с адреса, на который оформлялся заказ или подписка. Удаление данных рождения означает, что документ станет недоступен. Согласие на рекламные cookie можно отозвать: удалите cookie сайта в браузере — вопрос появится снова, а до ответа теги не загружаются. Если вы считаете, что мы обрабатываем данные неправильно, вы вправе обратиться в надзорный орган по защите данных вашей страны.

## Дети

Детская карта строится по данным ребёнка, которые вводит взрослый. Мы не заключаем договор с ребёнком и не связываемся с ним. Сервис не предназначен для самостоятельного использования лицами младше 18 лет.

## Изменения

Если политика изменится, новая редакция появится на этой странице с новой датой. Существенные изменения мы сообщим на почту, если у нас есть действующий заказ с вашим адресом.
`,
  uk: `
# Політика обробки даних

_Редакція від 2 листопада 2026 р. Оператор: coremind s. r. o., Vlčie hrdlo 1887/81, 821 07 Братислава – Ружинов, Словаччина, IČO 57 339 368, Торговий реєстр Міського суду Братислава III, розділ Sro, вкладка 194301/B. Зв'язок: help@chronika.me._

## Які дані ми отримуємо

Щоб побудувати карту, ви вводите **дату, час і місце народження**, ім'я (необов'язково) та форму звертання. Для доставки документа — **адресу електронної пошти**; якщо ви обираєте отримання в Telegram — ідентифікатор вашого чату. Для сумісності вводяться дані двох людей; для дитячої карти — дані дитини, які вводить батько, мати або опікун. Для підписки на гороскоп — дані народження і пошта.

За IP-адресою ми автоматично визначаємо країну — щоб показати ціну у вашій валюті і не приймати замовлення там, де оплата неможлива. Ця ж адреса на льоту слугує ще одній меті: обмежити частоту запитів до сайту. Саму IP-адресу ми не зберігаємо — крім випадку, описаного в розділі про рекламу, і лише з вашої згоди.

## Навіщо

Дані народження потрібні для одного: розрахувати положення планет і написати за ними текст. Пошта і Telegram — щоб доставити документ або гороскоп і повідомити про готовність. Більше ні для чого: ми не розсилаємо рекламу і не продаємо дані. Рекламному сервісу Meta ми повідомляємо про замовлення лише з вашої згоди і лише те, що перелічено в розділі про рекламу; даних народження там немає.

## Cookie і реклама

Сайт ставить власні технічні cookie: вашу відповідь на питання про cookie (на рік), промокод — якщо ви ввели його або прийшли за посиланням із ним (до кінця строку його дії) — і назву рекламної кампанії, з якої ви прийшли (без ідентифікаторів, до закриття браузера). Відвідування ми рахуємо самі та через Cloudflare Web Analytics — без cookie.

Рекламні теги (Meta, Google, TikTok) завантажуються, лише якщо ви натиснули «Дозволити», і лише на сторінках без особистих даних: на головній, у документах і на порожній формі. На сторінках з картою, замовленням, оплатою, очікуванням документа та підпискою їх немає — туди не потрапляють ні дані народження, ні посилання на документ.

Якщо ви натиснули «Дозволити», сайт також повідомляє Meta зі свого сервера про чотири події: ви відкрили превʼю своєї карти, перейшли до оплати, оплатили замовлення, підтвердили підписку на гороскоп — щоб розуміти, яка реклама до них привела. З подією передаються: адреса пошти і країна у вигляді хешу (незворотного відбитка), IP-адреса і дані браузера (user agent), рекламні cookie Meta, якщо вони вже встановлені, номер замовлення або підписки, продукт і ціна. Дані народження, імʼя, місце народження і стать не передаються ніколи. Щоб повідомити про оплату, яка надходить пізніше, IP-адреса, дані браузера і cookie Meta зберігаються із замовленням у зашифрованому вигляді — до оплати і не довше 7 днів. Якщо ви обрали «Тільки необхідні» або не відповіли, нічого з цього не надсилається і не зберігається.

## Хто їх обробляє

Ми не робимо все самі. Обробка відбувається на серверах **Cloudflare** (хостинг, база даних, сховище документів). Оплату приймає **Stripe**: йому передаються адреса пошти, назва продукту і ціна — без даних народження; дані картки бачить лише Stripe. Якщо ви платите іншим способом на сторінці Stripe — BLIK, Klarna, Revolut Pay тощо, — його провайдер отримує те, що потрібно для платежу, і обробляє це за власними правилами. Текст розбору і гороскопа пише мовна модель: провайдеру моделі (**Anthropic**, моделі Claude) передаються положення планет, аспекти й доми, ім'я, дата і час народження — за ними визначаються вік і повернення планет. Координати, місце народження, часовий пояс і пошта моделі не передаються. Листи надсилає **Resend**. Повідомлення в Telegram — **Telegram**, якщо ви самі обрали цей спосіб. Кожен із них пов'язаний з нами договором і обробляє дані лише за нашим дорученням.

## Як зберігаємо і скільки

Дані народження шифруються (AES-256-GCM) до того, як потрапляють у базу, і розшифровуються лише на час розрахунку. Дані народження, тексти розбору і готовий документ **видаляються через 30 днів** після замовлення — разом із посиланням на завантаження. Неоплачене замовлення видаляється з усіма даними через 7 днів. Адреса пошти в оплаченому замовленні зберігається 180 днів — на випадок запитань і повернень, — потім видаляється. Запис про замовлення без неї (що куплено, коли, за скільки) зберігається стільки, скільки вимагає бухгалтерський і податковий облік.

Підписка на гороскоп починається лише після того, як ви підтвердите її за посиланням із листа; непідтверджена заявка видаляється через 7 днів. Для чинної підписки ми зберігаємо пошту, а також розраховану карту та ім'я в зашифрованому вигляді; самі дані народження — лише перші 30 днів, на випадок виправлення. Після скасування або закінчення підписки її дані зберігаються ще 30 днів і видаляються.

Тексти безкоштовного прев'ю зберігаються до 30 днів, щоб не писати той самий текст двічі; до них не прив'язані ні пошта, ні замовлення.

## Ваші права

Ви можете запросити копію своїх даних, їх виправлення або видалення раніше строку — напишіть на help@chronika.me з адреси, на яку оформлювалося замовлення або підписка. Видалення даних народження означає, що документ стане недоступним. Згоду на рекламні cookie можна відкликати: видаліть cookie сайту в браузері — питання з'явиться знову, а до відповіді теги не завантажуються. Якщо ви вважаєте, що ми обробляємо дані неправильно, ви маєте право звернутися до наглядового органу із захисту даних вашої країни.

## Діти

Дитяча карта будується за даними дитини, які вводить дорослий. Ми не укладаємо договір з дитиною і не зв'язуємося з нею. Сервіс не призначений для самостійного використання особами, молодшими за 18 років.

## Зміни

Якщо політика зміниться, нова редакція з'явиться на цій сторінці з новою датою. Про суттєві зміни ми повідомимо на пошту, якщо маємо чинне замовлення з вашою адресою.
`,
  en: `
# Privacy policy

_Version of 2 November 2026. Operator: coremind s. r. o., Vlčie hrdlo 1887/81, 821 07 Bratislava – Ružinov, Slovakia, company ID (IČO) 57 339 368, Commercial Register of the Municipal Court Bratislava III, section Sro, insert 194301/B. Contact: help@chronika.me._

## What we collect

To build a chart you enter a **date, time and place of birth**, a first name (optional) and a form of address. To deliver the document we need an **email address**; if you choose Telegram, the identifier of your chat. Compatibility takes two people's data; a child's chart takes the child's data, entered by a parent or guardian. A horoscope subscription takes birth data and an email address.

We derive your country from your IP address automatically — to show prices in your currency and to take no orders where payment is impossible. The same address serves one more purpose on the fly: limiting how often the site can be called. The IP address itself is not stored, except in the case described under advertising, and only with your consent.

## Why

Birth data serves one purpose: computing the positions of the planets and writing a text from them. Email and Telegram exist to deliver the document or the horoscope and tell you it is ready. Nothing else: no marketing emails and no sale of data. We tell the advertising service Meta about orders only with your consent and only what is listed under advertising; birth data is never part of it.

## Cookies and advertising

The site sets its own technical cookies: your answer to the cookie question (for a year), a promo code — if you entered one or followed a link with one (until the code ends) — and the name of the advertising campaign that brought you (no identifiers, until the browser is closed). We count visits ourselves and with Cloudflare Web Analytics, without cookies.

Advertising tags (Meta, Google, TikTok) load only if you pressed "Allow", and only on pages without personal data: the home page, the documents and the empty form. Pages with your chart, your order, the payment, the waiting screen and your subscription carry none — neither birth data nor document links reach them.

If you pressed "Allow", the site also tells Meta, from its own server, about four events: you opened the preview of your chart, went to payment, paid for an order, confirmed a horoscope subscription — so we can see which advertising led to them. Each event carries your email address and country as a hash (an irreversible fingerprint), your IP address and browser details (user agent), Meta's advertising cookies if they are already set, the order or subscription number, the product and the price. Birth data, names, the place of birth and gender are never sent. To report a payment, which arrives later, the IP address, browser details and Meta's cookies are kept with the order in encrypted form — until it is paid, and for no more than 7 days. If you chose "Only necessary" or did not answer, none of this is sent or kept.

## Who processes it

We do not do everything ourselves. Processing runs on **Cloudflare** (hosting, database, document storage). Payments are taken by **Stripe**, which receives your email address, the product name and the price — no birth data; only Stripe sees your card details. If you pay another way on Stripe's page — BLIK, Klarna, Revolut Pay and the like — that method's provider receives what the payment needs and handles it under its own terms. The reading and the horoscope are written by a language model: the model provider (**Anthropic**, Claude models) receives the planetary positions, aspects and houses, your first name, and the date and time of birth — ages and planetary returns are read from them. Coordinates, the place of birth, the time zone and your email are not sent to the model. Letters are sent by **Resend**. Telegram messages by **Telegram**, only if you chose that channel. Each is bound to us by contract and processes data on our instructions alone.

## How long we keep it

Birth data is encrypted (AES-256-GCM) before it reaches the database and decrypted only for the calculation. Birth data, the reading's texts and the finished document are **deleted 30 days** after the order, together with the download link. An unpaid order is deleted with all its data after 7 days. The email address on a paid order is kept for 180 days, for questions and refunds, then deleted. The order record without it (what was bought, when, for how much) is kept as long as accounting and tax law require.

A horoscope subscription starts only once you confirm it through the link in our email; an unconfirmed request is deleted after 7 days. For an active subscription we keep your email address, and the computed chart and your first name in encrypted form; the birth data itself only for the first 30 days, in case it needs correcting. Once a subscription is cancelled or ends, its data is kept for 30 more days and then deleted.

The free preview's texts are kept for up to 30 days, so the same text is not written twice; no email address or order is attached to them.

## Your rights

You can ask for a copy of your data, a correction, or deletion before the deadline — write to help@chronika.me from the address used for the order or the subscription. Deleting birth data makes the document unavailable. You can withdraw consent to advertising cookies: delete the site's cookies in your browser — the question appears again, and no tag loads before you answer. If you believe we handle your data wrongly, you may complain to the data-protection authority of your country.

## Children

A child's chart is built from the child's data entered by an adult. We do not contract with or contact the child. The service is not meant for independent use by anyone under 18.

## Changes

If this policy changes, the new version appears here with a new date. We will email you about material changes if we hold a current order with your address.
`,
  de: `
# Datenschutzerklärung

_Fassung vom 2. November 2026. Verantwortlicher im Sinne der DSGVO: coremind s. r. o., Vlčie hrdlo 1887/81, 821 07 Bratislava – Ružinov, Slowakei, Identifikationsnummer (IČO) 57 339 368, Handelsregister des Stadtgerichts Bratislava III, Abteilung Sro, Einlage 194301/B. Kontakt: help@chronika.me._

## Welche Daten wir erhalten

Damit wir Ihr Horoskop berechnen können, geben Sie **Geburtsdatum, Geburtszeit und Geburtsort** ein, einen Vornamen (freiwillig) und die Form, in der wir Sie ansprechen sollen. Für die Zustellung des Dokuments benötigen wir Ihre **E-Mail-Adresse**; wenn Sie die Zustellung über Telegram wählen, die Kennung Ihres Chats. Für ein Partnerschaftshoroskop werden die Daten zweier Personen eingegeben; für ein Kinderhoroskop die Daten des Kindes, die ein Elternteil oder ein Vormund eingibt. Für ein Horoskop-Abonnement benötigen wir Geburtsdaten und eine E-Mail-Adresse. Ohne Geburtsdaten und Zustelladresse können wir das Dokument nicht erstellen und nicht zustellen.

Aus Ihrer IP-Adresse ermitteln wir automatisch Ihr Land – um Preise in Ihrer Währung anzuzeigen und keine Bestellungen dort anzunehmen, wo eine Zahlung nicht möglich ist. Dieselbe Adresse dient, nur im Moment der Anfrage, einem weiteren Zweck: zu begrenzen, wie oft die Website aufgerufen werden kann. Die IP-Adresse selbst speichern wir nicht – außer in dem Fall, der im Abschnitt über Werbung beschrieben ist, und nur mit Ihrer Einwilligung.

## Wozu und auf welcher Rechtsgrundlage

Geburtsdaten dienen einem einzigen Zweck: die Stellung der Planeten zu berechnen und daraus einen Text zu schreiben. E-Mail-Adresse und Telegram dienen dazu, das Dokument oder das Horoskop zuzustellen und Ihnen mitzuteilen, dass es fertig ist. Zu nichts anderem: Wir versenden keine Werbe-E-Mails und verkaufen keine Daten. Dem Werbedienst Meta melden wir Bestellungen nur mit Ihrer Einwilligung und nur das, was im Abschnitt über Werbung aufgeführt ist; Geburtsdaten gehören nie dazu.

Ihre eigenen Geburtsdaten, Ihren Vornamen, die Anrede und die Zustelladresse verarbeiten wir, weil das zur Erfüllung des Vertrags oder Abonnements mit Ihnen oder zur Erstellung der von Ihnen angeforderten kostenlosen Vorschau erforderlich ist (Art. 6 Abs. 1 lit. b DSGVO). Die Daten einer anderen Person, die Sie für ein Partnerschafts- oder Kinderhoroskop eingeben, verarbeiten wir auf Grundlage des berechtigten Interesses, Ihren Auftrag auszuführen (Art. 6 Abs. 1 lit. f DSGVO). Auf unserem berechtigten Interesse (Art. 6 Abs. 1 lit. f DSGVO) beruhen außerdem: die Bestimmung des Landes aus der IP-Adresse (richtige Preise und Zahlungswege), die Begrenzung der Aufrufe (Schutz und Stabilität der Website), die Besucherzählung ohne Cookies, die Zwischenspeicherung der Vorschautexte und die Aufbewahrung der E-Mail-Adresse für Rückfragen und Erstattungen. Die Werbe-Tags und die Meldungen an Meta beruhen auf Ihrer Einwilligung (Abschnitt „Cookies und Werbung“). Den Bestelldatensatz bewahren wir auf, weil Buchführungs- und Steuerrecht es verlangen (Art. 6 Abs. 1 lit. c DSGVO).

## Cookies und Werbung

Die Website setzt eigene technische Cookies: Ihre Antwort auf die Cookie-Frage (für ein Jahr), einen Promo-Code – wenn Sie ihn eingegeben haben oder über einen Link mit Code gekommen sind (bis zum Ende seiner Gültigkeit) – und den Namen der Werbekampagne, über die Sie gekommen sind (ohne Kennungen, bis zum Schließen des Browsers). Besuche zählen wir selbst und mit Cloudflare Web Analytics, ohne Cookies.

Werbe-Tags (Meta, Google, TikTok) werden nur geladen, wenn Sie „Zulassen“ gewählt haben, und nur auf Seiten ohne personenbezogene Daten: auf der Startseite, in den Rechtstexten und auf dem leeren Formular. Die Seiten mit Ihrem Horoskop, Ihrer Bestellung, der Zahlung, dem Warten auf das Dokument und Ihrem Abonnement enthalten keine – dorthin gelangen weder Geburtsdaten noch Links zum Dokument.

Wenn Sie „Zulassen“ gewählt haben, meldet die Website Meta außerdem von ihrem eigenen Server vier Ereignisse: Sie haben die Vorschau Ihres Horoskops geöffnet, sind zur Zahlung übergegangen, haben eine Bestellung bezahlt, haben ein Horoskop-Abonnement bestätigt – damit wir sehen, welche Werbung dazu geführt hat. Mit jedem Ereignis werden übermittelt: Ihre E-Mail-Adresse und Ihr Land als Hash (ein nicht umkehrbarer Fingerabdruck), Ihre IP-Adresse und Angaben zu Ihrem Browser (User-Agent), die Werbe-Cookies von Meta, sofern sie bereits gesetzt sind, die Bestell- oder Abonnementnummer, das Produkt und der Preis. Geburtsdaten, Namen, Geburtsort und Geschlecht werden nie übermittelt. Um eine Zahlung zu melden, die erst später eingeht, werden IP-Adresse, Browserangaben und die Cookies von Meta verschlüsselt mit der Bestellung gespeichert – bis zur Zahlung und höchstens 7 Tage. Haben Sie „Nur notwendige“ gewählt oder nicht geantwortet, wird nichts davon übermittelt oder gespeichert.

Rechtsgrundlage der Werbe-Tags und der Meldungen an Meta ist Ihre Einwilligung (Art. 6 Abs. 1 lit. a DSGVO); für das Speichern und Auslesen von Informationen auf Ihrem Endgerät zusätzlich die nationale Umsetzung von Art. 5 Abs. 3 der Richtlinie 2002/58/EG, in Deutschland § 25 Abs. 1 TDDDG.

## Wer die Daten verarbeitet

Wir machen nicht alles selbst. Die Verarbeitung läuft auf Servern von **Cloudflare** (Hosting, Datenbank, Dokumentenspeicher). Zahlungen nimmt **Stripe** entgegen: Stripe erhält Ihre E-Mail-Adresse, den Produktnamen und den Preis – ohne Geburtsdaten; Ihre Kartendaten sieht nur Stripe. Zahlen Sie auf der Seite von Stripe anders – etwa mit Klarna, BLIK oder Revolut Pay –, erhält der jeweilige Anbieter, was er für die Zahlung braucht, und verarbeitet es als eigener Verantwortlicher nach seinen Bedingungen. Den Text der Deutung und des Horoskops schreibt ein Sprachmodell: Der Anbieter des Modells (**Anthropic**, Claude-Modelle) erhält die Stellungen der Planeten, Aspekte und Häuser, Ihren Vornamen sowie Geburtsdatum und Geburtszeit – daraus werden Lebensalter und Planetenwiederkehren abgelesen. Koordinaten, Geburtsort, Zeitzone und E-Mail-Adresse erhält das Modell nicht. E-Mails versendet **Resend**, Nachrichten in Telegram **Telegram** – nur wenn Sie diesen Weg selbst gewählt haben. Jeder von ihnen ist vertraglich an uns gebunden und verarbeitet die Daten ausschließlich nach unseren Weisungen, als Auftragsverarbeiter im Sinne von Art. 28 DSGVO.

## Wie und wie lange wir speichern

Geburtsdaten werden verschlüsselt (AES-256-GCM), bevor sie in die Datenbank gelangen, und nur für die Dauer der Berechnung entschlüsselt. Geburtsdaten, die Texte der Deutung und das fertige Dokument werden **30 Tage nach der Bestellung gelöscht** – zusammen mit dem Download-Link. Eine unbezahlte Bestellung wird mit allen Daten nach 7 Tagen gelöscht. Die E-Mail-Adresse einer bezahlten Bestellung wird 180 Tage aufbewahrt – für Rückfragen und Erstattungen – und danach gelöscht. Der Bestelldatensatz ohne sie (was gekauft wurde, wann und zu welchem Preis) wird so lange aufbewahrt, wie Buchführungs- und Steuerrecht es verlangen.

Ein Horoskop-Abonnement beginnt erst, wenn Sie es über den Link in unserer E-Mail bestätigt haben; eine unbestätigte Anmeldung wird nach 7 Tagen gelöscht. Für ein laufendes Abonnement speichern wir Ihre E-Mail-Adresse sowie das berechnete Horoskop und Ihren Vornamen in verschlüsselter Form; die Geburtsdaten selbst nur in den ersten 30 Tagen, falls sie korrigiert werden müssen. Nach der Kündigung oder dem Ende eines Abonnements werden seine Daten noch 30 Tage aufbewahrt und dann gelöscht.

Die Texte der kostenlosen Vorschau werden bis zu 30 Tage gespeichert, damit derselbe Text nicht zweimal geschrieben wird; mit ihnen sind weder eine E-Mail-Adresse noch eine Bestellung verknüpft.

## Ihre Rechte

Sie haben das Recht auf Auskunft und eine Kopie Ihrer Daten (Art. 15 DSGVO), auf Berichtigung (Art. 16 DSGVO), auf Löschung auch vor Ablauf der genannten Fristen (Art. 17 DSGVO), auf Einschränkung der Verarbeitung (Art. 18 DSGVO) und auf Datenübertragbarkeit (Art. 20 DSGVO). Schreiben Sie dazu an help@chronika.me, von der Adresse, mit der die Bestellung oder das Abonnement abgeschlossen wurde. Werden die Geburtsdaten gelöscht, ist das Dokument nicht mehr verfügbar.

**Widerspruchsrecht:** Soweit wir Daten auf Grundlage unseres berechtigten Interesses verarbeiten (Art. 6 Abs. 1 lit. f DSGVO), können Sie dieser Verarbeitung aus Gründen, die sich aus Ihrer besonderen Situation ergeben, jederzeit widersprechen (Art. 21 DSGVO).

Eine Einwilligung können Sie jederzeit mit Wirkung für die Zukunft widerrufen (Art. 7 Abs. 3 DSGVO). Für die Werbe-Cookies geht das so: Löschen Sie die Cookies der Website in Ihrem Browser – die Frage erscheint dann erneut, und bis zu Ihrer Antwort werden keine Tags geladen. Wenn Sie der Ansicht sind, dass wir Ihre Daten nicht rechtmäßig verarbeiten, haben Sie das Recht auf Beschwerde bei einer Datenschutz-Aufsichtsbehörde, insbesondere bei der Aufsichtsbehörde Ihres Landes (Art. 77 DSGVO).

## Kinder

Ein Kinderhoroskop wird aus den Daten des Kindes erstellt, die ein Erwachsener eingibt. Wir schließen keinen Vertrag mit dem Kind und nehmen keinen Kontakt zu ihm auf. Der Dienst ist nicht zur eigenständigen Nutzung durch Personen unter 18 Jahren bestimmt.

## Änderungen

Ändert sich diese Erklärung, erscheint die neue Fassung auf dieser Seite mit neuem Datum. Über wesentliche Änderungen informieren wir Sie per E-Mail, wenn bei uns eine laufende Bestellung mit Ihrer Adresse vorliegt.
`,
  pl: `
# Polityka prywatności

_Wersja z 2 listopada 2026 r. Administratorem danych osobowych w rozumieniu rozporządzenia (UE) 2016/679 (RODO) jest coremind s. r. o., Vlčie hrdlo 1887/81, 821 07 Bratysława – Ružinov, Słowacja, IČO 57 339 368, rejestr handlowy Sądu Miejskiego Bratysława III, oddział Sro, wkładka nr 194301/B. Kontakt: help@chronika.me._

## Jakie dane otrzymujemy

Aby obliczyć Państwa horoskop urodzeniowy, podają Państwo **datę, godzinę i miejsce urodzenia**, imię (dobrowolnie) oraz formę, w jakiej mamy się do Państwa zwracać. Do dostarczenia dokumentu potrzebujemy Państwa **adresu e-mail**; jeżeli wybiorą Państwo dostarczenie przez Telegram – identyfikatora Państwa czatu. Do analizy zgodności podaje się dane dwóch osób; do horoskopu dziecka – dane dziecka, które wprowadza rodzic lub opiekun. Do subskrypcji horoskopu potrzebne są dane urodzenia i adres e-mail. Bez danych urodzenia i adresu do doręczenia nie możemy przygotować ani dostarczyć dokumentu.

Na podstawie adresu IP automatycznie ustalamy Państwa kraj – aby pokazać ceny w Państwa walucie i nie przyjmować zamówień tam, gdzie płatność nie jest możliwa. Ten sam adres służy, wyłącznie w chwili zapytania, jeszcze jednemu celowi: ograniczeniu częstotliwości wywołań strony. Samego adresu IP nie przechowujemy – z wyjątkiem przypadku opisanego w części dotyczącej reklamy i wyłącznie za Państwa zgodą.

## Cele i podstawy prawne przetwarzania

Dane urodzenia służą jednemu celowi: obliczeniu położenia planet i napisaniu na tej podstawie tekstu. Adres e-mail i Telegram służą do dostarczenia dokumentu lub horoskopu oraz do poinformowania Państwa, że jest gotowy. Do niczego innego: nie wysyłamy wiadomości reklamowych i nie sprzedajemy danych. Serwis reklamowy Meta informujemy o zamówieniach wyłącznie za Państwa zgodą i wyłącznie w zakresie wymienionym w części dotyczącej reklamy; dane urodzenia nigdy do niego nie należą.

Państwa własne dane urodzenia, imię, formę zwracania się i adres do doręczenia przetwarzamy, ponieważ jest to niezbędne do wykonania zawartej z Państwem umowy lub subskrypcji albo do przygotowania zamówionego przez Państwa bezpłatnego podglądu (art. 6 ust. 1 lit. b RODO). Dane innej osoby, które podają Państwo do analizy zgodności lub do horoskopu dziecka, przetwarzamy na podstawie prawnie uzasadnionego interesu polegającego na wykonaniu Państwa zamówienia (art. 6 ust. 1 lit. f RODO). Na naszym prawnie uzasadnionym interesie (art. 6 ust. 1 lit. f RODO) opierają się ponadto: ustalanie kraju na podstawie adresu IP (właściwe ceny i metody płatności), ograniczanie liczby wywołań (ochrona i stabilność strony), liczenie odwiedzin bez plików cookie, tymczasowe przechowywanie tekstów podglądu oraz przechowywanie adresu e-mail na potrzeby pytań i zwrotów. Tagi reklamowe i informowanie Meta opierają się na Państwa zgodzie (część „Pliki cookie i reklama”). Zapis zamówienia przechowujemy, ponieważ wymagają tego przepisy o rachunkowości i przepisy podatkowe (art. 6 ust. 1 lit. c RODO).

## Pliki cookie i reklama

Strona zapisuje własne techniczne pliki cookie: Państwa odpowiedź na pytanie o pliki cookie (na rok), kod promocyjny – jeżeli go Państwo wpisali lub weszli na stronę przez link z kodem (do końca jego ważności) – oraz nazwę kampanii reklamowej, z której Państwo przyszli (bez identyfikatorów, do zamknięcia przeglądarki). Odwiedziny liczymy sami oraz za pomocą Cloudflare Web Analytics, bez plików cookie.

Tagi reklamowe (Meta, Google, TikTok) są wczytywane tylko wtedy, gdy wybrali Państwo „Zgadzam się”, i tylko na stronach bez danych osobowych: na stronie głównej, w dokumentach prawnych i na pustym formularzu. Strony z Państwa horoskopem, zamówieniem, płatnością, oczekiwaniem na dokument i subskrypcją nie zawierają ich wcale – nie trafiają tam ani dane urodzenia, ani linki do dokumentu.

Jeżeli wybrali Państwo „Zgadzam się”, strona informuje ponadto Meta, ze swojego serwera, o czterech zdarzeniach: otworzyli Państwo podgląd swojego horoskopu, przeszli Państwo do płatności, opłacili Państwo zamówienie, potwierdzili Państwo subskrypcję horoskopu – abyśmy wiedzieli, która reklama do nich doprowadziła. Wraz z każdym zdarzeniem przekazywane są: Państwa adres e-mail i kraj w postaci skrótu (hash – nieodwracalnego odcisku), Państwa adres IP i dane przeglądarki (user agent), reklamowe pliki cookie Meta, jeżeli zostały już zapisane, numer zamówienia lub subskrypcji, produkt i cena. Dane urodzenia, imiona, miejsce urodzenia i płeć nie są przekazywane nigdy. Aby poinformować o płatności, która wpływa później, adres IP, dane przeglądarki i pliki cookie Meta są przechowywane wraz z zamówieniem w postaci zaszyfrowanej – do chwili zapłaty i nie dłużej niż 7 dni. Jeżeli wybrali Państwo „Tylko niezbędne” lub nie udzielili odpowiedzi, nic z tego nie jest wysyłane ani przechowywane.

Podstawą prawną tagów reklamowych i informowania Meta jest Państwa zgoda (art. 6 ust. 1 lit. a RODO); w odniesieniu do przechowywania informacji w Państwa urządzeniu końcowym i uzyskiwania do nich dostępu – dodatkowo krajowe przepisy wdrażające art. 5 ust. 3 dyrektywy 2002/58/WE, w Polsce art. 399 ust. 1 ustawy z dnia 12 lipca 2024 r. – Prawo komunikacji elektronicznej. Warunki przechowywania plików cookie i dostępu do nich mogą Państwo określić także w ustawieniach przeglądarki.

## Kto przetwarza dane

Nie robimy wszystkiego sami. Przetwarzanie odbywa się na serwerach **Cloudflare** (hosting, baza danych, przechowywanie dokumentów). Płatności przyjmuje **Stripe**: otrzymuje Państwa adres e-mail, nazwę produktu i cenę – bez danych urodzenia; dane Państwa karty widzi wyłącznie Stripe. Jeżeli płacą Państwo na stronie Stripe w inny sposób – na przykład BLIK, Klarna lub Revolut Pay – dostawca tej metody otrzymuje to, czego potrzebuje do płatności, i przetwarza to jako odrębny administrator na własnych zasadach. Tekst interpretacji i horoskopu pisze model językowy: dostawca modelu (**Anthropic**, modele Claude) otrzymuje położenia planet, aspekty i domy, Państwa imię oraz datę i godzinę urodzenia – na ich podstawie odczytuje się wiek i powroty planet. Współrzędnych, miejsca urodzenia, strefy czasowej ani adresu e-mail model nie otrzymuje. Wiadomości e-mail wysyła **Resend**, wiadomości w Telegramie – **Telegram**, tylko jeżeli sami Państwo wybrali tę drogę. Każdy z nich jest związany z nami umową i przetwarza dane wyłącznie na nasze polecenie, jako podmiot przetwarzający w rozumieniu art. 28 RODO.

## Jak i jak długo przechowujemy dane

Dane urodzenia są szyfrowane (AES-256-GCM), zanim trafią do bazy danych, i odszyfrowywane wyłącznie na czas obliczeń. Dane urodzenia, teksty interpretacji i gotowy dokument są **usuwane po 30 dniach** od złożenia zamówienia – razem z linkiem do pobrania. Nieopłacone zamówienie jest usuwane wraz ze wszystkimi danymi po 7 dniach. Adres e-mail przy opłaconym zamówieniu jest przechowywany przez 180 dni – na potrzeby pytań i zwrotów – a następnie usuwany. Zapis zamówienia bez niego (co kupiono, kiedy i za jaką cenę) przechowujemy tak długo, jak wymagają tego przepisy o rachunkowości i przepisy podatkowe.

Subskrypcja horoskopu rozpoczyna się dopiero wtedy, gdy potwierdzą ją Państwo za pomocą linku z naszej wiadomości e-mail; niepotwierdzone zgłoszenie jest usuwane po 7 dniach. W przypadku aktywnej subskrypcji przechowujemy Państwa adres e-mail oraz, w postaci zaszyfrowanej, obliczony horoskop i Państwa imię; same dane urodzenia – tylko przez pierwsze 30 dni, na wypadek potrzeby ich poprawienia. Po anulowaniu lub zakończeniu subskrypcji jej dane są przechowywane jeszcze przez 30 dni, a następnie usuwane.

Teksty bezpłatnego podglądu są przechowywane do 30 dni, aby ten sam tekst nie był pisany dwukrotnie; nie są z nimi powiązane ani adres e-mail, ani zamówienie.

## Państwa prawa

Mają Państwo prawo dostępu do swoich danych i otrzymania ich kopii (art. 15 RODO), prawo do ich sprostowania (art. 16 RODO), do ich usunięcia – także przed upływem podanych terminów (art. 17 RODO), do ograniczenia przetwarzania (art. 18 RODO) oraz do przenoszenia danych (art. 20 RODO). W tym celu prosimy napisać na adres help@chronika.me z adresu, z którego złożono zamówienie lub zamówiono subskrypcję. Usunięcie danych urodzenia oznacza, że dokument przestanie być dostępny.

**Prawo sprzeciwu:** W zakresie, w jakim przetwarzamy dane na podstawie naszego prawnie uzasadnionego interesu (art. 6 ust. 1 lit. f RODO), mogą Państwo w każdej chwili wnieść sprzeciw wobec takiego przetwarzania z przyczyn związanych z Państwa szczególną sytuacją (art. 21 RODO).

Zgodę mogą Państwo wycofać w każdej chwili, bez wpływu na zgodność z prawem przetwarzania, którego dokonano na podstawie zgody przed jej wycofaniem (art. 7 ust. 3 RODO). W przypadku reklamowych plików cookie odbywa się to tak: prosimy usunąć pliki cookie strony w przeglądarce – pytanie pojawi się ponownie, a do czasu udzielenia odpowiedzi żadne tagi nie są wczytywane. Jeżeli uważają Państwo, że przetwarzamy Państwa dane niezgodnie z prawem, mają Państwo prawo wnieść skargę do organu nadzorczego, w szczególności w państwie członkowskim swojego zwykłego pobytu (art. 77 RODO); w Polsce organem tym jest Prezes Urzędu Ochrony Danych Osobowych.

## Dzieci

Horoskop dziecka jest przygotowywany na podstawie danych dziecka, które wprowadza osoba dorosła. Nie zawieramy umowy z dzieckiem i nie kontaktujemy się z nim. Serwis nie jest przeznaczony do samodzielnego korzystania przez osoby, które nie ukończyły 18 lat.

## Zmiany

Jeżeli niniejsza polityka ulegnie zmianie, nowa wersja pojawi się na tej stronie z nową datą. O istotnych zmianach poinformujemy Państwa e-mailem, jeżeli mamy bieżące zamówienie z Państwa adresem.
`,
};
