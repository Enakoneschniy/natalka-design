import { ConfirmLogin, LinkExpired } from '@/components/pro/ConfirmLogin';
import { otherCabinet } from '@/lib/pro/account';
import { peekLogin } from '@/lib/pro/client';
import { liveSeller } from '@/lib/pro/current';

export const metadata = { title: 'Вход в кабинет', referrer: 'no-referrer' };

/** Whose cabinet the link opens, masked; `false` for a dead link; null when the jobs worker cannot
 * say, and the page then offers the button as it always has. */
async function linkOwner(token: string): Promise<string | false | null> {
  try {
    return (await peekLogin(token)) ?? false;
  } catch {
    return null;
  }
}

/** The link from the letter. Rendering it spends nothing — mail scanners open links — only the
 * button's POST does. The page says whose cabinet the link opens, and warns when this browser is
 * already signed in to a different one: the button would switch cabinets. */
export default async function ConfirmLoginPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const [owner, seller] = await Promise.all([linkOwner(token), liveSeller()]);
  const other = owner && seller ? otherCabinet(owner, seller.email) : null;

  return (
    <main className="screen plain auth">
      <div className="intro">
        <span className="eyebrow">Chronika Pro</span>
        <h1>Вход в кабинет</h1>
        {owner === false ? null : owner ? (
          <p className="muted">
            Ссылка откроет кабинет <strong className="addr">{owner}</strong>. Нажмите «Войти», чтобы
            открыть его на этом устройстве.
          </p>
        ) : (
          <p className="muted">Нажмите «Войти», чтобы открыть кабинет на этом устройстве.</p>
        )}
      </div>
      {owner === false ? (
        <LinkExpired />
      ) : (
        <>
          {other ? (
            <div className="card notice warn" role="status">
              <strong>
                Вы уже вошли как <span className="addr">{other}</span>
              </strong>
              <span className="muted">Эта ссылка откроет другой кабинет.</span>
            </div>
          ) : null}
          <ConfirmLogin token={token} />
        </>
      )}
    </main>
  );
}
