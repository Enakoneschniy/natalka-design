import type { Metadata } from 'next';
import { ConfirmLogin, LinkExpired } from '@/components/pro/ConfirmLogin';
import { LangSwitch } from '@/components/pro/Lang';
import { otherCabinet } from '@/lib/pro/account';
import { peekLogin } from '@/lib/pro/client';
import { liveSeller } from '@/lib/pro/current';
import { proText } from '@/lib/pro/locale';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await proText()).meta.confirmLogin, referrer: 'no-referrer' };
}

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
  const [owner, seller, t] = await Promise.all([linkOwner(token), liveSeller(), proText()]);
  const other = owner && seller ? otherCabinet(owner, seller.email) : null;

  return (
    <main className="screen plain auth">
      <div className="intro">
        <div className="eyebrow-row">
          <span className="eyebrow">Chronika Pro</span>
          <LangSwitch />
        </div>
        <h1>{t.confirm.title}</h1>
        {owner === false ? null : owner ? (
          <p className="muted">
            {t.confirm.opensBefore}
            <strong className="addr">{owner}</strong>
            {t.confirm.opensAfter}
          </p>
        ) : (
          <p className="muted">{t.confirm.pressSignIn}</p>
        )}
      </div>
      {owner === false ? (
        <LinkExpired />
      ) : (
        <>
          {other ? (
            <div className="card notice warn" role="status">
              <strong>
                {t.confirm.signedInAs}
                <span className="addr">{other}</span>
              </strong>
              <span className="muted">{t.confirm.otherCabinet}</span>
            </div>
          ) : null}
          <ConfirmLogin token={token} />
        </>
      )}
    </main>
  );
}
