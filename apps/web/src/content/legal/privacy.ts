/* Privacy policy. Drafts: the facts about data handling are true to the code; the fields in
   square brackets are the owner's to fill before the payment flow opens. */

export const privacy: Record<string, string> = {
  ru: `
# Политика обработки данных

_Редакция от [дата]. Оператор: [название и форма юрлица], [адрес], [регистрационный номер]. Связь: help@chronika.me._

## Какие данные мы получаем

Чтобы построить карту, вы вводите **дату, время и место рождения**, имя (необязательно) и форму обращения. Для доставки документа — **адрес электронной почты**; если вы выбираете получение в Telegram — идентификатор вашего чата. Для совместимости вводятся данные двух человек; для детской карты — данные ребёнка, которые вводит родитель или опекун.

Автоматически мы получаем страну по IP-адресу — только чтобы показать цену в вашей валюте и выбрать язык. Сам IP-адрес мы не сохраняем. Файлы cookie для слежения не используются; есть только технические, нужные для работы сайта.

## Зачем

Данные рождения нужны для одного: рассчитать положение планет и написать по ним текст. Почта и Telegram — чтобы доставить документ и сообщить о готовности. Больше ни для чего: мы не рассылаем рекламу, не продаём и не передаём данные третьим лицам для их целей.

## Кто их обрабатывает

Мы не делаем всё сами. Обработка происходит на серверах **Cloudflare** (хостинг, база данных, хранилище документов). Текст разбора пишет языковая модель: положения планет, аспекты и ваше имя передаются провайдеру модели (**OpenRouter**, модели Anthropic) — без почты, без координат и без адреса. Письма отправляет **Resend**. Сообщения в Telegram — **Telegram**, если вы сами выбрали этот способ. Каждый из них связан с нами договором и обрабатывает данные только по нашему поручению.

## Как храним и сколько

Данные рождения шифруются (AES-256-GCM) до того, как попадают в базу, и расшифровываются только на время расчёта. Готовый документ и данные рождения **удаляются через 30 дней** после заказа — вместе со ссылкой на скачивание. Запись о заказе (что куплено, когда, за сколько) хранится столько, сколько требует бухгалтерский и налоговый учёт.

Бесплатное превью хранится обезличенно: по данным рождения без имени, чтобы не считать одну и ту же карту дважды.

## Ваши права

Вы можете запросить копию своих данных, их исправление или удаление раньше срока — напишите на help@chronika.me с адреса, на который оформлялся заказ. Удаление данных рождения означает, что документ станет недоступен. Если вы считаете, что мы обрабатываем данные неправильно, вы вправе обратиться в надзорный орган по защите данных вашей страны.

## Дети

Детская карта строится по данным ребёнка, которые вводит взрослый. Мы не заключаем договор с ребёнком и не связываемся с ним. Сервис не предназначен для самостоятельного использования лицами младше 18 лет.

## Изменения

Если политика изменится, новая редакция появится на этой странице с новой датой. Существенные изменения мы сообщим на почту, если у нас есть действующий заказ с вашим адресом.
`,
  uk: `
# Політика обробки даних

_Редакція від [дата]. Оператор: [назва та форма юрособи], [адреса], [реєстраційний номер]. Зв'язок: help@chronika.me._

## Які дані ми отримуємо

Щоб побудувати карту, ви вводите **дату, час і місце народження**, ім'я (необов'язково) та форму звертання. Для доставки документа — **адресу електронної пошти**; якщо ви обираєте отримання в Telegram — ідентифікатор вашого чату. Для сумісності вводяться дані двох людей; для дитячої карти — дані дитини, які вводить батько, мати або опікун.

Автоматично ми отримуємо країну за IP-адресою — лише щоб показати ціну у вашій валюті та обрати мову. Саму IP-адресу ми не зберігаємо. Файли cookie для стеження не використовуються; є лише технічні, потрібні для роботи сайту.

## Навіщо

Дані народження потрібні для одного: розрахувати положення планет і написати за ними текст. Пошта і Telegram — щоб доставити документ і повідомити про готовність. Більше ні для чого: ми не розсилаємо рекламу, не продаємо і не передаємо дані третім особам для їхніх цілей.

## Хто їх обробляє

Ми не робимо все самі. Обробка відбувається на серверах **Cloudflare** (хостинг, база даних, сховище документів). Текст розбору пише мовна модель: положення планет, аспекти і ваше ім'я передаються провайдеру моделі (**OpenRouter**, моделі Anthropic) — без пошти, без координат і без адреси. Листи надсилає **Resend**. Повідомлення в Telegram — **Telegram**, якщо ви самі обрали цей спосіб. Кожен із них пов'язаний з нами договором і обробляє дані лише за нашим дорученням.

## Як зберігаємо і скільки

Дані народження шифруються (AES-256-GCM) до того, як потрапляють у базу, і розшифровуються лише на час розрахунку. Готовий документ і дані народження **видаляються через 30 днів** після замовлення — разом із посиланням на завантаження. Запис про замовлення (що куплено, коли, за скільки) зберігається стільки, скільки вимагає бухгалтерський і податковий облік.

Безкоштовне прев'ю зберігається знеособлено: за даними народження без імені, щоб не рахувати одну й ту саму карту двічі.

## Ваші права

Ви можете запросити копію своїх даних, їх виправлення або видалення раніше строку — напишіть на help@chronika.me з адреси, на яку оформлювалося замовлення. Видалення даних народження означає, що документ стане недоступним. Якщо ви вважаєте, що ми обробляємо дані неправильно, ви маєте право звернутися до наглядового органу із захисту даних вашої країни.

## Діти

Дитяча карта будується за даними дитини, які вводить дорослий. Ми не укладаємо договір з дитиною і не зв'язуємося з нею. Сервіс не призначений для самостійного використання особами, молодшими за 18 років.

## Зміни

Якщо політика зміниться, нова редакція з'явиться на цій сторінці з новою датою. Про суттєві зміни ми повідомимо на пошту, якщо маємо чинне замовлення з вашою адресою.
`,
  en: `
# Privacy policy

_Version of [date]. Operator: [legal name and form], [address], [registration number]. Contact: help@chronika.me._

## What we collect

To build a chart you enter a **date, time and place of birth**, a first name (optional) and a form of address. To deliver the document we need an **email address**; if you choose Telegram, the identifier of your chat. Compatibility takes two people's data; a child's chart takes the child's data, entered by a parent or guardian.

We derive your country from your IP address automatically — only to show prices in your currency and pick a language. The IP address itself is not stored. There are no tracking cookies; only the technical ones the site needs to work.

## Why

Birth data serves one purpose: computing the positions of the planets and writing a text from them. Email and Telegram exist to deliver the document and tell you it is ready. Nothing else: no marketing, no sale or transfer of data to third parties for their own purposes.

## Who processes it

We do not do everything ourselves. Processing runs on **Cloudflare** (hosting, database, document storage). The reading is written by a language model: planetary positions, aspects and your first name go to the model provider (**OpenRouter**, Anthropic models) — without your email, coordinates or address. Letters are sent by **Resend**. Telegram messages by **Telegram**, only if you chose that channel. Each is bound to us by contract and processes data on our instructions alone.

## How long we keep it

Birth data is encrypted (AES-256-GCM) before it reaches the database and decrypted only for the calculation. The finished document and the birth data are **deleted 30 days** after the order, together with the download link. The order record (what was bought, when, for how much) is kept as long as accounting and tax law require.

The free preview is stored without a name, keyed by the birth data alone, so the same chart is not computed twice.

## Your rights

You can ask for a copy of your data, a correction, or deletion before the deadline — write to help@chronika.me from the address used for the order. Deleting birth data makes the document unavailable. If you believe we handle your data wrongly, you may complain to the data-protection authority of your country.

## Children

A child's chart is built from the child's data entered by an adult. We do not contract with or contact the child. The service is not meant for independent use by anyone under 18.

## Changes

If this policy changes, the new version appears here with a new date. We will email you about material changes if we hold a current order with your address.
`,
};
