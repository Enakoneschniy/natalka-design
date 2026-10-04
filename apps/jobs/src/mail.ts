import type { Env } from './env';

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
};

const escape = (text: string) =>
  text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

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

/** The one door every letter leaves through. Callers check the provider key first. */
async function deliver(env: Env, letter: Letter): Promise<Sent> {
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
    // The body names the reason (bad key, unverified domain); the log gets it, the client does not.
    console.error('resend', response.status, (await response.text()).slice(0, 300));
    throw new Error(`mail provider answered ${response.status}`);
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

/** The sign-in letter for Chronika Pro. Russian only for the pilot. */
const LOGIN_COPY: Copy = {
  subject: 'Вход в Chronika Pro',
  ready: 'Нажмите кнопку, чтобы войти в кабинет. Ссылка действует 15 минут и срабатывает один раз.',
  open: 'Войти в кабинет',
  keeps: 'Если вы не запрашивали вход, просто проигнорируйте это письмо — без ссылки в кабинет не попасть.',
  sign: 'Chronika Pro · pro.chronika.me',
  window: '',
  manage: '',
  unsubscribe: '',
};

export async function sendLoginLink(env: Env, to: string, link: string): Promise<Sent> {
  if (!env.RESEND_API_KEY) {
    // Local development only: production always has the key, and without it nobody could sign in.
    console.log('pro sign-in link (no mail provider configured):', link);
    return { status: 'skipped', providerId: null };
  }
  return deliver(env, {
    to,
    subject: LOGIN_COPY.subject,
    html: html(LOGIN_COPY, link),
    text: `${LOGIN_COPY.ready}\n\n${link}\n\n${LOGIN_COPY.keeps}\n\n${LOGIN_COPY.sign}`,
  });
}

/** The letter that confirms a new seller's address. */
const SIGNUP_COPY: Copy = {
  subject: 'Подтвердите почту для Chronika Pro',
  ready: 'Чтобы открыть кабинет, подтвердите адрес по ссылке ниже. Ссылка действует 15 минут.',
  open: 'Подтвердить и войти',
  keeps: 'Если вы не регистрировались, просто удалите это письмо',
  sign: 'Chronika Pro · pro.chronika.me',
  window: '',
  manage: '',
  unsubscribe: '',
};

export async function sendSignupLink(env: Env, to: string, link: string): Promise<Sent> {
  if (!env.RESEND_API_KEY) {
    // Local development only: production always has the key, and without it nobody could register.
    console.log('pro sign-up link (no mail provider configured):', link);
    return { status: 'skipped', providerId: null };
  }
  return deliver(env, {
    to,
    subject: SIGNUP_COPY.subject,
    html: html(SIGNUP_COPY, link),
    text: `${SIGNUP_COPY.ready}\n\n${link}\n\n${SIGNUP_COPY.keeps}\n\n${SIGNUP_COPY.sign}`,
  });
}

export interface HoroscopeLetter {
  title: string;
  text: string;
  start: string;
  end: string;
  manage: string;
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
    headers: { 'List-Unsubscribe': `<${letter.manage}>` },
  });
}
