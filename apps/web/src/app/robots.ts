import type { MetadataRoute } from 'next';
import { INDEXABLE, PRIVATE_PATHS, SITE_URL } from '@/lib/seo';

/* Read at request time, not at build time: the switch that opens the site lives in the worker's
   environment, and a file baked during the build would keep whatever it said that day. */
export const dynamic = 'force-dynamic';

/** The answer engines get the same access as the search engines.
 *
 * Being quoted in an assistant's answer is how a page like this one is found now, and refusing
 * the crawlers that feed those answers costs the visibility without saving anything: the pages
 * are public either way. What is kept out is what is private — one person's chart, one purchase
 * in progress — and the API.
 */
const AI_AGENTS = [
  'GPTBot',
  'OAI-SearchBot',
  'ChatGPT-User',
  'ClaudeBot',
  'Claude-SearchBot',
  'Claude-User',
  'PerplexityBot',
  'Perplexity-User',
  'Google-Extended',
  'Applebot-Extended',
  'Bingbot',
  'meta-externalagent',
];

export default function robots(): MetadataRoute.Robots {
  if (!INDEXABLE) {
    // Nothing is indexed while a reading can still be had without paying for it.
    return { rules: [{ userAgent: '*', disallow: '/' }] };
  }

  const disallow = ['/api/', ...PRIVATE_PATHS.map((part) => `${part.replace(/\/$/, '')}`)];
  return {
    rules: [
      { userAgent: '*', allow: '/', disallow },
      ...AI_AGENTS.map((userAgent) => ({ userAgent, allow: '/', disallow })),
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
