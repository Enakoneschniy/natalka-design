'use client';

import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { cityLabel, emptyPerson, PersonFields, type PersonState } from '@/components/PersonFields';
import { parseDate, parseTime } from '@/lib/birth-input';

const GENDER_CODE: Record<string, string> = { female: 'f', male: 'm', neutral: 'n' };

/** Which products need a second person. Only compatibility, for now. */
const PAIRED = new Set(['synastry']);

export function BirthForm({ locale, product = 'natal' }: { locale: string; product?: string }) {
  const t = useTranslations('form');
  const paired = PAIRED.has(product);

  const [people, setPeople] = useState<PersonState[]>(
    paired ? [emptyPerson(), emptyPerson()] : [emptyPerson()],
  );
  const [errors, setErrors] = useState<Record<string, string>[]>([{}, {}]);
  const [pending, setPending] = useState(false);

  const update = (index: number, next: PersonState) =>
    setPeople((current) => current.map((person, i) => (i === index ? next : person)));

  /** Everything a chart needs, or the reasons it cannot be built yet. */
  const validate = (person: PersonState) => {
    const iso = parseDate(person.date);
    const hhmm = person.unknownTime ? null : parseTime(person.time);
    const problems: Record<string, string> = {};
    if (!iso) problems.date = t('errors.date');
    if (!person.unknownTime && !hhmm) problems.time = t('errors.time');
    if (!person.city) problems.city = t('errors.city');
    return { iso, hhmm, problems };
  };

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    const checked = people.map(validate);
    setErrors(checked.map((c) => c.problems));
    if (checked.some((c) => Object.keys(c.problems).length > 0)) return;

    const params = new URLSearchParams({ p: product });
    checked.forEach((check, index) => {
      const person = people[index];
      const city = person?.city;
      if (!check.iso || !city || !person) return;
      // The second person's fields carry a "2" so one flat query string describes both.
      const s = index === 0 ? '' : '2';
      params.set(`d${s}`, check.iso);
      params.set(`lat${s}`, city.latitude.toFixed(4));
      params.set(`lon${s}`, city.longitude.toFixed(4));
      params.set(`tz${s}`, city.zone);
      params.set(`c${s}`, cityLabel(city));
      params.set(`g${s}`, GENDER_CODE[person.gender] ?? 'n');
      if (check.hhmm) params.set(`t${s}`, check.hhmm);
      if (person.name.trim()) params.set(`n${s}`, person.name.trim().slice(0, 40));
    });

    setPending(true);
    // A full load, not a client-side step: this page may carry advertising tags, and a tag that
    // stays loaded reads the next address — which here holds the birth data.
    window.location.assign(
      `/${locale}/${product === 'horoscope' ? 'subscribe' : 'preview'}?${params.toString()}`,
    );
  };

  const labels = (index: number) => {
    if (paired) {
      return {
        legend: index === 0 ? t('you') : t('partner'),
        nameLabel: t('name'),
        nameHint: index === 0 ? t('nameHint') : t('partnerNameHint'),
        genderLabel: t('gender'),
        genderHint: t('genderHint'),
      };
    }
    if (product === 'child') {
      return {
        legend: undefined,
        nameLabel: t('childName'),
        nameHint: t('childNameHint'),
        genderLabel: t('childGender'),
        genderHint: t('childGenderHint'),
      };
    }
    return {
      legend: undefined,
      nameLabel: t('name'),
      nameHint: t('nameHint'),
      genderLabel: t('gender'),
      genderHint: t('genderHint'),
    };
  };

  return (
    <form className="form" onSubmit={submit} noValidate>
      {people.map((person, index) => (
        <PersonFields
          // The list is fixed at one or two entries and never reordered.
          // biome-ignore lint/suspicious/noArrayIndexKey: stable positions, not a dynamic list
          key={index}
          idPrefix={index === 0 ? 'person' : 'partner'}
          value={person}
          onChange={(next) => update(index, next)}
          errors={errors[index] ?? {}}
          {...labels(index)}
        />
      ))}

      <div className="form-foot">
        <button className="btn btn-primary btn-lg" type="submit" disabled={pending}>
          {pending
            ? t('submitPending')
            : product === 'horoscope'
              ? t('submitSubscribe')
              : t('submit')}
        </button>
        <span className="caption">
          {product === 'horoscope' ? t('freeSubscription') : t('free')}
        </span>
      </div>
    </form>
  );
}
