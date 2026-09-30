import { forecastYears } from '@/components/Landing';
import { INDEXABLE, PRICE, SELLER, SITE_URL } from '@/lib/seo';
import ru from '../../../messages/ru.json';

/* Read at request time, not at build time: the switch that opens the site lives in the worker's
   environment, and a file baked during the build would keep whatever it said that day. */
export const dynamic = 'force-dynamic';

/** llms.txt — the site, in the form an answer engine can quote.
 *
 * A model asked "где сделать натальную карту с расшифровкой" does not read our CSS; it reads
 * whatever plain statement of the facts it can find. This is that statement, in the language the
 * site is sold in, built from the same catalogue the pages are built from, so the two cannot
 * drift apart. The convention is a growing one rather than a standard — it costs one route and
 * several crawlers read it already.
 */

/** The catalogue is written for the pages, where the years are filled in as the page is built.
 * Here they have to be filled in by hand — the same years, from the same clock. */
const fill = (text: string): string => {
  const years = forecastYears() as unknown as Record<string, number>;
  return text.replace(/\{(from|next|year)\}/g, (_, key: string) => String(years[key] ?? ''));
};

const faq = ru.landing.faq.items.map((item) => `### ${item.q}\n${fill(item.a)}`).join('\n\n');
const inside = ru.landing.inside.cards
  .map((card) => `- ${card.title}: ${fill(card.text)}`)
  .join('\n');
const honest = ru.landing.honest.items
  .map((item) => `- ${item.title}: ${fill(item.text)}`)
  .join('\n');
const asks = ru.landing.asks.items.map((item) => `- ${fill(item)}`).join('\n');

const text = () => `# Chronika

> Личный разбор натальной карты с прогнозом по датам, в виде PDF. Одна оплата, без подписки.
> ${PRICE.low}–${PRICE.high} ${PRICE.currency} в зависимости от региона и текущего ценового теста.
> Язык сайта и документа — русский.

Chronika строит натальную карту по дате, времени и месту рождения и превращает её в документ на
35 страниц: кто вы по карте, отношения, работа и деньги, помесячный прогноз и страница точных дат
в конце. Карта считается по астрономическим эфемеридам (Swiss Ephemeris); текст пишет языковая
модель по методике, которую составили астрологи Chronika, и каждый абзац опирается на конкретную
позицию или аспект именно этой карты.

Сначала бесплатно строится превью — без регистрации и без банковской карты: колесо карты,
позиции планет и первые страницы разбора. Оплата нужна, только если читатель хочет продолжение.

## С какими вопросами приходят
${asks}

## Что внутри документа
${inside}

## Как это работает
1. Ввести дату, время и город рождения. Без времени карта строится без домов и Асцендента.
2. Карта и первые страницы разбора появляются примерно через минуту, бесплатно.
3. После оплаты полный PDF приходит на почту за 20–30 минут.

## Честно о методе
${honest}

## Страницы
- Главная: ${SITE_URL}/ru
- Публичная оферта: ${SITE_URL}/ru/legal/terms
- Политика конфиденциальности: ${SITE_URL}/ru/legal/privacy
- Возврат средств: ${SITE_URL}/ru/legal/refunds

Есть также гороскоп по той же карте с доставкой на почту или в Telegram, раз в неделю или раз в
месяц; его предлагают после бесплатного превью.

## Продавец
${SELLER.legalName}, ${SELLER.street}, ${SELLER.postalCode} ${SELLER.city}, Словакия.
${SELLER.registration}. Связь: ${SELLER.email}.

## Вопросы и ответы
${faq}

## Чего Chronika не делает
Не предсказывает события, не называет даты смерти, болезни или беременности и не даёт
медицинских, психологических или финансовых советов. Разбор носит развлекательно-познавательный
характер.
`;

export async function GET() {
  return new Response(INDEXABLE ? text() : '# Chronika\n\nПока закрыто.\n', {
    headers: {
      'content-type': 'text/plain; charset=utf-8',
      'cache-control': 'public, max-age=3600',
      'x-robots-tag': INDEXABLE ? 'all' : 'noindex',
    },
  });
}
