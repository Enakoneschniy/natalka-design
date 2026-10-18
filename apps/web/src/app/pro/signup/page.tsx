import { redirect } from 'next/navigation';
import { LangSwitch } from '@/components/pro/Lang';
import { SignupForm } from '@/components/pro/SignupForm';
import { hasLiveSession } from '@/lib/pro/current';
import { proText, titleOf } from '@/lib/pro/locale';

export const generateMetadata = titleOf('signup');

export default async function Signup() {
  if (await hasLiveSession()) redirect('/');
  const t = await proText();
  return (
    <main className="screen plain auth">
      <div className="intro">
        <div className="eyebrow-row">
          <span className="eyebrow">Chronika Pro</span>
          <LangSwitch />
        </div>
        <h1>{t.signup.title}</h1>
        <p className="muted">{t.signup.lead}</p>
      </div>
      <SignupForm />
    </main>
  );
}
