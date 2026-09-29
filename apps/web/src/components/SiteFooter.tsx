import Link from 'next/link';
import { useTranslations } from 'next-intl';
import type { Locale } from '@/i18n/routing';
import { Logo } from './Logo';

export function SiteFooter({ locale }: { locale: Locale }) {
  const t = useTranslations('footer');
  const p = useTranslations('products');
  return (
    <footer className="footer">
      <div className="container-page">
        <div className="footer-cols">
          <div>
            <Link className="logo" href={`/${locale}`}>
              <Logo size={26} />
              Chronika
            </Link>
            <p className="small muted footer-about">{t('about')}</p>
          </div>
          <div>
            <h4>{t('products')}</h4>
            <ul>
              <li>
                <Link href={`/${locale}/start?p=bundle`}>{p('bundle.title')}</Link>
              </li>
            </ul>
          </div>
          <div>
            <h4>{t('documents')}</h4>
            <ul>
              <li>
                <Link href={`/${locale}/legal/terms`}>{t('terms')}</Link>
              </li>
              <li>
                <Link href={`/${locale}/legal/privacy`}>{t('privacy')}</Link>
              </li>
              <li>
                <Link href={`/${locale}/legal/refunds`}>{t('refunds')}</Link>
              </li>
            </ul>
          </div>
          <div>
            <h4>{t('contacts')}</h4>
            <ul>
              <li>
                <a href="mailto:help@chronika.me">help@chronika.me</a>
              </li>
              <li>{t('hours')}</li>
            </ul>
          </div>
        </div>
        <div className="footer-legal">
          <span>{t('disclaimer')}</span>
        </div>
        <div className="footer-mark" aria-hidden="true">
          Chronika
        </div>
      </div>
    </footer>
  );
}
