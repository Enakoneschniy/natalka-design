import type { NextConfig } from 'next';
import createNextIntlPlugin from 'next-intl/plugin';

const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts');

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // The chart SVG comes from the internal API; nothing else is remote.
  images: { unoptimized: true },
};

export default withNextIntl(nextConfig);
