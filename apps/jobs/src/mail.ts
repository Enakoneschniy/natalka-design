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
}

const COPY: Record<string, Copy> = {
  uk: {
    subject: 'Ваш розбір готовий',
    ready: 'Документ зібрано. Він відкривається за посиланням нижче.',
    open: 'Відкрити розбір',
    keeps: 'Посилання працює тридцять днів; після цього документ і дані народження видаляються.',
    sign: 'Chronika · chronika.me',
  },
  ru: {
    subject: 'Ваш разбор готов',
    ready: 'Документ собран. Он открывается по ссылке ниже.',
    open: 'Открыть разбор',
    keeps: 'Ссылка работает тридцать дней; после этого документ и данные рождения удаляются.',
    sign: 'Chronika · chronika.me',
  },
  en: {
    subject: 'Your reading is ready',
    ready: 'The document is finished. It opens at the link below.',
    open: 'Open the reading',
    keeps: 'The link works for thirty days; after that the document and the birth data are deleted.',
    sign: 'Chronika · chronika.me',
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

  const response = await fetch(ENDPOINT, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${env.RESEND_API_KEY}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      from: FROM,
      to: [to],
      subject: copy.subject,
      html: html(copy, link),
      text: `${copy.ready}\n\n${link}\n\n${copy.keeps}\n\n${copy.sign}`,
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
