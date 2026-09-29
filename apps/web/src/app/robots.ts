import type { MetadataRoute } from 'next';

/** Nothing is indexed while the site is unfinished. Lift this together with the payment flow. */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: '*', disallow: '/' }],
  };
}
