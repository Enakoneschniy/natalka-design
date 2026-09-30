import Link from 'next/link';
import { locales } from '@/i18n/routing';

/** A page that is not there. It carries the three front doors rather than an apology, and it is
 * never indexed: a 404 that a crawler files away is a 404 someone else will find. */
export const metadata = { title: 'Chronika', robots: { index: false, follow: false } };

export default function NotFound() {
  return (
    <html lang="en">
      <body>
        <main>
          <div className="container-page narrow flow" style={{ paddingTop: '18vh' }}>
            <h1>404</h1>
            <p className="lead">This page does not exist. The front page does:</p>
            <p className="flow-links">
              {locales.map((locale) => (
                <Link key={locale} href={`/${locale}`}>
                  chronika.me/{locale}
                </Link>
              ))}
            </p>
          </div>
        </main>
      </body>
    </html>
  );
}
