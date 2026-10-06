import { afterEach, describe, expect, it, vi } from 'vitest';
import { sendAlert, sendLoginLink, sendReady } from '../src/mail';
import { envWith, letters, testEnv } from './env';

afterEach(() => vi.restoreAllMocks());

const captured = (method: 'log' | 'error' | 'warn') => {
  const lines: string[] = [];
  vi.spyOn(console, method).mockImplementation((...args: unknown[]) => {
    lines.push(args.map(String).join(' '));
  });
  return lines;
};

describe('sign-in links', () => {
  it('are never written to the log unless MAIL_LOG_LINKS is 1', async () => {
    const logged = captured('log');
    const link = 'https://pro.chronika.test/login/secret-token-1';
    await sendLoginLink(envWith('MAIL_LOG_LINKS', undefined), 'quiet@mail.test', link);
    expect(logged.join('\n')).not.toContain('secret-token-1');
    expect(await letters('quiet@mail.test')).toHaveLength(1);

    await sendLoginLink(testEnv, 'loud@mail.test', 'https://pro.chronika.test/login/secret-token-2');
    expect(logged.join('\n')).toContain('secret-token-2');
  });

  it('are not logged when no mail provider is configured either', async () => {
    const logged = captured('log');
    const env = Object.create(envWith('MAIL_LOG_LINKS', undefined));
    Object.defineProperty(env, 'RESEND_API_KEY', { value: undefined });
    expect(await sendLoginLink(env, 'nobody@mail.test', 'https://x.test/login/secret-token-3')).toEqual({
      status: 'skipped',
      providerId: null,
    });
    expect(logged.join('\n')).not.toContain('secret-token-3');
  });
});

describe('letters', () => {
  it('are not sent to an erased address', async () => {
    expect(await sendReady(testEnv, '', 'ru', 'https://chronika.test/ru/generating?t=x')).toEqual({
      status: 'skipped',
      providerId: null,
    });
    expect(await letters('')).toEqual([]);
  });
});

describe('sendAlert', () => {
  it('writes to the owner, with the text escaped', async () => {
    await sendAlert(testEnv, 'Order needs a refund', "order <o-1> & 'pi_1'");
    const [letter] = (await letters('owner@alerts.test')).filter((l) => l.text.includes('o-1'));
    expect(letter?.subject).toBe('[Chronika] Order needs a refund');
    expect(letter?.html).toContain('order &lt;o-1&gt; &amp; &#39;pi_1&#39;');
  });

  it('goes to help@chronika.me when no address is configured', async () => {
    await sendAlert(envWith('ALERT_EMAIL', undefined), 'Default address', 'job j-default');
    expect((await letters('help@chronika.me')).some((l) => l.text === 'job j-default')).toBe(true);
  });

  it('never throws, and logs a refusal by its status alone', async () => {
    const errors = captured('error');
    captured('warn');
    await expect(sendAlert(envWith('ALERT_EMAIL', 'fail-mail@alerts.test'), 'Refused', 'job j-1')).resolves.toBeUndefined();
    expect(errors.join('\n')).toContain('resend → 422');
    expect(errors.join('\n')).not.toContain('invalid to');
  });
});
