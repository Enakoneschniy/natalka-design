import Link from 'next/link';
import { initial } from '@/lib/pro/birth';
import type { ProLang } from '@/lib/pro/lang';
import {
  progressLabel,
  type ReadingSummary,
  readingDate,
  readingPill,
  readingTitle,
} from '@/lib/pro/readings';
import { textFor } from '@/lib/pro/text';

/** What a row may know beyond the list's summary: the full reading's progress and gaps. */
export interface ReadingDetail {
  written?: number;
  total?: number;
  missing?: number;
  pdf?: 'none' | 'building' | 'ready';
}

/** One reading in a list: whose it is and what, the status pill, the date, and while it is
 * being written, how far it has got; its language when it is not the cabinet's. Links to the
 * reading. */
export function ReadingItem({
  reading,
  client,
  partner,
  lang,
}: {
  reading: ReadingSummary & ReadingDetail;
  client?: string;
  partner?: string;
  lang: ProLang;
}) {
  const t = textFor(lang);
  const pill = readingPill(reading, lang);
  const written = reading.lang ?? 'ru';
  const writing = reading.status === 'writing';
  const known = writing && reading.total !== undefined && reading.written !== undefined;
  const share = known && reading.total ? Math.min(1, (reading.written ?? 0) / reading.total) : 0;
  return (
    <Link href={`/readings/${reading.id}`} className="item link">
      <span className="av" aria-hidden="true">
        {initial(client ?? '')}
      </span>
      <span className="grow">
        <span className="t">{readingTitle(reading.product, lang, client, partner)}</span>
        <span className="meta">
          <span className={`pill ${pill.tone}`}>{pill.label}</span>
          {written !== lang ? (
            <span className="pill" lang={written} title={t.lang.name[written]}>
              {t.lang.short[written]}
            </span>
          ) : null}
          <span className="s">
            {known
              ? progressLabel(reading.written ?? 0, reading.total ?? 0, lang)
              : readingDate(reading.created_at, lang)}
          </span>
        </span>
        {known ? (
          <span
            className="progress"
            role="progressbar"
            aria-label={t.reports.progressLabel}
            aria-valuemin={0}
            aria-valuemax={reading.total}
            aria-valuenow={reading.written}
          >
            <i style={{ width: `${Math.round(share * 100)}%` }} />
          </span>
        ) : null}
      </span>
    </Link>
  );
}
