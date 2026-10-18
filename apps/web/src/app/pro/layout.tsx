import type { Metadata, Viewport } from 'next';
import { LangProvider } from '@/components/pro/Lang';
import { proLang } from '@/lib/pro/locale';
import '@/styles/pro.css';

/** The seller cabinet's own root: none of the shop's chrome, marketing or locale machinery. It
 * speaks Ukrainian or Russian (`lib/pro/lang.ts`), chosen per visitor, with no locale in the
 * address. */
export const metadata: Metadata = {
  title: { default: 'Chronika Pro', template: '%s — Chronika Pro' },
  robots: { index: false, follow: false },
  applicationName: 'Chronika Pro',
};

export const viewport: Viewport = { themeColor: '#06091A', colorScheme: 'dark' };

export default async function ProLayout({ children }: { children: React.ReactNode }) {
  const lang = await proLang();
  return (
    <html lang={lang}>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,400;0,500;1,400&family=Golos+Text:wght@400;500;600&family=JetBrains+Mono:wght@400;500&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="pro">
        <LangProvider lang={lang}>{children}</LangProvider>
      </body>
    </html>
  );
}
