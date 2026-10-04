import type { Metadata, Viewport } from 'next';
import '@/styles/pro.css';

/** The seller cabinet's own root: none of the shop's chrome, marketing or locale machinery. */
export const metadata: Metadata = {
  title: { default: 'Chronika Pro', template: '%s — Chronika Pro' },
  robots: { index: false, follow: false },
  applicationName: 'Chronika Pro',
};

export const viewport: Viewport = { themeColor: '#06091A', colorScheme: 'dark' };

export default function ProLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ru">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,400;0,500;1,400&family=Golos+Text:wght@400;500;600&family=JetBrains+Mono:wght@400;500&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="pro">{children}</body>
    </html>
  );
}
