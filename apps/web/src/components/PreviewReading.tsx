'use client';

import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import type { SignedPreview } from '@/lib/preview';

interface Block {
  title: string;
  text: string;
}

/** The first words the product says to a visitor.
 *
 * Fetched from the browser rather than rendered on the server: the chart, the tables and the
 * aspects are ready immediately, and waiting on the model would hold all of that back for twenty
 * seconds. The passages drop in underneath when they arrive. What is asked about comes from the
 * page, signed, and is sent back as it came.
 */
export function PreviewReading({
  request,
  rails,
}: {
  /** The facts, language, product and names, with the page's signature; null when the site
   * cannot sign, and then there are no passages. */
  request: SignedPreview | null;
  /** The chart facts each passage is written from, rendered on the server. */
  rails?: React.ReactNode[];
}) {
  const t = useTranslations('preview');
  const [blocks, setBlocks] = useState<Block[] | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!request) {
      setFailed(true);
      return;
    }
    let active = true;
    (async () => {
      try {
        const response = await fetch('/api/preview', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(request),
        });
        if (!response.ok) throw new Error(String(response.status));
        const data = (await response.json()) as { blocks: Block[] };
        if (active) setBlocks(data.blocks);
      } catch {
        if (active) setFailed(true);
      }
    })();
    return () => {
      active = false;
    };
  }, [request]);

  if (failed) return null;

  return (
    <div className="reading-blocks">
      {(blocks ?? [null, null, null]).map((block, i) => (
        <article className="reading-block" key={block?.title ?? i}>
          <div className="reading-text">
            {block ? (
              <>
                <h3 className="block-title">{block.title}</h3>
                <p>{block.text}</p>
              </>
            ) : (
              <>
                <div className="skeleton skeleton-title" />
                <div className="skeleton" />
                <div className="skeleton skeleton-2" />
                <div className="skeleton skeleton-3" />
                <div className="skeleton skeleton-4" />
                <div className="skeleton skeleton-short" />
                <span className="caption">{t('writing')}</span>
              </>
            )}
          </div>
          <aside className="reading-rail">{rails?.[i]}</aside>
        </article>
      ))}
    </div>
  );
}
