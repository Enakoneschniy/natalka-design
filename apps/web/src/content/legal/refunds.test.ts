import { describe, expect, it } from 'vitest';
import { isDraft, renderLegal } from '.';
import { refunds } from './refunds';

const LANGUAGES = ['ru', 'uk', 'en', 'de', 'pl', 'fr', 'es'] as const;
const text = (locale: string) => refunds[locale] ?? '';

/** The refund promises and the deadlines, in each language's own words. */
const PROMISES: Record<(typeof LANGUAGES)[number], string[]> = {
  ru: [
    'не был доставлен в течение 24 часов после оплаты',
    'Оплата прошла дважды',
    'в течение 5 рабочих дней с нашей стороны',
    'один раз пересоберём документ по исправленным данным бесплатно, если вы напишете в течение 7 дней после заказа',
    'По закону у вас есть 14 дней',
    'Отвечаем в течение двух рабочих дней',
  ],
  uk: [
    'не був доставлений протягом 24 годин після оплати',
    'Оплата пройшла двічі',
    'протягом 5 робочих днів з нашого боку',
    'один раз перезберемо документ за виправленими даними безкоштовно, якщо ви напишете протягом 7 днів після замовлення',
    'За законом у вас є 14 днів',
    'Відповідаємо протягом двох робочих днів',
  ],
  en: [
    'was not delivered within 24 hours of payment',
    'You were charged twice',
    'within 5 working days on our side',
    'once, we will rebuild the document from corrected data at no charge if you write within 7 days of the order',
    'By law you have 14 days',
    'We answer within two working days',
  ],
  de: [
    'nicht innerhalb von 24 Stunden nach der Zahlung zugestellt',
    'Die Zahlung wurde doppelt abgebucht',
    'innerhalb von 5 Arbeitstagen auf unserer Seite',
    'erstellen das Dokument aber einmal kostenlos mit den korrigierten Daten neu, wenn Sie uns innerhalb von 7 Tagen nach der Bestellung schreiben',
    'Sie haben das Recht, binnen vierzehn Tagen ohne Angabe von Gründen diesen Vertrag zu widerrufen.',
    'Wir antworten innerhalb von zwei Arbeitstagen',
  ],
  pl: [
    'nie został dostarczony w ciągu 24 godzin od zapłaty',
    'Płatność została pobrana dwukrotnie',
    'w ciągu 5 dni roboczych po naszej stronie',
    'jeden raz bezpłatnie przygotujemy dokument ponownie na podstawie poprawionych danych, jeżeli napiszą Państwo do nas w ciągu 7 dni od złożenia zamówienia',
    'Mają Państwo prawo odstąpić od niniejszej umowy w terminie 14 dni bez podania jakiejkolwiek przyczyny.',
    'Odpowiadamy w ciągu dwóch dni roboczych',
  ],
  fr: [
    "n'a pas été remis dans les 24 heures suivant le paiement",
    'Le paiement a été débité deux fois',
    'dans un délai de 5 jours ouvrés de notre côté',
    'nous établissons, une seule fois et gratuitement, un nouveau document à partir des données corrigées si vous nous écrivez dans les 7 jours suivant la commande',
    'Vous avez le droit de vous rétracter du présent contrat sans donner de motif dans un délai de quatorze jours.',
    'Nous répondons dans un délai de deux jours ouvrés',
  ],
  es: [
    'no se ha entregado en las 24 horas siguientes al pago',
    'El pago se ha cobrado dos veces',
    'en un plazo de 5 días hábiles por nuestra parte',
    'elaboramos una vez y gratuitamente un nuevo documento con los datos corregidos si nos escribe en un plazo de 7 días desde el pedido',
    'Tiene usted derecho a desistir del presente contrato en un plazo de catorce días naturales sin necesidad de justificación.',
    'Respondemos en un plazo de dos días hábiles',
  ],
};

/** The text of one part of a policy (German unless told otherwise): from its heading to the next
 * heading of any level. */
const part = (heading: string, locale = 'de') => {
  const source = text(locale);
  const start = source.indexOf(heading);
  expect(start, heading).toBeGreaterThanOrEqual(0);
  const rest = source.slice(start + heading.length);
  const end = rest.search(/\n#{1,2} /);
  return end === -1 ? rest : rest.slice(0, end);
};

describe('refund policy', () => {
  it('has no blanks left in the German, Polish, French and Spanish editions', () => {
    expect(isDraft(text('de'))).toBe(false);
    expect(isDraft(text('pl'))).toBe(false);
    expect(isDraft(text('fr'))).toBe(false);
    expect(isDraft(text('es'))).toBe(false);
  });

  it('keeps every language in step, section for section', () => {
    const sections = LANGUAGES.map((locale) => text(locale).match(/^## /gm)?.length);
    expect(new Set(sections).size).toBe(1);
    expect(sections[0]).toBe(6);
  });

  it('makes the same refund promises in every language', () => {
    for (const locale of LANGUAGES) {
      for (const promise of PROMISES[locale]) {
        expect(text(locale), `${locale}: ${promise}`).toContain(promise);
      }
    }
  });

  it('lists the same five cases for a full refund in every language', () => {
    for (const locale of LANGUAGES) {
      const second = text(locale).split(/^## /m)[2] ?? '';
      expect(second.match(/^- /gm)?.length, locale).toBe(5);
    }
  });

  it('carries a German Widerrufsbelehrung for digital content', () => {
    const belehrung = part('## Widerrufsbelehrung');
    for (const line of [
      '**Widerrufsrecht**',
      'Die Widerrufsfrist beträgt vierzehn Tage ab dem Tag des Vertragsabschlusses.',
      'Um Ihr Widerrufsrecht auszuüben, müssen Sie uns (coremind s. r. o., Vlčie hrdlo 1887/81, 821 07 Bratislava – Ružinov, Slowakei, E-Mail: help@chronika.me) mittels einer eindeutigen Erklärung',
      'Zur Wahrung der Widerrufsfrist reicht es aus, dass Sie die Mitteilung über die Ausübung des Widerrufsrechts vor Ablauf der Widerrufsfrist absenden.',
      '**Folgen des Widerrufs**',
      'unverzüglich und spätestens binnen vierzehn Tagen',
      '**Erlöschen des Widerrufsrechts**',
      '§ 356 Abs. 6 BGB',
      'Sie ausdrücklich zugestimmt haben, dass wir vor Ablauf der Widerrufsfrist mit der Vertragserfüllung beginnen',
      'dass durch diese Zustimmung mit Beginn der Vertragserfüllung Ihr Widerrufsrecht erlischt',
      // What the payment page asks the German buyer to agree to (apps/jobs/src/stripe.ts).
      'dass Sie dadurch mit Beginn der Vertragserfüllung Ihr Widerrufsrecht verlieren',
    ]) {
      expect(belehrung, line).toContain(line);
    }
  });

  it('carries the Muster-Widerrufsformular, addressed and as a list', () => {
    const form = part('## Widerrufsbelehrung').split('**Muster-Widerrufsformular**')[1] ?? '';
    for (const line of [
      '- An coremind s. r. o., Vlčie hrdlo 1887/81, 821 07 Bratislava – Ružinov, Slowakei, E-Mail: help@chronika.me:',
      '- Hiermit widerrufe(n) ich/wir (*) den von mir/uns (*) abgeschlossenen Vertrag',
      '- Bestellt am (*)/erhalten am (*)',
      '- Name des/der Verbraucher(s)',
      '- Anschrift des/der Verbraucher(s)',
      '- Unterschrift des/der Verbraucher(s) (nur bei Mitteilung auf Papier)',
      '- Datum',
      '(*) Unzutreffendes streichen.',
    ]) {
      expect(form, line).toContain(line);
    }
    const html = renderLegal(text('de'), 'de');
    expect(html).toContain('<p><strong>Muster-Widerrufsformular</strong></p>');
    expect(html).toContain(
      '<li>Name des/der Verbraucher(s)</li><li>Anschrift des/der Verbraucher(s)</li>',
    );
  });

  it('carries a Polish pouczenie o prawie odstąpienia od umowy for digital content', () => {
    const pouczenie = part('## Pouczenie o prawie odstąpienia od umowy', 'pl');
    for (const line of [
      '**Prawo odstąpienia od umowy**',
      'Termin do odstąpienia od umowy wygasa po upływie 14 dni od dnia zawarcia umowy.',
      'Aby skorzystać z prawa odstąpienia od umowy, muszą Państwo poinformować nas (coremind s. r. o., Vlčie hrdlo 1887/81, 821 07 Bratysława – Ružinov, Słowacja, e-mail: help@chronika.me) o swojej decyzji o odstąpieniu od niniejszej umowy w drodze jednoznacznego oświadczenia (na przykład pismo wysłane pocztą lub pocztą elektroniczną).',
      'Mogą Państwo skorzystać z wzoru formularza odstąpienia od umowy, jednak nie jest to obowiązkowe.',
      'prześlemy Państwu niezwłocznie potwierdzenie otrzymania informacji o odstąpieniu od umowy na trwałym nośniku',
      'Aby zachować termin do odstąpienia od umowy, wystarczy, aby wysłali Państwo informację dotyczącą wykonania przysługującego Państwu prawa odstąpienia od umowy przed upływem terminu do odstąpienia od umowy.',
      '**Skutki odstąpienia od umowy**',
      'niezwłocznie, a w każdym przypadku nie później niż 14 dni',
      '**Utrata prawa odstąpienia od umowy**',
      'art. 38 ust. 1 pkt 13 ustawy z dnia 30 maja 2014 r. o prawach konsumenta',
      'rozpoczęliśmy świadczenie za Państwa wyraźną i uprzednią zgodą',
      'że po spełnieniu świadczenia przez nas utracą Państwo prawo odstąpienia od umowy, i przyjęli to Państwo do wiadomości',
      'potwierdzenie, o którym mowa w art. 15 ust. 1 i 2 albo art. 21 ust. 1 tej ustawy',
      // What the order and payment pages ask the Polish buyer to agree to (apps/jobs/src/contract.ts).
      '„Wyrażam zgodę na rozpoczęcie świadczenia przed upływem terminu do odstąpienia od umowy i przyjmuję do wiadomości, że po spełnieniu świadczenia utracę prawo odstąpienia od umowy.”',
    ]) {
      expect(pouczenie, line).toContain(line);
    }
    expect(renderLegal(text('pl'), 'pl')).toContain(
      '<a href="/pl/withdraw">„Odstąpienie od umowy”</a>',
    );
  });

  it('carries the wzór formularza odstąpienia od umowy, addressed and as a list', () => {
    const form =
      part('## Pouczenie o prawie odstąpienia od umowy', 'pl').split(
        '**Wzór formularza odstąpienia od umowy**',
      )[1] ?? '';
    for (const line of [
      '(formularz ten należy wypełnić i odesłać tylko w przypadku chęci odstąpienia od umowy)',
      '- Adresat: coremind s. r. o., Vlčie hrdlo 1887/81, 821 07 Bratysława – Ružinov, Słowacja, e-mail: help@chronika.me',
      '- Ja/My(*) niniejszym informuję/informujemy(*) o moim/naszym odstąpieniu od umowy',
      '/o świadczenie następującej usługi(*)',
      '- Data zawarcia umowy(*)/odbioru(*)',
      '- Imię i nazwisko konsumenta(-ów)',
      '- Adres konsumenta(-ów)',
      '- Podpis konsumenta(-ów) (tylko jeżeli formularz jest przesyłany w wersji papierowej)',
      '- Data',
      '(*) Niepotrzebne skreślić.',
    ]) {
      expect(form, line).toContain(line);
    }
    const html = renderLegal(text('pl'), 'pl');
    expect(html).toContain('<p><strong>Wzór formularza odstąpienia od umowy</strong></p>');
    expect(html).toContain(
      '<li>Imię i nazwisko konsumenta(-ów)</li><li>Adres konsumenta(-ów)</li>',
    );
  });

  it('carries the French information on the right of withdrawal for digital content', () => {
    const information = part(
      "## Informations concernant l'exercice du droit de rétractation",
      'fr',
    );
    for (const line of [
      '**Droit de rétractation**',
      'Le délai de rétractation expire quatorze jours après le jour de la conclusion du contrat.',
      "Pour exercer le droit de rétractation, vous devez nous notifier (coremind s. r. o., Vlčie hrdlo 1887/81, 821 07 Bratislava – Ružinov, Slovaquie, courriel : help@chronika.me) votre décision de rétractation du présent contrat au moyen d'une déclaration dénuée d'ambiguïté (par exemple, lettre envoyée par la poste ou courrier électronique).",
      "Vous pouvez utiliser le modèle de formulaire de rétractation mais ce n'est pas obligatoire.",
      'Vous pouvez également exercer votre droit de rétractation en ligne',
      "nous vous enverrons, dans les meilleurs délais, un accusé de réception de la rétractation sur un support durable (par exemple, par courriel), y compris son contenu ainsi que la date et l'heure de sa soumission.",
      "Pour que le délai de rétractation soit respecté, il suffit que vous transmettiez votre communication relative à l'exercice du droit de rétractation avant l'expiration du délai de rétractation.",
      '**Effets de rétractation**',
      'sans retard excessif et, en tout état de cause, au plus tard quatorze jours',
      '**Exception au droit de rétractation**',
      'article L. 221-28, 13°, du code de la consommation',
      "vous avez donné préalablement votre consentement exprès pour que l'exécution du contrat commence avant l'expiration du délai de rétractation",
      'vous avez reconnu que vous perdrez votre droit de rétractation',
      "deuxième alinéa de l'article L. 221-13 du même code",
      // What the order and payment pages ask the French buyer to agree to (apps/jobs/src/contract.ts).
      "« J'accepte expressément que l'exécution commence avant la fin du délai de rétractation et je reconnais que je perdrai ainsi mon droit de rétractation. »",
    ]) {
      expect(information, line).toContain(line);
    }
    expect(renderLegal(text('fr'), 'fr')).toContain('<a href="/fr/withdraw">« Se rétracter du contrat ici »</a>');
  });

  it('carries the French modèle de formulaire de rétractation, addressed and as a list', () => {
    const form =
      part("## Informations concernant l'exercice du droit de rétractation", 'fr').split(
        '**Modèle de formulaire de rétractation**',
      )[1] ?? '';
    for (const line of [
      '(Veuillez compléter et renvoyer le présent formulaire uniquement si vous souhaitez vous rétracter du contrat.)',
      "- À l'attention de coremind s. r. o., Vlčie hrdlo 1887/81, 821 07 Bratislava – Ružinov, Slovaquie, courriel : help@chronika.me :",
      '- Je/nous (*) vous notifie/notifions (*) par la présente ma/notre (*) rétractation du contrat',
      '/pour la prestation de services (*) ci-dessous :',
      '- Commandé le (*)/reçu le (*) :',
      '- Nom du (des) consommateur(s) :',
      '- Adresse du (des) consommateur(s) :',
      '- Signature du (des) consommateur(s) (uniquement en cas de notification du présent formulaire sur papier) :',
      '- Date :',
      '(*) Rayez la mention inutile.',
    ]) {
      expect(form, line).toContain(line);
    }
    const html = renderLegal(text('fr'), 'fr');
    expect(html).toContain('<p><strong>Modèle de formulaire de rétractation</strong></p>');
    expect(html).toContain(
      '<li>Nom du (des) consommateur(s) :</li><li>Adresse du (des) consommateur(s) :</li>',
    );
  });

  it('carries the Spanish información sobre el derecho de desistimiento for digital content', () => {
    const information = part(
      '## Información sobre el ejercicio del derecho de desistimiento',
      'es',
    );
    for (const line of [
      '**Derecho de desistimiento**',
      'El plazo de desistimiento expirará a los catorce días naturales del día de la celebración del contrato.',
      'Para ejercer el derecho de desistimiento, deberá usted notificarnos (coremind s. r. o., Vlčie hrdlo 1887/81, 821 07 Bratislava – Ružinov, Eslovaquia, correo electrónico: help@chronika.me) su decisión de desistir del contrato a través de una declaración inequívoca (por ejemplo, una carta enviada por correo postal o correo electrónico).',
      'Podrá utilizar el modelo de formulario de desistimiento que figura a continuación, aunque su uso no es obligatorio.',
      'Tiene usted asimismo la opción de cumplimentar y enviar electrónicamente el modelo de formulario de desistimiento o cualquier otra declaración inequívoca a través de nuestro sitio web',
      'le comunicaremos sin demora en un soporte duradero (por ejemplo, por correo electrónico) la recepción de dicho desistimiento.',
      'Para cumplir el plazo de desistimiento, basta con que la comunicación relativa al ejercicio por su parte de este derecho sea enviada antes de que venza el plazo correspondiente.',
      '**Consecuencias del desistimiento**',
      'sin ninguna demora indebida y, en todo caso, a más tardar 14 días naturales',
      '**Pérdida del derecho de desistimiento**',
      'artículo 103, letra m), del texto refundido de la Ley General para la Defensa de los Consumidores y Usuarios y otras leyes complementarias, aprobado por el Real Decreto Legislativo 1/2007, de 16 de noviembre',
      'usted haya otorgado su consentimiento previo y expreso para iniciar la ejecución durante el plazo del derecho de desistimiento',
      'haya expresado su conocimiento de que, en consecuencia, pierde su derecho de desistimiento',
      'la confirmación prevista en el artículo 98.7 de dicha ley',
      // What the order and payment pages ask the Spanish buyer to agree to (apps/jobs/src/contract.ts).
      '«Doy mi consentimiento expreso para que la ejecución comience antes de que finalice el plazo de desistimiento y reconozco que, con ello, pierdo mi derecho de desistimiento.»',
    ]) {
      expect(information, line).toContain(line);
    }
    expect(renderLegal(text('es'), 'es')).toContain(
      '<a href="/es/withdraw">«Desistir del contrato»</a>',
    );
  });

  it('carries the Spanish modelo de formulario de desistimiento, addressed and as a list', () => {
    const form =
      part('## Información sobre el ejercicio del derecho de desistimiento', 'es').split(
        '**Modelo de formulario de desistimiento**',
      )[1] ?? '';
    for (const line of [
      '(sólo debe cumplimentar y enviar el presente formulario si desea desistir del contrato)',
      '- A la atención de coremind s. r. o., Vlčie hrdlo 1887/81, 821 07 Bratislava – Ružinov, Eslovaquia, correo electrónico: help@chronika.me:',
      '- Por la presente le comunico/comunicamos (*) que desisto de mi/desistimos de nuestro (*) contrato',
      '/prestación del siguiente servicio (*)',
      '- Pedido el/recibido el (*)',
      '- Nombre del consumidor y usuario o de los consumidores y usuarios',
      '- Domicilio del consumidor y usuario o de los consumidores y usuarios',
      '- Firma del consumidor y usuario o de los consumidores y usuarios (solo si el presente formulario se presenta en papel)',
      '- Fecha',
      '(*) Táchese lo que no proceda.',
    ]) {
      expect(form, line).toContain(line);
    }
    const html = renderLegal(text('es'), 'es');
    expect(html).toContain('<p><strong>Modelo de formulario de desistimiento</strong></p>');
    expect(html).toContain(
      '<li>Nombre del consumidor y usuario o de los consumidores y usuarios</li><li>Domicilio del consumidor y usuario o de los consumidores y usuarios</li>',
    );
  });
});
