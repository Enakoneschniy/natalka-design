import { redirect } from 'next/navigation';
import { LoginForm } from '@/components/pro/LoginForm';
import { hasLiveSession } from '@/lib/pro/current';

export const metadata = { title: 'Вход' };

/** Sign-in. `?expired=1` comes from a session that ran out, `?closed=1` from closing a cabinet. */
export default async function Login({
  searchParams,
}: {
  searchParams: Promise<{ expired?: string; closed?: string }>;
}) {
  if (await hasLiveSession()) redirect('/');
  const { expired, closed } = await searchParams;
  return (
    <main className="screen plain auth">
      <div className="intro">
        <span className="eyebrow">Chronika Pro</span>
        <h1>Готовые астрологические разборы под вашим брендом</h1>
        <p className="muted">Войдите по ссылке из письма. Пароль не нужен.</p>
      </div>
      <LoginForm expired={expired === '1'} closed={closed === '1'} />
    </main>
  );
}
