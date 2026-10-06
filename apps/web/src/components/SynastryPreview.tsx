import { useTranslations } from 'next-intl';
import { ChartBadge, PositionsTable, signOf } from '@/components/ChartBits';
import { PreviewReading } from '@/components/PreviewReading';
import { Wheel } from '@/components/Wheel';
import type { SynastryFacts } from '@/lib/api';
import { formatDegree } from '@/lib/chart';
import type { SignedPreview } from '@/lib/preview';

/** How many contacts the free preview shows. Enough to see the shape of the pair, not the whole
 * reading — there are usually seventy or eighty of them. */
const SHOWN = 8;

export function SynastryPreview({
  facts,
  names,
  preview,
}: {
  facts: SynastryFacts;
  names: [string, string];
  /** The passages' request, signed by the page for these charts and these names. */
  preview: SignedPreview | null;
}) {
  const t = useTranslations('preview');
  const tc = useTranslations('chart');
  const [first, second] = names;

  const contacts = facts.cross_aspects.filter((c) => c.major).slice(0, SHOWN);
  const harmonious = facts.cross_aspects.filter((c) => c.major && c.nature === 'harmonious').length;
  const tense = facts.cross_aspects.filter((c) => c.major && c.nature === 'tense').length;

  const charts: [string, SynastryFacts['first']][] = [
    [first, facts.first],
    [second, facts.second],
  ];

  return (
    <>
      <section className="preview-section synastry-charts">
        {charts.map(([name, chart]) => {
          const sun = chart.positions.find((p) => p.body === 'sun');
          const moon = chart.positions.find((p) => p.body === 'moon');
          return (
            <div key={name}>
              <h2 className="block-title">{name}</h2>
              <div className="wheel-glow synastry-wheel">
                <Wheel facts={chart} size={420} detail="compact" />
              </div>
              <div className="preview-badges">
                {sun ? <ChartBadge body="sun" longitude={sun.longitude} withDegree astro /> : null}
                {moon ? <ChartBadge body="moon" longitude={moon.longitude} withDegree /> : null}
                {chart.houses ? (
                  <ChartBadge body="asc" longitude={chart.houses.asc} withDegree />
                ) : null}
              </div>
              <div className="card">
                <PositionsTable facts={chart} />
              </div>
            </div>
          );
        })}
      </section>

      <section className="preview-section">
        <div className="block-head">
          <h2 className="block-title">{t('contactsTitle')}</h2>
          <p className="muted">
            {t('contactsLead', { harmonious, tense, total: facts.cross_aspects.length })}
          </p>
        </div>
        <ul className="contacts">
          {contacts.map((contact) => (
            <li key={`${contact.a}-${contact.b}-${contact.type}`}>
              <span className={`dot ${contact.nature}`} />
              <span className="contact-pair">
                {tc(`planets.${contact.a}`)} <span className="muted">{first}</span>
              </span>
              <span className="contact-aspect mono">{tc(`aspects.${contact.type}`)}</span>
              <span className="contact-pair">
                {tc(`planets.${contact.b}`)} <span className="muted">{second}</span>
              </span>
              <span className="mono muted contact-orb">{contact.orb.toFixed(1)}°</span>
            </li>
          ))}
        </ul>
      </section>

      <section className="preview-section">
        <div className="block-head">
          <h2 className="block-title">{t('readingTitle')}</h2>
          <p className="muted">{t('readingLead')}</p>
        </div>
        <PreviewReading request={preview} />
      </section>
    </>
  );
}

/** The Sun sign of a chart, for the short line under a name. */
export const sunSign = (chart: SynastryFacts['first'], t: (key: string) => string): string => {
  const sun = chart.positions.find((p) => p.body === 'sun');
  if (!sun) return '';
  return `${t(`signs.${signOf(sun.longitude)}`)} ${formatDegree(sun.longitude)}`;
};
