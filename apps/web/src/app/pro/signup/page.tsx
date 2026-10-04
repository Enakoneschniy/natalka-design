import { redirect } from 'next/navigation';
import { SignupForm } from '@/components/pro/SignupForm';
import { hasLiveSession } from '@/lib/pro/current';

export const metadata = { title: 'Регистрация' };

export default async function Signup() {
  if (await hasLiveSession()) redirect('/');
  return (
    <main className="screen plain auth">
      <div className="intro">
        <span className="eyebrow">Chronika Pro</span>
        <h1>Регистрация</h1>
        <p className="muted">Разборы под вашим именем: вы продаёте, мы пишем.</p>
      </div>
      <SignupForm />
    </main>
  );
}
