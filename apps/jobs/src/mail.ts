import { sellerLine, WITHDRAWAL_HEADINGS, withdrawalConsent, withdrawalInfo } from './contract';
import type { Product } from './db';
import type { Env } from './env';
import { errorCode, UpstreamError } from './errors';
import { productName } from './stripe';

/** The one email the pipeline sends: the document is ready, here is the link.
 *
 * Resend over HTTPS — no SMTP from a Worker, and no SDK for one POST. The address the letter
 * comes from is fixed here rather than configured: the domain is ours and nothing else should
 * ever write from it. */

const FROM = 'Chronika <noreply@chronika.me>';
const ENDPOINT = 'https://api.resend.com/emails';

interface Copy {
  subject: string;
  ready: string;
  open: string;
  keeps: string;
  sign: string;
  /** The horoscope letter: the window, the management link, the way out. */
  window: string;
  manage: string;
  unsubscribe: string;
}

const COPY: Record<string, Copy> = {
  uk: {
    subject: 'Ваш розбір готовий',
    ready: 'Документ зібрано. Він відкривається за посиланням нижче.',
    open: 'Відкрити розбір',
    keeps: 'Посилання працює тридцять днів; після цього документ і дані народження видаляються.',
    sign: 'Chronika · chronika.me',
    window: 'Гороскоп на',
    manage: 'Керувати підпискою',
    unsubscribe: 'Ви отримали цей лист, бо підписалися на гороскопи Chronika. Відписатися або змінити періодичність можна за посиланням вище.',
  },
  ru: {
    subject: 'Ваш разбор готов',
    ready: 'Документ собран. Он открывается по ссылке ниже.',
    open: 'Открыть разбор',
    keeps: 'Ссылка работает тридцать дней; после этого документ и данные рождения удаляются.',
    sign: 'Chronika · chronika.me',
    window: 'Гороскоп на',
    manage: 'Управлять подпиской',
    unsubscribe: 'Вы получили это письмо, потому что подписались на гороскопы Chronika. Отписаться или изменить периодичность можно по ссылке выше.',
  },
  en: {
    subject: 'Your reading is ready',
    ready: 'The document is finished. It opens at the link below.',
    open: 'Open the reading',
    keeps: 'The link works for thirty days; after that the document and the birth data are deleted.',
    sign: 'Chronika · chronika.me',
    window: 'Horoscope for',
    manage: 'Manage subscription',
    unsubscribe: 'You are receiving this because you subscribed to Chronika horoscopes. Unsubscribe or change the cadence at the link above.',
  },
  de: {
    subject: 'Ihre Deutung ist fertig',
    ready: 'Das Dokument ist fertig. Sie öffnen es über den Link unten.',
    open: 'Deutung öffnen',
    keeps: 'Der Link gilt dreißig Tage; danach werden das Dokument und die Geburtsdaten gelöscht.',
    sign: 'Chronika · chronika.me',
    window: 'Horoskop für',
    manage: 'Abo verwalten',
    unsubscribe: 'Sie erhalten diese E-Mail, weil Sie die Horoskope von Chronika abonniert haben. Abbestellen oder den Rhythmus ändern können Sie über den Link oben.',
  },
};

const escape = (text: string) =>
  text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

function html(copy: Copy, link: string): string {
  // One column, one button, system fonts: it has to read the same in Gmail, Outlook and a
  // Telegram preview, and none of them agree on anything more ambitious.
  return `<!doctype html><html><body style="margin:0;padding:32px 16px;background:#06091a;color:#f4f1e8;font-family:-apple-system,Segoe UI,Roboto,sans-serif;">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr><td align="center">
<table role="presentation" width="480" cellspacing="0" cellpadding="0" style="max-width:480px;width:100%;">
<tr><td style="padding:0 0 24px 0;font-size:13px;letter-spacing:0.18em;color:#e7b75c;">CHRONIKA</td></tr>
<tr><td style="font-size:24px;line-height:1.3;font-weight:500;padding-bottom:16px;">${escape(copy.subject)}</td></tr>
<tr><td style="font-size:16px;line-height:1.55;color:#aeb2c8;padding-bottom:28px;">${escape(copy.ready)}</td></tr>
<tr><td style="padding-bottom:28px;"><a href="${escape(link)}" style="display:inline-block;background:#e7b75c;color:#1a1204;text-decoration:none;font-weight:600;font-size:16px;padding:14px 26px;border-radius:12px;">${escape(copy.open)}</a></td></tr>
<tr><td style="font-size:13px;line-height:1.5;color:#767b99;padding-bottom:24px;">${escape(copy.keeps)}</td></tr>
<tr><td style="font-size:13px;color:#767b99;border-top:1px solid rgba(255,255,255,0.1);padding-top:16px;">${escape(copy.sign)}</td></tr>
</table></td></tr></table></body></html>`;
}

export interface Sent {
  status: 'sent' | 'skipped';
  providerId: string | null;
}

interface Letter {
  to: string;
  subject: string;
  html: string;
  text: string;
  headers?: Record<string, string>;
}

/** The one door every letter leaves through. Callers check the provider key first. An address
 * the retention sweep has erased is an empty string: there is nobody to write to, so nothing is
 * sent. */
async function deliver(env: Env, letter: Letter): Promise<Sent> {
  if (!letter.to.includes('@')) return { status: 'skipped', providerId: null };
  const response = await fetch(ENDPOINT, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${env.RESEND_API_KEY}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      from: FROM,
      to: [letter.to],
      subject: letter.subject,
      html: letter.html,
      text: letter.text,
      headers: letter.headers,
    }),
  });
  if (!response.ok) {
    // The status tells a bad key from an outage; the body can quote the recipient back, so it is
    // neither logged nor passed on.
    console.error('resend', response.status);
    throw new UpstreamError('resend', response.status);
  }
  const data = (await response.json()) as { id?: string };
  return { status: 'sent', providerId: data.id ?? null };
}

/** Sends the ready letter, or reports that it could not because no provider is configured.
 * Any other failure throws: the pipeline records the step and the queue retries it. */
export async function sendReady(
  env: Env,
  to: string,
  locale: string,
  link: string,
): Promise<Sent> {
  if (!env.RESEND_API_KEY) return { status: 'skipped', providerId: null };
  const copy = COPY[locale] ?? COPY.en;
  if (!copy) return { status: 'skipped', providerId: null };

  return deliver(env, {
    to,
    subject: copy.subject,
    html: html(copy, link),
    text: `${copy.ready}\n\n${link}\n\n${copy.keeps}\n\n${copy.sign}`,
  });
}

/** The languages of the Chronika Pro letters: the cabinet's two. */
export type ProLetterLang = 'ru' | 'uk';

/** The sign-in letter for Chronika Pro. */
const LOGIN_COPY: Record<ProLetterLang, Copy> = {
  ru: {
    subject: 'Вход в Chronika Pro',
    ready: 'Нажмите кнопку, чтобы войти в кабинет. Ссылка действует 15 минут и срабатывает один раз.',
    open: 'Войти в кабинет',
    keeps: 'Если вы не запрашивали вход, просто проигнорируйте это письмо — без ссылки в кабинет не попасть.',
    sign: 'Chronika Pro · pro.chronika.me',
    window: '',
    manage: '',
    unsubscribe: '',
  },
  uk: {
    subject: 'Вхід до Chronika Pro',
    ready: 'Натисніть кнопку, щоб увійти до кабінету. Посилання діє 15 хвилин і спрацьовує один раз.',
    open: 'Увійти до кабінету',
    keeps: 'Якщо ви не намагалися увійти, просто проігноруйте цей лист — без посилання до кабінету не потрапити.',
    sign: 'Chronika Pro · pro.chronika.me',
    window: '',
    manage: '',
    unsubscribe: '',
  },
};

/** Local development only: with MAIL_LOG_LINKS=1 the link a letter carries is also written to the
 * log, so a sign-in can be finished without a mailbox. A link is a key to an account or a
 * subscription, so this is never on anywhere else. */
function logLink(env: Env, what: string, link: string): void {
  if (env.MAIL_LOG_LINKS === '1') console.log(`${what} (MAIL_LOG_LINKS):`, link);
}

export async function sendLoginLink(env: Env, to: string, link: string, lang: ProLetterLang): Promise<Sent> {
  logLink(env, 'pro sign-in link', link);
  if (!env.RESEND_API_KEY) return { status: 'skipped', providerId: null };
  const copy = LOGIN_COPY[lang];
  return deliver(env, {
    to,
    subject: copy.subject,
    html: html(copy, link),
    text: `${copy.ready}\n\n${link}\n\n${copy.keeps}\n\n${copy.sign}`,
  });
}

/** The letter that confirms a new seller's address. */
const SIGNUP_COPY: Record<ProLetterLang, Copy> = {
  ru: {
    subject: 'Подтвердите почту для Chronika Pro',
    ready: 'Чтобы открыть кабинет, подтвердите адрес по ссылке ниже. Ссылка действует 15 минут.',
    open: 'Подтвердить и войти',
    keeps: 'Если вы не регистрировались, просто удалите это письмо',
    sign: 'Chronika Pro · pro.chronika.me',
    window: '',
    manage: '',
    unsubscribe: '',
  },
  uk: {
    subject: 'Підтвердіть пошту для Chronika Pro',
    ready: 'Щоб відкрити кабінет, підтвердіть адресу за посиланням нижче. Посилання діє 15 хвилин.',
    open: 'Підтвердити й увійти',
    keeps: 'Якщо ви не реєструвалися, просто видаліть цей лист',
    sign: 'Chronika Pro · pro.chronika.me',
    window: '',
    manage: '',
    unsubscribe: '',
  },
};

export async function sendSignupLink(env: Env, to: string, link: string, lang: ProLetterLang): Promise<Sent> {
  logLink(env, 'pro sign-up link', link);
  if (!env.RESEND_API_KEY) return { status: 'skipped', providerId: null };
  const copy = SIGNUP_COPY[lang];
  return deliver(env, {
    to,
    subject: copy.subject,
    html: html(copy, link),
    text: `${copy.ready}\n\n${link}\n\n${copy.keeps}\n\n${copy.sign}`,
  });
}

export interface HoroscopeLetter {
  title: string;
  text: string;
  start: string;
  end: string;
  manage: string;
  /** Where a mail client's one-click unsubscribe POSTs: it cancels the subscription. */
  unsubscribe: string;
}

const dmy = (iso: string) => iso.split('-').reverse().join('.');

function horoscopeHtml(copy: Copy, letter: HoroscopeLetter): string {
  const paragraphs = letter.text
    .split(/\n\s*\n/)
    .map((p) => `<p style="margin:0 0 18px 0;font-size:17px;line-height:1.6;color:#f4f1e8;">${escape(p.trim())}</p>`)
    .join('');
  return `<!doctype html><html><body style="margin:0;padding:32px 16px;background:#06091a;color:#f4f1e8;font-family:Georgia,'Times New Roman',serif;">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr><td align="center">
<table role="presentation" width="560" cellspacing="0" cellpadding="0" style="max-width:560px;width:100%;">
<tr><td style="padding:0 0 24px 0;font-size:13px;letter-spacing:0.18em;color:#e7b75c;font-family:-apple-system,Segoe UI,Roboto,sans-serif;">CHRONIKA</td></tr>
<tr><td style="font-size:13px;letter-spacing:0.12em;text-transform:uppercase;color:#aeb2c8;font-family:-apple-system,Segoe UI,Roboto,sans-serif;padding-bottom:10px;">${escape(copy.window)} ${escape(dmy(letter.start))} — ${escape(dmy(letter.end))}</td></tr>
<tr><td style="font-size:26px;line-height:1.3;font-weight:500;padding-bottom:22px;">${escape(letter.title)}</td></tr>
<tr><td>${paragraphs}</td></tr>
<tr><td style="padding:14px 0 26px 0;"><a href="${escape(letter.manage)}" style="display:inline-block;border:1px solid rgba(255,255,255,0.2);color:#f4f1e8;text-decoration:none;font-size:14px;padding:10px 18px;border-radius:999px;font-family:-apple-system,Segoe UI,Roboto,sans-serif;">${escape(copy.manage)}</a></td></tr>
<tr><td style="font-size:12px;line-height:1.5;color:#767b99;border-top:1px solid rgba(255,255,255,0.1);padding-top:16px;font-family:-apple-system,Segoe UI,Roboto,sans-serif;">${escape(copy.unsubscribe)}<br>${escape(copy.sign)}</td></tr>
</table></td></tr></table></body></html>`;
}

/** The horoscope itself, as a letter. */
export async function sendHoroscope(
  env: Env,
  to: string,
  locale: string,
  letter: HoroscopeLetter,
): Promise<Sent> {
  if (!env.RESEND_API_KEY) return { status: 'skipped', providerId: null };
  const copy = COPY[locale] ?? COPY.en;
  if (!copy) return { status: 'skipped', providerId: null };
  return deliver(env, {
    to,
    subject: `${letter.title} · ${dmy(letter.start)} — ${dmy(letter.end)}`,
    html: horoscopeHtml(copy, letter),
    text: `${letter.title}\n${copy.window} ${dmy(letter.start)} — ${dmy(letter.end)}\n\n${letter.text}\n\n${copy.manage}: ${letter.manage}\n\n${copy.unsubscribe}`,
    // One-click unsubscribe (RFC 8058): the mail client POSTs to the link itself, and that cancels.
    // Without the Post header Gmail's «Отписаться» only opens a page and nothing is cancelled.
    headers: {
      'List-Unsubscribe': `<${letter.unsubscribe}>`,
      'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
    },
  });
}

/** A letter of one button, in the subscriber's language. */
const simple = (subject: string, ready: string, open: string, keeps: string): Copy => ({
  subject,
  ready,
  open,
  keeps,
  sign: 'Chronika · chronika.me',
  window: '',
  manage: '',
  unsubscribe: '',
});

/** A letter of several parts — the confirmation of a contract, the receipt of a withdrawal — in
 * the same dress as the others: a heading, then short labelled lines and paragraphs. */
interface Part {
  heading?: string;
  lines?: [string, string][];
  paragraphs?: string[];
}

function partsHtml(title: string, parts: Part[], sign: string): string {
  const body = parts
    .map((part) => {
      const heading = part.heading
        ? `<tr><td style="font-size:15px;font-weight:600;color:#f4f1e8;padding:8px 0 8px 0;">${escape(part.heading)}</td></tr>`
        : '';
      const lines = (part.lines ?? [])
        .map(
          ([label, value]) =>
            `<tr><td style="font-size:14px;line-height:1.5;color:#aeb2c8;padding-bottom:4px;"><span style="color:#767b99;">${escape(label)}:</span> ${escape(value)}</td></tr>`,
        )
        .join('');
      const paragraphs = (part.paragraphs ?? [])
        .map((text) =>
          WITHDRAWAL_HEADINGS.has(text)
            ? `<tr><td style="font-size:14px;font-weight:600;color:#f4f1e8;padding:10px 0 4px 0;">${escape(text)}</td></tr>`
            : `<tr><td style="font-size:14px;line-height:1.55;color:#aeb2c8;padding-bottom:10px;">${escape(text)}</td></tr>`,
        )
        .join('');
      return `${heading}${lines}${paragraphs}<tr><td style="padding-bottom:16px;"></td></tr>`;
    })
    .join('');
  return `<!doctype html><html><body style="margin:0;padding:32px 16px;background:#06091a;color:#f4f1e8;font-family:-apple-system,Segoe UI,Roboto,sans-serif;">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr><td align="center">
<table role="presentation" width="520" cellspacing="0" cellpadding="0" style="max-width:520px;width:100%;">
<tr><td style="padding:0 0 24px 0;font-size:13px;letter-spacing:0.18em;color:#e7b75c;">CHRONIKA</td></tr>
<tr><td style="font-size:22px;line-height:1.3;font-weight:500;padding-bottom:16px;">${escape(title)}</td></tr>
${body}
<tr><td style="font-size:13px;color:#767b99;border-top:1px solid rgba(255,255,255,0.1);padding-top:16px;">${escape(sign)}</td></tr>
</table></td></tr></table></body></html>`;
}

function partsText(title: string, parts: Part[], sign: string): string {
  const out = [title, ''];
  for (const part of parts) {
    if (part.heading) out.push(part.heading.toUpperCase());
    for (const [label, value] of part.lines ?? []) out.push(`${label}: ${value}`);
    for (const text of part.paragraphs ?? []) out.push(text, '');
    out.push('');
  }
  out.push(sign);
  return out.join('\n').replace(/\n{3,}/g, '\n\n');
}

const when = (iso: string, locale: string): string =>
  new Intl.DateTimeFormat(locale, {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Europe/Berlin',
    timeZoneName: 'short',
  }).format(new Date(iso));

const money = (amountMinor: number, currency: string, locale: string): string =>
  new Intl.NumberFormat(locale, { style: 'currency', currency, minimumFractionDigits: 0 }).format(
    amountMinor / 100,
  );

interface ConfirmationCopy {
  subject: string;
  intro: string;
  order: string;
  date: string;
  product: string;
  description: string;
  price: string;
  seller: string;
  consentTitle: string;
  consentIntro: string;
  started: string;
  withdrawalTitle: string;
  button: string;
  documents: string;
}

const CONFIRMATION: Record<string, ConfirmationCopy> = {
  ru: {
    subject: 'Подтверждение заказа',
    intro: 'Спасибо за заказ. Этим письмом мы подтверждаем договор; сохраните его.',
    order: 'Номер заказа',
    date: 'Дата оплаты',
    product: 'Продукт',
    description: 'личный разбор в PDF, около 35 страниц, ссылка на почту',
    price: 'Цена',
    seller: 'Исполнитель',
    consentTitle: 'Ваше согласие',
    consentIntro: 'Перед оплатой вы подтвердили:',
    started: 'Создание документа началось сразу после оплаты; ссылка придёт отдельным письмом через 10–20 минут.',
    withdrawalTitle: 'Право отказаться от покупки',
    button: 'Отказаться от договора можно и кнопкой «Отказаться от договора» на сайте:',
    documents: 'Условия и правила возврата:',
  },
  uk: {
    subject: 'Підтвердження замовлення',
    intro: 'Дякуємо за замовлення. Цим листом ми підтверджуємо договір; збережіть його.',
    order: 'Номер замовлення',
    date: 'Дата оплати',
    product: 'Продукт',
    description: 'особистий розбір у PDF, близько 35 сторінок, посилання на пошту',
    price: 'Ціна',
    seller: 'Виконавець',
    consentTitle: 'Ваша згода',
    consentIntro: 'Перед оплатою ви підтвердили:',
    started: 'Створення документа почалося одразу після оплати; посилання прийде окремим листом за 10–20 хвилин.',
    withdrawalTitle: 'Право відмовитися від покупки',
    button: 'Відмовитися від договору можна й кнопкою «Відмовитися від договору» на сайті:',
    documents: 'Умови та правила повернення:',
  },
  en: {
    subject: 'Your order: confirmation',
    intro: 'Thank you for your order. This letter confirms the contract; please keep it.',
    order: 'Order number',
    date: 'Paid on',
    product: 'Product',
    description: 'a personal reading as a PDF, about 35 pages, sent as a link by email',
    price: 'Price',
    seller: 'Seller',
    consentTitle: 'Your consent',
    consentIntro: 'Before paying, you confirmed:',
    started: 'We began creating the document right after payment; the link follows in a separate letter within 10–20 minutes.',
    withdrawalTitle: 'Right of withdrawal',
    button: 'You can also withdraw with the "Withdraw from the contract" button on the site:',
    documents: 'Terms and refund policy:',
  },
  de: {
    subject: 'Bestellbestätigung',
    intro: 'Vielen Dank für Ihre Bestellung. Mit dieser E-Mail bestätigen wir den Vertrag; bitte bewahren Sie sie auf.',
    order: 'Bestellnummer',
    date: 'Bezahlt am',
    product: 'Produkt',
    description: 'persönliche Deutung als PDF, etwa 35 Seiten, Link per E-Mail',
    price: 'Preis (inkl. MwSt.)',
    seller: 'Anbieter',
    consentTitle: 'Ihre Zustimmung',
    consentIntro: 'Vor der Zahlung haben Sie Folgendes erklärt:',
    started: 'Mit der Erstellung des Dokuments haben wir unmittelbar nach der Zahlung begonnen; den Link erhalten Sie in 10–20 Minuten in einer eigenen E-Mail.',
    withdrawalTitle: 'Widerrufsbelehrung',
    button: 'Den Widerruf können Sie auch über die Schaltfläche „Vertrag widerrufen“ auf unserer Website erklären:',
    documents: 'AGB und Widerrufsbelehrung:',
  },
};

export interface ConfirmationInput {
  orderId: string;
  product: Product;
  locale: string;
  amountMinor: number;
  currency: string;
  paidAt: string;
}

/** The confirmation of the contract, sent the moment a payment settles and before the document is
 * written (see contract.ts): what was bought, for how much, from whom, the consent the buyer gave
 * and the withdrawal information — in the letter itself, a durable medium, not behind a link. */
export async function sendOrderConfirmation(env: Env, to: string, input: ConfirmationInput): Promise<Sent> {
  if (!env.RESEND_API_KEY) return { status: 'skipped', providerId: null };
  const locale = input.locale in CONFIRMATION ? input.locale : 'en';
  const copy = CONFIRMATION[locale] as ConfirmationCopy;
  const site = `${env.SITE_URL}/${input.locale}`;
  const parts: Part[] = [
    { paragraphs: [copy.intro] },
    {
      lines: [
        [copy.order, input.orderId],
        [copy.date, when(input.paidAt, locale)],
        [copy.product, `${productName(input.product, locale)} — ${copy.description}`],
        [copy.price, money(input.amountMinor, input.currency, locale)],
        [copy.seller, sellerLine(locale)],
      ],
    },
    {
      heading: copy.consentTitle,
      paragraphs: [`${copy.consentIntro} „${withdrawalConsent(locale)}“`, copy.started],
    },
    {
      heading: copy.withdrawalTitle,
      paragraphs: [
        ...withdrawalInfo(locale),
        `${copy.button} ${site}/withdraw`,
        `${copy.documents} ${site}/legal/terms · ${site}/legal/refunds`,
      ],
    },
  ];
  const sign = 'Chronika · chronika.me';
  return deliver(env, {
    to,
    subject: `${copy.subject} · ${input.orderId}`,
    html: partsHtml(copy.subject, parts, sign),
    text: partsText(copy.subject, parts, sign),
  });
}

interface ReceiptCopy {
  subject: string;
  intro: string;
  received: string;
  name: string;
  email: string;
  order: string;
  message: string;
  messageKept: string;
  next: string;
}

const RECEIPT: Record<string, ReceiptCopy> = {
  ru: {
    subject: 'Мы получили ваш отказ от договора',
    intro: 'Это подтверждение того, что ваше заявление об отказе от договора к нам поступило. Его текст:',
    received: 'Получено',
    name: 'Имя',
    email: 'Почта',
    order: 'Заказ',
    message: 'Сообщение',
    messageKept: 'получено, мы его прочитаем',
    next: 'Мы ответим в течение двух рабочих дней. Если вам положен возврат, деньги вернутся тем же способом, которым вы платили.',
  },
  uk: {
    subject: 'Ми отримали вашу відмову від договору',
    intro: 'Це підтвердження того, що ваша заява про відмову від договору до нас надійшла. Її текст:',
    received: 'Отримано',
    name: "Ім'я",
    email: 'Пошта',
    order: 'Замовлення',
    message: 'Повідомлення',
    messageKept: 'отримано, ми його прочитаємо',
    next: 'Ми відповімо протягом двох робочих днів. Якщо вам належить повернення, гроші повернуться тим самим способом, яким ви платили.',
  },
  en: {
    subject: 'We have received your withdrawal',
    intro: 'This confirms that your notice of withdrawal from the contract has reached us. It reads:',
    received: 'Received',
    name: 'Name',
    email: 'Email',
    order: 'Order',
    message: 'Message',
    messageKept: 'received; we will read it',
    next: 'We will reply within two working days. If a refund is due, it goes back the way you paid.',
  },
  de: {
    subject: 'Eingangsbestätigung Ihres Widerrufs',
    intro: 'Hiermit bestätigen wir den Eingang Ihrer Widerrufserklärung. Ihr Inhalt:',
    received: 'Eingegangen am',
    name: 'Name',
    email: 'E-Mail',
    order: 'Bestellung',
    message: 'Nachricht',
    messageKept: 'liegt uns vor; wir lesen sie',
    next: 'Wir melden uns innerhalb von zwei Werktagen. Steht Ihnen eine Rückzahlung zu, erfolgt sie über dasselbe Zahlungsmittel, mit dem Sie bezahlt haben.',
  },
};

export interface WithdrawalInput {
  locale: string;
  name: string;
  email: string;
  order: string;
  /** Whether the visitor wrote a message. Its words go to the owner, never back out in a letter
   * from us: the receipt is not a way to mail someone a text of a stranger's choosing. */
  hasMessage: boolean;
  receivedAt: string;
}

/** The receipt a withdrawal declared on the site is owed at once (§ 356a BGB): its content, and
 * the date and time it arrived, on a durable medium. */
export async function sendWithdrawalReceipt(env: Env, input: WithdrawalInput): Promise<Sent> {
  if (!env.RESEND_API_KEY) return { status: 'skipped', providerId: null };
  const locale = input.locale in RECEIPT ? input.locale : 'en';
  const copy = RECEIPT[locale] as ReceiptCopy;
  const lines: [string, string][] = [
    [copy.received, when(input.receivedAt, locale)],
    [copy.name, input.name],
    [copy.email, input.email],
  ];
  if (input.order) lines.push([copy.order, input.order]);
  if (input.hasMessage) lines.push([copy.message, copy.messageKept]);
  const parts: Part[] = [{ paragraphs: [copy.intro] }, { lines }, { paragraphs: [copy.next, sellerLine(locale)] }];
  const sign = 'Chronika · chronika.me';
  return deliver(env, {
    to: input.email,
    subject: copy.subject,
    html: partsHtml(copy.subject, parts, sign),
    text: partsText(copy.subject, parts, sign),
  });
}

/** The letter that confirms a horoscope subscription. Nothing is written or sent before it. */
const CONFIRM_COPY: Record<string, Copy> = {
  ru: simple(
    'Подтвердите подписку на гороскопы',
    'Нажмите кнопку, чтобы подтвердить подписку на гороскопы Chronika. Пока подписка не подтверждена, мы ничего не присылаем.',
    'Подтвердить подписку',
    'Ссылка действует 7 дней. Если вы не подписывались, просто не отвечайте на это письмо: данные удалятся сами.',
  ),
  uk: simple(
    'Підтвердіть підписку на гороскопи',
    'Натисніть кнопку, щоб підтвердити підписку на гороскопи Chronika. Поки підписку не підтверджено, ми нічого не надсилаємо.',
    'Підтвердити підписку',
    'Посилання діє 7 днів. Якщо ви не підписувалися, просто не відповідайте на цей лист: дані видаляться самі.',
  ),
  en: simple(
    'Confirm your horoscope subscription',
    'Press the button to confirm your Chronika horoscope subscription. Nothing is sent until it is confirmed.',
    'Confirm subscription',
    'The link works for 7 days. If you did not subscribe, simply ignore this letter: the data is deleted on its own.',
  ),
  de: simple(
    'Bitte bestätigen Sie Ihr Horoskop-Abo',
    'Klicken Sie auf die Schaltfläche, um Ihr Abo der Horoskope von Chronika zu bestätigen. Solange es nicht bestätigt ist, senden wir nichts.',
    'Abo bestätigen',
    'Der Link gilt 7 Tage. Wenn Sie nichts abonniert haben, ignorieren Sie diese E-Mail einfach: Die Daten werden von selbst gelöscht.',
  ),
};

export async function sendSubscriptionConfirm(env: Env, to: string, locale: string, link: string): Promise<Sent> {
  logLink(env, 'subscription confirmation link', link);
  if (!env.RESEND_API_KEY) return { status: 'skipped', providerId: null };
  const copy = CONFIRM_COPY[locale] ?? CONFIRM_COPY.en;
  if (!copy) return { status: 'skipped', providerId: null };
  return deliver(env, {
    to,
    subject: copy.subject,
    html: html(copy, link),
    text: `${copy.ready}\n\n${link}\n\n${copy.keeps}\n\n${copy.sign}`,
  });
}

/** The one letter when the free month is over. No payment link: there is no paid plan yet. */
const TRIAL_ENDED_COPY: Record<string, Copy> = {
  ru: simple(
    'Бесплатный месяц закончился',
    'Бесплатный месяц гороскопов Chronika закончился, и новых гороскопов больше не будет. Платить ничего не нужно: подписка просто остановилась.',
    'Открыть подписку',
    'Через 30 дней данные подписки удалятся. Удалить их раньше можно на странице подписки.',
  ),
  uk: simple(
    'Безкоштовний місяць закінчився',
    'Безкоштовний місяць гороскопів Chronika закінчився, і нових гороскопів більше не буде. Платити нічого не потрібно: підписка просто зупинилася.',
    'Відкрити підписку',
    'Через 30 днів дані підписки видаляться. Видалити їх раніше можна на сторінці підписки.',
  ),
  en: simple(
    'Your free month has ended',
    'Your free month of Chronika horoscopes has ended, and no more horoscopes will come. There is nothing to pay: the subscription simply stopped.',
    'Open subscription',
    'The subscription data is deleted in 30 days. You can delete it sooner on the subscription page.',
  ),
  de: simple(
    'Ihr kostenloser Monat ist vorbei',
    'Ihr kostenloser Monat mit den Horoskopen von Chronika ist vorbei, weitere Horoskope kommen nicht. Sie müssen nichts bezahlen: Das Abo endet einfach.',
    'Abo öffnen',
    'Die Daten des Abos werden in 30 Tagen gelöscht. Auf der Seite des Abos können Sie sie schon früher löschen.',
  ),
};

export async function sendTrialEnded(env: Env, to: string, locale: string, manage: string): Promise<Sent> {
  if (!env.RESEND_API_KEY) return { status: 'skipped', providerId: null };
  const copy = TRIAL_ENDED_COPY[locale] ?? TRIAL_ENDED_COPY.en;
  if (!copy) return { status: 'skipped', providerId: null };
  return deliver(env, {
    to,
    subject: copy.subject,
    html: html(copy, manage),
    text: `${copy.ready}\n\n${copy.open}: ${manage}\n\n${copy.keeps}\n\n${copy.sign}`,
    headers: { 'List-Unsubscribe': `<${manage}>` },
  });
}

const DEFAULT_ALERT_EMAIL = 'help@chronika.me';

/** A note to the owner that something needs a person: a payment to refund, a dispute to answer, a
 * document that could not be made. Ids and status codes only, never a customer's data. Best
 * effort: an alert that cannot be sent is logged, and never stops the work that raised it. */
export async function sendAlert(env: Env, subject: string, text: string): Promise<void> {
  console.warn('alert', subject, text);
  if (!env.RESEND_API_KEY) return;
  try {
    await deliver(env, {
      to: env.ALERT_EMAIL || DEFAULT_ALERT_EMAIL,
      subject: `[Chronika] ${subject}`,
      html: `<!doctype html><html><body><pre style="white-space:pre-wrap;">${escape(text)}</pre></body></html>`,
      text,
    });
  } catch (error) {
    console.error('alert not sent', errorCode(error));
  }
}
