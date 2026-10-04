const rules = new Intl.PluralRules('ru');
const forms: Record<string, string> = { one: 'кредит', few: 'кредита', many: 'кредитов' };

/** «1 кредит», «3 кредита», «12 кредитов». */
export function creditsLabel(n: number): string {
  return `${n} ${forms[rules.select(n)] ?? 'кредита'}`;
}
