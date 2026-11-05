/** The contract as the buyer is told it.
 *
 * Two things the law ties to the moment of payment. The payment page asks the buyer to consent to
 * the document being made at once, which is what lets the right of withdrawal lapse. And the
 * confirmation of the contract (§ 312f BGB, Art. 8(7) of the Consumer Rights Directive) has to
 * reach them on a durable medium — a letter, not a link — with that consent and the withdrawal
 * information in it, before the work begins: without it the right does not lapse at all
 * (§ 356 Abs. 6 BGB). Both are kept here so that the page and the letter say the same words.
 *
 * The withdrawal texts repeat the refund policy (apps/web/src/content/legal/refunds.ts) word for
 * word; a change there is a change here.
 */

export const SELLER_LINES = [
  'coremind s. r. o.',
  'Vlčie hrdlo 1887/81, 821 07 Bratislava – Ružinov',
  'IČO 57 339 368, IČ DPH SK2122681594',
  'help@chronika.me',
];

const COUNTRY: Record<string, string> = {
  ru: 'Словакия',
  uk: 'Словаччина',
  en: 'Slovakia',
  de: 'Slowakei',
  pl: 'Słowacja',
};

/** The seller, in one line, in the buyer's language. */
export const sellerLine = (locale: string): string => {
  const [name, street, id, mail] = SELLER_LINES;
  return `${name}, ${street}, ${COUNTRY[locale] ?? COUNTRY.en}, ${id}, ${mail}`;
};

const CONSENT_EN =
  'The document is created right after payment; the right of withdrawal ends with its delivery.';

/** What the payment page asks the buyer to agree to. The German wording follows § 356 Abs. 6 BGB:
 * consent to start before the withdrawal period ends, and knowledge that the right lapses when
 * performance begins. */
const CONSENT: Record<string, string> = {
  uk: 'Документ створюється одразу після оплати; з його доставкою право на відмову припиняється.',
  ru: 'Документ создаётся сразу после оплаты; с его доставкой право на отказ прекращается.',
  en: CONSENT_EN,
  de: 'Ich stimme ausdrücklich zu, dass Sie vor Ablauf der Widerrufsfrist mit der Erstellung des Dokuments beginnen, und mir ist bekannt, dass ich durch diese Zustimmung mit Beginn der Vertragserfüllung mein Widerrufsrecht verliere.',
  // Art. 38 ust. 1 pkt 13 ustawy o prawach konsumenta.
  pl: 'Wyrażam zgodę na rozpoczęcie spełniania świadczenia przed upływem terminu do odstąpienia od umowy i przyjmuję do wiadomości, że z chwilą rozpoczęcia spełniania świadczenia utracę prawo odstąpienia od umowy.',
};

export const withdrawalConsent = (locale: string): string => CONSENT[locale] ?? CONSENT_EN;

const WITHDRAWAL_EN = [
  'By law you have 14 days to withdraw from a distance purchase. For digital content whose supply began at your express request, that right ends on delivery. By placing an order you agree that the document is created and delivered immediately and acknowledge that you lose the right of withdrawal once it is delivered. Withdrawal is possible before generation starts — but generation starts as soon as payment is made.',
];

/** The withdrawal information the confirmation carries. German is the statutory model text
 * (Anlage 1 zu Art. 246a § 1 EGBGB) with the model form; the other languages repeat the refund
 * policy's own section. */
const WITHDRAWAL: Record<string, string[]> = {
  ru: [
    'По закону у вас есть 14 дней на отказ от дистанционной покупки. Для цифрового контента, поставка которого началась по вашему явному запросу, это право прекращается с момента доставки. Оформляя заказ, вы соглашаетесь с тем, что документ будет создан и доставлен сразу, и подтверждаете, что понимаете утрату права на отказ после доставки. До начала генерации отказ возможен — но генерация начинается сразу после оплаты.',
  ],
  uk: [
    'За законом у вас є 14 днів на відмову від дистанційної покупки. Для цифрового контенту, постачання якого почалося за вашим явним запитом, це право припиняється з моменту доставки. Оформлюючи замовлення, ви погоджуєтеся з тим, що документ буде створено і доставлено одразу, і підтверджуєте, що розумієте втрату права на відмову після доставки. До початку генерації відмова можлива — але генерація починається одразу після оплати.',
  ],
  en: WITHDRAWAL_EN,
  de: [
    'Widerrufsrecht',
    'Sie haben das Recht, binnen vierzehn Tagen ohne Angabe von Gründen diesen Vertrag zu widerrufen. Die Widerrufsfrist beträgt vierzehn Tage ab dem Tag des Vertragsabschlusses.',
    'Um Ihr Widerrufsrecht auszuüben, müssen Sie uns (coremind s. r. o., Vlčie hrdlo 1887/81, 821 07 Bratislava – Ružinov, Slowakei, E-Mail: help@chronika.me) mittels einer eindeutigen Erklärung (z. B. ein mit der Post versandter Brief oder eine E-Mail) über Ihren Entschluss, diesen Vertrag zu widerrufen, informieren. Sie können dafür das beigefügte Muster-Widerrufsformular verwenden, das jedoch nicht vorgeschrieben ist. Sie können den Widerruf auch über die Schaltfläche „Vertrag widerrufen“ auf unserer Website erklären.',
    'Zur Wahrung der Widerrufsfrist reicht es aus, dass Sie die Mitteilung über die Ausübung des Widerrufsrechts vor Ablauf der Widerrufsfrist absenden.',
    'Folgen des Widerrufs',
    'Wenn Sie diesen Vertrag widerrufen, haben wir Ihnen alle Zahlungen, die wir von Ihnen erhalten haben, unverzüglich und spätestens binnen vierzehn Tagen ab dem Tag zurückzuzahlen, an dem die Mitteilung über Ihren Widerruf dieses Vertrags bei uns eingegangen ist. Für diese Rückzahlung verwenden wir dasselbe Zahlungsmittel, das Sie bei der ursprünglichen Transaktion eingesetzt haben, es sei denn, mit Ihnen wurde ausdrücklich etwas anderes vereinbart; in keinem Fall werden Ihnen wegen dieser Rückzahlung Entgelte berechnet.',
    'Erlöschen des Widerrufsrechts',
    'Ihr Widerrufsrecht erlischt, wenn wir mit der Vertragserfüllung begonnen haben, nachdem Sie ausdrücklich zugestimmt haben, dass wir vor Ablauf der Widerrufsfrist mit der Vertragserfüllung beginnen, und Ihre Kenntnis davon bestätigt haben, dass durch diese Zustimmung mit Beginn der Vertragserfüllung Ihr Widerrufsrecht erlischt (§ 356 Abs. 6 BGB). Diese E-Mail ist die Bestätigung des Vertrags, die das Gesetz dafür vorsieht.',
    'Muster-Widerrufsformular',
    '(Wenn Sie den Vertrag widerrufen wollen, dann füllen Sie bitte dieses Formular aus und senden Sie es zurück.)',
    'An coremind s. r. o., Vlčie hrdlo 1887/81, 821 07 Bratislava – Ružinov, Slowakei, E-Mail: help@chronika.me: Hiermit widerrufe(n) ich/wir (*) den von mir/uns (*) abgeschlossenen Vertrag über den Kauf der folgenden Waren (*)/die Erbringung der folgenden Dienstleistung (*) — Bestellt am (*)/erhalten am (*) — Name des/der Verbraucher(s) — Anschrift des/der Verbraucher(s) — Unterschrift des/der Verbraucher(s) (nur bei Mitteilung auf Papier) — Datum',
    '(*) Unzutreffendes streichen.',
  ],
  // The statutory model (załącznik nr 1 do ustawy o prawach konsumenta) and its form.
  pl: [
    'Prawo odstąpienia od umowy',
    'Mają Państwo prawo odstąpić od niniejszej umowy w terminie 14 dni bez podania jakiejkolwiek przyczyny. Termin do odstąpienia od umowy wygasa po upływie 14 dni od dnia zawarcia umowy.',
    'Aby skorzystać z prawa odstąpienia od umowy, muszą Państwo poinformować nas (coremind s. r. o., Vlčie hrdlo 1887/81, 821 07 Bratysława – Ružinov, Słowacja, e-mail: help@chronika.me) o swojej decyzji o odstąpieniu od niniejszej umowy w drodze jednoznacznego oświadczenia (na przykład pismo wysłane pocztą lub pocztą elektroniczną). Mogą Państwo skorzystać z wzoru formularza odstąpienia od umowy, jednak nie jest to obowiązkowe. Mogą Państwo również złożyć oświadczenie przyciskiem „Odstąpienie od umowy” na naszej stronie.',
    'Aby zachować termin do odstąpienia od umowy, wystarczy, aby wysłali Państwo informację dotyczącą wykonania przysługującego Państwu prawa odstąpienia od umowy przed upływem terminu do odstąpienia od umowy.',
    'Skutki odstąpienia od umowy',
    'W przypadku odstąpienia od niniejszej umowy zwracamy Państwu wszystkie otrzymane od Państwa płatności niezwłocznie, a w każdym przypadku nie później niż 14 dni od dnia, w którym zostaliśmy poinformowani o Państwa decyzji o wykonaniu prawa odstąpienia od niniejszej umowy. Zwrotu płatności dokonamy przy użyciu takich samych sposobów płatności, jakie zostały przez Państwa użyte w pierwotnej transakcji, chyba że wyraźnie zgodzili się Państwo na inne rozwiązanie; w każdym przypadku nie poniosą Państwo żadnych opłat w związku z tym zwrotem.',
    'Wygaśnięcie prawa odstąpienia',
    'Prawo odstąpienia od umowy nie przysługuje, jeżeli spełnianie świadczenia rozpoczęło się za wyraźną i uprzednią zgodą konsumenta, który przed rozpoczęciem świadczenia został poinformowany, że po spełnieniu świadczenia utraci prawo odstąpienia od umowy, i przyjął to do wiadomości (art. 38 ust. 1 pkt 13 ustawy o prawach konsumenta). Ta wiadomość jest potwierdzeniem zawarcia umowy, które przewiduje dla tego ustawa.',
    'Wzór formularza odstąpienia od umowy',
    '(formularz ten należy wypełnić i odesłać tylko w przypadku chęci odstąpienia od umowy)',
    'Adresat: coremind s. r. o., Vlčie hrdlo 1887/81, 821 07 Bratysława – Ružinov, Słowacja, e-mail: help@chronika.me — Ja/My(*) niniejszym informuję/informujemy(*) o moim/naszym odstąpieniu od umowy o dostarczenie treści cyfrowych(*)/świadczenie następującej usługi(*) — Data zawarcia umowy(*)/odbioru(*) — Imię i nazwisko konsumenta(-ów) — Adres konsumenta(-ów) — Podpis konsumenta(-ów) (tylko jeżeli formularz jest przesyłany w wersji papierowej) — Data',
    '(*) Niepotrzebne skreślić.',
  ],
};

export const withdrawalInfo = (locale: string): string[] => WITHDRAWAL[locale] ?? WITHDRAWAL_EN;

/** The short lines of the German text that are headings rather than paragraphs. */
export const WITHDRAWAL_HEADINGS = new Set([
  'Widerrufsrecht',
  'Folgen des Widerrufs',
  'Erlöschen des Widerrufsrechts',
  'Muster-Widerrufsformular',
  'Prawo odstąpienia od umowy',
  'Skutki odstąpienia od umowy',
  'Wygaśnięcie prawa odstąpienia',
  'Wzór formularza odstąpienia od umowy',
]);
