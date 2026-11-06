import { describe, expect, it } from 'vitest';
import { isDraft } from '.';
import { privacy } from './privacy';

const LANGUAGES = ['ru', 'uk', 'en', 'de', 'pl', 'fr', 'es'] as const;
const text = (locale: string) => privacy[locale] ?? '';

/** What each language must say, in its own words. */
const FACTS: Record<(typeof LANGUAGES)[number], string[]> = {
  ru: [
    'Оплату принимает **Stripe**: ему передаются адрес почты, название продукта и цена — без данных рождения',
    'передаются положения планет, аспекты и дома, имя, дата и время рождения',
    'Координаты, место рождения, часовой пояс и почта модели не передаются',
    'только если вы нажали «Разрешить», и только на страницах без личных данных',
    'только после того, как вы подтвердите её по ссылке из письма',
    '**удаляются через 30 дней**',
    'Неоплаченный заказ удаляется со всеми данными через 7 дней',
    'хранится 180 дней',
    'хранятся ещё 30 дней и удаляются',
  ],
  uk: [
    'Оплату приймає **Stripe**: йому передаються адреса пошти, назва продукту і ціна — без даних народження',
    "передаються положення планет, аспекти й доми, ім'я, дата і час народження",
    'Координати, місце народження, часовий пояс і пошта моделі не передаються',
    'лише якщо ви натиснули «Дозволити», і лише на сторінках без особистих даних',
    'лише після того, як ви підтвердите її за посиланням із листа',
    '**видаляються через 30 днів**',
    'Неоплачене замовлення видаляється з усіма даними через 7 днів',
    'зберігається 180 днів',
    'зберігаються ще 30 днів і видаляються',
  ],
  en: [
    'Payments are taken by **Stripe**, which receives your email address, the product name and the price — no birth data',
    'receives the planetary positions, aspects and houses, your first name, and the date and time of birth',
    'Coordinates, the place of birth, the time zone and your email are not sent to the model',
    'only if you pressed "Allow", and only on pages without personal data',
    'starts only once you confirm it through the link in our email',
    '**deleted 30 days**',
    'An unpaid order is deleted with all its data after 7 days',
    'kept for 180 days',
    'kept for 30 more days and then deleted',
  ],
  de: [
    'Zahlungen nimmt **Stripe** entgegen: Stripe erhält Ihre E-Mail-Adresse, den Produktnamen und den Preis – ohne Geburtsdaten',
    'erhält die Stellungen der Planeten, Aspekte und Häuser, Ihren Vornamen sowie Geburtsdatum und Geburtszeit',
    'Koordinaten, Geburtsort, Zeitzone und E-Mail-Adresse erhält das Modell nicht',
    'nur geladen, wenn Sie „Zulassen“ gewählt haben, und nur auf Seiten ohne personenbezogene Daten',
    'erst, wenn Sie es über den Link in unserer E-Mail bestätigt haben',
    '**30 Tage nach der Bestellung gelöscht**',
    'Eine unbezahlte Bestellung wird mit allen Daten nach 7 Tagen gelöscht',
    '180 Tage aufbewahrt',
    'noch 30 Tage aufbewahrt und dann gelöscht',
  ],
  pl: [
    'Płatności przyjmuje **Stripe**: otrzymuje Państwa adres e-mail, nazwę produktu i cenę – bez danych urodzenia',
    'otrzymuje położenia planet, aspekty i domy, Państwa imię oraz datę i godzinę urodzenia',
    'Współrzędnych, miejsca urodzenia, strefy czasowej ani adresu e-mail model nie otrzymuje',
    'tylko wtedy, gdy wybrali Państwo „Zgadzam się”, i tylko na stronach bez danych osobowych',
    'dopiero wtedy, gdy potwierdzą ją Państwo za pomocą linku z naszej wiadomości e-mail',
    '**usuwane po 30 dniach**',
    'Nieopłacone zamówienie jest usuwane wraz ze wszystkimi danymi po 7 dniach',
    'przechowywany przez 180 dni',
    'przechowywane jeszcze przez 30 dni, a następnie usuwane',
  ],
  fr: [
    'Les paiements sont reçus par **Stripe** : Stripe reçoit votre adresse e-mail, le nom du produit et le prix – sans données de naissance',
    "reçoit les positions des planètes, les aspects et les maisons, votre prénom ainsi que la date et l'heure de naissance",
    "Les coordonnées géographiques, le lieu de naissance, le fuseau horaire et l'adresse e-mail ne sont pas transmis au modèle",
    'ne sont chargées que si vous avez choisi « Autoriser », et uniquement sur les pages sans données personnelles',
    "ne commence qu'une fois que vous l'avez confirmé par le lien figurant dans notre e-mail",
    '**supprimés 30 jours après la commande**',
    'Une commande non payée est supprimée avec toutes ses données au bout de 7 jours',
    'conservée 180 jours',
    'conservées encore 30 jours, puis supprimées',
  ],
  es: [
    'Los pagos los recibe **Stripe**, que recibe su dirección de correo electrónico, el nombre del producto y el precio, sin datos de nacimiento',
    'recibe las posiciones de los planetas, los aspectos y las casas, su nombre y la fecha y la hora de nacimiento',
    'Las coordenadas, el lugar de nacimiento, la zona horaria y la dirección de correo electrónico no se transmiten al modelo',
    'solo se cargan si ha elegido «Aceptar», y solo en páginas sin datos personales',
    'solo comienza cuando usted la confirma mediante el enlace de nuestro correo electrónico',
    '**se suprimen a los 30 días del pedido**',
    'Un pedido no pagado se suprime con todos sus datos a los 7 días',
    'se conserva durante 180 días',
    'se conservan 30 días más y después se suprimen',
  ],
};

/** The edition every language is dated by. */
const EDITION: Record<(typeof LANGUAGES)[number], string> = {
  ru: '_Редакция от 2 ноября 2026 г.',
  uk: '_Редакція від 2 листопада 2026 р.',
  en: '_Version of 2 November 2026.',
  de: '_Fassung vom 2. November 2026.',
  pl: '_Wersja z 2 listopada 2026 r.',
  fr: '_Version du 2 novembre 2026.',
  es: '_Versión de 2 de noviembre de 2026.',
};

describe('privacy policy', () => {
  it('has no blanks left in any language', () => {
    for (const locale of LANGUAGES) expect(isDraft(text(locale)), locale).toBe(false);
  });

  it('keeps every language in step, section for section', () => {
    const sections = LANGUAGES.map((locale) => text(locale).match(/^## /gm)?.length);
    expect(new Set(sections).size).toBe(1);
    expect(sections[0]).toBe(8);
  });

  it('states what the model, Stripe and the tags receive, and how long data is kept', () => {
    for (const locale of LANGUAGES) {
      for (const fact of FACTS[locale]) expect(text(locale), `${locale}: ${fact}`).toContain(fact);
    }
  });

  it('is dated by the same edition in every language', () => {
    for (const locale of LANGUAGES) expect(text(locale), locale).toContain(EDITION[locale]);
  });

  it('names, in German, the controller, the legal bases, the processors and the rights', () => {
    const de = text('de');
    for (const term of [
      'Verantwortlicher im Sinne der DSGVO: coremind s. r. o.',
      'Art. 6 Abs. 1 lit. a DSGVO',
      'Art. 6 Abs. 1 lit. b DSGVO',
      'Art. 6 Abs. 1 lit. c DSGVO',
      'Art. 6 Abs. 1 lit. f DSGVO',
      'Auftragsverarbeiter im Sinne von Art. 28 DSGVO',
      '**Widerspruchsrecht:**',
      'Art. 7 Abs. 3 DSGVO',
      'Beschwerde bei einer Datenschutz-Aufsichtsbehörde',
      'Art. 77 DSGVO',
    ]) {
      expect(de, term).toContain(term);
    }
  });

  it('names, in Polish, the controller, the legal bases, the processors, the rights and UODO', () => {
    const pl = text('pl');
    for (const term of [
      'Administratorem danych osobowych w rozumieniu rozporządzenia (UE) 2016/679 (RODO) jest coremind s. r. o.',
      'art. 6 ust. 1 lit. a RODO',
      'art. 6 ust. 1 lit. b RODO',
      'art. 6 ust. 1 lit. c RODO',
      'art. 6 ust. 1 lit. f RODO',
      'podmiot przetwarzający w rozumieniu art. 28 RODO',
      'art. 399 ust. 1 ustawy z dnia 12 lipca 2024 r. – Prawo komunikacji elektronicznej',
      '**Prawo sprzeciwu:**',
      'art. 21 RODO',
      'art. 7 ust. 3 RODO',
      'prawo wnieść skargę do organu nadzorczego',
      'art. 77 RODO',
      'Prezes Urzędu Ochrony Danych Osobowych',
    ]) {
      expect(pl, term).toContain(term);
    }
  });

  it('names, in French, the controller, the legal bases, the processors, the rights and the CNIL', () => {
    const fr = text('fr');
    for (const term of [
      'Responsable du traitement au sens du règlement (UE) 2016/679 (RGPD) : coremind s. r. o.',
      'article 6, paragraphe 1, point a), du RGPD',
      'article 6, paragraphe 1, point b), du RGPD',
      'article 6, paragraphe 1, point c), du RGPD',
      'article 6, paragraphe 1, point f), du RGPD',
      "sous-traitant au sens de l'article 28 du RGPD",
      "l'article 82 de la loi n° 78-17 du 6 janvier 1978 relative à l'informatique, aux fichiers et aux libertés",
      "**Droit d'opposition :**",
      'article 21 du RGPD',
      'article 7, paragraphe 3, du RGPD',
      "le droit d'introduire une réclamation auprès d'une autorité de contrôle",
      'article 77 du RGPD',
      "Commission nationale de l'informatique et des libertés (CNIL)",
    ]) {
      expect(fr, term).toContain(term);
    }
  });

  it('names, in Spanish, the controller, the legal bases, the processors, the rights and the AEPD', () => {
    const es = text('es');
    for (const term of [
      'Responsable del tratamiento a efectos del Reglamento (UE) 2016/679 (RGPD) y de la Ley Orgánica 3/2018, de 5 de diciembre, de Protección de Datos Personales y garantía de los derechos digitales (LOPDGDD): coremind s. r. o.',
      'artículo 6, apartado 1, letra a), del RGPD',
      'artículo 6, apartado 1, letra b), del RGPD',
      'artículo 6, apartado 1, letra c), del RGPD',
      'artículo 6, apartado 1, letra f), del RGPD',
      'encargado del tratamiento en el sentido del artículo 28 del RGPD y del artículo 33 de la LOPDGDD',
      'artículo 22.2 de la Ley 34/2002, de 11 de julio, de servicios de la sociedad de la información y de comercio electrónico',
      'en los términos de los artículos 12 a 18 de la LOPDGDD',
      '**Derecho de oposición:**',
      'artículo 21 del RGPD',
      'artículo 7, apartado 3, del RGPD',
      'derecho a presentar una reclamación ante una autoridad de control',
      'artículo 77 del RGPD',
      'Agencia Española de Protección de Datos (AEPD)',
    ]) {
      expect(es, term).toContain(term);
    }
  });
});
