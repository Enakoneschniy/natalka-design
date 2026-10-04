import Link from 'next/link';
import { initial } from '@/lib/pro/birth';
import {
  progressLabel,
  type ReadingSummary,
  readingDate,
  readingPill,
  readingTitle,
} from '@/lib/pro/readings';

/** What a row may know beyond the list's summary: the full reading's progress and gaps. */
export interface ReadingDetail {
  written?: number;
  total?: number;
  missing?: number;
  pdf?: 'none' | 'building' | 'ready';
}

/** One reading in a list: whose it is and what, the status pill, the date, and while it is
 * being written, how far it has got. Links to the reading. */
export function ReadingItem({
  reading,
  client,
  partner,
}: {
  reading: ReadingSummary & ReadingDetail;
  client?: string;
  partner?: string;
}) {
  const pill = readingPill(reading);
  const writing = reading.status === 'writing';
  const known = writing && reading.total !== undefined && reading.written !== undefined;
  const share = known && reading.total ? Math.min(1, (reading.written ?? 0) / reading.total) : 0;
  return (
    <Link href={`/readings/${reading.id}`} className="item link">
      <span className="av" aria-hidden="true">
        {initial(client ?? '')}
      </span>
      <span className="grow">
        <span className="t">{readingTitle(reading.product, client, partner)}</span>
        <span className="meta">
          <span className={`pill ${pill.tone}`}>{pill.label}</span>
          <span className="s">
            {known
              ? progressLabel(reading.written ?? 0, reading.total ?? 0)
              : readingDate(reading.created_at)}
          </span>
        </span>
        {known ? (
          <span
            className="progress"
            role="progressbar"
            aria-label="Сколько разделов написано"
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
