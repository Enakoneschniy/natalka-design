const rules = new Intl.PluralRules('ru');
const forms: Record<string, string> = { one: 'кредит', few: 'кредита', many: 'кредитов' };

/** «кредит», «кредита», «кредитов»: the noun alone, agreed with the number. */
export function creditsNoun(n: number): string {
  return forms[rules.select(n)] ?? 'кредита';
}

/** «1 кредит», «3 кредита», «12 кредитов». */
export function creditsLabel(n: number): string {
  return `${n} ${creditsNoun(n)}`;
}
