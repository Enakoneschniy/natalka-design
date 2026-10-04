import { ConfirmLogin } from '@/components/pro/ConfirmLogin';

export const metadata = { title: 'Вход в кабинет', referrer: 'no-referrer' };

/** The link from the letter. Rendering it spends nothing — mail scanners open links — only the
 * button's POST does. */
export default async function ConfirmLoginPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return (
    <main className="screen plain auth">
      <div className="intro">
        <span className="eyebrow">Chronika Pro</span>
        <h1>Вход в кабинет</h1>
        <p className="muted">Нажмите «Войти», чтобы открыть кабинет на этом устройстве.</p>
      </div>
      <ConfirmLogin token={token} />
    </main>
  );
}
