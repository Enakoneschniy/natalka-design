/* The Telegram bot: a second way to receive a finished document, and later the channel the
 * horoscopes arrive through.
 *
 * It holds exactly one secret, the bot token. Everything else — who ordered what, whether it is
 * ready, the PDF itself — is asked of the jobs worker over a service binding, so a leak here
 * exposes a chat bot and nothing behind it. */

import { WorkerEntrypoint } from 'cloudflare:workers';

/** What the jobs worker exposes over its binding (see apps/jobs, JobsInternal). Typed by hand:
 * the two workers do not share a build. */
interface JobsInternalStub {
  claimTelegram(code: string, chatId: number): Promise<Claim | null>;
  telegramDelivered(code: string): Promise<void>;
  forgetTelegram(chatId: number): Promise<void>;
  document(token: string): Promise<ArrayBuffer | null>;
}

interface Env {
  JOBS: JobsInternalStub;
  SITE_URL: string;
  TELEGRAM_BOT_TOKEN?: string;
}

interface Update {
  update_id: number;
  message?: {
    message_id: number;
    chat: { id: number; type: string };
    from?: { language_code?: string };
    text?: string;
  };
}

interface Claim {
  locale: string;
  ready: boolean;
  failed: boolean;
  token: string | null;
}

const COPY = {
  uk: {
    hello: 'Це Chronika. Щоб отримати документ сюди, відкрийте посилання «Отримати в Telegram» на сторінці свого замовлення.',
    unknown: 'Такого коду немає або посилання застаріло. Відкрийте сторінку замовлення ще раз і натисніть «Отримати в Telegram».',
    waiting: 'Розбір ще пишеться — зазвичай це десять–п’ятнадцять хвилин. Щойно документ буде готовий, я надішлю його сюди.',
    failed: 'З цим замовленням щось пішло не так. Ми бачимо помилку і повторимо генерацію; якщо за годину нічого не зміниться — напишіть на help@chronika.me.',
    here: 'Ваш розбір готовий.',
    caption: 'Chronika · документ зберігається тридцять днів',
    stopped: 'Гаразд, більше нічого сюди не надсилатиму.',
  },
  ru: {
    hello: 'Это Chronika. Чтобы получить документ сюда, откройте ссылку «Получить в Telegram» на странице своего заказа.',
    unknown: 'Такого кода нет или ссылка устарела. Откройте страницу заказа ещё раз и нажмите «Получить в Telegram».',
    waiting: 'Разбор ещё пишется — обычно это десять–пятнадцать минут. Как только документ будет готов, я пришлю его сюда.',
    failed: 'С этим заказом что-то пошло не так. Мы видим ошибку и повторим генерацию; если за час ничего не изменится — напишите на help@chronika.me.',
    here: 'Ваш разбор готов.',
    caption: 'Chronika · документ хранится тридцать дней',
    stopped: 'Хорошо, больше ничего сюда не пришлю.',
  },
  en: {
    hello: 'This is Chronika. To receive your document here, open the "Get it in Telegram" link on your order page.',
    unknown: 'No such code, or the link has expired. Open your order page again and tap "Get it in Telegram".',
    waiting: 'Your reading is still being written — usually ten to fifteen minutes. As soon as the document is ready I will send it here.',
    failed: 'Something went wrong with this order. We can see the error and will retry; if nothing changes within an hour, write to help@chronika.me.',
    here: 'Your reading is ready.',
    caption: 'Chronika · the document is kept for thirty days',
    stopped: 'All right, nothing more will be sent here.',
  },
} as const;

type Lang = keyof typeof COPY;
const lang = (code?: string | null): Lang => (code === 'uk' || code === 'ru' ? code : 'en');

/* Telegram authenticates its webhook calls with a secret we choose. Derived from the token rather
 * than stored as a second secret: it is only ever compared here. */
async function webhookSecret(token: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`${token}:webhook`));
  return [...new Uint8Array(digest)]
    .slice(0, 16)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

const api = (token: string, method: string) => `https://api.telegram.org/bot${token}/${method}`;

async function sendText(token: string, chatId: number, text: string): Promise<void> {
  const response = await fetch(api(token, 'sendMessage'), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text }),
  });
  if (!response.ok) throw new Error(`sendMessage ${response.status}`);
}

async function sendDocument(
  token: string,
  chatId: number,
  file: Blob,
  caption: string,
): Promise<void> {
  const form = new FormData();
  form.set('chat_id', String(chatId));
  form.set('caption', caption);
  form.set('document', file, 'chronika.pdf');
  const response = await fetch(api(token, 'sendDocument'), { method: 'POST', body: form });
  if (!response.ok) throw new Error(`sendDocument ${response.status}`);
}

/** Fetches the finished PDF from the jobs worker and hands it to the chat. */
async function deliver(env: Env, token: string, chatId: number, docToken: string, l: Lang) {
  const bytes = await env.JOBS.document(docToken);
  if (!bytes) throw new Error('document is not available');
  const file = new Blob([bytes], { type: 'application/pdf' });
  await sendText(token, chatId, COPY[l].here);
  await sendDocument(token, chatId, file, COPY[l].caption);
}

async function onStart(env: Env, token: string, chatId: number, code: string, fallback: Lang) {
  if (!code) {
    await sendText(token, chatId, COPY[fallback].hello);
    return;
  }
  const claim = await env.JOBS.claimTelegram(code, chatId);
  if (!claim) {
    await sendText(token, chatId, COPY[fallback].unknown);
    return;
  }
  const l = lang(claim.locale);
  if (claim.failed) {
    await sendText(token, chatId, COPY[l].failed);
    return;
  }
  if (!claim.ready || !claim.token) {
    await sendText(token, chatId, COPY[l].waiting);
    return;
  }
  await deliver(env, token, chatId, claim.token, l);
  await env.JOBS.telegramDelivered(code);
}

async function onUpdate(env: Env, token: string, update: Update): Promise<void> {
  const message = update.message;
  if (!message?.text || message.chat.type !== 'private') return;
  const chatId = message.chat.id;
  const fallback = lang(message.from?.language_code?.slice(0, 2));
  const [command = '', argument = ''] = message.text.trim().split(/\s+/, 2);

  if (command === '/start') return onStart(env, token, chatId, argument, fallback);
  if (command === '/stop') {
    await env.JOBS.forgetTelegram(chatId);
    return sendText(token, chatId, COPY[fallback].stopped);
  }
  return sendText(token, chatId, COPY[fallback].hello);
}

/** Points Telegram at this worker. Idempotent, and it can only ever point the bot at itself. */
async function setup(env: Env, token: string, origin: string): Promise<Response> {
  const secret = await webhookSecret(token);
  const response = await fetch(api(token, 'setWebhook'), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      url: `${origin}/webhook`,
      secret_token: secret,
      allowed_updates: ['message'],
      drop_pending_updates: true,
    }),
  });
  const result = (await response.json()) as { ok: boolean; description?: string };
  await fetch(api(token, 'setMyCommands'), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      commands: [
        { command: 'start', description: 'Chronika' },
        { command: 'stop', description: 'Stop / Зупинити / Остановить' },
      ],
    }),
  });
  return Response.json({ webhook: result.ok, note: result.description ?? null });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const token = env.TELEGRAM_BOT_TOKEN;
    if (url.pathname === '/health') return Response.json({ status: 'ok', configured: Boolean(token) });
    if (!token) return Response.json({ error: 'bot token is not configured' }, { status: 503 });

    if (url.pathname === '/setup') return setup(env, token, url.origin);

    if (url.pathname === '/webhook' && request.method === 'POST') {
      if (request.headers.get('x-telegram-bot-api-secret-token') !== (await webhookSecret(token))) {
        return new Response('forbidden', { status: 403 });
      }
      const update = (await request.json()) as Update;
      try {
        await onUpdate(env, token, update);
      } catch (error) {
        // Telegram retries a failed webhook for hours; answer 200 and keep the failure in the log.
        console.error('update', update.update_id, error instanceof Error ? error.message : error);
      }
      return new Response('ok');
    }

    return new Response('not found', { status: 404 });
  },
};

/** What the jobs worker may ask, over its service binding and nothing else. An RPC entrypoint
 * has no URL: the public fetch handler above never sees these calls, so there is no route for a
 * stranger to push a document into someone's chat. */
export class BotInternal extends WorkerEntrypoint<Env> {
  /** A document a chat has been waiting for is finished: send it. */
  async deliver(args: { chatId: number; code: string; locale: string; token: string }) {
    const token = this.env.TELEGRAM_BOT_TOKEN;
    if (!token) throw new Error('bot token is not configured');
    await deliver(this.env, token, args.chatId, args.token, lang(args.locale));
    await this.env.JOBS.telegramDelivered(args.code);
  }
}
