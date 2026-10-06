import { cookies } from 'next/headers';
import Script from 'next/script';
import { Consent } from '@/components/Consent';
import { anyTag, CONSENT_COOKIE, readConsent, tags } from '@/lib/marketing';

/** Cloudflare Web Analytics: page views, referrers, countries, devices. No cookie, no
 * identifier, and the beacon reports to our own Cloudflare account rather than to a third party,
 * so it runs for everybody, with or without consent, and needs no banner. */
function Beacon() {
  const token = process.env.CF_BEACON_TOKEN;
  if (!token) return null;
  return (
    <Script
      src="https://static.cloudflareinsights.com/beacon.min.js"
      strategy="afterInteractive"
      data-cf-beacon={JSON.stringify({ token })}
    />
  );
}

/** What the advertising platforms are allowed to see.
 *
 * Rendered by the pages that carry nothing about a visitor — the landing, the documents and the
 * empty form — and by no other: not the preview, the checkout, the waiting page or anything
 * behind a link from a letter. Until the visitor answers, the only thing on the page is Google's
 * consent-mode default, which says "denied" — that has to be present *before* any Google tag,
 * even one that never loads. The tags themselves go in only after a yes, and only the ones that
 * are configured.
 */
export async function Marketing() {
  const t = tags();
  const consent = readConsent((await cookies()).get(CONSENT_COOKIE)?.value);

  if (!anyTag(t)) return <Beacon />;

  if (consent !== 'granted') {
    return (
      <>
        <Beacon />
        {(t.ga || t.ads) && (
          <Script id="consent-default" strategy="beforeInteractive">
            {`window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments)}
              gtag('consent','default',{ad_storage:'denied',ad_user_data:'denied',ad_personalization:'denied',analytics_storage:'denied',wait_for_update:500});`}
          </Script>
        )}
        {consent === null ? <Consent /> : null}
      </>
    );
  }

  return (
    <>
      <Beacon />
      {(t.ga || t.ads) && (
        <>
          <Script id="consent-granted" strategy="beforeInteractive">
            {`window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments)}
              gtag('consent','default',{ad_storage:'granted',ad_user_data:'granted',ad_personalization:'granted',analytics_storage:'granted'});`}
          </Script>
          <Script
            src={`https://www.googletagmanager.com/gtag/js?id=${t.ga ?? t.ads}`}
            strategy="afterInteractive"
          />
          <Script id="gtag-init" strategy="afterInteractive">
            {`gtag('js', new Date());
              ${t.ga ? `gtag('config','${t.ga}');` : ''}
              ${t.ads ? `gtag('config','${t.ads}');` : ''}`}
          </Script>
        </>
      )}

      {t.meta && (
        <Script id="meta-pixel" strategy="afterInteractive">
          {`!function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?
            n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;
            n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;
            t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,
            document,'script','https://connect.facebook.net/en_US/fbevents.js');
            fbq('init','${t.meta}');fbq('track','PageView');`}
        </Script>
      )}

      {t.tiktok && (
        <Script id="tiktok-pixel" strategy="afterInteractive">
          {`!function(w,d,t){w.TiktokAnalyticsObject=t;var ttq=w[t]=w[t]||[];
            ttq.methods=["page","track","identify","instances","debug","on","off","once","ready","alias","group","enableCookie","disableCookie"];
            ttq.setAndDefer=function(t,e){t[e]=function(){t.push([e].concat(Array.prototype.slice.call(arguments,0)))}};
            for(var i=0;i<ttq.methods.length;i++)ttq.setAndDefer(ttq,ttq.methods[i]);
            ttq.instance=function(t){for(var e=ttq._i[t]||[],n=0;n<ttq.methods.length;n++)ttq.setAndDefer(e,ttq.methods[n]);return e};
            ttq.load=function(e,n){var r="https://analytics.tiktok.com/i18n/pixel/events.js";
            ttq._i=ttq._i||{};ttq._i[e]=[];ttq._i[e]._u=r;ttq._t=ttq._t||{};ttq._t[e]=+new Date;
            ttq._o=ttq._o||{};ttq._o[e]=n||{};var o=d.createElement("script");o.type="text/javascript";
            o.async=!0;o.src=r+"?sdkid="+e+"&lib="+t;var a=d.getElementsByTagName("script")[0];
            a.parentNode.insertBefore(o,a)};
            ttq.load('${t.tiktok}');ttq.page();}(window,document,'ttq');`}
        </Script>
      )}
    </>
  );
}
