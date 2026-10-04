import Link from 'next/link';

export const metadata = { title: 'Страница не найдена' };

/** The cabinet's 404, in its own root layout: an address on the cabinet host that has no page. */
export default function ProNotFound() {
  return (
    <main className="screen plain auth">
      <div className="intro">
        <span className="eyebrow">Chronika Pro</span>
        <h1>Такой страницы нет</h1>
      </div>
      <Link href="/" className="btn ghost start">
        На главную кабинета
      </Link>
    </main>
  );
}
