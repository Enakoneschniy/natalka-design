'use client';

import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import type { ChartFacts } from '@/lib/chart';

interface Block {
  title: string;
  text: string;
}

/** The first words the product says to a visitor.
 *
 * Fetched from the browser rather than rendered on the server: the chart, the tables and the
 * aspects are ready immediately, and waiting on the model would hold all of that back for twenty
 * seconds. The passages drop in underneath when they arrive.
 */
export function PreviewReading({
  facts,
  lang,
  rails,
}: {
  facts: ChartFacts;
  lang: string;
  /** The chart facts each passage is written from, rendered on the server. */
  rails?: React.ReactNode[];
}) {
  const t = useTranslations('preview');
  const [blocks, setBlocks] = useState<Block[] | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const response = await fetch('/api/preview', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ facts, lang }),
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
  }, [facts, lang]);

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
