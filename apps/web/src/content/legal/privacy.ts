/* Privacy policy. The facts about data handling are true to the code: what the model, Stripe and
   the advertising tags receive, and how long each kind of data is kept. Change it with them. */

export const privacy: Record<string, string> = {
  ru: `
# Политика обработки данных

_Редакция от 6 октября 2026 г. Оператор: coremind s. r. o., Vlčie hrdlo 1887/81, 821 07 Братислава – Ружинов, Словакия, IČO 57 339 368, Торговый реестр Городского суда Братислава III, раздел Sro, вставка 194301/B. Связь: help@chronika.me._

## Какие данные мы получаем

Чтобы построить карту, вы вводите **дату, время и место рождения**, имя (необязательно) и форму обращения. Для доставки документа — **адрес электронной почты**; если вы выбираете получение в Telegram — идентификатор вашего чата. Для совместимости вводятся данные двух человек; для детской карты — данные ребёнка, которые вводит родитель или опекун. Для подписки на гороскоп — данные рождения и почта.

По IP-адресу мы автоматически определяем страну — чтобы показать цену в вашей валюте и не принимать заказы там, где оплата невозможна. Тот же адрес на лету служит ещё двум целям: ограничить частоту запросов к сайту и закрепить за вами одну цену, пока идёт ценовой тест. Сам IP-адрес мы не сохраняем.

## Зачем

Данные рождения нужны для одного: рассчитать положение планет и написать по ним текст. Почта и Telegram — чтобы доставить документ или гороскоп и сообщить о готовности. Больше ни для чего: мы не рассылаем рекламу, не продаём и не передаём данные третьим лицам для их целей.

## Cookie и реклама

Сайт ставит свои технические cookie: ваш ответ на вопрос о cookie (на год), вариант ценового теста (на 60 дней — чтобы цена не менялась от визита к визиту) и название рекламной кампании, по которой вы пришли (без идентификаторов, до закрытия браузера). Посещения мы считаем сами и через Cloudflare Web Analytics — без cookie.

Рекламные теги (Meta, Google, TikTok) загружаются, только если вы нажали «Разрешить», и только на страницах без личных данных: на главной, в документах и на пустой форме. На страницах с картой, заказом, оплатой, ожиданием документа и подпиской их нет — туда не попадают ни данные рождения, ни ссылки на документ.

## Кто их обрабатывает

Мы не делаем всё сами. Обработка происходит на серверах **Cloudflare** (хостинг, база данных, хранилище документов). Оплату принимает **Stripe**: ему передаются адрес почты, название продукта и цена — без данных рождения; данные карты видит только Stripe. Текст разбора и гороскопа пишет языковая модель: провайдеру модели (**OpenRouter**, модели Anthropic) передаются положения планет, аспекты и дома, имя, дата и время рождения — по ним определяются возраст и возвраты планет. Координаты, место рождения, часовой пояс и почта модели не передаются. Письма отправляет **Resend**. Сообщения в Telegram — **Telegram**, если вы сами выбрали этот способ. Каждый из них связан с нами договором и обрабатывает данные только по нашему поручению.

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

_Редакція від 6 жовтня 2026 р. Оператор: coremind s. r. o., Vlčie hrdlo 1887/81, 821 07 Братислава – Ружинов, Словаччина, IČO 57 339 368, Торговий реєстр Міського суду Братислава III, розділ Sro, вкладка 194301/B. Зв'язок: help@chronika.me._

## Які дані ми отримуємо

Щоб побудувати карту, ви вводите **дату, час і місце народження**, ім'я (необов'язково) та форму звертання. Для доставки документа — **адресу електронної пошти**; якщо ви обираєте отримання в Telegram — ідентифікатор вашого чату. Для сумісності вводяться дані двох людей; для дитячої карти — дані дитини, які вводить батько, мати або опікун. Для підписки на гороскоп — дані народження і пошта.

За IP-адресою ми автоматично визначаємо країну — щоб показати ціну у вашій валюті і не приймати замовлення там, де оплата неможлива. Ця ж адреса на льоту слугує ще двом цілям: обмежити частоту запитів до сайту і закріпити за вами одну ціну, поки триває ціновий тест. Саму IP-адресу ми не зберігаємо.

## Навіщо

Дані народження потрібні для одного: розрахувати положення планет і написати за ними текст. Пошта і Telegram — щоб доставити документ або гороскоп і повідомити про готовність. Більше ні для чого: ми не розсилаємо рекламу, не продаємо і не передаємо дані третім особам для їхніх цілей.

## Cookie і реклама

Сайт ставить власні технічні cookie: вашу відповідь на питання про cookie (на рік), варіант цінового тесту (на 60 днів — щоб ціна не змінювалася від візиту до візиту) і назву рекламної кампанії, з якої ви прийшли (без ідентифікаторів, до закриття браузера). Відвідування ми рахуємо самі та через Cloudflare Web Analytics — без cookie.

Рекламні теги (Meta, Google, TikTok) завантажуються, лише якщо ви натиснули «Дозволити», і лише на сторінках без особистих даних: на головній, у документах і на порожній формі. На сторінках з картою, замовленням, оплатою, очікуванням документа та підпискою їх немає — туди не потрапляють ні дані народження, ні посилання на документ.

## Хто їх обробляє

Ми не робимо все самі. Обробка відбувається на серверах **Cloudflare** (хостинг, база даних, сховище документів). Оплату приймає **Stripe**: йому передаються адреса пошти, назва продукту і ціна — без даних народження; дані картки бачить лише Stripe. Текст розбору і гороскопа пише мовна модель: провайдеру моделі (**OpenRouter**, моделі Anthropic) передаються положення планет, аспекти й доми, ім'я, дата і час народження — за ними визначаються вік і повернення планет. Координати, місце народження, часовий пояс і пошта моделі не передаються. Листи надсилає **Resend**. Повідомлення в Telegram — **Telegram**, якщо ви самі обрали цей спосіб. Кожен із них пов'язаний з нами договором і обробляє дані лише за нашим дорученням.

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

_Version of 6 October 2026. Operator: coremind s. r. o., Vlčie hrdlo 1887/81, 821 07 Bratislava – Ružinov, Slovakia, company ID (IČO) 57 339 368, Commercial Register of the Municipal Court Bratislava III, section Sro, insert 194301/B. Contact: help@chronika.me._

## What we collect

To build a chart you enter a **date, time and place of birth**, a first name (optional) and a form of address. To deliver the document we need an **email address**; if you choose Telegram, the identifier of your chat. Compatibility takes two people's data; a child's chart takes the child's data, entered by a parent or guardian. A horoscope subscription takes birth data and an email address.

We derive your country from your IP address automatically — to show prices in your currency and to take no orders where payment is impossible. The same address serves two more purposes on the fly: limiting how often the site can be called, and keeping one price for you while a price test runs. The IP address itself is not stored.

## Why

Birth data serves one purpose: computing the positions of the planets and writing a text from them. Email and Telegram exist to deliver the document or the horoscope and tell you it is ready. Nothing else: no marketing, no sale or transfer of data to third parties for their own purposes.

## Cookies and advertising

The site sets its own technical cookies: your answer to the cookie question (for a year), which variant of a price test you are shown (for 60 days, so the price does not change from visit to visit), and the name of the advertising campaign that brought you (no identifiers, until the browser is closed). We count visits ourselves and with Cloudflare Web Analytics, without cookies.

Advertising tags (Meta, Google, TikTok) load only if you pressed "Allow", and only on pages without personal data: the home page, the documents and the empty form. Pages with your chart, your order, the payment, the waiting screen and your subscription carry none — neither birth data nor document links reach them.

## Who processes it

We do not do everything ourselves. Processing runs on **Cloudflare** (hosting, database, document storage). Payments are taken by **Stripe**, which receives your email address, the product name and the price — no birth data; only Stripe sees your card details. The reading and the horoscope are written by a language model: the model provider (**OpenRouter**, Anthropic models) receives the planetary positions, aspects and houses, your first name, and the date and time of birth — ages and planetary returns are read from them. Coordinates, the place of birth, the time zone and your email are not sent to the model. Letters are sent by **Resend**. Telegram messages by **Telegram**, only if you chose that channel. Each is bound to us by contract and processes data on our instructions alone.

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
};
