import { redirect } from 'next/navigation';
import { LangSwitch } from '@/components/pro/Lang';
import { LoginForm } from '@/components/pro/LoginForm';
import { hasLiveSession } from '@/lib/pro/current';
import { proText, titleOf } from '@/lib/pro/locale';

export const generateMetadata = titleOf('login');

/** Sign-in. `?expired=1` comes from a session that ran out, `?closed=1` from closing a cabinet. */
export default async function Login({
  searchParams,
}: {
  searchParams: Promise<{ expired?: string; closed?: string }>;
}) {
  if (await hasLiveSession()) redirect('/');
  const [{ expired, closed }, t] = await Promise.all([searchParams, proText()]);
  return (
    <main className="screen plain auth">
      <div className="intro">
        <div className="eyebrow-row">
          <span className="eyebrow">Chronika Pro</span>
          <LangSwitch />
        </div>
        <h1>{t.login.title}</h1>
        <p className="muted">{t.login.lead}</p>
      </div>
      <LoginForm expired={expired === '1'} closed={closed === '1'} />
    </main>
  );
}
