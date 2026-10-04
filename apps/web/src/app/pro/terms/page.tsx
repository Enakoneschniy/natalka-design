import Link from 'next/link';

export const metadata = { title: 'Условия работы' };

/** Public: the sign-up form links here. Phase 6 replaces the placeholder with the offer. */
export default function Terms() {
  return (
    <main className="screen plain">
      <header className="bar" style={{ padding: '14px 0 10px' }}>
        <Link href="/" className="logo">
          Chronika<small>PRO</small>
        </Link>
      </header>
      <h1>Условия работы</h1>
      <p>Оферта готовится. Пока действуют условия, о которых мы договорились при подключении.</p>
    </main>
  );
}
